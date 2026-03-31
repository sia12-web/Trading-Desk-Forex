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
7. [How AI Handles Major News & Geopolitical Events](#7-how-ai-handles-major-news--geopolitical-events)
8. [Anti-Hallucination System](#8-anti-hallucination-system)
9. [CMS Engine (Conditional Market Shaping)](#9-cms-engine)
10. [OANDA Integration](#10-oanda-integration)
11. [Dashboard](#11-dashboard)
12. [Background Tasks](#12-background-tasks)
13. [Notification System](#13-notification-system)
14. [Cron Schedule](#14-cron-schedule)
15. [Database Tables](#15-database-tables)
16. [Security Model](#16-security-model)

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

Lower timeframes (M15, M5, M1) were deliberately removed — AI cannot reliably predict them. The system focuses on H1 and above for all execution and analysis.

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
| Claude claude-opus-4-6 | @anthropic-ai/sdk | Decision Architect — Elliott Wave, narrative synthesis, strategy gate, trade plan | 60-180s |

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
4:00 AM UTC  →  Intelligence Agents run (4 agents per pair)
Event-Driven  →  Story generation triggers ONLY when Scenario Monitor hits a price trigger or position requires management.
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
- **Active position** — current AI-tracked position + adjustment history
- **Risk context** — user's risk rules + OANDA account balance/margin
- **Psychology context** — trader's streak, focus area, and violations

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
- `position_guidance` — enter_long/enter_short/set_limit_long/set_limit_short/hold/adjust/close/wait with precise levels
- `desk_messages` — Unified Morning Meeting huddle with Ray, Sarah, Alex, and Marcus (Position Episodes only)
- `desk_evaluation` — Final PM verdict (approved/caution/blocked) and institutional reasoning

**Unified Desk Characters**:
- **RAY (Quant)**: Statistical edge, candle confirmations (EMA/ADR/ATR), clinical tone.
- **SARAH (Risk)**: The iron hand. Cross-references guidance against trader's **Psychology Context** (slumps/violations/weaknesses).
- **ALEX (Macro)**: Connects trade to central bank narratives and key fundamental catalysts.
- **MARCUS (PM)**: The decider. Reviews the Bible's season arc and gives the final verdict.

**Prompt caching**: The narrator prompt is split at `## CURRENT DATA` — everything before (identity + rules + Bible + history) is cached. ~90% cache hit rate.

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
| `enter_long` / `enter_short` | Creates position (status: 'active') + 'open' adjustment |
| `set_limit_long` / `set_limit_short` | Creates position (status: 'suggested') + 'pending' adjustment |
| `adjust` | Updates SL/TP + records adjustment |
| `close` | Marks position closed + records adjustment |
| `hold` | Records "hold" for journey tracking |
| `wait` | No-op |

The active position (direction, entry, SL/TP, unrealized P&L, full adjustment history) is fed back to Claude in subsequent episodes.

**UI**: `PositionGuidanceCard` (current recommendation), `PositionJourney` (visual timeline across episodes), `ScenarioProximity` (price distance gauge to triggers).

**Tables**: `story_positions`, `story_position_adjustments`

### Position Sizing & Leverage Management

**Critical Philosophy**: The AI has access to your capital and leverage information. It understands that brokers profit when traders lose, and that over-leveraging is the #1 cause of retail account blowups.

#### How Position Sizing Works

When Claude outputs `position_guidance`, it includes:
```json
{
  "action": "enter_long",
  "entry_price": 1.0850,
  "stop_loss": 1.0820,
  "take_profits": [1.0890, 1.0920, 1.0950],
  "position_size_lots": 0.05,
  "risk_percent": 1.0,
  "reasoning": "Conservative entry due to volatility spike..."
}
```

#### AI's Position Sizing Context (What Claude Knows)

Each episode, Claude receives:
1. **Your risk rules** from `risk_rules` table:
   - Max risk per trade (% of balance)
   - Max daily loss limit
   - Max open trades simultaneously
   - Max position size (lots)
   - Min reward/risk ratio
2. **Your OANDA account** from `getAccountSummary()`:
   - Available balance (USD)
   - Current margin used
   - Unrealized P&L on open positions
   - Open trade count
3. **Current market conditions**:
   - Volatility regime (spike/hot/normal/cold)
   - ATR (pip volatility measurement)
   - Spread size (broker's cut)
   - Recent drawdown history

#### Conservative Sizing Rules (Hardcoded in Narrator Prompt)

Claude is instructed to:

| Volatility Regime | Max Risk per Trade | Lot Size Multiplier |
|-------------------|-------------------|---------------------|
| **Spike** (ATR >1.5x) | 0.5% of balance | 0.25x normal |
| **Hot** (ATR 1.1-1.5x) | 0.75% of balance | 0.5x normal |
| **Normal** (ATR 0.9-1.1x) | 1.0% of balance | 1.0x normal |
| **Cold** (ATR <0.9x) | 1.5% of balance | 1.25x normal |

**Additional constraints**:
- If account is down >5% this week: Halve all position sizes
- If 3+ consecutive losses: Skip next trade (wait for confirmation)
- If open positions already at 50%+ margin: Wait, no new entries
- If entry-to-SL distance >2x ATR: Skip (stop too wide = overleveraged)
- Never exceed user's `max_position_size` from risk rules (hard limit)

#### Anti-Broker Exploitation

The AI is explicitly told:
```
"Brokers make money when traders lose. Retail traders typically lose due to:
1. Over-leveraging (risking 5-10% per trade)
2. No stop losses (letting losses run)
3. Revenge trading after losses
4. Trading during news spikes (widened spreads)

Your job: Keep the user ALIVE. Conservative sizing > aggressive profits.
If volatility is spiking or the user is in drawdown, recommend WAIT."
```

#### Position Guidance Types

| Action | When AI Recommends |
|--------|-------------------|
| `enter_long` / `enter_short` | High-confidence setup + user has capital + volatility is normal |
| `wait` | Unclear structure, volatility spike, user in drawdown, or spread too wide |
| `hold` | Existing position is still valid, no adjustments needed |
| `adjust` | Move SL to breakeven, trail SL, or take partial profit at TP1 |
| `close` | Invalidation imminent or profit target hit |

#### Lot Size Calculation Example

```
User balance: $10,000
Risk per trade: 1.0% = $100
Entry: 1.0850
Stop Loss: 1.0820
Risk in pips: 30 pips

Lot size = Risk $ / (Pips at risk × Pip value)
         = $100 / (30 × $10 per pip for 0.1 lot)
         = 0.33 lots

But if volatility is "hot" → multiply by 0.5 → 0.165 lots (rounded to 0.15)
```

Claude outputs the final lot size in `position_size_lots`, respecting all constraints.

#### User Control

The user **always** has final say:
1. AI suggests position → stored as `status='suggested'` in `story_positions`
2. User reviews recommendation in UI (`PositionGuidanceCard`)
3. User clicks "Activate Position" → `activatePosition()` sets `status='active'`
4. User manually executes via `/trade` page (OANDA API)
5. User can link OANDA trade to Story position for P&L tracking

**The AI never auto-executes trades.** It only provides guidance.

#### Monitoring Open Positions

If a Story position is active, Claude receives it in the next episode:
```
ACTIVE STORY POSITION
Direction: LONG
Entry: 1.0850
Current SL: 1.0830 (breakeven)
Current TP1: 1.0890 (hit), TP2: 1.0920 (pending), TP3: 1.0950 (pending)
Unrealized P&L: +40 pips
Opened in: Season 2, Episode 12
Adjustments: 3 (SL to breakeven, partial close at TP1, TP2 trail)
```

Claude can then recommend:
- Trail SL further if momentum continues
- Close remaining position if invalidation approaches
- Partial close at TP2 to lock in profit
- Hold if structure is still intact

---

### Profitable Trader Psychology: Let Winners Run, Cut Losers Fast

**Core Philosophy**: The system is designed around the psychology of consistently profitable traders — asymmetric risk/reward through position management, not prediction accuracy.

#### The Winning Formula

```
Profitable Trading = (Win Rate × Avg Win) - (Loss Rate × Avg Loss) > 0

Example A (Typical Retail - LOSING):
  40% win rate × $200 avg win = $80
  60% loss rate × $150 avg loss = $90
  Net: -$10 per trade (NEGATIVE)

Example B (Profitable Trader - WINNING):
  40% win rate × $500 avg win = $200  ← Winners run
  60% loss rate × $50 avg loss = $30   ← Losers cut fast
  Net: +$170 per trade (POSITIVE)
```

The AI is calibrated for **Example B psychology** — not chasing high win rates, but maximizing the W/L ratio through disciplined management.

#### Principle 1: Cut Losers Immediately

**AI's stop-loss discipline**:
- Initial SL is placed at technical invalidation (not arbitrary % loss)
- If price moves against entry by 50% of the stop distance within 4 hours → recommend immediate exit
- **No hope, no prayer, no "it will come back"** — invalidation = close
- Better to take 10 small losses than 1 catastrophic loss

**Hardcoded rule**: If SL is hit, Claude will recommend `close` in the next episode. No suggestions to "widen the stop" or "average down." The trade thesis broke — accept it and move on.

#### Principle 2: Let Winners Run (Trail Aggressively)

**AI's profit management**:
- TP1 (first target): Take 30-40% off to lock in profit (removes emotional attachment)
- Move SL to breakeven immediately after TP1 hit (trade is now "risk-free")
- TP2: Take another 30-40% (now 60-80% of position is secured)
- TP3 (runner): Let the final 20-40% run with **trailing stop**
  - Trail SL by 50% of the move (if price moves +100 pips, trail SL +50 pips)
  - Let momentum exhaust naturally — don't exit early out of fear

**Key insight**: The "runner" (20-40% left after TP1/TP2) is where big profits come from. In trending markets, this runner can capture 3-5x the initial risk. This is how profitable traders achieve asymmetric outcomes.

#### Principle 3: Scaling In When Structure Confirms

**The "add to winners" strategy**:

When the market is "calling out loud" (strong directional move with clear structure), the AI can suggest **adding to the winning position** — but ONLY if:

1. **Original position is already in profit** (at least +50% of TP1 distance)
2. **Stop loss is at breakeven or better** (downside is protected)
3. **New entry has valid technical structure** (pullback to support in uptrend, or bounce off resistance in downtrend)
4. **Total position size still within risk limits** (combined lots don't exceed max_position_size)
5. **Volatility is normal or cooling** (not spiking — spikes = trap)
6. **No major news event in next 8 hours** (avoid gap risk)

**Example scenario**:
```
Episode 1: "Enter LONG at 1.0850, SL 1.0820, TP1 1.0890"
  → User enters 0.1 lots

Episode 2: Price now at 1.0880 (+30 pips)
  → AI: "The bullish structure is confirmed. Buyers are dominant.
         Recommendation: Add 0.05 lots at 1.0875 (pullback entry),
         SL 1.0850 (original entry = breakeven for position 1).
         Move original position's SL to 1.0850 (breakeven)."
  → Now: 0.1 lots from 1.0850 + 0.05 lots from 1.0875 = 0.15 lots total

Episode 3: Price at 1.0920 (TP1 hit)
  → AI: "TP1 reached. Take 50% off (0.075 lots) = lock $225 profit.
         Remaining: 0.075 lots. Trail SL to 1.0885 (+35 pips from breakeven).
         Let the runner capture the full trend."
```

**Why this works**:
- By the time you add the 2nd position, the 1st is already secured (SL at breakeven)
- You're risking the SAME absolute $ (because SL on position 2 is at the entry of position 1)
- You're increasing exposure to a **proven winning trade**, not averaging into a loser
- If the trade reverses, you still exit at breakeven (no loss)
- If the trade continues, you capture the trend with a larger position

#### Principle 4: Never Average Down (No "Doubling Down" on Losers)

**Explicitly forbidden**:
- If position 1 is in drawdown, the AI will **NEVER** suggest adding to it
- "Averaging down" = hope-based trading, not edge-based trading
- Only scale into **confirmed winners**, never into losing positions

**The AI knows**:
```
Adding to a loser = Turning a small loss into a potential account blowup
Adding to a winner = Maximizing edge when the market confirms your thesis
```

#### Principle 5: Pyramid Sizing (Smaller Adds as Price Extends)

When scaling in, each additional position should be **smaller** than the previous:

```
Position 1: 0.10 lots (initial risk: $100)
Position 2: 0.05 lots (half size — risk: $50)
Position 3: 0.03 lots (30% of original — risk: $30)
```

**Why**: Price is further from the original entry. Even though the structure is bullish, the probability of a pullback increases as price extends. Smaller adds = protection against getting caught in a reversal.

Claude is instructed to **automatically reduce position size by 50%** for each additional entry in a scaling sequence.

#### Principle 6: Risk Management for Multi-Position Scaling

**Hard limits when scaling**:
- Max 3 entries per trend (original + 2 adds)
- Each add must have its own technical justification (not just "price is going up")
- Combined position size cannot exceed user's `max_position_size` from risk rules
- Combined **margin used** across all open positions cannot exceed 60% of account balance
- If any add fails to move into profit within 8 hours, close it (don't let adds become deadweight)

**Total risk protection**:
```
Position 1: Risk $100, now at breakeven (risk = $0)
Position 2: Risk $50 (SL at position 1 entry), now in profit
Position 3: Risk $30 (SL at position 2 entry)

Total risk on the trade = $30 (only the last add is at risk)
Total exposure = 0.18 lots (captures the full trend if it continues)
```

This is how profitable traders achieve **10:1 or 20:1 R:R ratios** — not by predicting, but by managing.

#### AI's Role: Psychological Alignment

Each episode, Claude's narrator assesses:
1. **Is the current position winning or losing?**
   - Winning: Consider trail stops, partial profits, or scaling in
   - Losing: Respect the stop, no hope, no averaging down
2. **Is the structure getting stronger or weaker?**
   - Stronger: Suggest scale-in if criteria met
   - Weaker: Tighten stops, take profits early
3. **Is the user emotionally aligned?**
   - If recent losses: Recommend smaller sizing or wait (avoid revenge trading)
   - If recent wins: Suggest letting the winner run (don't exit early out of fear)
4. **Is the market "calling out loud"?**
   - Clear trend + momentum + institutional buying/selling = scale-in opportunity
   - Choppy/ranging/unclear = single position only, conservative exits

#### Example Episode Narratives

**Scaling in (bullish confirmation)**:
> "The Buyers have seized control. The 1.0850 support held like a fortress, and they're now marching toward 1.0920. Your current position from 1.0865 is secured (SL at breakeven, +35 pips unrealized). The structure is screaming: this is not a fakeout.
>
> **Position Guidance**: Consider adding 0.05 lots at 1.0880 (pullback to the breakeven cluster). New SL: 1.0865 (your original entry). This scales your exposure into a confirmed winner while keeping total risk at $50. If the Buyers continue, you'll ride the full trend with 0.15 lots. If they fail here, you exit near breakeven."

**Cutting a loser (invalidation)**:
> "The structure has broken. Sellers reclaimed 1.0820, which was the line in the sand. Your thesis was that Buyers would hold this level — they didn't. The market has spoken.
>
> **Position Guidance**: Close the position at market. Loss: ~30 pips ($30 on 0.1 lots). Accept it and move on. This is not a reflection on your analysis — it's part of the game. The edge comes from taking many small losses and a few big wins. This is a small loss."

**Letting a winner run (trail stop)**:
> "TP1 hit. You've locked $120 profit (40% of position closed). The remaining 0.06 lots is your runner. The Buyers are not done — momentum is still strong, and the Daily timeframe is wide open to 1.0980.
>
> **Position Guidance**: Trail your stop to 1.0890 (now +40 pips above breakeven). Let this runner breathe. Don't exit early out of fear. The goal is not to 'lock in profits' on the runner — the goal is to **capture the full move**. If it reverses, you'll still bank +40 pips on the runner (+$120 on TP1 portion = $240 total). If it continues to 1.0980, you'll bank +130 pips on the runner = $780 total profit."

---

### Summary: AI as Your Disciplined Partner

The system doesn't try to **predict** — it tries to **manage**. The AI knows:
- Small losses are tuition, not failure
- Big wins come from letting runners ride
- Scaling into winners amplifies edge
- Averaging into losers destroys accounts
- Discipline > prediction

**You and the AI are aligned on one goal**: Survive long enough to catch the big trends, cut the noise fast, and compound asymmetric outcomes.

---

## 7. How AI Handles Major News & Geopolitical Events

### The Core Philosophy: React, Don't Predict

When the user asks: *"What if war breaks out with Iran? What if the USA wins vs. Iran wins?"* — the AI's answer is: **"I don't know, and I don't try to predict."**

The system does NOT attempt to forecast geopolitical outcomes. Instead, it **reacts to structural changes in price** caused by those outcomes. This is a critical distinction.

### The News Pipeline

#### Step 1: News Collection (`lib/story/news-summarizer.ts`)

Every time a Story episode is generated, the system fetches:
- **Headlines**: Recent news from ForexFactory API
- **Economic Calendar**: High-impact events (NFP, CPI, FOMC, central bank decisions)

News is **filtered by pair currencies** (e.g., for EUR/USD, only events affecting EUR or USD are included).

#### Step 2: News Intelligence Agent (`lib/story/agents/news-intelligence.ts`)

One of the 4 daily intelligence agents (runs at 4AM UTC before story generation):
- **Model**: Gemini (gemini-3-flash-preview)
- **Purpose**: Deep macro/fundamental analysis
- **Outputs**:
  - `macro_environment`: Global risk sentiment (risk-on/risk-off)
  - `central_bank_analysis`: Fed/ECB/BOJ paths (hawkish/dovish signals)
  - `geopolitical_factors`: Wars, elections, trade conflicts
  - `sentiment_shift`: Direction and magnitude of fundamental sentiment change
  - `key_drivers`: Top 3 factors moving the pair

This report is stored in `story_agent_reports` and injected into the Claude narrator's prompt as "Intelligence Briefing."

#### Step 3: News Summarization (`StoryNewsContext`)

Gemini processes the filtered news and produces:
```typescript
{
  sentiment: 'bullish' | 'bearish' | 'neutral',
  key_drivers: ['Central bank hawkish pivot', 'Risk appetite improving'],
  fundamental_narrative: 'Fed signaling rate cuts while ECB holds firm...',
  avoidTrading: true | false  // true if high-impact news within 2 hours
}
```

The `avoidTrading` flag is critical — if a major news event (NFP, FOMC, war declaration) is imminent, the AI will factor this into position guidance.

#### Step 4: Claude Narrator Receives News Context

The narrator prompt (`lib/story/prompts/claude-narrator.ts`) includes:
- Line 218: `${news.avoidTrading ? '\n⚠️ HIGH-IMPACT NEWS IMMINENT — factor this into the story.' : ''}`
- Line 576: `Geopolitical Factors: ${news.geopolitical_factors.join('; ') || 'None significant'}`

Claude sees:
1. **Technical structure** (AMD phases, liquidity, scenarios)
2. **Fundamental context** (news, central banks, geopolitics)
3. **Position state** (current entries, P&L, adjustments)

### What Happens During a Black Swan Event?

Let's walk through **"War with Iran"** as an example:

#### Before the Event
- EUR/USD is in Accumulation phase
- Active scenario: "Bullish breakout above 1.0920"
- User has 0.1 lot long position from 1.0850
- Trigger: 1.0920 (direction: above), Invalidation: 1.0820 (direction: below)

#### Event Occurs (e.g., USA attacks Iran)
- **Immediate market reaction**: Risk-off deluge
- EUR/USD plunges 200 pips in 2 hours to 1.0650
- Scenario invalidated (price smashed through 1.0820)

#### What the AI Does (Step-by-Step)

**1. Scenario Monitor Bot Detects Invalidation** (`lib/story/scenario-monitor.ts`)
- Runs every 15 minutes
- Checks: `price < 1.0820` (invalidation_level, direction: below)
- **Auto-resolves scenario** as `invalidated`
- **Auto-triggers new episode generation** (if >6 hours since last bot-triggered episode)

**2. News Intelligence Agent Captures Context** (next 4AM run)
- Detects: `geopolitical_factors: ['Iran-USA military conflict escalation']`
- Macro environment: `risk_off`
- Sentiment shift: `strong_bearish` (safe-haven flows to USD, away from EUR)

**3. New Episode Generated**
The narrator receives:
- **Technical**: Structure broken, Accumulation phase invalidated, new Manipulation phase
- **Fundamental**: War narrative, risk-off, USD strength
- **Position state**: User's long position hit stop-loss at 1.0820 (-30 pips, -$30)

Claude writes an episode like:

> **Episode Title**: "The Safe-Haven Deluge"
>
> The market has spoken with violence. The Iran-USA conflict ignited a flight to safety, and EUR/USD became collateral damage. The Buyers, who seemed in control just hours ago, were obliterated. The 1.0820 support — which looked like a fortress — shattered like glass.
>
> **What Happened**:
> - Risk-off tsunami: S&P 500 -3%, Gold +4%, USD +2%
> - EUR/USD plunged 200 pips in 2 hours
> - Your bullish scenario invalidated (price smashed 1.0820)
> - Position stopped out at 1.0820: -30 pips, -$30
>
> **The New Structure**:
> We are now in **Manipulation phase** — the Sellers have seized control. The question is: where do they pause?
>
> Potential floor: **1.0580** (Monthly support from 2023)
> Resistance overhead: **1.0750** (now acting as ceiling)
>
> **Position Guidance**: FLAT (no position)
> - Do NOT try to "buy the dip" yet — this is a knife falling
> - Wait for stabilization (price consolidates for 24+ hours)
> - Let the dust settle before re-entering
> - If war escalates further, expect another leg down to 1.0500
>
> **New Scenarios**:
> 1. **Bearish continuation**: Break below 1.0650 → target 1.0580
> 2. **Mean reversion bounce**: Hold 1.0650, bounce to 1.0750 (short opportunity)

**4. User Sees the Episode**
- Old scenario marked "invalidated"
- New episode explains what happened (fundamentals + technicals)
- Position guidance: FLAT, avoid catching knives
- New scenarios reflect the risk-off reality

#### If the War Outcome Changes (e.g., "USA Wins" or "Iran Wins")

The AI **still doesn't predict** which outcome will occur. Instead:
- If peace talks emerge → Risk-on, EUR/USD rallies back
- If conflict escalates → More risk-off, USD strength continues
- Scenario Monitor keeps checking prices vs. trigger/invalidation levels
- New episodes generated as structure evolves

**The AI follows the price, not the headline.** Headlines provide context, but price action is the truth.

### Season Finales Triggered by Fundamental Shifts

From the narrator prompt (line 470):
> "Consider ending the season if... a fundamental shift occurred (central bank policy change, geopolitical event)"

When a major event like "war with Iran" occurs, Claude can choose to end the current season and start Season 2. This resets the Bible, allowing the AI to write a fresh narrative arc without being anchored to the old bullish thesis.

### The `avoidTrading` Flag

If the News Intelligence Agent detects high-impact news within 2 hours (e.g., FOMC announcement, war escalation, central bank decision), the `avoidTrading` flag is set to `true`.

Claude's response:
> "⚠️ HIGH-IMPACT NEWS IMMINENT — avoid opening new positions. If you have an open position, tighten stops or close entirely. Volatility will spike, and slippage will be severe."

This protects the user from getting whipsawed during event-driven chaos.

### What the AI Does NOT Do

❌ **Predict geopolitical outcomes** ("USA will win the war")
❌ **Predict news events** ("Iran will attack next week")
❌ **Recommend positions based on headlines alone** ("War = buy USD")

### What the AI DOES Do

✅ **React to structural changes** (price broke support = invalidate scenario)
✅ **Incorporate fundamental context** (war = risk-off = USD strength)
✅ **Protect capital during chaos** (avoidTrading flag, tighten stops)
✅ **Adapt scenarios to new reality** (bullish thesis dead → new bearish scenarios)
✅ **Update Bible with new arc** (Season 2: risk-off regime)

### Summary: News as Context, Not Prediction

When you ask: *"What if war with Iran goes the other way?"* — the system's answer is:

**"I don't know which way it will go. But I'll watch the price. If EUR/USD rallies (peace talks), I'll adjust scenarios bullishly. If it collapses (escalation), I'll adjust scenarios bearishly. The market is smarter than me — I follow its lead."**

The AI is not a fortune teller. It's a **structural analyst with fundamental awareness**. It uses news to understand *why* price is moving, but it doesn't try to predict *what* news will happen or *how* news will resolve.

This is the only sustainable approach in a chaotic, unpredictable market.

---

## 8. Anti-Hallucination System

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

## 9. CMS Engine

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

---

## 10. OANDA Integration

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

## 11. Dashboard

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

## 12. Background Tasks

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

## 13. Notification System

| Channel | Tech | Used By |
|---------|------|---------|
| **Web Push** | `web-push` + VAPID keys | Story episodes, scenario triggers |
| **Telegram** | Bot token + chat ID | Briefings, alerts, story updates |

Dispatcher: `lib/notifications/notifier.ts` routes based on user's preferences.

---

## 14. Cron Schedule

All scheduled via Supabase `pg_cron` + `pg_net`. Authenticated with `Bearer CRON_SECRET`.

| Job | Schedule | Endpoint | Purpose |
|-----|----------|----------|---------|
| Scenario Analysis | Mon 3:30 AM UTC | `/api/cron/scenario-analysis` | Weekly institutional scenario report |
| Story Agents | 4:00 AM Mon-Fri | `/api/cron/story-agents` | 4 intelligence agents per pair |
| Scenario Monitor | Every 15 min | `/api/cron/scenario-monitor` | Check scenarios + Trigger Story (Event-Driven) |

---

## 15. Database Tables

### Core (User Data — PRESERVED on AI reset)
`trader_profile`, `risk_rules`, `trades`, `trade_pnl`, `trade_screenshots`, `trade_strategies`, `trade_sync_log`, `execution_log`, `calendar_events`, `user_pair_notes`, `trading_guru_notes`

### Story System (DELETED on AI reset)
`pair_subscriptions`, `story_episodes`, `story_scenarios`, `story_bibles`, `story_seasons`, `story_agent_reports`, `story_positions`, `story_position_adjustments`

### Analysis & AI (DELETED on AI reset)
`wave_analysis`, `big_picture_analysis`, `structural_analysis_cache`, `indicator_optimizations`, `technical_analyses`, `cms_analyses`, `scenario_analyses`

### Infrastructure (PRESERVED)
`background_tasks`, `notification_preferences`, `push_subscriptions`, `ai_usage_logs`

---

## 16. Security Model

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
