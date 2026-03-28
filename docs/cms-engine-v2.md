# CMS Engine V2 — Conditional Market Shaping

## What Is CMS?

CMS discovers **"IF this happens, THEN that follows"** patterns from historical forex data. It answers questions like:

- "When Friday fails to break Thursday's high, what does Monday do?"
- "When Asia session is quiet, how big is the London move?"
- "After 3 bearish days in a row, does the market reverse?"

Every answer is backed by **exact statistics** computed from real OANDA candle data — not AI guesses.

---

## The Anti-Hallucination Problem (Why V2 Exists)

**V1 (old):** Sent summary statistics to AI → AI generated sample sizes, probabilities, and pip moves. The numbers sounded plausible but were fabricated. An AI model cannot count 500 candles accurately.

**V2 (current):** TypeScript code iterates every candle and computes exact counts. AI only interprets the results — it never touches the numbers.

```
V1: Raw data → AI discovers patterns + invents statistics → Display
V2: Raw data → TypeScript computes exact statistics → AI ranks & interprets → Display
```

---

## How It Works (Step by Step)

### Phase 0: Data Collection (No AI)

`lib/cms/data-collector.ts` → `collectCMSData(pair)`

1. Fetches from OANDA in parallel:
   - 500 Daily candles
   - 200 Weekly candles
   - 500 H1 candles
   - 300 H4 candles
   - Cross-market indices (SPX500, NAS100, US30)

2. Pre-computes relationship data:
   - **DailyRelationship[]** — Each day's OHLC, gap from previous close, broke previous high/low, inside/outside day
   - **WeeklyRelationship[]** — Which day set weekly high/low, Monday range, weekly direction
   - **SessionAnnotatedH1[]** — Each H1 bar tagged with session (Tokyo, London, New York, Overlap)
   - **SessionStats[]** — Per-session average range, continuation/reversal percentages
   - **VolatilityProfile** — ATR14, trend/quiet day percentages, first hour stats
   - **CrossMarketCorrelation[]** — Same-direction percentage between FX pair and stock indices

### Phase 0.5: Condition Engine (No AI)

`lib/cms/condition-engine.ts` → `computeAllConditions(data)`

This is the core of V2. Pure TypeScript code that iterates the pre-computed data and counts exact occurrences for ~36 patterns.

**Example — Pattern d1:**
```
For each Friday in the dataset:
  IF this Friday did NOT break Thursday's high:
    Look at next Monday
    IF Monday's low went below Friday's low → count as a HIT
    Record the pip distance

Result: sample_size=47, hits=31, probability=66%, avg_move=23.5 pips
```

Every pattern follows this exact same logic: iterate, filter, count, compute probability.

**Filtering:** Only conditions with `sample_size ≥ 15` AND `probability ≥ 55%` pass. This eliminates noise.

### Phase 1: Gemini Ranks Patterns (AI — No Stats Generation)

`lib/cms/prompts/gemini-pattern.ts`

Gemini receives ALL pre-computed conditions with their real statistics. Its job:

1. **Rank** patterns by tradability (0-100 score)
2. **Group** related patterns into clusters (e.g., "end-of-week exhaustion" cluster)
3. **Flag** coincidental patterns that passed statistical filters but lack market logic
4. **Write** a market personality summary

Gemini does NOT modify any numbers. It only adds ranking metadata.

### Phase 2: DeepSeek Validates Structure (AI — No Stats Generation)

`lib/cms/prompts/deepseek-stats.ts`

DeepSeek receives the ranked conditions. Its job:

1. **Validate market microstructure** — Does this pattern have a real cause? (institutional order flow, session transitions, carry trade dynamics)
2. **Assess persistence** — Will this pattern continue, or is it an artifact of the sample period?
3. **Identify regime dependency** — Does this only work in trending/ranging/volatile markets?
4. **Reject** patterns that are coincidental despite passing statistical filters

DeepSeek does NOT modify any numbers.

### Phase 3: Claude Synthesizes Implications (AI — No Stats Generation)

`lib/cms/prompts/claude-synthesis.ts`

Claude receives the structurally validated conditions. Its job:

1. **Write trader-friendly implications** — "When this happens, do X. Enter at Y session. Target Z pips."
2. **Assign confidence** — Based on DeepSeek's structural validation
3. **Structure the final output** — Categorized by daily/weekly/session/volatility/cross-market
4. **Write market personality** — A paragraph describing this pair's unique behavioral traits

Claude does NOT modify any numbers. The prompt explicitly forbids it:
> "YOU MUST NOT: Change any probability value. Change any sample_size value."

### Storage

Results stored in `cms_analyses` table:
- JSONB `result` column containing all categorized conditions
- 7-day TTL (`expires_at`)
- One result per user+pair (old result deleted on regeneration)

---

## The 36 Patterns

### Daily Patterns (~10)

| ID | IF (Condition) | THEN (Outcome) |
|----|----------------|-----------------|
| d1 | Friday fails to break Thursday's high | Monday tests Friday's low |
| d2 | Inside day forms | Next day breaks in direction of prior 3-day trend |
| d3 | Outside day forms | Next day reverses direction |
| d4 | Gap up opens (>10% ATR) | Same-day gap fill occurs |
| d5 | Gap down opens (>10% ATR) | Same-day gap fill occurs |
| d6 | 3+ consecutive bullish days | Next day is bearish |
| d7 | 3+ consecutive bearish days | Next day is bullish |
| d8 | Large range day (>1.5x ATR) | Next day continues direction |
| d9 | Monday closes bullish | Tuesday continues bullish |
| d10 | Thursday closes bearish | Friday continues bearish |

### Weekly Patterns (~8)

| ID | IF (Condition) | THEN (Outcome) |
|----|----------------|-----------------|
| w1 | Monday sets the weekly high | Week closes bearish |
| w2 | Monday sets the weekly low | Week closes bullish |
| w3 | Monday closes in a direction | Weekly close matches Monday's direction |
| w4 | Monday range is small (<50% of avg) | Weekly range exceeds average |
| w5 | Friday closes above weekly open | Next Monday bullish |
| w6 | Friday closes below weekly open | Next Monday bearish |
| w7 | Weekly inside bar forms | Next week expands range (breakout) |
| w8 | Monday establishes directional bias | Week reverses (closes opposite) |

### Session Patterns (~8)

| ID | IF (Condition) | THEN (Outcome) |
|----|----------------|-----------------|
| s1 | Asia range < 30% of ATR (quiet) | London moves > 70% of ATR |
| s2 | Asia establishes direction | London continues same direction |
| s3 | London establishes direction | New York reverses London |
| s4 | Full trading day | Overlap produces largest hourly bar |
| s5 | Trading day begins | First H1 bar sets daily high |
| s6 | Trading day begins | First H1 bar sets daily low |
| s7 | Asia range exceeds ATR (volatile) | London range contracts |
| s8 | Tokyo closes bullish | London continues bullish |

### Volatility Patterns (~6)

| ID | IF (Condition) | THEN (Outcome) |
|----|----------------|-----------------|
| v1 | 2+ consecutive quiet days (<0.5x ATR) | Next day range exceeds ATR |
| v2 | Trend day occurs (>1.5x ATR) | Next day continues direction |
| v3 | 3 consecutive days of expanding range | 4th day continues expansion |
| v4 | 3+ days of contracting range | Breakout (range > ATR) within 2 days |
| v5 | High-range week (>130% of average) | Next week has lower range |
| v6 | Low-range week (<70% of average) | Next week has higher range |

### Cross-Market Patterns (~4)

| ID | IF (Condition) | THEN (Outcome) |
|----|----------------|-----------------|
| cm1 | S&P 500 closes bullish | Pair closes in same direction |
| cm2 | S&P 500 closes bearish | Pair moves opposite |
| cm3 | Nasdaq diverges from S&P 500 | Pair instability |
| cm4 | All 3 US indices same direction | Pair follows consensus |

---

## Two Modes of Operation

### Mode 1: Standalone CMS Page (`/cms`)

**Trigger:** User manually clicks "Generate" on the CMS page.

**Flow:**
```
User clicks Generate
  → POST /api/cms/generate (rate limited: 5/hour)
  → Background task created
  → Phase 0: Fetch OANDA data
  → Phase 0.5: Compute conditions (TypeScript)
  → Phase 1: Gemini ranks (AI call #1)
  → Phase 2: DeepSeek validates (AI call #2)
  → Phase 3: Claude synthesizes (AI call #3)
  → Store in cms_analyses table (7-day TTL)
  → UI displays results
```

**Cost:** 3 AI calls (Gemini + DeepSeek + Claude)
**Duration:** ~2-4 minutes
**Cache:** 7 days

### Mode 2: Story Intelligence Agent

**Trigger:** Automated via existing cron at 4AM UTC weekdays.

**Flow:**
```
/api/cron/story-agents (4AM UTC)
  → For each subscribed pair:
    → Agent 1: Indicator Optimizer (DeepSeek)
    → Agent 2: News Intelligence (Gemini)
    → Agent 3: Cross-Market Effects (Gemini)
    → Agent 4: CMS Intelligence (TypeScript only!)
      → Fetch OANDA data
      → Compute conditions programmatically
      → Store top 15 conditions in story_agent_reports
      → Zero AI cost
```

At 5AM UTC, when Story generation runs:
```
/api/cron/story-generation
  → Fetches all 4 agent reports
  → Claude narrator receives CMS conditions in Intelligence Briefing:

    ### Conditional Market Shape (CMS Agent — PROGRAMMATIC STATISTICS)
    These statistics are computed programmatically. They are REAL counts.

    Top Conditions:
    - Friday fails to break Thursday's high → Monday tests Friday's low (66%, n=47)
    - Inside day forms → Next day breaks in prior trend (62%, n=83)
    ...
```

**Cost:** Zero AI calls (pure TypeScript computation)
**Duration:** ~5-10 seconds
**Dedup:** Runs once per pair per day

---

## Cron Jobs — What You Need

### Already Automated (No Action Needed)

| What | Cron | Route | Handles CMS? |
|------|------|-------|-------------|
| Story Agents | 4AM UTC Mon-Fri | `/api/cron/story-agents` | Yes — CMS is the 4th agent |
| Story Generation | 5AM UTC Mon-Fri | `/api/cron/story-generation` | Yes — narrator reads CMS report |

The CMS Story agent is already wired into `runAgentsForPair()` in `lib/story/agents/runner.ts`. It runs alongside the other 3 agents with the same dedup logic (once per day per pair).

### NOT Automated (By Design)

| What | Why Manual |
|------|-----------|
| Standalone CMS (`/cms` page) | Uses 3 AI calls per generation. Auto-running for all pairs would burn tokens. Results cache for 7 days — most traders only need fresh analysis once a week. |

### Optional Future Enhancement

If you later want auto-refresh of standalone CMS for subscribed pairs, you could add a cron that runs weekly (e.g., Sunday night before market open). But this is NOT needed now because:

1. The Story agent already provides CMS data daily (programmatic, free)
2. The standalone CMS page is for when you want the full AI-interpreted deep dive
3. 7-day cache means manual generation once a week is sufficient

---

## File Map

```
lib/cms/
├── condition-engine.ts    ← Core: 36 patterns computed in TypeScript
├── data-collector.ts      ← OANDA data fetching + pre-computation
├── pipeline.ts            ← Phase 0 → Gemini → DeepSeek → Claude orchestration
├── types.ts               ← ProgrammaticCondition, CMSCondition, CMSResult
└── prompts/
    ├── gemini-pattern.ts  ← Ranks conditions by tradability
    ├── deepseek-stats.ts  ← Validates market structure logic
    └── claude-synthesis.ts ← Writes implications + personality

lib/story/agents/
├── cms-intelligence.ts    ← CMS as Story agent (programmatic only)
├── runner.ts              ← Runs all 4 agents
├── types.ts               ← CMSIntelligenceReport type
└── data.ts                ← Fetches agent reports (including CMS)

lib/story/prompts/
└── claude-narrator.ts     ← Intelligence Briefing includes CMS section

app/api/cms/
├── generate/route.ts      ← POST: trigger standalone CMS analysis
└── results/route.ts       ← GET: fetch cached results

app/(dashboard)/cms/
└── page.tsx               ← CMS UI page

supabase/migrations/
└── 20260328_create_cms_analyses.sql  ← Database table
```

---

## Database

### cms_analyses (standalone results)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | UUID | FK to auth.users, RLS-protected |
| pair | VARCHAR(10) | e.g., "EUR/USD" |
| result | JSONB | Full CMSResult with all conditions |
| created_at | TIMESTAMPTZ | When generated |
| expires_at | TIMESTAMPTZ | 7 days after creation |

Unique constraint: `(user_id, pair)` — one result per pair.

### story_agent_reports (agent mode)

Uses existing table with `agent_type = 'cms_intelligence'`.
Deduped by `(user_id, pair, agent_type, report_date)`.

---

## Key Design Principles

1. **AI Never Generates Statistics** — TypeScript counts real candles. AI only interprets.
2. **Source Tracking** — Every condition has `source: 'programmatic'` — the UI can badge this.
3. **Two Modes** — Full AI analysis (standalone, paid) vs. pure programmatic (Story agent, free).
4. **Anti-Hallucination Chain** — Each AI phase is explicitly told not to modify numbers.
5. **Filtering** — Only `n≥15` and `prob≥55%` patterns survive. Noise is eliminated before AI sees them.
6. **Narrator Integration** — Story narrator receives "PROGRAMMATIC STATISTICS" warning and uses real numbers in episode scenarios.
