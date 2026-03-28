# TradeDesk Forex — Future Scaling Roadmap

> Known scalability issues, planned improvements, and architectural decisions for growing beyond a single-user system.

---

## Current Architecture Constraints

TradeDesk Forex currently runs as a single Railway container serving a Next.js app with Supabase as the database. This works well for a single user, but several patterns will break under concurrent users or horizontal scaling.

---

## Priority 1: Critical (Will Break at Scale)

### 1.1 Fire-and-Forget Background Tasks

**Problem**: Story generation (~4-5 min) and story agents are started with `.catch()` but never awaited in cron routes. If the container restarts, times out, or OOM-kills mid-execution, the operation dies silently with partial data in the database.

**Affected files**:
- `app/api/cron/story-generation/route.ts` — line 150
- `app/api/cron/story-agents/route.ts` — line 59-79
- `lib/story/scenario-monitor.ts` — line 239-245

**Current behavior**:
```typescript
generateStory(userId, pair, taskId).catch(err => {
    console.error('Background fail:', err)
})
// Returns 202 immediately — pipeline runs untracked
```

**Fix**: Implement a proper task queue.

**Option A — Database Queue (Recommended for current scale)**:
```
1. Cron inserts rows into `background_tasks` with status='queued'
2. A separate worker endpoint polls for queued tasks
3. Worker atomically sets status='processing' (prevents duplicates)
4. Worker runs the pipeline, updating progress
5. Worker sets status='completed' or 'failed'
6. Failed tasks are retried up to 3 times
```

**Option B — Redis Queue (For higher scale)**:
- Use Upstash Redis (serverless) with BullMQ
- Dedicated worker process (Railway service) consuming jobs
- Automatic retries, dead letter queue, concurrency control

**Effort**: Medium (Option A: 2-3 days, Option B: 4-5 days)

---

### 1.2 Unbounded Cron Queries

**Problem**: Story generation cron fetches ALL active subscriptions without pagination or locking. With 100 users x 5 pairs = 500 subscriptions loaded into memory in one query.

**Affected file**: `app/api/cron/story-generation/route.ts`

**Current behavior**:
```typescript
const { data: subscriptions } = await client
    .from('pair_subscriptions')
    .select('user_id, pair')
    .eq('is_active', true)
    // No .limit() — fetches everything
```

**Fix**:
1. **Paginate**: Process 50 subscriptions per cron run with cursor-based pagination
2. **Distributed locking**: Use a `cron_locks` table to prevent overlapping runs
3. **Stale task detection**: Skip subscriptions that already have a `processing` task from the current day

```sql
-- Proposed cron_locks table
CREATE TABLE cron_locks (
    job_name TEXT PRIMARY KEY,
    locked_at TIMESTAMPTZ NOT NULL,
    locked_by TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
```

**Effort**: Low-Medium (1-2 days)

---

### 1.3 Sequential Agent Processing

**Problem**: Story agents run sequentially with a 500ms stagger per pair. With 100 subscriptions, this takes 50+ seconds just for staggering, before any AI calls. The 300s function timeout will be exceeded.

**Affected file**: `app/api/cron/story-agents/route.ts`

**Fix**: Process in parallel batches:
```typescript
const BATCH_SIZE = 4
for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    const batch = subscriptions.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(batch.map(sub =>
        runAgentsForPair(sub.user_id, sub.pair, client)
    ))
    await new Promise(r => setTimeout(r, 100)) // Small delay between batches
}
```

**Effort**: Low (few hours)

---

## Priority 2: High (Performance Degradation)

### 2.1 Broad `select('*')` on Large Tables

**Problem**: Episode queries fetch ALL columns including `narrative` (~1-5 KB), `raw_ai_output` (~5-10 KB), `gemini_output`, `deepseek_output` (5-10 KB each), `agent_reports` (~2 KB). Listing 20 episodes = 500+ KB unnecessarily.

**Affected files**: `lib/data/stories.ts`, `lib/data/story-positions.ts`, `lib/story/bible.ts` — 20+ occurrences

**Fix**: Specify only needed columns per use case:
```typescript
// Listing (summary view)
.select('id, episode_number, season_number, title, current_phase, confidence, created_at')

// Detail view
.select('id, episode_number, narrative, raw_ai_output, scenarios(id, title, status)')
```

**Effort**: Low (1 day — mechanical changes)

---

### 2.2 Fixed 2-Second Polling Interval

**Problem**: Background task polling uses a fixed 2s interval with no maximum duration. For a 5-minute story generation: 150 requests per task per browser tab. Multiple tabs multiply this.

**Affected file**: `lib/background-tasks/client.ts`

**Fix**: Exponential backoff with max duration:
```typescript
let pollCount = 0
const maxDuration = 15 * 60 * 1000 // 15 minutes absolute max
const startTime = Date.now()

const poll = async () => {
    if (stopped || Date.now() - startTime > maxDuration) return
    // ... fetch task ...
    const delay = Math.min(2000 * Math.pow(1.5, Math.floor(pollCount / 3)), 30000)
    pollCount++
    setTimeout(poll, delay)
}
```

Result: 2s → 3s → 4.5s → 6.75s → ... → 30s max. Reduces total requests from 150 to ~30.

**Effort**: Low (few hours)

---

### 2.3 In-Memory News Cache

**Problem**: `app/api/news/fetch/route.ts` uses a module-level `Map` for caching news. Same issue as the old rate limiter — won't survive cold starts or work across instances.

**Fix**: Move to Supabase or a dedicated cache table with TTL:
```sql
CREATE TABLE cache_entries (
    cache_key TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
```

Or use Supabase's built-in caching via short `revalidate` windows.

**Effort**: Low (few hours)

---

## Priority 3: Medium (Architecture Improvements)

### 3.1 Promise.all Fragility in Story Pipeline

**Problem**: The continuity context loading uses `Promise.all` — if one query fails (e.g., `getBible` timeout), the entire pipeline fails even though 6/7 queries succeeded.

**Affected file**: `lib/story/pipeline.ts`

**Fix**: Use `Promise.allSettled` with graceful degradation:
```typescript
const [bibleResult, lastEpResult, ...] = await Promise.allSettled([
    getBible(userId, pair, client),
    getLatestEpisode(userId, pair, client),
    // ...
])
const bible = bibleResult.status === 'fulfilled' ? bibleResult.value : null
// Continue with partial data — Claude can work without a Bible
```

**Effort**: Low (few hours)

---

### 3.2 AI Usage Logging Fire-and-Forget

**Problem**: `logAIUsage()` in `lib/ai/usage-logger.ts` is fire-and-forget. If the process dies before the log is written, the rate limiter (which counts from `ai_usage_logs`) has an inaccurate count.

**Fix**: Await the log write in the calling function's finally block:
```typescript
try {
    const result = await callClaude(...)
    await logAIUsage({ ...usage, success: true })
    return result
} catch (error) {
    await logAIUsage({ ...usage, success: false, error: error.message })
    throw error
}
```

**Effort**: Low (few hours)

---

### 3.3 Supabase Client Creation Pattern

**Problem**: Multiple Supabase clients are created per request chain. Each `await createClient()` creates a new instance. While lightweight, it's wasteful.

**Fix**: For server components, this is unavoidable (each request needs fresh auth context). For the browser polling client, use a singleton:
```typescript
let browserClient: SupabaseClient | null = null
export function getSupabaseClient() {
    if (!browserClient) browserClient = createBrowserClient(...)
    return browserClient
}
```

**Effort**: Low (few hours)

---

## Priority 4: Future Scale (Multi-User / Production)

### 4.1 Dedicated Worker Process

When cron jobs consistently take >60s, split the architecture:

```
┌──────────────────┐    ┌──────────────────┐
│  Next.js App     │    │  Worker Service   │
│  (Railway)       │    │  (Railway)        │
│                  │    │                   │
│  API Routes      │───→│  Task Queue       │
│  UI              │    │  Story Pipeline   │
│  Auth            │    │  Agent Runner     │
│                  │    │  Scenario Monitor │
└──────────────────┘    └──────────────────┘
         │                       │
         └───────┬───────────────┘
                 │
         ┌───────▼───────┐
         │   Supabase    │
         │   (Shared DB) │
         └───────────────┘
```

- Next.js handles HTTP requests and UI
- Worker handles all long-running AI operations
- Communicate via database task queue
- Each can scale independently

**Effort**: High (1-2 weeks)

---

### 4.2 Redis for Rate Limiting and Caching

Replace DB-backed rate limiter and in-memory caches with Upstash Redis:
- Atomic `INCR` + `EXPIRE` for rate limiting (faster than COUNT query)
- News cache with automatic TTL expiry
- Distributed locks for cron deduplication
- Session-level caching for hot data (current prices, account summary)

```
Railway Add-on: Upstash Redis (serverless, pay-per-request)
```

**Effort**: Medium (2-3 days)

---

### 4.3 WebSocket for Real-Time Updates

Replace polling with Supabase Realtime subscriptions:
```typescript
supabase
    .channel('task-updates')
    .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'background_tasks',
        filter: `id=eq.${taskId}`
    }, (payload) => {
        onProgress(payload.new.progress_percent, payload.new.progress_message)
    })
    .subscribe()
```

Benefits: Zero polling, instant updates, lower server load, better mobile battery life.

**Effort**: Medium (1-2 days)

---

### 4.4 CDN for Static Assets

If story narratives become popular (shared publicly), serve generated content from Supabase Storage + CDN:
- Store rendered episode HTML/images in Storage
- Serve via Supabase CDN or Cloudflare
- Cache invalidation on new episode generation

**Effort**: Medium (2-3 days)

---

### 4.5 Database Optimization

As tables grow, add targeted indexes:

```sql
-- Story episodes: fast lookup by user+pair+season
CREATE INDEX idx_episodes_user_pair_season
ON story_episodes (user_id, pair, season_number DESC, episode_number DESC);

-- Scenarios: fast monitor queries
CREATE INDEX idx_scenarios_active_monitor
ON story_scenarios (status, monitor_active)
WHERE status = 'active' AND monitor_active = true;

-- Agent reports: fast dedup check
CREATE INDEX idx_agent_reports_dedup
ON story_agent_reports (user_id, pair, agent_type, report_date);

-- AI usage: fast rate limit count
CREATE INDEX idx_usage_rate_limit
ON ai_usage_logs (user_id, created_at DESC);

-- Background tasks: fast queue polling
CREATE INDEX idx_tasks_queue
ON background_tasks (status, created_at)
WHERE status IN ('queued', 'processing');
```

Also consider partitioning `story_episodes` by `created_at` if it exceeds millions of rows.

**Effort**: Low (few hours for indexes, medium for partitioning)

---

### 4.6 Multi-Region Deployment

For global users, deploy read replicas:
- Primary Supabase in US East (writes)
- Read replica in EU (European users)
- Railway in both regions with geographic routing

**Effort**: High (depends on Supabase plan)

---

## Summary Table

| Item | Priority | Effort | Impact |
|------|----------|--------|--------|
| Task queue (replace fire-and-forget) | Critical | Medium | Prevents silent data loss |
| Cron pagination + locking | Critical | Low-Med | Prevents OOM + duplicates |
| Parallel agent batching | Critical | Low | 10x faster agent runs |
| Column-specific SELECT | High | Low | 80% less bandwidth |
| Polling exponential backoff | High | Low | 80% fewer poll requests |
| News cache to DB | High | Low | Survives cold starts |
| Promise.allSettled in pipeline | Medium | Low | More resilient pipeline |
| Await usage logging | Medium | Low | Accurate rate limiting |
| Dedicated worker process | Future | High | Independent scaling |
| Redis (Upstash) | Future | Medium | Faster caching + locking |
| WebSocket (Supabase Realtime) | Future | Medium | Zero polling |
| Database indexes | Future | Low | Query performance |
| Multi-region | Future | High | Global latency |
