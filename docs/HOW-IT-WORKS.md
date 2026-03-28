# TradeDesk Forex — How It Works

> Complete technical and functional reference for the entire system.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [User Journey](#2-user-journey)
3. [The Story Engine](#3-the-story-engine)
4. [Intelligence Agents](#4-intelligence-agents)
5. [Scenario Monitor](#5-scenario-monitor)
6. [Position Tracker](#6-position-tracker)
7. [Anti-Hallucination System](#7-anti-hallucination-system)
8. [CMS Engine (Conditional Market Shaping)](#8-cms-engine)
9. [Daily Plan](#9-daily-plan)
10. [Unified Analysis](#10-unified-analysis)
11. [OANDA Integration](#11-oanda-integration)
12. [Dashboard](#12-dashboard)
13. [Background Tasks](#13-background-tasks)
14. [Notification System](#14-notification-system)
15. [Cron Schedule](#15-cron-schedule)
16. [Database Tables](#16-database-tables)
17. [Security Model](#17-security-model)

---

## 1. Architecture Overview

### Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) + TypeScript + React 19 |
| **Database** | Supabase (Postgres + Auth + RLS + Storage + RPC) |
| **AI** | Claude Opus 4.6 + Gemini 3 Flash + DeepSeek V3.2 |
| **Broker** | OANDA REST API v20 (demo + live) |
| **Deployment** | Railway (auto-deploy from GitHub `master`) |
| **Cron** | Supabase `pg_cron` + `pg_net` |
| **UI** | Tailwind CSS 4, Lucide icons, Recharts, Tiptap, ReactMarkdown |

### Supported Timeframes

Only 5: **Monthly (M), Weekly (W), Daily (D), 4-Hour (H4), 1-Hour (H1)**.

Lower timeframes (M15, M5, M1) were deliberately removed — AI cannot reliably predict them. The only execution strategy (PIPO) operates on H1.

### Supported Pairs

10 major/minor forex pairs:
`EUR/USD, GBP/USD, USD/JPY, EUR/GBP, AUD/USD, USD/CAD, NZD/USD, EUR/JPY, USD/CHF, GBP/JPY`

Enforced via a centralized whitelist at `lib/utils/valid-pairs.ts`.

### Tri-Model AI System

Three specialized AI models work in sequence — **all must succeed or the operation fails** (no fallbacks for analysis pipelines):

| Model | SDK | Role | Timeout |
|-------|-----|------|---------|
| **Gemini** `gemini-3-flash-preview` | `@google/genai` | Pattern Archaeologist — structural analysis, cycle detection, Fibonacci clusters, S/R mapping | 90s |
| **DeepSeek** `deepseek-chat` V3.2 | `openai` SDK | Quantitative Engine — zone validation, divergences, precise levels, risk model, flags suspicious data | 90s |
| **Claude** `claude-opus-4-6` | `@anthropic-ai/sdk` | Decision Architect — Elliott Wave, narrative synthesis, strategy gate, trade plan, coaching | 60-180s |

**Pipeline order**: Gemini (processes raw data) → DeepSeek (validates Gemini) → Claude (synthesizes both).

---

## 2. User Journey

### Setup

1. Sign up via Supabase Auth at `/signup`
2. Configure OANDA connection in `/settings` (demo or live API key)
3. Set risk rules in `/risk-rules` (max risk %, max daily loss, etc.)
4. Configure notifications in `/settings` (Telegram, wake-up time, trading hours)

### Daily Workflow

```
4:00 AM UTC  →  Intelligence Agents run (4 agents per subscribed pair)
5:00 AM UTC  →  Story episodes auto-generate (using agent intelligence)
Every 15 min →  Scenario Monitor checks live prices vs active triggers

User wakes up:
  1. Dashboard: Quick stats, volatile pairs, market sessions, account health
  2. Story page: Read new episodes, review scenarios, check position guidance
  3. Trade: Execute based on AI recommendations via OANDA integration
  4. Journal: Review closed trades, link to story episodes
```

### Navigation

Dashboard → Calendar → Story → Trading Gurus → Market News → Trade → Journal → Positions → Analytics → Risk Rules → Execution Log → AI Usage → References → Settings

---

## 3. The Story Engine

The flagship feature. Turns forex analysis into an ongoing narrative — each currency pair is a TV show, each analysis is an episode, organized into seasons.

### How an Episode is Generated

**Entry**: `generateStory(userId, pair, taskId)` in `lib/story/pipeline.ts`
**Duration**: ~4-5 minutes per episode (runs as background task)

#### Step 1 — Collect Market Data (10%)

`collectStoryData()` fetches ~1,020 candles across 5 timeframes from OANDA:

| Timeframe | Candles | What's Computed |
|-----------|---------|----------------|
| Monthly | 120 | RSI, MACD, ADX, BB Width, Stoch, ATR, SAR, EMAs, trends, patterns, swings |
| Weekly | 200 | Same |
| Daily | 200 | Same |
| H4 | 200 | Same |
| H1 | 300 | Same |

Also: current mid price, last 10 trades (with episode linkage), AMD phase detection per timeframe, liquidity zone mapping (equal highs/lows, stop hunts, order blocks), volatility status (spike/hot/normal/cold from ATR14/ATR50 ratio).

#### Step 2 — News Context (20%)

`summarizeNewsForStory()` fetches forex headlines + economic calendar, filters by pair currencies, uses Gemini to summarize into sentiment, key drivers, fundamental narrative, and an `avoidTrading` flag.

#### Step 3 — Load Intelligence (22%)

Fetches today's cached agent reports (4 agents — see [Intelligence Agents](#4-intelligence-agents)):
- Indicator Optimizer (DeepSeek)
- News Intelligence (Gemini)
- Cross-Market Effects (Gemini)
- CMS Intelligence (programmatic)

#### Step 4 — Load Continuity Context (25%)

All fetched in parallel:
- **Story Bible** — persistent arc memory for this pair
- **Last episode** — full narrative + scenarios
- **Resolved scenarios** — last 10 that triggered/invalidated
- **Season archive** — past season summaries for cross-season memory
- **Latest scenario analysis** — weekly institutional report
- **Active position** — current AI-tracked position for this pair
- **Risk context** — user's risk rules + OANDA account balance/margin

#### Step 5 — Gemini Structural Analysis (35%)

**Prompt**: `lib/story/prompts/gemini-structural.ts`

Gemini processes ALL raw multi-timeframe data and outputs:
- `structural_bias` — overall market direction
- `key_levels` — major resistance, support, liquidity targets
- `pattern_confluences` — multi-TF pattern alignments
- `cycle_assessment` — Wyckoff cycle phase
- `multi_tf_alignment` — agreement/divergence across timeframes
- `structural_narrative` — technical story summary

**Grounding rule**: Must only reference levels from actual candle data. Never fabricate.

#### Step 6 — DeepSeek Quantitative Validation (55%)

**Prompt**: `lib/story/prompts/deepseek-quant.ts`

DeepSeek receives Gemini's output and the raw indicators, then:
- Cross-validates every price level against actual swing highs/lows
- Detects divergences (bullish/bearish, hidden/regular)
- Computes precise entry, SL, TP1-3 levels
- Calculates risk metrics (R:R ratio, pip risk/reward, confluence score)
- **Flags suspicious levels** — any Gemini level not corresponding to real data

The `flagged_levels` array is critical — it feeds the anti-hallucination system.

#### Step 7 — Claude Narration (75%)

**Prompt**: `lib/story/prompts/claude-narrator.ts`

Claude receives everything and produces the final episode:

```
Inputs:
  ├── Gemini structural output
  ├── DeepSeek quant output (including flagged levels)
  ├── News context
  ├── Story Bible (full arc history)
  ├── Last episode narrative + scenarios
  ├── Resolved scenarios (what happened since last time)
  ├── Agent Intelligence Briefing (all 4 agents)
  ├── Season archive (past season summaries)
  ├── Active position context
  ├── Risk rules + account balance
  └── Volatility regime
```

**Output** (`StoryResult`):
- `story_title` — episode name (like a TV episode title)
- `narrative` — 3-5 paragraphs using character metaphors (Buyers vs Sellers)
- `characters` — buyers/sellers with strength level, momentum, narrative
- `current_phase` — accumulation / manipulation / distribution
- `scenarios` — exactly 2 binary outcomes, each with:
  - Title, description, probability
  - Trigger level + direction (precise price where scenario activates)
  - Invalidation level + direction (precise price where scenario fails)
- `key_levels` — entries, stop losses, take profits
- `confidence` — 0 to 1
- `bible_update` — updated arc summary, key events, character evolution, threads
- `is_season_finale` — AI decides based on narrative arc completion
- `position_guidance` — enter_long/enter_short/hold/adjust/close/wait with precise levels

**Prompt caching**: The narrator prompt is split at `## CURRENT DATA` — everything before (identity + rules + Bible + history) is cached, everything after (Gemini/DeepSeek/market data) is dynamic. ~90% cache hit rate.

#### Step 8 — Validate and Store (85-100%)

1. Parse Claude's JSON via `parseAIJson<StoryResult>()` (JSON5)
2. **Hard validate** scenarios: direction consistency, range check (within 3x ATR). Retry Claude on failure.
3. **Soft validate** all levels: within observed price range (5% buffer). Log warnings.
4. Store episode in `story_episodes`
5. Store scenarios in `story_scenarios` (linked to episode)
6. Process position guidance (create/adjust/close positions)
7. Update Story Bible (key_events capped at 15, resolved_threads at 10)
8. Check for season ending
9. Notify user

### Story Bible

One Bible per user+pair. Contains the full arc summary, key events, character evolution, unresolved/resolved threads, and dominant themes. Updated by Claude each episode — the AI rewrites the entire arc summary (not incremental).

### Season System

AI-driven season endings (not hardcoded):
- AI sets `is_season_finale = true` when the narrative arc completes (major S/R break, trend reversal, all threads resolved)
- Safety cap: 50 episodes per season
- Minimum: 5 episodes per season
- Past season summaries archived and fed to narrator for cross-season callbacks

---

## 4. Intelligence Agents

Four agents run daily at 4AM UTC (before story generation at 5AM). Each produces a report stored in `story_agent_reports`, then injected into Claude's "Intelligence Briefing."

### Agent 1: Indicator Optimizer (DeepSeek)

`lib/story/agents/indicator-optimizer.ts`

- Analyzes whether default indicator parameters (RSI 14, MACD 12/26/9, BB 20/2, etc.) are optimal for this pair
- Output: per-timeframe/indicator optimization recommendations + market regime (trending/ranging/volatile)
- Side effect: upserts optimized parameters into `indicator_optimizations` table (30-day expiry)

### Agent 2: News Intelligence (Gemini)

`lib/story/agents/news-intelligence.ts`

- Deep macro/fundamental analysis — economic outlook per currency, central bank rate paths, geopolitical factors
- Output: currency outlooks, rate trajectory analysis, institutional/retail sentiment, key risks with probability, upcoming catalysts

### Agent 3: Cross-Market Effects (Gemini)

`lib/story/agents/cross-market.ts`

- Fetches daily candles from relevant stock indices via OANDA (S&P 500, Dow, Nasdaq for USD; DAX, Euro Stoxx for EUR; FTSE for GBP; Nikkei for JPY; ASX for AUD)
- Computes 1D/5D/20D % changes + SMA trend
- Output: risk appetite assessment (risk-on/off/mixed), index-currency correlations, divergences, cross-market thesis

### Agent 4: CMS Intelligence (Programmatic — Zero AI Cost)

`lib/story/agents/cms-intelligence.ts`

- Purely programmatic TypeScript — no AI calls
- Computes ~36 conditional "IF X THEN Y" patterns from real candle data
- Filters: sample_size >= 15 AND probability >= 55%
- Output: top 15 conditions with exact statistics (probability, sample size, avg move in pips)
- Feeds into Claude as "PROGRAMMATIC STATISTICS" — AI cannot modify the numbers

### How Reports Feed Into Story

`buildIntelligenceBriefing()` in `claude-narrator.ts` combines all 4 reports into a structured briefing:
```
INTELLIGENCE BRIEFING
├── Indicator Health Report (optimizer)
├── Macro & Fundamental Intelligence (news)
├── Cross-Market Effects (cross-market)
└── Conditional Market Shape (CMS — programmatic stats)
```

This makes the narrator both a technical analyst AND an economist/fundamentalist.

---

## 5. Scenario Monitor

`lib/story/scenario-monitor.ts` — runs every 15 minutes via cron.

### How Auto-Resolution Works

1. **Market hours guard**: Only runs Sun 10PM – Fri 10PM UTC
2. **Fetch monitorable scenarios**: `status='active'` + `monitor_active=true` + trigger/invalidation levels set
3. **Batch price fetch**: Single OANDA API call for all unique pairs
4. **Evaluate each scenario**:
   - Price crosses trigger level in trigger direction → **TRIGGERED**
   - Price crosses invalidation level in invalidation direction → **INVALIDATED**
5. **Update**: Sets status, records `resolved_by='bot'`, adds outcome notes
6. **Notify**: Push notification per resolution
7. **Queue new episode** (triggered scenarios only):
   - Anti-spam: max 1 bot-triggered generation per pair per 6 hours
   - Fires `generateStory()` with `generationSource: 'bot'`

---

## 6. Position Tracker

Each episode, Claude outputs `position_guidance`. The pipeline auto-manages positions:

```
Lifecycle: suggested → active → partial_closed → closed
```

| Guidance | Action |
|----------|--------|
| `enter_long` / `enter_short` | Creates position + "open" adjustment |
| `adjust` | Updates SL/TP + records adjustment |
| `close` | Marks position closed + records adjustment |
| `hold` | Records "hold" for journey tracking |
| `wait` | No-op |

The active position (direction, entry, SL/TP, unrealized P&L, full adjustment history) is fed back to Claude in subsequent episodes.

**UI**: `PositionGuidanceCard` (current recommendation), `PositionJourney` (visual timeline across episodes), `ScenarioProximity` (price distance gauge to triggers).

**Tables**: `story_positions`, `story_position_adjustments`

---

## 7. Anti-Hallucination System

Five layers of protection against AI price fabrication:

| Layer | Where | Type |
|-------|-------|------|
| **Gemini grounding rules** | Structural prompt | Instruction: "ONLY reference levels from actual candle data" |
| **DeepSeek cross-validation** | Quant prompt | Must flag any Gemini level not matching real swing highs/lows |
| **Claude forbidden levels** | Narrator prompt | Flagged levels injected with "DO NOT USE" instruction |
| **`validateScenarioLevels()`** | Post-processing | Hard gate: direction consistency + range check. Retry on failure. |
| **`validateStoryLevels()`** | Post-processing | Soft check: all levels within observed range + 5% buffer. Log warnings. |
| **CMS source tagging** | CMS pipeline | All stats tagged `source: 'programmatic'` — AI forbidden from modifying |

---

## 8. CMS Engine

**Conditional Market Shaping** — programmatic pattern detection enhanced by AI interpretation.

### Phase 0 — Programmatic Computation (No AI)

`lib/cms/condition-engine.ts` iterates real candles to compute ~36 patterns across 5 categories:

| Category | Examples |
|----------|---------|
| **Daily** (~10) | Friday/Thursday relationships, inside days, gap fills, consecutive direction |
| **Weekly** (~8) | Monday setting weekly extremes, inside bars, mid-week reversals |
| **Session** (~8) | Quiet Asia predicting London expansion, overlap producing largest bar |
| **Volatility** (~6) | Quiet days predicting expansion, range expansion/contraction sequences |
| **Cross-Market** (~4) | S&P 500 correlation, inverse correlation, Nasdaq divergence |

All statistics are exact counts from real data — probability, sample size, average pip move.

### Phases 1-3 — AI Enhancement

| Phase | Model | Purpose |
|-------|-------|---------|
| **Phase 1** | Gemini | Ranks conditions by tradability, groups into clusters |
| **Phase 2** | DeepSeek | Validates market structure logic, flags coincidental patterns |
| **Phase 3** | Claude | Writes trader-friendly implications. **Forbidden from modifying statistics.** |

### CMS as Story Agent

When run as a Story Intelligence Agent (at 4AM), only Phase 0 runs — zero AI cost. Top 15 conditions feed into the narrator's Intelligence Briefing as "PROGRAMMATIC STATISTICS."

The CMS page (`/cms`) is not visible in navigation — it's an internal AI data source only.

---

## 9. Daily Plan

`lib/ai/prompts-daily-plan.ts`

AI coach "Manouk" generates a personalized morning briefing with 8-12 focused tasks. Characteristics:
- **ONE generation per day** — no regeneration allowed
- Knows all platform features by name and path
- Fetches volatility scanner data for pair recommendations
- Respects wake-up time + trading hours from notification preferences
- Background task tracking — generation continues if user navigates away
- References specific platform features in tasks (e.g., "Check the Story for EUR/USD at /story")

---

## 10. Unified Analysis

`lib/ai/prompts-unified-analysis.ts` + `lib/analysis/data-aggregator.ts`

Two modes:
- **Auto Mode**: OANDA data → optimize indicators → Fibonacci/patterns → tri-model AI analysis
- **Manual Mode**: Upload 5 timeframe screenshots (M, W, D, H4, H1) → AI analyzes images

Single AI call produces: Elliott Wave counting, strategy gate recommendation, trade plan, zones, TradingView drawings.

---

## 11. OANDA Integration

`lib/oanda/client.ts`

### Core Wrapper

`oandaFetch<T>()` provides:
- Retry logic: 3 attempts with exponential backoff (2s, 4s, 8s)
- 30s timeout per request
- Retries on: HTTP 429 (rate limit), 500+ (server), timeouts, network errors
- Response caching via Next.js `revalidate`

### Key Functions

| Function | Cache | Purpose |
|----------|-------|---------|
| `getAccountSummary()` | 10s | Balance, margin, NAV |
| `getOpenTrades()` | 5s | Current positions |
| `getCurrentPrices(instruments)` | 1s | Live bid/ask |
| `getCandles(params)` | none | Historical OHLC |
| `createMarketOrder(params)` | — | Execute trade (FOK) |
| `modifyTrade(id, params)` | — | Modify SL/TP |
| `closeTrade(id, units)` | — | Close position |

### Demo vs Live

Account mode stored in `oanda-mode` cookie. Candle data always fetched from demo config (ensures data availability even without live account).

---

## 12. Dashboard

`app/(dashboard)/page.tsx`

### Layout

```
┌─────────────────────────────────────────────────────┐
│ Hero: "Precision Terminal"          [New Execution]  │
├──────────────────┬──────────────────────────────────┤
│ Quick Stats:     │ Active Exposure │ Day P&L        │
│                  │ Total Volume    │ System Health   │
├──────────────────┴──────────────────────────────────┤
│ Left (8 cols)              │ Right (4 cols)          │
│ ┌────────────────────────┐ │ ┌────────────────────┐ │
│ │ Recent Execution Log   │ │ │ Market Sessions    │ │
│ │ (last 5 trades)        │ │ │ (Tokyo/London/NY)  │ │
│ └────────────────────────┘ │ ├────────────────────┤ │
│ ┌────────────────────────┐ │ │ Account Risk       │ │
│ │ Indicator Optimizer    │ │ ├────────────────────┤ │
│ │ Widget                 │ │ │ Volatile Pairs     │ │
│ └────────────────────────┘ │ ├────────────────────┤ │
│                            │ │ Market Indices     │ │
│                            │ │ (SPX,DAX,FTSE...) │ │
│                            │ ├────────────────────┤ │
│                            │ │ Journal Card       │ │
│                            │ └────────────────────┘ │
└────────────────────────────┴────────────────────────┘
```

### Volatile Pairs Widget

`lib/scanner/volatility-scanner.ts` — Composite tradability score:
- 55% volatility (ATR-based)
- 45% liquidity (OANDA spreads + order book depth)

---

## 13. Background Tasks

Long-running operations (story generation, CMS analysis) persist across page navigation.

### Server (`lib/background-tasks/manager.ts`)

```
createTask(userId, taskType, context)  →  task ID
updateProgress(taskId, percent, msg)   →  0-100%
completeTask(taskId, result)           →  done
failTask(taskId, error)                →  failed
```

### Client (`lib/background-tasks/client.ts`)

```
pollTask(taskId, onProgress, onComplete, onError)
  → Polls every 2s via Supabase client
  → Returns stop() function
```

### Flow

1. API route creates task → returns task ID immediately (HTTP 202)
2. Pipeline runs in background, updating progress
3. Client polls for progress → shows progress bar
4. User can navigate away and return — task persists in database

---

## 14. Notification System

| Channel | Tech | Used By |
|---------|------|---------|
| **Web Push** | `web-push` + VAPID keys | Story episodes, scenario triggers |
| **Telegram** | Bot token + chat ID | Briefings, alerts, story updates |

Dispatcher: `lib/notifications/notifier.ts` routes based on user's preferences.

---

## 15. Cron Schedule

All scheduled via Supabase `pg_cron` + `pg_net`. Authenticated with `Bearer CRON_SECRET`.

| Job | Schedule | Endpoint | Purpose |
|-----|----------|----------|---------|
| Scenario Analysis | Mon 3:30 AM UTC | `/api/cron/scenario-analysis` | Weekly institutional scenario report |
| Story Agents | 4:00 AM Mon-Fri | `/api/cron/story-agents` | 4 intelligence agents per subscribed pair |
| Story Generation | 5:00 AM Mon-Fri | `/api/cron/story-generation` | Auto-generate episodes for all subscriptions |
| Scenario Monitor | Every 15 min | `/api/cron/scenario-monitor` | Check active scenarios vs live OANDA prices |

---

## 16. Database Tables

### Core (User Data — PRESERVED on AI reset)
`trader_profile`, `risk_rules`, `trades`, `trade_pnl`, `trade_screenshots`, `trade_strategies`, `trade_sync_log`, `execution_log`, `calendar_events`, `user_pair_notes`, `trading_guru_notes`

### Story System (DELETED on AI reset)
`pair_subscriptions`, `story_episodes`, `story_scenarios`, `story_bibles`, `story_seasons`, `story_agent_reports`, `story_positions`, `story_position_adjustments`

### Analysis & AI (DELETED on AI reset)
`wave_analysis`, `big_picture_analysis`, `structural_analysis_cache`, `indicator_optimizations`, `technical_analyses`, `cms_analyses`, `scenario_analyses`

### Coaching & Plans (DELETED on AI reset)
`ai_coaching_sessions`, `coaching_memory`, `behavioral_analysis`, `daily_plans`, `daily_tasks`

### Strategy Lab (DELETED on AI reset)
`strategy_discoveries`, `lab_signals`, `lab_settings`, `lab_scan_history`, `lab_performance_snapshots`, `strategy_engines`, `strategy_signals`

### Infrastructure (PRESERVED)
`background_tasks`, `notification_preferences`, `push_subscriptions`, `ai_usage_logs`

---

## 17. Security Model

| Control | Implementation |
|---------|---------------|
| **Authentication** | All API routes use `getAuthUser()` (server-side JWT validation via `supabase.auth.getUser()`) |
| **Row-Level Security** | All user tables have `auth.uid() = user_id` policy |
| **Pair validation** | Centralized `isValidPair()` whitelist check on all routes accepting pair input |
| **Rate limiting** | Database-backed (5 AI calls/hour/user via `ai_usage_logs` count) |
| **Input bounds** | Numeric params bounded (days: 1-365, limit: 1-100, hoursAhead: 1-168) |
| **Cron auth** | All `/api/cron/*` routes validate `Bearer CRON_SECRET` |
| **API keys** | Server-side only via env vars — never exposed to client |
| **File uploads** | MIME type allowlist + 10MB size limit |
| **No raw SQL** | All queries via Supabase JS client (parameterized) |
