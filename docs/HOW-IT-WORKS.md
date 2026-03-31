# TradeDesk CFD — How It Works

> Complete technical and functional reference for the entire system.
> Covers both **forex pairs** and **CFD indices** (Nasdaq 100, S&P 500, DAX 40, Dow 30).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [User Journey](#2-user-journey)
3. [The Story Engine](#3-the-story-engine)
4. [Intelligence Agents](#4-intelligence-agents)
5. [Scenario Monitor](#5-scenario-monitor)
6. [Position Tracker](#6-position-tracker)
7. [Volatility Gate](#7-volatility-gate)
8. [How AI Handles Major News & Geopolitical Events](#8-how-ai-handles-major-news--geopolitical-events)
9. [Anti-Hallucination System](#9-anti-hallucination-system)
10. [CMS Engine (Conditional Market Shaping)](#10-cms-engine)
11. [The Desk (AI Trading Floor)](#11-the-desk)
12. [OANDA Integration](#12-oanda-integration)
13. [Dashboard](#13-dashboard)
14. [Background Tasks](#14-background-tasks)
15. [Notification System](#15-notification-system)
16. [Cron Schedule](#16-cron-schedule)
17. [Database Tables](#17-database-tables)
18. [Security Model](#18-security-model)

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

Lower timeframes (M15, M5, M1) were deliberately removed — AI cannot reliably predict them.

### Supported Instruments

**Forex Pairs** (10 major/minor):
`EUR/USD, GBP/USD, USD/JPY, EUR/GBP, AUD/USD, USD/CAD, NZD/USD, EUR/JPY, USD/CHF, GBP/JPY`

**CFD Indices** (4):
`NAS100/USD (Nasdaq 100), SPX500/USD (S&P 500), DE30/EUR (DAX 40), US30/USD (Dow 30)`

Forex pairs enforced via `lib/utils/valid-pairs.ts`. CFD indices detected by `lib/story/asset-config.ts`.

### Asset-Aware System

The system distinguishes between forex and indices at every layer:

| Aspect | Forex | CFD Index |
|--------|-------|-----------|
| **Unit** | Pips (×10,000) | Points (×1) |
| **Price precision** | 5 decimals | 1 decimal |
| **Story driver** | Technicals-first, fundamentals supplement | Fundamentals-first (Fed/ECB, earnings, sectors), technicals for precision |
| **News agent** | Central bank rate differentials, currency outlook | Monetary policy, earnings season, sector rotation, VIX |
| **Cross-market agent** | "How do indices affect this currency?" | "How do bonds, peers, and dollar affect this index?" |
| **Narrator tone** | Technical structure drives narrative | Fed policy, earnings, macro data drive narrative |

Asset type is detected by `getAssetConfig(pair)` in `lib/story/asset-config.ts`, which returns configuration including `type`, `pointLabel`, `pointMultiplier`, and rich metadata for indices (sector, central bank, peer instruments, bond instrument).

### Tri-Model AI System

Three specialized AI models work in sequence — **all must succeed or the operation fails**:

| Model | Role | Timeout |
|-------|------|---------|
| **Gemini** `gemini-3-flash-preview` | Pattern Archaeologist — structural analysis, cycle detection, Fibonacci clusters, S/R mapping | 90s |
| **DeepSeek** `deepseek-chat` V3.2 | Quantitative Engine — zone validation, divergences, precise levels, risk model, flags suspicious data | 90s |
| **Claude** `claude-opus-4-6` | Decision Architect — narrative synthesis, strategy gate, trade plan, desk character reactions | 60-180s |

**Pipeline order**: Gemini (processes raw data) → DeepSeek (validates Gemini) → Claude (synthesizes both).

---

## 2. User Journey

### Setup

1. Sign up via Supabase Auth at `/signup`
2. Configure OANDA connection in `/settings` (demo or live API key)
3. Set risk rules in `/risk-rules` (max risk %, max daily loss, etc.)
4. Configure notifications in `/settings` (Telegram, wake-up time, trading hours)
5. Subscribe to pairs/indices in `/story` (Story Hub)

### Daily Workflow

```
4:00 AM UTC  →  Intelligence Agents run (4 agents per instrument)
Event-Driven →  Story generation triggers ONLY when Scenario Monitor
                hits a price trigger or user manually begins
Every 15 min →  Scenario Monitor checks live prices vs active triggers

User wakes up:
  1. Dashboard: Account health, volatile instruments (forex + indices), sessions
  2. Story page: Read new episodes, review scenarios, check position guidance
  3. Trade: Execute based on AI recommendations via OANDA integration
  4. Journal: Review closed trades, link to story episodes
```

---

## 3. The Story Engine

The flagship feature. Turns market analysis into an ongoing narrative — each instrument is a TV show, each analysis is an episode, organized into seasons (trade cycles).

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

Also computed: current mid price, last 10 trades, AMD phase detection per timeframe, liquidity zone mapping, volatility status (spike/hot/normal/cold from ATR14/ATR50 ratio), Gann swing levels with opposite extremes.

**Pip/point location** is asset-aware: forex gets -4 (or -2 for JPY pairs), indices get -1.

#### Step 2 — News Context (20%)

`summarizeNewsForStory()` fetches headlines + economic calendar, filters by instrument currencies, uses Gemini to summarize into sentiment, key drivers, and an `avoidTrading` flag.

#### Step 3 — Load Intelligence (22%)

Fetches today's cached agent reports (4 agents — see [Intelligence Agents](#4-intelligence-agents)):
- Indicator Optimizer (DeepSeek) — same for forex and indices
- News Intelligence (Gemini) — **forex variant OR index variant** based on asset type
- Cross-Market Effects (Gemini) — **forex variant OR index variant** based on asset type
- CMS Intelligence (programmatic) — same for all

#### Step 4 — Load Continuity Context (25%)

All fetched in parallel:
- **Story Bible** — persistent arc memory for this instrument
- **Last episode** — full narrative + scenarios
- **Resolved scenarios** — last 10 that triggered/invalidated
- **Season archive** — past season summaries
- **Latest scenario analysis** — weekly institutional report
- **Active position** — current AI-tracked position + adjustment history
- **Risk context** — user's risk rules + OANDA account balance/margin
- **Psychology context** — trader's streak, focus area, violations

#### Step 5 — Gemini Structural Analysis (35%)

100% asset-agnostic. Gemini processes ALL raw multi-timeframe data and outputs structural bias, key levels, pattern confluences, cycle assessment, multi-TF alignment.

#### Step 6 — DeepSeek Quantitative Validation (55%)

100% asset-agnostic. Cross-validates every price level, detects divergences, computes precise entry/SL/TP levels, flags suspicious data.

#### Step 7 — Claude Narration (75%)

Claude receives everything and produces the final episode. The narrator prompt is **asset-aware**:

**For forex**: Technicals drive the narrative. Intelligence briefing shows base/quote currency outlooks, central bank rate differentials, index-to-currency correlations.

**For indices**: Fundamentals drive the narrative. Intelligence briefing shows Fed/ECB monetary policy, earnings season context, sector rotation, VIX/risk appetite, dollar impact, bond yields, peer index divergences.

The narrator prompt includes: `"IMPORTANT: For this index, FUNDAMENTALS drive the story. Fed policy, earnings, and macro data should be the primary narrative drivers."`

**Output** (`StoryResult`):
- `story_title` — episode name
- `narrative` — 3-5 paragraphs using character metaphors (Buyers vs Sellers)
- `scenarios` — exactly 2 binary outcomes with trigger/invalidation levels
- `position_guidance` — enter/hold/adjust/close/wait with precise levels
- `desk_messages` — 4-character desk reactions (position episodes only)
- `bible_update` — updated arc memory

#### Step 8 — Validate and Store (85-100%)

1. Parse Claude's JSON via `parseAIJson<StoryResult>()` (JSON5)
2. **Hard validate** scenarios (direction consistency, range check). Retry on failure.
3. **Soft validate** all levels (within observed range). Log warnings.
4. Store episode + scenarios in database
5. Process position guidance (create/adjust/close positions)
6. Update Story Bible
7. Notify user

### Season System (Trade-Cycle Driven)

Seasons are **not AI-driven** — they follow the trade cycle:

- Season = one trade cycle (analysis → entry → management → close)
- Season ends when: trade closes, user skips entry, or safety cap hit
- Past season summaries archived and fed to narrator for cross-season callbacks

### Episode Types

| Type | Trigger | AI Focus |
|------|---------|----------|
| `analysis` | Manual "Begin the Story" or first generation | Market structure, setup identification, scenario creation |
| `position_entry` | Scenario trigger fires | Entry recommendation with precise levels, lot sizing |
| `position_management` | Subsequent scenario trigger while position open | Hold/adjust/close recommendations |

---

## 4. Intelligence Agents

Four agents run daily at 4AM UTC. Each produces a report stored in `story_agent_reports`, then injected into Claude's "Intelligence Briefing."

### Agent 1: Indicator Optimizer (DeepSeek)

`lib/story/agents/indicator-optimizer.ts` — **Same for forex and indices**

Analyzes whether default indicator parameters are optimal for this instrument. Output: per-timeframe optimization recommendations + market regime.

### Agent 2: News Intelligence (Gemini)

**Routes based on asset type:**

**Forex** → `lib/story/agents/news-intelligence.ts`
- Central bank rate paths (Fed vs ECB vs BOJ)
- Base/quote currency outlooks
- Rate differential trends
- Geopolitical factors, institutional/retail sentiment

**CFD Index** → `lib/story/agents/news-intelligence-index.ts`
- **Monetary policy**: Fed stance (US indices) or ECB stance (DE30), rate path, QT/QE status
- **Economic outlook**: Growth trajectory, inflation, labor market, upcoming data
- **Earnings context**: Season status, notable reports, sector surprises
- **Risk appetite**: VIX assessment, institutional flow
- **Sector dynamics**: Leading/lagging sectors, rotation narrative
- **Dollar impact**: DXY trend and implication for the index

### Agent 3: Cross-Market Effects (Gemini)

**Routes based on asset type:**

**Forex** → `lib/story/agents/cross-market.ts`
- Question: "How do stock indices affect this currency pair?"
- Fetches relevant indices for each currency (S&P for USD, DAX for EUR, etc.)
- Output: risk appetite, index-currency correlations, divergences

**CFD Index** → `lib/story/agents/cross-market-index.ts`
- Question: "How do bonds, peer indices, and dollar affect this index?"
- Fetches: peer indices (NAS100↔SPX500↔US30), bond instruments (US 10Y, DE 10Y), EUR/USD as inverse dollar proxy
- Output: peer divergences, bond yield impact, dollar headwind/tailwind, correlation thesis

### Agent 4: CMS Intelligence (Programmatic — Zero AI Cost)

`lib/story/agents/cms-intelligence.ts` — **Same for forex and indices**

Purely programmatic. Computes ~36 conditional patterns from real candle data. Top 15 feed into narrator as "PROGRAMMATIC STATISTICS."

### How Intelligence Feeds Into Story

`buildIntelligenceBriefing()` in `claude-narrator.ts` renders the briefing conditionally:

- Detects asset type via `getAssetConfig(pair)`
- **Forex**: Base/quote outlook, central banks, rate differential, index correlations
- **Index**: Monetary policy, QT status, earnings, risk appetite, sector rotation, dollar impact, peer indices, bond yields

---

## 5. Scenario Monitor

`lib/story/scenario-monitor.ts` — runs every 15 minutes via cron.

### How Auto-Resolution Works

1. **Market hours guard**: `isMarketOpen()` — OANDA forex + CFD indices share same hours (Sun 10PM – Fri 10PM UTC)
2. **Fetch monitorable scenarios**: `status='active'` + trigger/invalidation levels set
3. **Candle close evaluation**: Uses completed candle close price (not spot) for triggers — prevents wick false triggers
4. **Spot price fallback**: For invalidation only (more urgent — a wick below support IS a break)
5. **Binary pair logic**: When one scenario triggers, sibling auto-invalidated via `deactivateSiblingScenarios()`
6. **Queue new episode**: Fires `generateStory()` with triggered scenario context (fire-and-forget)

---

## 6. Position Tracker

Each episode, Claude outputs `position_guidance`. The pipeline auto-manages positions:

```
Lifecycle: suggested → active → partial_closed → closed
```

| Guidance | Action |
|----------|--------|
| `enter_long` / `enter_short` | Creates position (status: 'active') |
| `set_limit_long` / `set_limit_short` | Creates position (status: 'suggested') |
| `adjust` | Updates SL/TP + records adjustment |
| `close` | Marks position closed → **season ends** |
| `hold` | Records "hold" for journey tracking |
| `wait` | No-op |

**Position sizing** is asset-aware:
- Forex: SL distance × pip multiplier (10,000 for standard, 100 for JPY)
- Indices: SL distance × point multiplier (1)
- Both scale by volatility regime and account balance

When a position closes, `endSeason()` is called — the trade cycle is complete.

**The AI never auto-executes trades.** It only provides guidance. The user has final say.

---

## 7. Volatility Gate

**Critical safety feature** — prevents position entries when the market is too quiet.

Located in `lib/story/pipeline.ts`, immediately after episode type determination:

```
IF episodeType === 'position_entry' AND volatilityStatus === 'cold' (ATR ratio < 0.7)
THEN downgrade to 'analysis'
```

**Why**: In a cold/compressed market, there's not enough movement to justify risk. The AI will still analyze the market and create scenarios, but won't recommend entering a position. This applies equally to forex pairs and CFD indices.

The narrator's **Volatility Doctrine** further reinforces this:
- **Cold** (ratio < 0.9): Recommend WAIT or very small size
- **Contracting Hard** (ratio < 0.7): Recommend WAIT with specific trigger levels — "When it breaks, it will be FAST"
- **Spike** (ratio > 1.5): Reduce lot size (more movement = more risk per pip)

---

## 8. How AI Handles Major News & Geopolitical Events

### Core Philosophy: React, Don't Predict

The system does NOT predict geopolitical outcomes. It **reacts to structural changes in price**.

### The News Pipeline

1. **Collection**: Headlines + economic calendar filtered by instrument
2. **News Intelligence Agent**: Deep macro/fundamental analysis (daily at 4AM)
   - Forex: Currency-specific central bank analysis
   - Index: Fed/ECB policy, earnings, sector dynamics
3. **Summarization**: Gemini produces sentiment + `avoidTrading` flag
4. **Narrator receives**: Technical structure + fundamental context + position state

### Black Swan Protection

- `avoidTrading` flag blocks new entries during high-impact news
- Scenario Monitor auto-invalidates broken scenarios
- New episodes generated with updated fundamental context
- Position guidance: FLAT, "don't catch falling knives"

---

## 9. Anti-Hallucination System

Five layers of protection against AI price fabrication:

| Layer | Where | Type |
|-------|-------|------|
| Gemini grounding rules | Structural prompt | "ONLY reference levels from actual candle data" |
| DeepSeek cross-validation | Quant prompt | Flags any Gemini level not matching real data |
| Claude forbidden levels | Narrator prompt | Flagged levels injected with "DO NOT USE" |
| `validateScenarioLevels()` | Post-processing | Hard gate: direction + range check. Retry on failure. |
| `validateStoryLevels()` | Post-processing | Soft check: within observed range + 5% buffer |

---

## 10. CMS Engine

**Conditional Market Shaping** — programmatic pattern detection.

Computes ~36 "IF X THEN Y" patterns from real candle data across 5 categories (daily, weekly, session, volatility, cross-market). All statistics are exact counts — probability, sample size, avg move. Zero AI cost when used as a Story agent.

---

## 11. The Desk (AI Trading Floor)

JP Morgan-style AI floor with 4 characters. **Lean integration** — 2 touchpoints only:

### Touchpoint 1: Story Position Reactions (Automatic)

When a position episode generates (entry or management), Gemini Flash fires a dedicated reaction pass:

- **Ray (Quant)**: Statistical edge, confluence metrics
- **Sarah (Risk)**: R:R check, lot size, references trader psychology
- **Alex (Macro)**: Macro alignment check
- **Marcus (PM)**: Final verdict (approved/caution/blocked)

Stored as `desk_messages`. Fire-and-forget — doesn't block the pipeline.

**Asset-aware**: Prompts use dynamic `pointLabel` ("pips" vs "points") and `pointMultiplier` instead of hardcoded forex values.

### Touchpoint 2: Pre-Trade Gatekeeper (Manual)

On the `/trade` page, clicking "Execute Order" triggers a desk review (`POST /api/desk/review`) before the OANDA order fires. Marcus's `final_verdict` determines if the trade proceeds:
- `approved` → user can execute
- `blocked` → Sarah's concerns shown, user must adjust

### Dashboard Metrics

`DeskStats` widget shows: Process Score, Streak, Violations, Today P&L.

---

## 12. OANDA Integration

`lib/oanda/client.ts`

### Core Wrapper

`oandaFetch<T>()` provides retry logic (3 attempts, exponential backoff), 30s timeout, response caching.

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

Works for both forex pairs and CFD indices — OANDA serves both through the same API.

---

## 13. Dashboard

`app/(dashboard)/page.tsx`

### Layout

```
┌──────────────────────────────────────────────┐
│ Dashboard                [New Execution]      │
├──────────────────┬───────────────────────────┤
│ OANDA Account    │ Risk Status               │
├──────────────────┼───────────────────────────┤
│ Volatility Engine│ Market Sessions            │
│ (Forex + Indices)│ (Tokyo/London/NY)          │
├──────────────────┴───────────────────────────┤
│ Desk Metrics (Process Score, Streak, P&L)     │
└──────────────────────────────────────────────┘
```

### Volatility Engine

Scans **19 instruments** (15 forex + 4 indices), shows top 8 by daily range %. Index entries show an "IDX" badge and 1-decimal pricing.

---

## 14. Background Tasks

Long-running operations persist across page navigation.

```
createTask(userId, taskType, context) → task ID
updateProgress(taskId, percent, msg)  → 0-100%
completeTask(taskId, result)          → done
failTask(taskId, error)               → failed
```

Client polls every 2s via Supabase, shows progress bar. User can navigate away and return.

---

## 15. Notification System

| Channel | Tech | Used By |
|---------|------|---------|
| **Web Push** | `web-push` + VAPID keys | Story episodes, scenario triggers |
| **Telegram** | Bot token + chat ID | Briefings, alerts, story updates |

---

## 16. Cron Schedule

All via Supabase `pg_cron` + `pg_net`, authenticated with `Bearer CRON_SECRET`.

| Job | Schedule | Purpose |
|-----|----------|---------|
| Scenario Analysis | Mon 3:30 AM UTC | Weekly institutional scenario report |
| Story Agents | 4:00 AM Mon-Fri | 4 intelligence agents per instrument |
| Scenario Monitor | Every 15 min | Check scenarios + trigger stories (event-driven) |

---

## 17. Database Tables

### Core (User Data — PRESERVED on AI reset)
`trader_profile`, `risk_rules`, `trades`, `trade_pnl`, `trade_screenshots`, `trade_strategies`, `trade_sync_log`, `execution_log`, `calendar_events`, `user_pair_notes`, `trading_guru_notes`

### Story System (DELETED on AI reset)
`pair_subscriptions`, `story_episodes`, `story_scenarios`, `story_bibles`, `story_seasons`, `story_agent_reports`, `story_positions`, `story_position_adjustments`

### Desk System
`desk_meetings`, `desk_messages`, `process_scores`, `desk_state`

### Analysis & AI (DELETED on AI reset)
`wave_analysis`, `big_picture_analysis`, `structural_analysis_cache`, `indicator_optimizations`, `technical_analyses`, `cms_analyses`, `scenario_analyses`

### Infrastructure (PRESERVED)
`background_tasks`, `notification_preferences`, `push_subscriptions`, `ai_usage_logs`

---

## 18. Security Model

| Control | Implementation |
|---------|---------------|
| **Authentication** | All API routes use `getAuthUser()` (server-side JWT validation) |
| **Row-Level Security** | All user tables have `auth.uid() = user_id` policy |
| **Pair validation** | Centralized `isValidPair()` whitelist + `getAssetConfig()` for indices |
| **Rate limiting** | Database-backed (5 AI calls/hour/user) |
| **Cron auth** | All `/api/cron/*` validate `Bearer CRON_SECRET` |
| **API keys** | Server-side only via env vars — never exposed to client |
| **No raw SQL** | All queries via Supabase JS client (parameterized) |
