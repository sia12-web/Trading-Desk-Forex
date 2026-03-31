# TradeDesk Forex — System Context

> **Purpose**: Complete reference for every subsystem. Read this before implementing any feature.

---

## Architecture Overview

- **Framework**: Next.js 16 (App Router) + TypeScript + React 19
- **Database**: Supabase (Auth, Postgres, Storage, RPC)
- **Deployment**: Railway (standalone output, NIXPACKS builder, auto-deploy from `master`)
- **AI**: Tri-Model V2 — Claude (Decision Architect) + Gemini (Pattern Archaeologist) + DeepSeek (Quant Engine)
- **Broker**: OANDA REST API (demo + live modes)
- **UI**: Tailwind CSS 4, Lucide icons, Recharts, ReactMarkdown, Tiptap rich text editor
- **Notifications**: Web Push (VAPID) + Telegram bot
- **Timeframes**: Monthly (M), Weekly (W), Daily (D), 4-Hour (H4), 1-Hour (H1) — **only these 5**

---

## Pages & Navigation

All pages live under `app/(dashboard)/` with shared layout in `DashboardShell.tsx`.

| Route | Page | Purpose |
|-------|------|---------|
| `/` | The Desk | JP Morgan-style AI trading floor — morning meetings, desk feed, process metrics |
| `/story` | Story Hub | Pair subscriptions, My Story tab, episode list |
| `/story/[pair]` | Story Detail | Episodes + scenarios + private notes per pair |
| `/trading-gurus` | Trading Gurus | Private library of trading mentors & wisdom |
| `/trading-gurus/[guru]` | Guru Vault | Interactive workspace for mentor insights |
| `/ai-usage` | AI Usage | Token usage, costs, and performance per model |
| `/trade` | Trade Execution | Manual trade form with OANDA integration |
| `/positions` | Open Positions | Live OANDA positions + planned trades |
| `/execution-log` | Execution Log | OANDA API call history |
| `/journal` | Trade Journal | Past trades with notes |
| `/journal/[id]` | Journal Entry | Single trade detail |
| `/journal/[id]/edit` | Journal Edit | Edit trade notes/screenshots |
| `/pnl` | P&L Dashboard | Profit/loss analytics with charts |
| `/risk-rules` | Risk Rules | Max position, daily loss, drawdown limits |
| `/calendar` | Calendar | Trading calendar with recurring events |
| `/cms` | CMS Engine | Conditional Market Shaping — programmatic pattern analysis |
| `/news` | News | Forex Factory + economic calendar |
| `/references` | References | Candlestick patterns, chart patterns |
| `/settings` | Settings | OANDA connection, notifications, profile |
| `/login` | Login | Auth (under `(auth)` layout) |
| `/signup` | Signup | Auth (under `(auth)` layout) |

---

## API Routes

### OANDA Integration
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/oanda/account` | Account balance, margin, NAV |
| GET | `/api/oanda/connection` | Test OANDA connectivity |
| GET | `/api/oanda/positions` | Open positions |
| GET | `/api/oanda/prices` | Live pricing + spreads |
| GET | `/api/oanda/trades` | Active trades |
| POST | `/api/oanda/switch-mode` | Toggle demo/live mode |

### Trade Management
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/trade/execute` | Place market/limit order via OANDA |
| POST | `/api/trade/execute-planned` | Execute a planned trade |
| POST | `/api/trade/plan` | Save a planned trade |
| POST | `/api/trade/modify` | Modify SL/TP on open trade |
| POST | `/api/trade/close` | Close open position |
| POST | `/api/trade/cancel` | Cancel pending order |
| GET | `/api/trades` | List journal trades |
| POST | `/api/trades/sync` | Sync trades from OANDA |

### Risk Management
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/risk-rules` | List all risk rules |
| GET/PUT/DELETE | `/api/risk-rules/[id]` | CRUD single rule |
| POST | `/api/risk/validate` | Validate trade against rules |

### Story (AI Narrative)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/story/generate` | Trigger episode generation (background task) |
| GET/POST | `/api/story/episodes` | List/create episodes |
| GET/PUT/DELETE | `/api/story/episodes/[id]` | CRUD single episode |
| GET/POST | `/api/story/scenarios` | List/create scenarios |
| GET/PUT/DELETE | `/api/story/scenarios/[id]` | CRUD single scenario |
| GET/POST | `/api/story/subscriptions` | List/create pair subscriptions |
| GET/DELETE | `/api/story/subscriptions/[pair]` | Get/remove pair subscription |
| GET/PUT | `/api/story/bible` | Get/update story bible |
| GET/POST | `/api/story/my-story` | Private note handler (AI-excluded) |

### Trading Gurus (Private Knowledge)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/trading-gurus` | CRUD single guru topic (AI-excluded) |
| GET | `/api/trading-gurus/list` | List mentors and topics |

### AI Usage
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/ai-usage` | Aggregated AI usage stats (per provider, daily costs) |

### Calendar
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/calendar/events` | List/create calendar events |
| GET/PUT/DELETE | `/api/calendar/events/[id]` | CRUD single event |
| POST | `/api/calendar/seed-market-events` | Seed predefined market events |

### Notifications
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/notifications/subscribe` | Register push subscription |
| GET/PUT | `/api/notifications/preferences` | Get/update notification prefs |
| POST | `/api/notifications/send` | Send notification (internal) |
| POST | `/api/notifications/telegram/test` | Test Telegram connection |

### AI & Market Data
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/ai-connections` | Check AI API key status |
| GET | `/api/market-indices` | Global stock indices (public, no auth) |
| GET | `/api/indicator-optimizer` | Optimized indicator params |
| GET | `/api/news/fetch` | Forex news from external sources |
| GET | `/api/pairs/info` | Pair metadata (pip size, etc.) |

### CMS (Conditional Market Shaping)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/cms/generate` | Trigger CMS analysis (background task) |
| GET | `/api/cms/results?pair=EUR/USD` | Fetch cached CMS results |

### Cron Jobs (Protected by `CRON_SECRET`, scheduled via Supabase pg_cron + pg_net)
| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/scenario-analysis` | **Mon 3:30 AM UTC** | Weekly institutional scenario analysis per pair |
| `/api/cron/story-agents` | **4:00 AM UTC Mon-Fri** | Daily intelligence agents (Optimizer, News, Cross-Market) |
| `/api/cron/scenario-monitor` | **Every 15 min** | Check active scenarios vs OANDA prices, auto-resolve |

### Utilities
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/upload/screenshot` | Upload trade screenshot |
| GET | `/api/health` | Health check (Railway) |
| POST | `/api/demo/reset` | Reset demo data |

### Auth (under `app/auth/`)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/auth/callback` | Supabase OAuth callback |
| POST | `/auth/signout` | Sign out + clear session |

---

## AI Pipeline (Tri-Model V2)

**Sequential flow**: Gemini → DeepSeek (validates Gemini) → Claude (synthesizes both)
**All 3 must succeed** — `Promise.all`, no fallbacks. Errors propagate to user.

### Gemini "Pattern Archaeologist"
- **Model**: `gemini-3-flash-preview` via `@google/genai`
- **Timeout**: 90s, 8K output tokens
- **Role**: Process ALL raw data across 5 TFs
- **Output**: Wyckoff cycle, cross-TF Fibonacci clusters, floor/roof extrema, structural S/R, optimization suggestions
- **Prompt**: `lib/ai/prompts-gemini-archaeologist.ts`
- **Client**: `lib/ai/clients/gemini.ts`

### DeepSeek "Quantitative Engine"
- **Model**: `deepseek-chat` (V3.2) via `openai` SDK
- **Timeout**: 90s per phase (2-phase)
- **Phase 1** (parallel with Gemini): Indicator health, cross-TF divergences, confluence scoring
- **Phase 2** (after Gemini): Validate Gemini's zones, compute precise entry/SL/TP, risk model
- **Prompt**: `lib/ai/prompts-deepseek-engine.ts`
- **Client**: `lib/ai/clients/deepseek.ts`

### Claude "Decision Architect"
- **Model**: `claude-opus-4-6` via `@anthropic-ai/sdk`
- **Timeout**: 60s, `noFallback: true`
- **Role**: Elliott Wave counting, strategy gate, contradiction resolution, trade plan
- **Prompt**: `lib/ai/prompts-unified-analysis.ts` → `getUnifiedAuditorPromptV2()`
- **Client**: `lib/ai/clients/claude.ts`

### Infrastructure
- **JSON Parsing**: `lib/ai/parse-response.ts` → `parseAIJson<T>()` (uses JSON5)
- **Rate Limiter**: `lib/ai/rate-limiter.ts` → 5 calls/hour per user (in-memory)
- **Usage Logger**: `lib/ai/usage-logger.ts` → fire-and-forget DB logging with cost estimation
- **Model selection is HARDCODED** — no user-selectable tiers

### AI Usage Tracking
- **Table**: `ai_usage_logs` (provider, model, feature, tokens, cost, duration, success)
- **Logger**: `lib/ai/usage-logger.ts` → `logAIUsage()` (fire-and-forget, service role client)
- **Instrumented**: All 3 AI clients accept optional `usage: { userId, feature }` in options
- **Page**: `/ai-usage` — per-provider cards (Anthropic/Google/DeepSeek), daily cost chart, feature breakdown
- **API**: `GET /api/ai-usage?days=30` — aggregates logs client-side from raw rows
- **Cost Estimation**: Approximate pricing per 1M tokens (Claude Opus: $15/$75, Gemini Flash: $0.15/$0.60, DeepSeek: $0.27/$1.10)

---

## Story System

The narrative-based forex analysis feature — follow pairs like a TV show.

### Core Pipeline
- **Entry**: `lib/story/pipeline.ts` → `generateStory(userId, pair, taskId, options?)`
- **Flow**: Gemini (structural) → DeepSeek (quant validation) → Claude (narrator)
- **Duration**: ~4-5 min per episode (background task)

### Components
| Module | Path | Purpose |
|--------|------|---------|
| Pipeline | `lib/story/pipeline.ts` | Main orchestration |
| Bible | `lib/story/bible.ts` | Persistent arc memory per pair |
| Seasons | `lib/story/seasons.ts` | 20 episodes/season, auto-archive |
| Validators | `lib/story/validators.ts` | Anti-hallucination level checks |
| Monitor | `lib/story/scenario-monitor.ts` | 15min cron, auto-resolve scenarios |
| AMD Detector | `lib/story/amd-detector.ts` | Accumulation-Manipulation-Distribution |
| Liquidity | `lib/story/liquidity-mapper.ts` | Order blocks, equal highs/lows |
| Data | `lib/story/data-collector.ts` | OANDA data collection |
| News | `lib/story/news-summarizer.ts` | News context for narrator |
| Types | `lib/story/types.ts` | TypeScript definitions |

### Prompts
| Prompt | Path | AI Model |
|--------|------|----------|
| Gemini Structural | `lib/story/prompts/gemini-structural.ts` | Gemini |
| DeepSeek Quant | `lib/story/prompts/deepseek-quant.ts` | DeepSeek |
| Claude Narrator | `lib/story/prompts/claude-narrator.ts` | Claude |

### Intelligence Agents (run at 4AM UTC before story gen)
| Agent | Path | Model | Purpose |
|-------|------|-------|---------|
| Indicator Optimizer | `lib/story/agents/indicator-optimizer.ts` | DeepSeek | Optimal indicator params per pair/TF |
| News Intelligence | `lib/story/agents/news-intelligence.ts` | Gemini | Macro/fundamental analysis |
| Cross-Market Effects | `lib/story/agents/cross-market.ts` | Gemini | Stock index impacts on forex |
| **CMS Intelligence** | `lib/story/agents/cms-intelligence.ts` | **Programmatic** | **Conditional market patterns (no AI cost)** |
| Runner | `lib/story/agents/runner.ts` | — | Agent orchestration (runs all 4) |
| Types | `lib/story/agents/types.ts` | — | Agent type definitions |
| Data | `lib/story/agents/data.ts` | — | Agent data access |

### Key Features
- **Story Bible**: Persistent arc summary per pair (`story_bibles` table), updated each episode
- **Season System V2 (AI-Driven)**: AI decides when to end a season (no hardcoded episode cap), safety cap at 50 episodes. `story_seasons` table stores season metadata.
- **Season Archive Memory**: Past season summaries fed to narrator for deep cross-season recall and callbacks
- **Trade-Episode Linkage**: `trades.story_episode_id` + `story_season_number` columns — AI references "opened in S1E5" in narrative
- **Scenario Monitor**: Cron every 15min checks active scenarios vs OANDA prices, auto-resolves + auto-generates next episode
- **Anti-Hallucination V2**: DeepSeek `flagged_levels`, Claude forbidden from using them, `validateScenarioLevels()` hard gate with retry on direction/range violations
- **Prompt Caching**: `callClaudeWithCaching()` — ~90% cache discount on narrator prompt
- **Button UX**: "Begin the Story" (0 episodes) vs "Write Next Episode" (>0), auto-generate S1E1 on pair subscription
- **Anti-spam**: Max 1 bot-triggered generation per pair per 6 hours
- **Market hours**: No-op on weekends (Sat + Sun before 10PM UTC + Fri after 10PM UTC)
- **Position Tracker**: AI-guided trading positions that persist across episodes (see below)

### Story Position Tracker
AI tells the trader when to enter, hold, adjust, or close across episodes.

| Module | Path | Purpose |
|--------|------|---------|
| Position Data | `lib/data/story-positions.ts` | CRUD for positions + adjustments |
| Types | `lib/story/types.ts` → `PositionGuidance` | AI output schema |
| Pipeline | `lib/story/pipeline.ts` → `processPositionGuidance()` | Auto-process after each episode |
| Narrator Prompt | `lib/story/prompts/claude-narrator.ts` | Injects active position context + guidance rules |

**API Routes:**
- `GET /api/story/positions?pair=EUR/USD` — list all positions for a pair
- `GET /api/story/positions/[id]` — position with full adjustment journey
- `POST /api/story/positions/[id]/activate` — user confirms suggested position
- `POST /api/story/positions/[id]/link-trade` — link OANDA trade ID

**UI Components** (`app/(dashboard)/story/_components/`):
- `PositionGuidanceCard` — current episode's AI recommendation (enter/hold/adjust/close/wait)
- `PositionJourney` — visual timeline of position life across episodes
- `ScenarioProximity` — gauge showing price distance to scenario triggers/invalidations

**Tables:** `story_positions`, `story_position_adjustments` (RLS: `auth.uid() = user_id`)

**Flow:** Each episode → AI outputs `position_guidance` → pipeline creates/adjusts/closes position → UI shows journey

### Scenario Analysis (Internal — No UI)
Auto-generated weekly via cron. Story pipeline consumes the latest analysis as institutional context.
- **Pipeline**: `lib/scenario-analysis/pipeline.ts` → `generateScenarioAnalysis(userId, pair, taskId, options?)`
- **Flow**: Gemini (scanner) → DeepSeek (validator) → Claude (synthesizer) → stored in `scenario_analyses` table
- **Cron**: `scenario-analysis-weekly` — Monday 3:30 AM UTC via `/api/cron/scenario-analysis`
- **Story integration**: `getLatestScenarioAnalysisForPrompt()` injects institutional context into narrator

---

## CMS Engine V2 (Conditional Market Shaping)

Programmatic statistical pattern engine — discovers "IF → THEN" market behaviors from real candle data.

### Architecture

**Phase 0 (TypeScript — NO AI):**
- Fetch OANDA candles (Daily, Weekly, H1, H4)
- Compute ~36 conditional patterns programmatically across 5 categories
- Each pattern: exact `sample_size`, `hits`, `probability`, `avg_move_pips` from real data
- Filter: `sample_size ≥ 15` AND `probability ≥ 55%`

**Phase 1 (Gemini):**
- Receives pre-computed conditions with REAL statistics
- Role: Rank patterns by tradability and structural logic
- Groups related patterns into clusters
- Does NOT generate statistics

**Phase 2 (DeepSeek):**
- Validates market structure logic (not statistics)
- Identifies microstructure mechanisms (institutional flow, session dynamics)
- Flags coincidental patterns vs structurally meaningful ones

**Phase 3 (Claude):**
- Synthesizes validated patterns into trader-friendly implications
- Writes market personality summary
- Forbidden from modifying any statistics

### Pattern Categories (~36 total)

| Category | Count | Examples |
|----------|-------|----------|
| **Daily** | ~10 | Friday fails to break Thursday's high → Monday tests Friday's low; Inside day → breakout in prior trend direction |
| **Weekly** | ~8 | Monday sets weekly high → week closes bearish; Friday closes above weekly open → next Monday bullish |
| **Session** | ~8 | Quiet Asia (<30% ATR) → London moves >70% ATR; London continues Asia's direction |
| **Volatility** | ~6 | 2+ quiet days → next day range > ATR; Range expanding 3 days → 4th day expands further |
| **Cross-Market** | ~4 | SPX500 up → pair follows; NAS diverges from SPX → pair instability |

### Modules

| Module | Path | Purpose |
|--------|------|---------|
| Condition Engine | `lib/cms/condition-engine.ts` | Programmatic computation of all patterns |
| Data Collector | `lib/cms/data-collector.ts` | OANDA candle fetching + pre-computation |
| Pipeline | `lib/cms/pipeline.ts` | Phase 0 → Gemini → DeepSeek → Claude orchestration |
| Types | `lib/cms/types.ts` | TypeScript definitions (`CMSCondition`, `ProgrammaticCondition`) |

### Prompts

| Prompt | Path | Role |
|--------|------|------|
| Gemini Pattern Ranker | `lib/cms/prompts/gemini-pattern.ts` | Ranks pre-computed conditions by tradability |
| DeepSeek Structure Validator | `lib/cms/prompts/deepseek-stats.ts` | Validates market structure logic |
| Claude Synthesizer | `lib/cms/prompts/claude-synthesis.ts` | Writes implications + personality |

### Story Integration (4th Intelligence Agent)

CMS runs as a Story agent at **4AM UTC** (alongside Optimizer, News, Cross-Market).

| Module | Path | Purpose |
|--------|------|---------|
| CMS Agent | `lib/story/agents/cms-intelligence.ts` | Programmatic agent (no AI calls) |
| Agent Types | `lib/story/agents/types.ts` | `CMSIntelligenceReport` definition |
| Agent Runner | `lib/story/agents/runner.ts` | Orchestrates all 4 agents |
| Narrator Prompt | `lib/story/prompts/claude-narrator.ts` | Injects CMS conditions into Intelligence Briefing |

**Flow:** CMS agent → computes conditions → stores as `story_agent_reports` (type=`'cms_intelligence'`) → Claude narrator references validated patterns in scenarios

### API Routes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/cms/generate` | Trigger CMS analysis (background task) |
| GET | `/api/cms/results?pair=EUR/USD` | Fetch cached results |

### Database Tables

| Table | Purpose |
|-------|---------|
| `cms_analyses` | Stores CMS results per user+pair (7-day expiry, JSONB result, RLS) |
| `story_agent_reports` | Stores CMS as agent type `'cms_intelligence'` |

**Migration:** `supabase/migrations/20260328_create_cms_analyses.sql`

### Key Design Principles

1. **AI Never Generates Statistics** — all numbers come from TypeScript iterating real candles
2. **Source Tracking** — every condition has `source: 'programmatic'` field
3. **Anti-Hallucination** — AI only interprets, never invents sample sizes or probabilities
4. **Dedup-Friendly** — CMS agent has same dedup logic as other Story agents (once per day per pair)
5. **Zero AI Cost in Agent Mode** — CMS agent is pure TypeScript (no model calls when run as Story agent)

### UI

- **Page**: `/cms` — standalone analysis interface
- **Widget**: Story Intelligence Briefing shows top 8 CMS conditions with probabilities

---

## Trading Desk (JP Morgan-Style AI Trading Floor)

The dashboard home page (`/`) IS the Trading Desk. 4 AI characters interact daily with the trader: morning meetings, trade reviews, process scoring.

### Characters

| Seat | Name | Role | Personality |
|------|------|------|-------------|
| PM | **Marcus** | Portfolio Manager | Calm, strategic, demanding but fair. Sets desk direction. |
| Risk | **Sarah** | Risk Desk | Blunt, zero-tolerance. Can block trades. Authority is absolute. |
| Quant | **Ray** | Quantitative Analyst | Probabilistic. Never says "bullish" — says "67% probability." |
| Macro | **Alex** | Macro Strategist | Big-picture. Central banks, geopolitics, flows. |

### Modules

| Module | Path | Purpose |
|--------|------|---------|
| Types | `lib/desk/types.ts` | TypeScript definitions for all desk entities |
| Data Collector | `lib/desk/data-collector.ts` | Gathers all context for AI generation |
| Generator | `lib/desk/generator.ts` | Orchestrates AI calls + storage |
| Morning Meeting Prompt | `lib/desk/prompts/morning-meeting.ts` | All 4 characters in one Gemini call |
| Trade Review Prompt | `lib/desk/prompts/trade-review.ts` | Desk reviews proposed trades |
| Process Scoring Prompt | `lib/desk/prompts/process-scoring.ts` | Grade trades on 5 process criteria |

### API Routes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/desk/meeting` | Generate morning meeting (background task) |
| GET | `/api/desk/meeting` | Get today's latest meeting |
| POST | `/api/desk/review` | Desk reviews a trade proposal (synchronous) |
| GET | `/api/desk/messages` | Paginated message history |
| GET | `/api/desk/state` | Desk state + recent process scores |
| POST | `/api/desk/score` | Trigger process scoring for a trade |
| GET | `/api/desk/score` | Get existing score for a trade |

### UI Components (`app/(dashboard)/_components/desk/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `DeskFeed.tsx` | Client | Scrollable message feed + "Generate Meeting" button |
| `DeskMembers.tsx` | Server | Character cards with status indicators |
| `DeskStats.tsx` | Server | Process score, streak, violations, P&L |
| `DeskBook.tsx` | Server | Open positions from desk perspective |
| `MessageBubble.tsx` | Client | Individual message styling per character |

### Key Design Principles

1. **Single Gemini Call** — all 4 characters generated in one shot (~$0.01-0.03 per session)
2. **Data-Grounded** — every character statement backed by real data from `DeskContext`
3. **Anti-Hallucination** — prompt explicitly forbids fabricating prices/events
4. **Persistent Memory** — `desk_state` stores character memory across sessions
5. **Process > Outcome** — scoring evaluates discipline, not P&L

---

## Signals Hub

### Strategy Signals
Strategy signals from optimized indicator rules are stored in the `strategy_signals` table. Lifecycle: pending → approved → executed.

### Indicator Alerts
Individual indicator alerts from the optimizer.

### Generator
- **Generator**: `lib/signals/indicator-generator.ts`
- **Compression Signal**: `lib/signals/compression-signal-generator.ts`


---

## Data Layer (Supabase)

### Core Tables
| Table | Purpose |
|-------|---------|
| `trader_profile` | User profile + AI-observed traits |
| `risk_rules` | Max position, daily loss, drawdown limits |
| `trades` | Journal entries (entry, exit, SL, TP, status, OANDA sync) |
| `trade_screenshots` | Screenshots attached to trades |
| `trade_strategies` | Strategy steps per trade |
| `trade_pnl` | P&L per trade |
| `execution_log` | OANDA API call tracking |
| `trade_sync_log` | OANDA sync session history |
| `calendar_events` | Trading calendar with recurring support |
| `user_pair_notes` | Private "My Story" notes (RLS-protected, AI-excluded) |
| `trading_guru_notes` | Private mentor wisdom notes (RLS-protected, AI-excluded) |
| `technical_analyses` | Various analysis types |

### AI & Analysis Tables
| Table | Purpose |
|-------|---------|
| `wave_analysis` | Elliott Wave + auto-analysis |
| `big_picture_analysis` | Macro analysis |
| `structural_analysis_cache` | Gemini output + compression_springs (30min TTL) |
| `indicator_optimizations` | Optimized params per pair/TF (30-day expiry) |

### Story Tables
| Table | Purpose |
|-------|---------|
| `pair_subscriptions` | Which pairs user follows |
| `story_episodes` | AI narrative episodes per pair |
| `story_scenarios` | Binary scenarios with trigger/invalidation |
| `story_bibles` | Persistent arc memory per pair |
| `story_seasons` | Season grouping (20 episodes/season) |
| `story_agent_reports` | Intelligence reports (optimizer, news, cross-market, cms) |
| `story_positions` | AI-guided positions across episodes (suggested→active→closed) |
| `story_position_adjustments` | Journey log of SL/TP moves, partial closes per episode |

### Desk Tables
| Table | Purpose |
|-------|---------|
| `desk_meetings` | Morning meetings, trade reviews, ad-hoc sessions (4 character JSONB briefs) |
| `desk_messages` | Individual messages in desk chat feed |
| `process_scores` | Trade-level process grading (5 criteria, 1-10 scale) |
| `desk_state` | Persistent per-user state: character memory, streak, violations |

### CMS Tables
| Table | Purpose |
|-------|---------|
| `cms_analyses` | Conditional market shaping results (JSONB, 7-day expiry, RLS) |

### Scenario Analysis Tables
| Table | Purpose |
|-------|---------|
| `scenario_analyses` | Institutional-grade reports (5 JSONB sections, 24h expiry, RLS) |

### AI Usage Tables
| Table | Purpose |
|-------|---------|
| `ai_usage_logs` | Per-call token usage, cost estimates, latency, success/failure (RLS) |




### Notification Tables
| Table | Purpose |
|-------|---------|
| `notification_preferences` | Wake-up time, trading hours, alert prefs |
| `push_subscriptions` | Web Push device endpoints |

### Security
- **RLS enabled** on all user tables — policy: `auth.uid() = user_id`
- **No raw SQL** — all queries via Supabase JS client (parameterized)
- **Migrations**: `supabase/migrations/001_initial_core.sql` (368 lines, 16 tables)

---

## Background Tasks

Long-running operations that persist across page navigation.

| Module | Path | Side |
|--------|------|------|
| Manager | `lib/background-tasks/manager.ts` | Server only |
| Client | `lib/background-tasks/client.ts` | Browser only |
| Hook | `lib/hooks/use-background-task.ts` | React hook |
| Table | `background_tasks` | Supabase |

**IMPORTANT**: Never import `manager.ts` from client components — server/client split is mandatory.

---

## Notifications

### Web Push
- **Library**: `web-push` npm package
- **Module**: `lib/notifications/web-push.ts` (VAPID keys)
- **Hook**: `lib/hooks/use-push-notifications.ts`
- **Env**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

### Telegram
- **Module**: `lib/notifications/telegram.ts`
- **Env**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

### Dispatcher
- **Module**: `lib/notifications/notifier.ts` — routes to Web Push or Telegram based on user prefs

---

## OANDA Integration

- **Client**: `lib/oanda/client.ts` — REST API wrapper with retry logic
- **Account Config**: `lib/oanda/account.ts` — LIVE/DEMO account configurations
- **Sync**: `lib/sync/oanda-sync.ts` — Sync trades from OANDA to local DB
- **Demo URL**: `https://api-fxpractice.oanda.com`
- **Live URL**: `https://api-fxtrade.oanda.com`

---

## Utilities

| Module | Path | Purpose |
|--------|------|---------|
| ATR | `lib/utils/atr.ts` | Average True Range calculation |
| Indicators | `lib/utils/indicators.ts` | Technical indicator calculations |
| Trend Detector | `lib/utils/trend-detector.ts` | Trend assessment utility |
| Candlestick | `lib/utils/candlestick-patterns.ts` | Pattern recognition |
| Forex | `lib/utils/forex.ts` | Pip calculations, pair utilities |
| Market Cycles | `lib/utils/market-cycles.ts` | Cycle analysis |
| Market Sessions | `lib/utils/market-sessions.ts` | London, NY, Tokyo, Sydney hours |
| Pair Knowledge | `lib/utils/pair-knowledge.ts` | Pair metadata |
| Sentiment | `lib/utils/sentiment.ts` | Market sentiment analysis |
| Time Fibonacci | `lib/utils/time-fibonacci.ts` | Time-based Fib calculations |
| General | `lib/utils/utils.ts` | Shared utilities |

---

## Environment Variables

| Variable | Secret? | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase backend privileged key |
| `NEXT_PUBLIC_APP_URL` | No | App base URL |
| `OANDA_DEMO_API_KEY` | Yes | Demo trading API key |
| `OANDA_DEMO_ACCOUNT_ID` | Yes | Demo account ID |
| `OANDA_DEMO_API_URL` | No | `https://api-fxpractice.oanda.com` |
| `OANDA_LIVE_API_KEY` | Yes | Live trading API key |
| `OANDA_LIVE_ACCOUNT_ID` | Yes | Live account ID |
| `OANDA_LIVE_API_URL` | No | `https://api-fxtrade.oanda.com` |
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `GEMINI_API_KEY` | Yes | Gemini API key |
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API key |
| `VAPID_PUBLIC_KEY` | No | Web Push public key |
| `VAPID_PRIVATE_KEY` | Yes | Web Push private key |
| `VAPID_SUBJECT` | No | Web Push subject (email) |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Yes | Telegram recipient chat ID |
| `CRON_SECRET` | Yes | Bearer token for cron endpoints |
| `NODE_ENV` | No | `development` or `production` |

---

## Deployment (Railway)

### Config (`railway.json`)
- **Builder**: NIXPACKS
- **Start**: `npm start` → `cross-env HOSTNAME=0.0.0.0 node .next/standalone/server.js`
- **Health Check**: `GET /api/health` (120s timeout)
- **Restart**: ON_FAILURE

### Next.js Config (`next.config.ts`)
- **Output**: `standalone` (optimized for Railway)
- **File Tracing Root**: `__dirname` (fixes static asset 404s)
- **Security Headers**: X-Content-Type-Options, X-Frame-Options (DENY), HSTS (2yr), Referrer-Policy, Permissions-Policy

### Deploy Workflow
1. Code passes `npm run build` locally
2. `git push origin master`
3. Railway auto-deploys from GitHub `master` branch
4. NIXPACKS builds → standalone server starts
5. Health check at `/api/health` confirms deployment

---

## Security Patterns

- **Auth**: All API routes authenticate via `supabase.auth.getUser()` (except `/api/health`, `/api/market-indices`)
- **RLS**: Every user table has `auth.uid() = user_id` policy
- **Cron Auth**: Bearer `CRON_SECRET` token on all `/api/cron/*` routes
- **Rate Limiting**: AI calls limited to 5/hour per user (in-memory)
- **Pair Validation**: All pairs checked against `VALID_PAIRS` whitelist before AI calls
- **Headers**: HSTS, X-Frame-Options DENY, nosniff, strict Referrer-Policy
- **No Raw SQL**: All queries via Supabase JS client (parameterized)
- **Server-only secrets**: AI API keys never exposed to client
- **Private Data Vaults**: `user_pair_notes` and `trading_guru_notes` are strictly for human consumption; they are never sent to AI providers or analyzed by system agents.
- **CORS**: Handled by Next.js defaults + Supabase config

---

## Chart Color Convention

Centralized in `lib/ai/chart-style.ts` → `CHART_STYLE_PROMPT_BLOCK`. Injected into all AI prompts.

| Timeframe | Color |
|-----------|-------|
| Monthly (M) | RED |
| Weekly (W) | GREEN |
| Daily (D) | BLUE |
| 4-Hour (H4) | YELLOW |
| 1-Hour (H1) | WHITE |

---

## Key Data Modules

| Module | Path | Purpose |
|--------|------|---------|
| Analytics | `lib/data/analytics.ts` | P&L and performance queries |
| Calendar | `lib/data/calendar.ts` | Calendar event CRUD |
| Execution Logs | `lib/data/execution-logs.ts` | OANDA execution tracking |
| Risk Rules | `lib/data/risk-rules.ts` | Risk rule CRUD |
| Screenshots | `lib/data/screenshots.ts` | Screenshot management |
| Scenario Analyses | `lib/data/scenario-analyses.ts` | Scenario analysis CRUD |
| Stories | `lib/data/stories.ts` | Story data access |
| Trades | `lib/data/trades.ts` | Trade journal CRUD |
| Trader Profile | `lib/data/trader-profile.ts` | Profile management |
| Push Subs | `lib/data/push-subscriptions.ts` | Push subscription management |


---

## Supabase Client Setup

| Client | Path | Use Case |
|--------|------|----------|
| Browser | `lib/supabase/client.ts` | Client components |
| Server | `lib/supabase/server.ts` | Server components, API routes |
| Service | `lib/supabase/service.ts` | Backend (service role key) |
| Middleware | `lib/supabase/middleware.ts` | Session refresh |
