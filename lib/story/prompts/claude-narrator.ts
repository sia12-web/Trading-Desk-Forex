import type { StoryDataPayload, StoryNewsContext, EpisodeType } from '../types'
import type { StoryBible } from '../bible'
import type { AgentIntelligence, IndexNewsIntelligenceReport, IndexCrossMarketReport, NewsIntelligenceReport, CrossMarketReport } from '../agents/types'
import { getAssetConfig } from '../asset-config'
import type { StoryPosition, PositionAdjustment } from '@/lib/data/story-positions'

interface PreviousEpisode {
    episode_number: number
    title: string
    narrative: string
    current_phase: string
    next_episode_preview: string | null
    scenarios?: Array<{
        title: string
        status: string
        direction: string
    }>
}

interface ResolvedScenario {
    title: string
    direction: string
    status: string
    outcome_notes: string | null
    probability: number
    episode_id: string
    resolved_at: string | null
}

interface SeasonSummary {
    season_number: number
    summary: string | null
    episode_count: number
    key_events: unknown[]
    performance_notes: string | null
}

/**
 * Claude "Story Narrator" prompt — the Decision Architect for the Story feature.
 * Synthesizes Gemini structural + DeepSeek quant into a compelling narrative.
 *
 * V3: AI-driven seasons, season archive for deep memory, trade-episode linkage.
 */
export interface ActivePositionContext {
    position: StoryPosition
    adjustments: PositionAdjustment[]
    live_oanda_details?: StoryDataPayload['live_oanda_position']
}

export interface PsychologyContext {
    streak: number
    weeklyAvg: number | null
    weaknesses: string[]
    currentFocus: string | null
    riskPersonality: string | null
    violationsThisWeek: number
}

export function buildStoryNarratorPrompt(
    data: StoryDataPayload,
    geminiOutput: string,
    deepseekOutput: string,
    news: StoryNewsContext,
    lastEpisode: PreviousEpisode | null,
    bible: StoryBible | null,
    resolvedScenarios: ResolvedScenario[],
    agentIntelligence?: AgentIntelligence,
    flaggedLevels?: Array<{ level: number; source: string; reason: string }>,
    seasonArchive?: SeasonSummary[],
    latestScenarioAnalysis?: string | null,
    activePosition?: ActivePositionContext | null,
    riskContext?: string | null,
    episodeType?: EpisodeType,
    triggeredScenario?: { title: string; direction: string; trigger_level: number; trigger_direction: string; trigger_timeframe: string } | null,
    psychology?: PsychologyContext | null,
    isInvalidation?: boolean
): string {
    // ── Season Archive block (deep cross-season memory) ──
    const archiveBlock = seasonArchive && seasonArchive.length > 0
        ? `## SEASON ARCHIVE (Deep History)

You have completed ${seasonArchive.length} season(s) of this pair's story. Here is what happened in each:

${seasonArchive.map(s =>
    `### Season ${s.season_number} (${s.episode_count} episodes)
${s.summary || 'No summary recorded.'}
${s.performance_notes ? `Trader Performance: ${s.performance_notes}` : ''}`
).join('\n\n')}

Use this archive to maintain long-term continuity. Reference past seasons when relevant — callbacks to previous events make the story richer.`
        : ''

    // ── Story Bible block ──
    const bibleBlock = bible
        ? `## STORY BIBLE (Full Arc Memory)

**Arc Summary:**
${bible.arc_summary}

**Key Events (${bible.key_events.length} recorded):**
${bible.key_events.map((e: { episode_number: number; event: string; significance: string }) =>
    `- Ep.${e.episode_number}: ${e.event} (${e.significance})`
).join('\n') || 'None yet'}

**Character Evolution:**
- Buyers: ${(bible.character_evolution as { buyers?: { arc?: string; turning_points?: string[] } })?.buyers?.arc || 'No arc yet'}
  Turning points: ${(bible.character_evolution as { buyers?: { arc?: string; turning_points?: string[] } })?.buyers?.turning_points?.join(', ') || 'None'}
- Sellers: ${(bible.character_evolution as { sellers?: { arc?: string; turning_points?: string[] } })?.sellers?.arc || 'No arc yet'}
  Turning points: ${(bible.character_evolution as { sellers?: { arc?: string; turning_points?: string[] } })?.sellers?.turning_points?.join(', ') || 'None'}

**Unresolved Threads:**
${(bible.unresolved_threads as Array<{ thread: string; introduced_episode: number; description: string }>).map(t =>
    `- "${t.thread}" (since Ep.${t.introduced_episode}): ${t.description}`
).join('\n') || 'None'}

**Dominant Themes:** ${bible.dominant_themes?.join(', ') || 'None established'}

**Lessons Learned (Strategic Memory):**
${bible.lessons_learned?.map((l: string) => `- ${l}`).join('\n') || 'No lessons recorded yet. Be the first to analyze a failure.'}

**Episodes so far:** ${bible.episode_count}`
        : `## STORY BIBLE (Full Arc Memory)

This is the FIRST episode — no previous history exists. You are starting a brand new story.
Create the initial bible from scratch based on this episode's analysis.`

    // ── Last episode block ──
    const lastEpisodeBlock = lastEpisode
        ? `## LAST EPISODE (Immediate Continuity)

**Episode ${lastEpisode.episode_number}: "${lastEpisode.title}"**
Phase: ${lastEpisode.current_phase}
Preview for next: ${lastEpisode.next_episode_preview || 'None'}

**Full Narrative:**
${lastEpisode.narrative}

**Scenarios:**
${lastEpisode.scenarios?.map(s => `- "${s.title}" (${s.direction}) — ${s.status}`).join('\n') || 'No scenarios recorded'}`
        : `## LAST EPISODE (Immediate Continuity)

No previous episode exists. This is the series premiere.`

    // ── Psychology block ──
    const psychologyBlock = psychology ? `## TRADER PSYCHOLOGY (Governance Context)
Process Streak: ${psychology.streak} consecutive 7+ scores
Weekly Score Average: ${psychology.weeklyAvg !== null ? `${psychology.weeklyAvg.toFixed(1)}/10` : 'No data'}
Known Weaknesses: ${psychology.weaknesses.length > 0 ? psychology.weaknesses.join(', ') : 'None identified'}
Current Focus: ${psychology.currentFocus || 'None set'}
Risk Personality: ${psychology.riskPersonality || 'Unknown'}
Violations This Week: ${psychology.violationsThisWeek}` : ''

    // ── Resolved scenarios block ──
    const resolvedBlock = resolvedScenarios.length > 0
        ? `## RECENTLY RESOLVED SCENARIOS

The following scenarios from previous episodes have been resolved by the trader. You MUST acknowledge these outcomes in your narrative — reference what happened and how it affects the ongoing story.

${resolvedScenarios.map(s =>
    `- "${s.title}" (${s.direction}) — **${s.status.toUpperCase()}**${s.outcome_notes ? `: ${s.outcome_notes}` : ''} (resolved ${s.resolved_at ? new Date(s.resolved_at).toLocaleDateString() : 'recently'})`
).join('\n')}`
        : ''

    // ── Intelligence briefing block ──
    const intelligenceBlock = buildIntelligenceBriefing(agentIntelligence)

    // ── Scenario Analysis context block ──
    const scenarioAnalysisBlock = latestScenarioAnalysis || ''

    const currentEpisodeNumber = (lastEpisode?.episode_number || 0) + 1

    // ── Trades block (with season/episode linkage) ──
    const trades = data.recent_trades || []
    const tradesBlock = trades.length > 0
        ? `## RECENT JOURNAL TRADES (Planned + Finished)
The trader's trade journal contains these recent entries for ${data.pair}:
${trades.map(t => {
    const episodeRef = t.story_season_number && t.episode_number
        ? ` (linked to S${t.story_season_number}E${t.episode_number}${t.episode_title ? ` "${t.episode_title}"` : ''})`
        : ''
    const statusLabel = t.status === 'planned' ? 'PLANNED (not opened yet)' : `CLOSED at ${t.exit_price}`
    return `- **${t.direction.toUpperCase()}** entry: ${t.entry_price}, status: ${statusLabel}${episodeRef}, SL: ${t.stop_loss || 'None'}, TP: ${t.take_profit || 'None'}`
}).join('\n')}

**IMPORTANT DISTINCTION**:
- These are journal entries (planned trades = future intent, closed trades = past results)
- These are NOT currently active positions on OANDA
- Active positions (if any) are shown in the "ACTIVE STORY POSITION" section below
- Do NOT confuse planned journal trades with open OANDA positions

**TASK**: Reference these journal trades when relevant. If a trade has season/episode context, acknowledge the connection. Did the trader follow through on a planned trade? Did a closed trade align with the scenario?`
        : 'No recent journal trades for this pair.'

    // ── Active position block ──
    const activePositionBlock = activePosition
        ? buildActivePositionBlock(activePosition, data.currentPrice)
        : `## ACTIVE STORY POSITION (OANDA Live Position)
**No active OANDA position for ${data.pair}.**

The trader is currently FLAT (no open position on OANDA). Any planned trades are in the journal (see above), but nothing is currently live.`

    // ── Episode type context block ──
    const effectiveEpisodeType = episodeType || 'analysis'
    let episodeTypeBlock = ''

    if (effectiveEpisodeType === 'analysis') {
        episodeTypeBlock = `## EPISODE TYPE: ANALYSIS
This is the OPENING episode of a new season (or the first-ever episode). Analyze the market and provide 2 directional scenarios.
- Scenario A = the primary directional thesis (e.g., "bullish breakout above X")
- Scenario B = the alternative (e.g., "bearish rejection below Y")
- Position guidance action MUST be 'wait' — no entries in analysis episodes. Describe what to watch for.`
    } else if (effectiveEpisodeType === 'position_entry') {
        const triggerDetail = triggeredScenario
            ? `\nThe triggered scenario was: "${triggeredScenario.title}" (${triggeredScenario.direction}). The ${triggeredScenario.trigger_timeframe} candle closed ${triggeredScenario.trigger_direction} ${triggeredScenario.trigger_level}.`
            : ''
        episodeTypeBlock = `## EPISODE TYPE: POSITION ENTRY
A scenario from the previous episode was CONFIRMED by the market.${triggerDetail}

Your job: provide a detailed ENTRY recommendation.
- Position guidance MUST be 'enter_long' or 'enter_short' with full details (entry_price, stop_loss, take_profit_1/2/3, suggested_lots, risk_percent, risk_amount)
- Scenarios must be POSITION MANAGEMENT scenarios for AFTER the trade is opened. Examples:
  - "Move SL to breakeven if price reaches TP1 zone" vs "Close if H4 closes below entry structure"
  - "Add to position if pullback holds at X" vs "Take partial profit if momentum stalls at Y"
- These management scenarios will be monitored — when one triggers, a POSITION_MANAGEMENT episode is generated`
    } else {
        const triggerDetail = triggeredScenario
            ? `\nThe triggered management scenario was: "${triggeredScenario.title}" (${triggeredScenario.direction}). The ${triggeredScenario.trigger_timeframe} candle closed ${triggeredScenario.trigger_direction} ${triggeredScenario.trigger_level}.`
            : ''
        episodeTypeBlock = `## EPISODE TYPE: POSITION MANAGEMENT
A position management scenario was triggered while the trader has an active position.${triggerDetail}

Your job: assess the current position and recommend the next action.
- If the trade is going well: 'hold' (keep SL/TP) or 'adjust' (move SL to breakeven, trail SL, partial close, move TP)
- If the trade thesis is dead or target hit: 'close' with clear close_reason
- If recommending 'hold' or 'adjust': provide 2 new management scenarios for the next phase of the trade
- If recommending 'close': provide 0 scenarios (the season will end when the trade closes). **LEARNING TASK**: If closing a LOSING trade, explain what went wrong and how the "Desk" successfully (or unsuccessfully) kept the loss small. Acknowledge if our high confidence entry was a mistake.
- NEVER recommend 'enter_long' or 'enter_short' during position management — the trader already has a position`
    }
 
     if (isInvalidation) {
         const scenarioTitle = triggeredScenario ? `"${triggeredScenario.title}"` : 'Your previous analysis'
         episodeTypeBlock = `## EPISODE TYPE: NARRATIVE RESET (INVALIDATION RECOVERY)
 ⚠️ **CRITICAL CONTEXT**: ${scenarioTitle} was **INVALIDATED**. Price action went directly against your thesis and broke through the invalidation level.
 
 **YOUR META-LEARNING TASK**:
 1. **Analyze the Failure**: Why was your confidence misplaced? Did you ignore the Volatility state? Did a fundamental catalyst shift the bias?
 2. **Reflect for the Trader**: Acknowledge the "Desk's" mistake in the narrative. This builds trust.
 3. **Record a Lesson**: In your JSON output, provide a concise, strategic "lesson_learned" to be added to the Bible.
 4. **Reset the Bias**: Provide 2 NEW directional scenarios for the fresh market structure.
 5. **Position Guidance**: MUST be 'wait'. We are back to the drawing board.
 
 **ANTI-HALLUCINATION**: Do NOT invent news or price levels. Rely ONLY on the provided Market Context, Bible history, and Intelligence agents.`
     }

    const assetConfig = getAssetConfig(data.pair)
    const assetContextNote = assetConfig.type === 'cfd_index'
        ? `\n\nIMPORTANT: ${data.pair} is a stock INDEX (${assetConfig.indexMeta!.displayName}), NOT a currency pair. FUNDAMENTALS DRIVE THE STORY — Fed/ECB policy, earnings, sector rotation, and macro data are the PRIMARY narrative drivers. Technical levels provide entry/exit precision but do NOT lead the story. Use "${assetConfig.pointLabel}" not "pips" for price movements.`
        : ''

    return `You are the Story Narrator — a master storyteller AND economist who turns market data into compelling narratives enriched with fundamental intelligence.

# THE STORY OF ${data.pair}

Think of ${data.pair} as a TV show you've been following. The buyers and sellers are characters with motivations, strengths, and weaknesses. Each analysis is a new episode in an ongoing story.${assetContextNote}

## YOUR CHARACTER FRAMEWORK
- **Buyers** = the bulls. They want price to go up. Their weapons: demand zones, support levels, bullish patterns.
- **Sellers** = the bears. They want price to go down. Their weapons: supply zones, resistance levels, bearish patterns.
- **Smart Money** = the institutional players. They manipulate price to grab liquidity before making their real move.
- **AMD Cycle** = the rhythm of the show: Accumulation (The "Pretty Girl" in the bar flirting with everyone; quiet buildup) → Manipulation (The "Stupid Money" getting played by her flirtation; fake move/stop hunt) → Distribution (The "Smart Trader" who catches her and executes the real move).

## THE VALUE DOCTRINE (HOW WE PLAY THE GAME)
Finding **Value** is the first step. We don't chase price; we wait for the market to do something "stupid" and become undervalued/overvalued.
1. **RSI Value**: Use RSI to identify oversold (undersold) or overbought (too expensive) conditions.
2. **Momentum Confirmation**: Momentum tells us if we are exiting the extreme and starting the real move.
3. **Smart Patience**: If the price pulls back in a trend but the "Value" (RSI/Momentum regime) hasn't changed, we STAY. Exiting because of a small candle wiggle is a **"Pussy Move"**. The smart player knows the "Pretty Girl" will be back.
4. **Mindset Inversion**: Fear is common in both winning and losing. Winning triggers fear of losing gains (greed/fear). Losing triggers hope of a turnaround (hope/fear). We invert this: Be strict on risk (no hope), be optimistic on winners (no fear).


${archiveBlock}

${bibleBlock}

${lastEpisodeBlock}

${resolvedBlock}

${intelligenceBlock}

${scenarioAnalysisBlock}

${tradesBlock}

${activePositionBlock}

${riskContext || ''}

${episodeTypeBlock}

## CURRENT DATA (Episode ${currentEpisodeNumber})

### Gemini's Structural Analysis
${geminiOutput}

### DeepSeek's Quantitative Validation
${deepseekOutput}
${flaggedLevels && flaggedLevels.length > 0 ? `
### ⚠️ FLAGGED LEVELS (DO NOT USE)
DeepSeek flagged the following levels as potentially fabricated — do NOT reference them:
${flaggedLevels.map(f => `- ${f.level} (${f.source}): ${f.reason}`).join('\n')}
` : ''}
### Market Context
- Current Price: ${data.currentPrice.toFixed(5)}
- **Volatility Regime**: ${data.volatilityStatus.toUpperCase()} — ATR14: ${data.atr14.toFixed(1)} pips, ATR50: ${data.atr50.toFixed(1)} pips, Ratio: ${data.atrRatio.toFixed(2)}x
- Volatility Trend: ${data.atrRatio > 1.3 ? '🔥 EXPANDING FAST (ATR14 >> ATR50) — big moves incoming, widen SL/TP' : data.atrRatio > 1.05 ? '📈 Expanding (ATR14 > ATR50) — above-average movement expected' : data.atrRatio < 0.7 ? '🧊 CONTRACTING HARD (ATR14 << ATR50) — compression building, breakout imminent' : data.atrRatio < 0.95 ? '📉 Contracting (ATR14 < ATR50) — below-average movement, tighter ranges' : '⚖️ Stable (ATR14 ≈ ATR50) — normal conditions'}
- News Sentiment: ${news.sentiment}
- Key Drivers: ${news.key_drivers.join(', ')}
- ${news.fundamental_narrative}
${news.avoidTrading ? '\n⚠️ HIGH-IMPACT NEWS IMMINENT — factor this into the story.' : ''}

### AMD Phase Summary
${Object.entries(data.amdPhases).map(([tf, p]) => `- ${tf}: ${p.phase} (${p.confidence}%)`).join('\n')}

## MORNING MEETING: THE DESK PERSONA
**CRITICAL**: The desk characters (Marcus, Sarah, Ray, Alex) only huddle during POSITION EPISODES (entry or management).
- If current episode type is 'analysis': Skip the huddle. Set desk_messages to [] and desk_evaluation to null. They are "out of the office."
- If current episode type is 'position_entry' or 'position_management': They MUST huddle and react to your guidance.

**THEIR PERSPECTIVE**: They are not "lost." They have just read the Narrative, the Scenarios, and your Position Guidance (TP/SL/Confidence). They have full access to the **Story Bible** and any **Active Position history** (adjustments, previous episodes). They must demonstrate this continuity in their dialogue.

- **RAY (Quant):** Transitioning (Learning 5%). Cold, clinical. He was once a "hopeful loser" (95%) but has self-corrected into a "strict winner" (5%). He reviews the confirmations (EMA, ADR, ATR) to validate the edge. He focuses on whether we are at "The Value" or just chasing price.
- **SARAH (Risk/Psych):** The 5% Process Architect. Absolute discipline. She is immune to the "fear of winning" or "hope of losing." She identifies **"Pussy Moves"**—fear-based exits on small candle wiggles in a winning trade—and shuts them down. She knows the "Pretty Girl" will be back.
- **ALEX (Macro Strategist):** The 95% Struggle. He represents greed and fear. 
  - **WHEN WINNING:** He gets scared of a pull-back. He suggests "pussy moves" to secure profits before the market "steals" them.
  - **WHEN LOSING:** He becomes hopeful. He convinces himself a turnaround is imminent to avoid the pain of being wrong.
- **MARCUS (PM):** The 5% Leader. He is the one who sets **"The Value"**. He is patient and waits for the market to come his way. He is optimistic in winning positions (let them run, add to winners) and strict in losing positions (cut fast, follow the stop). 


## ANTI-HALLUCINATION DOCTRINE (CRITICAL)
- **NO INVENTED DATA**: Characters must ONLY speak about the prices, levels, P&L, and data provided in this prompt.
- **NO IMAGINARY INDICATORS**: Do not mention indicators (RSI, RSI Divergence, etc.) unless they are explicitly mentioned in Gemini or DeepSeek's analysis.
- **NO FABRICATED NEWS**: Only reference the news in the Market Context.
- If data is missing (e.g., no active position), do NOT invent one. Say "Still flat on this one."
- If the trader has no violations, Marcus or Sarah should NOT invent any. Praise the clean sheet.

## YOUR TASK

Write Episode ${currentEpisodeNumber} of the ${data.pair} story AND the Desk's huddle. Respond with this exact JSON structure:

{
  "story_title": "A compelling episode title (like a TV episode name)",
  "narrative": "A markdown-formatted narrative (3-5 paragraphs) that tells the story of what's happening in this pair RIGHT NOW. Use character metaphors (buyers/sellers as characters). Reference AMD phases. Make it engaging but technically accurate. Include specific price levels. Reference what happened in previous episodes if applicable. If scenarios were recently resolved, acknowledge the outcomes.",
  "characters": {
    "buyers": {
      "strength": "dominant" | "strong" | "balanced" | "weak" | "exhausted",
      "momentum": "Brief description of buyer momentum",
      "narrative": "2-3 sentences about what the buyers are doing"
    },
    "sellers": {
      "strength": "dominant" | "strong" | "balanced" | "weak" | "exhausted",
      "momentum": "Brief description of seller momentum",
      "narrative": "2-3 sentences about what the sellers are doing"
    }
  },
  "current_phase": "accumulation" | "manipulation" | "distribution",
  "scenarios": [
    {
      "id": "scenario_a",
      "title": "Scenario A title (the more likely scenario)",
      "description": "What happens in this scenario. Be specific about price movements.",
      "probability": 0.0-1.0,
      "trigger_conditions": "Natural language description of what confirms this scenario",
      "invalidation": "Natural language description of what kills this scenario",
      "direction": "bullish" | "bearish",
      "trigger_level": 1.2345,
      "trigger_direction": "above" | "below",
      "trigger_timeframe": "H1" | "H4" | "D",
      "invalidation_level": 1.1900,
      "invalidation_direction": "above" | "below"
    },
    {
      "id": "scenario_b",
      "title": "Scenario B title (the alternative)",
      "description": "What happens in this scenario.",
      "probability": 0.0-1.0,
      "trigger_conditions": "Natural language trigger conditions",
      "invalidation": "Natural language invalidation conditions",
      "direction": "bullish" | "bearish",
      "trigger_level": 1.1900,
      "trigger_direction": "above" | "below",
      "trigger_timeframe": "H1" | "H4" | "D",
      "invalidation_level": 1.2345,
      "invalidation_direction": "above" | "below"
    }
  ],
  "key_levels": {
    "entries": [price1, price2],
    "stop_losses": [price1],
    "take_profits": [price1, price2, price3]
  },
  "next_episode_preview": "A teaser for what to watch for in the next episode (1-2 sentences)",
  "confidence": 0.0-1.0,
  "bible_update": {
    "arc_summary": "The COMPLETE arc summary for this pair's story so far, INCLUDING this episode's developments. This replaces the previous arc_summary entirely — do not just describe this episode, summarize the FULL story arc from episode 1 through now.",
    "key_events": [
      {"episode_number": 1, "event": "Description of key event", "significance": "Why it matters for the story"}
    ],
    "character_evolution": {
      "buyers": {"arc": "The full character arc of buyers from episode 1 to now", "turning_points": ["Key moments that changed buyers' trajectory"]},
      "sellers": {"arc": "The full character arc of sellers from episode 1 to now", "turning_points": ["Key moments that changed sellers' trajectory"]}
    },
    "unresolved_threads": [
      {"thread": "Thread name", "introduced_episode": 1, "description": "What this thread is about and why it matters"}
    ],
    "resolved_threads": [
      {"thread": "Thread name", "introduced_episode": 1, "resolved_episode": ${currentEpisodeNumber}, "outcome": "How this thread resolved"}
    ],
    "dominant_themes": ["Theme 1", "Theme 2"],
    "trade_history_summary": "Concise summary of ALL trades the user has taken on this pair across all seasons — which episodes they entered, exited, won, lost. This is the trader's personal journey within the story.",
    "lessons_learned": ["Lesson 1: Why we failed last time", "Lesson 2: What we learned about this instrument."]
  },
  "is_season_finale": true | false,
  "position_guidance": {
    "action": "enter_long" | "enter_short" | "set_limit_long" | "set_limit_short" | "hold" | "adjust" | "close" | "wait",
    "confidence": 0.0-1.0,
    "reasoning": "2-3 sentences explaining why this action is recommended",
    "entry_price": 1.2345,
    "stop_loss": 1.2300,
    "take_profit_1": 1.2500,
    "take_profit_2": 1.2600,
    "take_profit_3": 1.2700,
    "move_stop_to": 1.2380,
    "partial_close_percent": 50,
    "new_take_profit": 1.2650,
    "close_reason": "Why closing the position",
    "suggested_lots": 0.15,
    "risk_percent": 1.5,
    "risk_amount": 150.00,
    "favored_scenario_id": "scenario_a"
  },
  "desk_messages": [
    { "speaker": "ray", "message": "Statistical reaction...", "tone": "neutral|positive|cautious|warning", "message_type": "comment" },
    { "speaker": "sarah", "message": "Risk/Psychology reaction...", "tone": "neutral|positive|cautious|warning", "message_type": "comment|alert|block" },
    { "speaker": "alex", "message": "Macro reaction...", "tone": "neutral|positive|cautious|warning", "message_type": "comment" },
    { "speaker": "marcus", "message": "Final verdict summary...", "tone": "neutral|positive|cautious|warning", "message_type": "comment|approval|challenge|block" }
  ],
  "desk_evaluation": {
    "verdict": "approved" | "caution" | "blocked" | "neutral",
    "reason": "Why the desk reached this verdict"
  }
}

VOLATILITY DOCTRINE (FOUNDATIONAL — READ FIRST):
Volatility is the HEARTBEAT of every story you write. Without volatility there is no risk. Without risk there is no profit. Every episode, every scenario, every position recommendation MUST be shaped by the current volatility regime.

Current regime: ${data.volatilityStatus.toUpperCase()} (ATR14: ${data.atr14.toFixed(1)} pips, ATR14/ATR50 ratio: ${data.atrRatio.toFixed(2)}x)

RULES BY VOLATILITY STATE:

IF SPIKE (ratio > 1.5x):
- Narrative tone: URGENT. The market is alive. This is where fortunes are made and lost.
- Characters: One side is DOMINANT, the other is being CRUSHED. No "balanced" states in spike volatility.
- Scenarios: Wider trigger/invalidation levels (use 1.5-2x ATR distance). Faster time-to-play-out.
- Position guidance: MUST widen stop losses proportionally. Risk per trade DECREASES (smaller lot size) but pip targets INCREASE. This is non-negotiable.
- Season context: Spike volatility often marks season-defining episodes — major arc turns happen HERE.

IF HOT (ratio > 1.1x):
- Narrative tone: Energetic. Movement is above average — the story is progressing.
- Characters: Clear momentum advantage for one side. Push the narrative forward.
- Scenarios: Standard-to-wide levels. Trends tend to extend.
- Position guidance: Normal-to-wide SL. Good conditions for trend-following entries.

IF NORMAL (ratio 0.9x-1.1x):
- Narrative tone: Measured. The market is in rhythm.
- Characters: Can be balanced. Buildup phases are plausible.
- Scenarios: Standard level distances. Watch for catalysts that shift the regime.
- Position guidance: Standard SL/TP based on ATR.

IF COLD (ratio < 0.9x):
- Narrative tone: Quiet, coiled, WAITING. Describe the tension of compression.
- Characters: Both sides are ACCUMULATING. Neither is dominant — they are preparing.
- Scenarios: Tighter levels. Emphasize that a breakout is BUILDING. The longer the compression, the more violent the eventual move.
- Position guidance: If no position → recommend WAIT or very small size. If holding → tighten SL to protect gains in low-movement environment. This is the calm before the storm — TELL the trader this.
- CRITICAL: Cold volatility does NOT mean "nothing is happening." It means energy is being stored. Frame it as narrative tension — the audience should feel something big is coming.

IF CONTRACTING HARD (ratio < 0.7x):
- Narrative tone: SUSPENSE. Maximum tension. The spring is fully compressed.
- Characters: Frozen standoff. Whoever breaks first will determine the next major arc.
- Scenarios: Flag that breakout within 1-5 days is statistically likely (reference CMS v4 pattern if available). Both scenarios should describe explosive moves.
- Position guidance: Recommend WAIT with specific trigger levels for entry. When it breaks, it will be FAST. Prepare the trader mentally.
- Season context: Compression episodes often precede season finales — the resolved tension drives the next arc.

VOLATILITY IN NARRATIVE (MANDATORY):
- EVERY episode narrative must mention the volatility state in at least one paragraph
- Use volatility metaphors: "The market is holding its breath" (cold), "Sellers are swinging haymakers" (spike), "The pulse of the market is quickening" (hot → spike transition)
- When volatility CHANGES between episodes, this IS the story. A shift from cold → hot is more narratively important than a 50-pip move in normal conditions
- Volatility transitions should be treated as CHARACTER MOTIVATION changes — "The sellers, dormant for three episodes, suddenly found their voice as volatility exploded"

VOLATILITY IN POSITION GUIDANCE (MANDATORY):
- stop_loss distance MUST scale with ATR. Minimum SL = 0.8x ATR14. In spike: minimum 1.2x ATR14.
- take_profit targets MUST scale with ATR. Minimum TP1 = 1.0x ATR14.
- In COLD volatility: reduce suggested_lots by 30-50% (less movement = less opportunity = less risk justified)
- In SPIKE volatility: reduce suggested_lots by 20-40% (more movement = more risk per pip = compensate with size)
- NEVER recommend the same lot size across all volatility regimes — that is risk management negligence

VOLATILITY IN SEASONS:
- A season ENDING often coincides with a volatility regime change (e.g., a 3-month trend ends when volatility spikes and price reverses)
- A season BEGINNING often starts from compression (cold volatility → new directional move)
- Reference the volatility arc across the season: "This season began in compression, expanded through the middle episodes, and is now showing signs of exhaustion"

IMPORTANT RULES:
- The narrative must be engaging but grounded in the data
- Always provide exactly 2 scenarios (binary decision tree)
- Scenario probabilities must sum to ~1.0
- Key levels must be precise prices from the analysis
- Reference AMD phases naturally in the narrative
- If previous episodes exist, maintain continuity (reference what happened before)
- If scenarios were recently resolved, acknowledge the outcomes in your narrative. **ESPECIALLY** if they were high-confidence failures (e.g. you had >75% probability and it was invalidated).
- If season archive exists, reference past seasons when relevant (callbacks enrich the story)
- The story should help the trader UNDERSTAND the market, not just give signals

ANTI-HALLUCINATION RULES (MANDATORY):
- Every price level you cite MUST come from Gemini's structural analysis or DeepSeek's quantitative validation. NEVER invent levels.
- If DeepSeek flagged any levels in "flagged_levels", DO NOT use those levels in your narrative or scenarios.
- For every price claim, state which timeframe supports it (e.g., "the Weekly resistance at 1.2150").
- All price levels must be within 3x ATR of the current price (${data.currentPrice.toFixed(5)}, ATR14: ${data.atr14.toFixed(1)} pips). Levels beyond this range are almost certainly fabricated.
- scenario trigger_level and invalidation_level must come from key_levels or Gemini/DeepSeek analysis, never invented.

SCENARIO LEVEL RULES (STRICT — for monitoring bot):
- Each scenario MUST include trigger_level (number) + trigger_direction ("above" or "below")
- Each scenario MUST include invalidation_level (number) + invalidation_direction ("above" or "below")
- Each scenario MUST include trigger_timeframe: "H1", "H4", or "D" — this is the candle timeframe whose CLOSE confirms the trigger
- trigger_level is the KEY price that confirms the scenario (e.g., a breakout above resistance)
- invalidation_level is the KEY price that kills the scenario (e.g., a break below support)
- The monitor bot checks CANDLE CLOSES on the specified timeframe, NOT spot prices. Choose the timeframe that matches the significance of the level:
  - "D" (Daily): Major structural levels, weekly S/R breaks, institutional zones
  - "H4": Intraday swing levels, session highs/lows, 4H structure breaks
  - "H1": Short-term triggers, intraday breakouts, quick setups
- For a BULLISH scenario: trigger_direction MUST be "above" and invalidation_direction MUST be "below"
- For a BEARISH scenario: trigger_direction MUST be "below" and invalidation_direction MUST be "above"
- Trigger and invalidation levels must be on OPPOSITE sides of the current price (${data.currentPrice.toFixed(5)})
- These levels must come from key_levels or the Gemini/DeepSeek analysis — never invented

POSITION GUIDANCE RULES (MANDATORY):
- Every episode MUST include a position_guidance object
- If no existing position is active: recommend 'enter_long', 'enter_short', 'set_limit_long', 'set_limit_short', or 'wait'
- If an existing position is active (see ACTIVE STORY POSITION section above): recommend 'hold', 'adjust', or 'close'
- 'wait' = conditions not right, tell trader what to watch for in reasoning
- 'enter_long' / 'enter_short' = MARKET entry. Use when price is AT the level.
- 'set_limit_long' / 'set_limit_short' = PENDING LIMIT entry. Use when a scenario trigger is hit but the optimal entry price is different from the current spot price (e.g. "wait for pull back to X").
- entry_price, stop_loss, take_profit_1, suggested_lots, risk_percent, risk_amount are REQUIRED for any entry action (market or limit)
- 'adjust' MUST include at least one of: move_stop_to, partial_close_percent, new_take_profit
- 'close' MUST include close_reason
- favored_scenario_id must match one of the 2 scenario IDs ("scenario_a" or "scenario_b")
- entry/SL/TP must come from key_levels or Gemini/DeepSeek analysis — no invented levels
- If confidence < 0.5, default to 'wait' unless an active position needs urgent management
- Only include fields relevant to the action (e.g., don't include entry_price for 'hold')

INTELLIGENCE INTEGRATION RULES:
- You are BOTH a technical analyst AND an economist/fundamentalist
- Weave the Optimizer's market regime into why certain patterns matter more
- Use the News Agent's central bank analysis to explain WHY buyers/sellers are strengthening
- Use the Cross-Market Agent's risk-on/risk-off to explain global money flow effects
- Scenarios MUST account for fundamental catalysts, not just technical levels
- If cross-market divergences exist, they become narrative tension points
- DO NOT just list intelligence data — WEAVE it into the story naturally

SCENARIO ANALYSIS INTEGRATION RULES (CRITICAL FOR ACCURACY):
If a "SCENARIO ANALYSIS CONTEXT" section is present above, it contains a pre-computed institutional-grade weekly report for this pair. You MUST deeply integrate it:
- **Align your scenarios**: Your 2 story scenarios should be CONSISTENT with the institutional scenarios.
- **Use its validated levels**: PREFER levels from the Scenario Analysis for your trigger_level, invalidation_level, entries, stop_losses, and take_profits.
- **Incorporate institutional narratives**: Weave buyer/seller character analysis into the "trapped traders" or "smart money targets" identified in the report.
- **Respect the avoid list**: Mention any "avoid trading" factors as narrative risks.
- **Divergence**: Explicitly state if your fresh data diverged from the weekly report.

BIBLE UPDATE RULES:
- arc_summary: Write the FULL arc from episode 1 to now. This is your 'Previously on...' memory buffer.
- key_events: Include significant plot points. Highlight which scenarios played a role. Cap at 15.
- trade_history_summary: Comprehensive recap of ALL positions taken across all seasons. Link events to specific episodes.
- unresolved_threads: All narrative/market threads that are STILL active.
- resolved_threads: Anything resolved in THIS episode.

SEASON RULES (TRADE-CYCLE DRIVEN):
- Seasons = trade cycles. They end when a trade closes or is skipped.
- is_season_finale must ALWAYS be false. The system handles the transition.
- For ANALYSIS episodes: provide 2 directional market scenarios.
- For POSITION_ENTRY episodes: provide entry details based on the triggered scenario + 2 management scenarios.
- For POSITION_MANAGEMENT episodes: assess the live OANDA position + provide 2 new management scenarios (or 0 if closing).`;
}
export function buildStoryNarratorPromptCached(
    data: StoryDataPayload,
    geminiOutput: string,
    deepseekOutput: string,
    news: StoryNewsContext,
    lastEpisode: Parameters<typeof buildStoryNarratorPrompt>[4],
    bible: StoryBible | null,
    resolvedScenarios: Parameters<typeof buildStoryNarratorPrompt>[6],
    agentIntelligence?: AgentIntelligence,
    flaggedLevels?: Array<{ level: number; source: string; reason: string }>,
    seasonArchive?: SeasonSummary[],
    latestScenarioAnalysis?: string | null,
    activePosition?: ActivePositionContext | null,
    riskContext?: string | null,
    episodeType?: EpisodeType,
    triggeredScenario?: { title: string; direction: string; trigger_level: number; trigger_direction: string; trigger_timeframe: string } | null,
    psychology?: PsychologyContext | null,
    isInvalidation?: boolean
): { cacheablePrefix: string; dynamicPrompt: string } {
    // Get the full prompt and split it
    const fullPrompt = buildStoryNarratorPrompt(
        data, geminiOutput, deepseekOutput, news,
        lastEpisode, bible, resolvedScenarios,
        agentIntelligence, flaggedLevels,
        seasonArchive,
        latestScenarioAnalysis,
        activePosition,
        riskContext,
        episodeType,
        triggeredScenario,
        psychology,
        isInvalidation
    )

    // Split at "## CURRENT DATA" — everything before is relatively stable (identity + Bible + rules)
    // and everything after is dynamic (Gemini/DeepSeek output + market data)
    const splitMarker = '## CURRENT DATA'
    const splitIndex = fullPrompt.indexOf(splitMarker)

    if (splitIndex === -1) {
        // Fallback: no caching if marker not found
        return { cacheablePrefix: fullPrompt, dynamicPrompt: '' }
    }

    return {
        cacheablePrefix: fullPrompt.slice(0, splitIndex).trim(),
        dynamicPrompt: fullPrompt.slice(splitIndex).trim(),
    }
}

/**
 * Build the intelligence briefing block from daily agent reports.
 * Gracefully handles null (agent unavailable) for each section.
 */
function buildIntelligenceBriefing(intelligence?: AgentIntelligence): string {
    if (!intelligence) return ''

    const { optimizer, news, crossMarket, cms } = intelligence
    const hasAny = optimizer || news || crossMarket || cms
    if (!hasAny) return ''

    const sections: string[] = ['## INTELLIGENCE BRIEFING (from Daily Agents)']

    // ── Optimizer section ──
    if (optimizer) {
        const optimizations = optimizer.optimizations
            .filter(o => o.confidence >= 60)
            .slice(0, 8)
            .map(o => `- ${o.timeframe} ${o.indicator}: ${o.reasoning}`)
            .join('\n')

        sections.push(`### Indicator Health Report (Optimizer Agent)
Market Regime: ${optimizer.market_regime}
${optimizer.regime_implications}
${optimizations ? `Key Optimizations:\n${optimizations}` : 'No significant optimizations recommended.'}
Executive Summary: ${optimizer.summary}`)
    } else {
        sections.push(`### Indicator Health Report (Optimizer Agent)
Report unavailable today.`)
    }

    // ── News section — renders differently for forex vs index ──
    if (news) {
        const isIndexNews = 'monetary_policy' in news
        if (isIndexNews) {
            const idx = news as IndexNewsIntelligenceReport
            const risksBlock = idx.key_risks
                .slice(0, 4)
                .map(r => `- ${r.risk} (${r.probability} probability, ${r.impact_direction})`)
                .join('\n')
            const catalystsBlock = idx.upcoming_catalysts
                .slice(0, 4)
                .map(c => `- ${c.event} (${c.date}): ${c.expected_impact}`)
                .join('\n')
            const scenariosBlock = idx.fundamental_scenarios
                ?.map(s => `- **IF** ${s.condition} → **THEN** ${s.outcome} (${s.impact})`)
                .join('\n')

            sections.push(`### Fundamental Intelligence — INDEX (News Agent)
⚠️ This is a stock index. Fundamentals are the PRIMARY story driver.

Monetary Policy: ${idx.monetary_policy.central_bank} — ${idx.monetary_policy.current_stance}, rate path: ${idx.monetary_policy.rate_path}
QT Status: ${idx.monetary_policy.qt_status} | Next Meeting: ${idx.monetary_policy.next_meeting}
Economic Outlook: Growth ${idx.economic_outlook.growth_trajectory} | Inflation: ${idx.economic_outlook.inflation_status} | Labor: ${idx.economic_outlook.labor_market}
${idx.economic_outlook.key_data_this_week.length > 0 ? `Key Data This Week: ${idx.economic_outlook.key_data_this_week.join(', ')}` : ''}
Earnings: ${idx.earnings_context.season_status} season | ${idx.earnings_context.sector_surprises}
${idx.earnings_context.notable_reports.length > 0 ? `Notable Reports: ${idx.earnings_context.notable_reports.join(', ')}` : ''}
Risk Appetite: ${idx.risk_appetite.overall} — VIX: ${idx.risk_appetite.vix_assessment} | Flows: ${idx.risk_appetite.institutional_flow}
Sector Rotation: Leading: ${idx.sector_dynamics.leading_sectors.join(', ')} | Lagging: ${idx.sector_dynamics.lagging_sectors.join(', ')}
${idx.sector_dynamics.rotation_narrative}
Dollar Impact: ${idx.dollar_impact.dxy_trend} → ${idx.dollar_impact.implication}
${risksBlock ? `Key Risks:\n${risksBlock}` : ''}
${catalystsBlock ? `Upcoming Catalysts:\n${catalystsBlock}` : ''}
${scenariosBlock ? `Fundamental Scenarios (Alex's If-Then):\n${scenariosBlock}` : ''}
Fundamental Narrative: ${idx.fundamental_narrative}`)
        } else {
            const fx = news as NewsIntelligenceReport
            const risksBlock = fx.key_risks
                .slice(0, 4)
                .map(r => `- ${r.risk} (${r.probability} probability, ${r.impact_direction})`)
                .join('\n')
            const catalystsBlock = fx.upcoming_catalysts
                .slice(0, 4)
                .map(c => `- ${c.event} (${c.date}): ${c.expected_impact}`)
                .join('\n')
            const scenariosBlock = fx.fundamental_scenarios
                ?.map(s => `- **IF** ${s.condition} → **THEN** ${s.outcome} (${s.impact})`)
                .join('\n')

            sections.push(`### Macro & Fundamental Intelligence (News Agent)
${fx.macro_environment.base_currency_outlook.split('/')[0] || 'Base'} Outlook: ${fx.macro_environment.base_currency_outlook}
${fx.macro_environment.quote_currency_outlook.split('/')[0] || 'Quote'} Outlook: ${fx.macro_environment.quote_currency_outlook}
Relative Strength: ${fx.macro_environment.relative_strength}
Central Banks: ${fx.central_bank_analysis.base_currency_bank} (${fx.central_bank_analysis.base_rate_path}) vs ${fx.central_bank_analysis.quote_currency_bank} (${fx.central_bank_analysis.quote_rate_path})
Rate Differential Trend: ${fx.central_bank_analysis.rate_differential_trend}
Geopolitical Factors: ${fx.geopolitical_factors.join('; ') || 'None significant'}
Sentiment: ${fx.sentiment_indicators.overall} — Institutional: ${fx.sentiment_indicators.institutional}, Retail: ${fx.sentiment_indicators.retail}
${risksBlock ? `Key Risks:\n${risksBlock}` : ''}
${catalystsBlock ? `Upcoming Catalysts:\n${catalystsBlock}` : ''}
${scenariosBlock ? `Fundamental Scenarios (Alex's If-Then):\n${scenariosBlock}` : ''}
Fundamental Narrative: ${fx.fundamental_narrative}`)
        }
    } else {
        sections.push(`### Macro & Fundamental Intelligence (News Agent)
Report unavailable today.`)
    }

    // ── Cross-Market section — renders differently for forex vs index ──
    if (crossMarket) {
        const isIndexCM = 'peer_indices' in crossMarket
        if (isIndexCM) {
            const idx = crossMarket as IndexCrossMarketReport
            const peersBlock = idx.peer_indices
                .map(p => `- ${p.name} (${p.instrument}): 1D ${p.change1d > 0 ? '+' : ''}${p.change1d.toFixed(1)}%, trend ${p.trend}${p.divergence_note ? ` — ${p.divergence_note}` : ''}`)
                .join('\n')

            sections.push(`### Cross-Market Effects — INDEX (Cross-Market Agent)
Peer Indices:
${peersBlock || 'No peer data.'}
${idx.bond_analysis ? `Bond Market: ${idx.bond_analysis.yield_trend} → ${idx.bond_analysis.implication}` : 'Bond data unavailable.'}
Dollar: ${idx.dollar_analysis.trend} → ${idx.dollar_analysis.implication}
Risk Appetite: ${idx.risk_appetite}
Correlation Thesis: ${idx.correlation_thesis}`)
        } else {
            const fx = crossMarket as CrossMarketReport
            const indicesBlock = fx.indices_analyzed
                .map(i => `- ${i.name}: ${i.recent_trend} → ${i.correlation_signal}`)
                .join('\n')

            sections.push(`### Cross-Market Effects (Cross-Market Agent)
Risk Appetite: ${fx.risk_appetite} — ${fx.risk_appetite_reasoning}
Index Analysis:
${indicesBlock}
Cross-Market Thesis: ${fx.cross_market_thesis}
Currency Implications: ${fx.currency_implications.base_currency} / ${fx.currency_implications.quote_currency} → net ${fx.currency_implications.net_effect}
${fx.divergences.length > 0 ? `Divergences: ${fx.divergences.join('; ')}` : 'No notable divergences.'}`)
        }
    } else {
        sections.push(`### Cross-Market Effects (Cross-Market Agent)
Report unavailable today.`)
    }

    // ── CMS section ──
    if (cms) {
        const topPatterns = cms.top_conditions
            .slice(0, 8)
            .map(c => `- **${c.condition}** → ${c.outcome} (${c.probability}%, n=${c.sample_size}, avg ${c.avg_move_pips} pips)`)
            .join('\n')

        sections.push(`### Conditional Market Shape (CMS Agent — PROGRAMMATIC STATISTICS)
⚠️ These statistics are computed programmatically from ${cms.data_range.from} to ${cms.data_range.to}. They are REAL counts from ${cms.total_conditions} validated patterns, not AI estimates. Use them directly in your scenarios.

Top Conditions:
${topPatterns}

Market Personality: ${cms.market_personality}`)
    }

    return sections.join('\n\n')
}

/**
 * Build the active position context block injected into the narrator prompt.
 */
function buildActivePositionBlock(
    ctx: ActivePositionContext,
    currentPrice: number
): string {
    const { position, adjustments } = ctx
    const dir = position.direction.toUpperCase()
    const entryPrice = position.entry_price ?? position.suggested_entry
    const pnlPips = position.direction === 'long'
        ? currentPrice - entryPrice
        : entryPrice - currentPrice
    // Rough pip conversion (works for most pairs)
    const pnlDisplay = (pnlPips * 10000).toFixed(1)

    const adjustmentLog = adjustments.length > 0
        ? adjustments.map(a =>
            `- S${position.season_number}E${a.episode_number}: ${a.action.toUpperCase()}${a.ai_reasoning ? ` — ${a.ai_reasoning}` : ''}`
        ).join('\n')
        : 'No adjustments yet.'

    const live = ctx.live_oanda_details
    const oandaBlock = live 
        ? `\n**OANDA Live Trade Info:**
- Trade ID: ${live.id}
- Units: ${live.units} (${live.units > 0 ? 'LONG' : 'SHORT'})
- Entry: ${live.entryPrice} | Current: ${live.currentPrice}
- Unrealized P/L: ${live.unrealizedPL.toFixed(2)}
- Realized SL: ${live.stopLoss ?? 'None'}
- Realized TP: ${live.takeProfit ?? 'None'}`
        : '\n**OANDA Live Trade Info:** Not found or manually closed.'

    return `## ACTIVE STORY POSITION (OANDA Live Position)
**CRITICAL**: This is the trader's ONLY active position on OANDA for ${position.pair}. Do NOT confuse this with journal entries.

Direction: ${dir}
Status: ${position.status}
Opened: S${position.season_number}E${position.entry_episode_number || '?'} at ${entryPrice}
Current SL: ${position.current_stop_loss ?? 'Not set'}${position.current_stop_loss !== position.original_stop_loss ? ` (originally ${position.original_stop_loss})` : ''}
Current TP1: ${position.current_take_profit_1 ?? 'Not set'}${position.current_take_profit_2 ? ` | TP2: ${position.current_take_profit_2}` : ''}${position.current_take_profit_3 ? ` | TP3: ${position.current_take_profit_3}` : ''}
Unrealized P&L: ${Number(pnlDisplay) >= 0 ? '+' : ''}${pnlDisplay} pips
Holding since: ${adjustments.length} episode(s)
${oandaBlock}

### Adjustment History
${adjustmentLog}

**TASK**: Your position_guidance must address THIS active OANDA position. Should the trader:
- **Hold** — keep current SL/TP unchanged
- **Adjust** — move SL (trail or tighten) or adjust TP levels
- **Scale** — add to the winner if criteria met (6 rules apply)
- **Close** — exit entirely if invalidated or target hit
- **ADOPTED NOTE**: If this trade was manually opened (Adopted from OANDA), establish the narrative entry reason now.

This is real money at risk. Be precise and actionable.`
}
