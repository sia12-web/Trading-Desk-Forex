import type { StoryDataPayload, StoryNewsContext } from '../types'
import type { StoryBible } from '../bible'
import type { AgentIntelligence } from '../agents/types'
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
    forceSeasonFinale?: boolean,
    latestScenarioAnalysis?: string | null,
    activePosition?: ActivePositionContext | null,
    riskContext?: string | null
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
        ? `## RECENT TRADES (OANDA Journal — with Story Context)
The trader has been active in this pair:
${trades.map(t => {
    const episodeRef = t.story_season_number && t.episode_number
        ? ` (opened in S${t.story_season_number}E${t.episode_number}${t.episode_title ? ` "${t.episode_title}"` : ''})`
        : ''
    return `- **${t.direction.toUpperCase()}** at ${t.entry_price} (${t.status})${episodeRef} — SL: ${t.stop_loss || 'None'}, TP: ${t.take_profit || 'None'}${t.closed_at ? `. CLOSED at ${t.exit_price}` : '. POSITION ACTIVE.'}`
}).join('\n')}

**TASK**: Reference these trades in your story. If a trade has season/episode context, acknowledge WHEN in the story it was opened. Did the trader follow the scenario? Was the position successful? Active positions create narrative tension.`
        : 'No recent trades recorded for this pair.'

    // ── Active position block ──
    const activePositionBlock = activePosition ? buildActivePositionBlock(activePosition, data.currentPrice) : ''

    // ── Force finale nudge ──
    const forceFinaleBlock = forceSeasonFinale
        ? `\n\n⚠️ SEASON FINALE REQUIRED: This season has reached the maximum episode limit. You MUST set is_season_finale to true and write this as a season-ending episode. Tie up loose threads and provide a comprehensive season summary.`
        : ''

    return `You are the Story Narrator — a master storyteller AND economist who turns forex market data into compelling narratives enriched with fundamental intelligence.

# THE STORY OF ${data.pair}

Think of ${data.pair} as a TV show you've been following. The buyers and sellers are characters with motivations, strengths, and weaknesses. Each analysis is a new episode in an ongoing story.

## YOUR CHARACTER FRAMEWORK
- **Buyers** = the bulls. They want price to go up. Their weapons: demand zones, support levels, bullish patterns.
- **Sellers** = the bears. They want price to go down. Their weapons: supply zones, resistance levels, bearish patterns.
- **Smart Money** = the institutional players. They manipulate price to grab liquidity before making their real move.
- **AMD Cycle** = the rhythm of the show: Accumulation (quiet buildup) → Manipulation (fake move/stop hunt) → Distribution (the real directional move)

${archiveBlock}

${bibleBlock}

${lastEpisodeBlock}

${resolvedBlock}

${intelligenceBlock}

${scenarioAnalysisBlock}

${tradesBlock}

${activePositionBlock}

${riskContext || ''}

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
- Volatility: ${data.volatilityStatus} (ATR14: ${data.atr14.toFixed(1)} pips)
- News Sentiment: ${news.sentiment}
- Key Drivers: ${news.key_drivers.join(', ')}
- ${news.fundamental_narrative}
${news.avoidTrading ? '\n⚠️ HIGH-IMPACT NEWS IMMINENT — factor this into the story.' : ''}

### AMD Phase Summary
${Object.entries(data.amdPhases).map(([tf, p]) => `- ${tf}: ${p.phase} (${p.confidence}%)`).join('\n')}

## YOUR TASK

Write Episode ${currentEpisodeNumber} of the ${data.pair} story. Respond with this exact JSON structure:

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
    "trade_history_summary": "Concise summary of ALL trades the user has taken on this pair across all seasons — which episodes they entered, exited, won, lost. This is the trader's personal journey within the story."
  },
  "is_season_finale": true | false,
  "position_guidance": {
    "action": "enter_long" | "enter_short" | "hold" | "adjust" | "close" | "wait",
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
  }
}

IMPORTANT RULES:
- The narrative must be engaging but grounded in the data
- Always provide exactly 2 scenarios (binary decision tree)
- Scenario probabilities must sum to ~1.0
- Key levels must be precise prices from the analysis
- Reference AMD phases naturally in the narrative
- If previous episodes exist, maintain continuity (reference what happened before)
- If scenarios were recently resolved, acknowledge the outcomes in your narrative
- If season archive exists, reference past seasons when relevant (callbacks enrich the story)
- The story should help the trader UNDERSTAND the market, not just give signals${forceFinaleBlock}

ANTI-HALLUCINATION RULES (MANDATORY):
- Every price level you cite MUST come from Gemini's structural analysis or DeepSeek's quantitative validation. NEVER invent levels.
- If DeepSeek flagged any levels in "flagged_levels", DO NOT use those levels in your narrative or scenarios.
- For every price claim, state which timeframe supports it (e.g., "the Weekly resistance at 1.2150").
- All price levels must be within 3x ATR of the current price (${data.currentPrice.toFixed(5)}, ATR14: ${data.atr14.toFixed(1)} pips). Levels beyond this range are almost certainly fabricated.
- scenario trigger_level and invalidation_level must come from key_levels or Gemini/DeepSeek analysis, never invented.

SCENARIO LEVEL RULES (STRICT — for monitoring bot):
- Each scenario MUST include trigger_level (number) + trigger_direction ("above" or "below")
- Each scenario MUST include invalidation_level (number) + invalidation_direction ("above" or "below")
- trigger_level is the KEY price that confirms the scenario (e.g., a breakout above resistance)
- invalidation_level is the KEY price that kills the scenario (e.g., a break below support)
- For a BULLISH scenario: trigger_direction MUST be "above" and invalidation_direction MUST be "below"
- For a BEARISH scenario: trigger_direction MUST be "below" and invalidation_direction MUST be "above"
- Trigger and invalidation levels must be on OPPOSITE sides of the current price (${data.currentPrice.toFixed(5)})
- These levels must come from key_levels or the Gemini/DeepSeek analysis — never invented

POSITION GUIDANCE RULES (MANDATORY):
- Every episode MUST include a position_guidance object
- If no existing position is active: recommend 'enter_long', 'enter_short', or 'wait'
- If an existing position is active (see ACTIVE STORY POSITION section above): recommend 'hold', 'adjust', or 'close'
- 'wait' = conditions not right, tell trader what to watch for in reasoning
- 'enter_long' or 'enter_short' MUST include entry_price, stop_loss, take_profit_1, suggested_lots, risk_percent, risk_amount
- 'adjust' MUST include at least one of: move_stop_to, partial_close_percent, new_take_profit
- 'close' MUST include close_reason
- favored_scenario_id must match one of the 2 scenario IDs ("scenario_a" or "scenario_b")
- entry/SL/TP must come from key_levels or Gemini/DeepSeek analysis — no invented levels
- If confidence < 0.5, default to 'wait' unless an active position needs urgent management
- Only include fields relevant to the action (e.g., don't include entry_price for 'hold')

POSITION SIZING RULES (when entering):
- Use the RISK MANAGEMENT & ACCOUNT CONTEXT section (if present) to calculate position size
- suggested_lots = (account_balance * risk_percent / 100) / (SL_distance_in_pips * pip_value_per_lot)
- For most pairs, 1 standard lot = 100,000 units, pip value ≈ $10 per pip
- NEVER exceed max_position_size from risk rules
- NEVER exceed max_risk_per_trade % from risk rules
- If account balance is unknown, use risk_percent only (let the trader calculate lots)
- risk_percent should typically be 1-2% per trade — NEVER more than the max_risk_per_trade rule

TRADER PSYCHOLOGY & POSITION MANAGEMENT RULES (CRITICAL):
- You must think like the 1% of traders who are consistently profitable
- LET PROFITS RUN: Do NOT close winning positions too early out of fear. Move SL to breakeven/profit instead
- CUT LOSSES QUICKLY: If the trade thesis is invalidated, close immediately. Don't hope for recovery
- NO REVENGE TRADING: After a loss, do NOT recommend entering immediately. Wait for a proper setup
- SCALE OUT, NOT ALL-IN: Use multiple TPs (TP1, TP2, TP3). Close partial at TP1 to lock profit, let the rest run
- MOVE SL TO BREAKEVEN after TP1 is hit — this makes the remaining position a "free trade"
- RESPECT THE SCENARIOS: If the favored scenario is getting invalidated (price approaching invalidation_level), recommend closing or tightening SL — don't hold and hope
- ACCOUNT PROTECTION: If the trader has open losing trades or is near max_daily_loss, be CONSERVATIVE. Recommend 'wait' or reduce position size
- DON'T BE AFRAID: If the setup is clear and all conditions align (technical + fundamental + scenarios), have the confidence to recommend entry. Sitting out forever is also a losing strategy
- DRAWDOWN AWARENESS: If unrealized P&L is significantly negative, factor this into position sizing and confidence
- TRAILING STOPS: For strong trends, recommend moving SL behind structure (swing lows for longs, swing highs for shorts) rather than using fixed levels

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
- **Align your scenarios**: Your 2 story scenarios should be CONSISTENT with the institutional scenarios. If the Scenario Analysis says the highest-probability scenario is bearish, your primary scenario should reflect that unless your fresh Gemini/DeepSeek data contradicts it — and if it does, you MUST explain the divergence in the narrative.
- **Use its validated levels**: The key levels, liquidity pools, and watchlist levels in the Scenario Analysis have been validated through a separate tri-model pipeline. PREFER these levels for your trigger_level, invalidation_level, entries, stop_losses, and take_profits. They are pre-validated and grounded.
- **Incorporate institutional narratives**: The institutional scenarios describe who is trapped and where smart money is targeting. Weave this into your buyer/seller character analysis — e.g., "Sellers are trapped above 1.2350, and smart money is likely targeting the liquidity pool at 1.2280."
- **Reference impact factors**: USD strength direction, risk sentiment, session dynamics, and correlated pair signals from the Scenario Analysis must inform your narrative. These are the WHY behind the price action.
- **Use conditional patterns**: If the Scenario Analysis includes historical "IF X THEN Y" patterns, reference the relevant ones when conditions are met or approaching.
- **Respect the avoid list**: If the Scenario Analysis flags conditions to avoid trading, mention these as risk factors in your narrative.
- **Convergence/Divergence**: Explicitly state whether your fresh analysis CONVERGES or DIVERGES with the Scenario Analysis. Convergence = higher confidence. Divergence = narrative tension point that the trader must resolve.
- **NEVER contradict validated levels silently**: If you disagree with a Scenario Analysis level, say so explicitly and explain why based on fresh data.

BIBLE UPDATE RULES:
- arc_summary: Write the FULL arc from episode 1 to now (replaces previous). This is your 'Previously on...' memory buffer — keep it tight but informative for FUTURE episodes so we don't need to read old narratives.
- key_events: Include significant plot points. Highlight which scenarios played a role. Cap at 15.
- trade_history_summary: Comprehensive recap of ALL positions taken across all seasons. Include season/episode references when available (e.g., "Opened long in S1E5, closed in S1E8 for +40 pips"). This builds the trader's personal journey within the story.
- unresolved_threads: All narrative/market threads that are STILL active.
- resolved_threads: Anything resolved in THIS episode.
- dominant_themes: The 3-5 main themes of this pair's story.

SEASON FINALE RULES (AI-DRIVEN):
- Set is_season_finale to true when the current narrative arc has reached a natural conclusion:
  * A major support/resistance level that defined the season was decisively broken
  * A multi-week trend reversed direction (e.g., from bullish to bearish)
  * A fundamental shift occurred (central bank policy change, geopolitical event)
  * All major unresolved threads from recent episodes have been resolved
  * The buyer/seller power dynamic fundamentally shifted (e.g., from buyer dominance to seller dominance)
- Do NOT end a season just because a certain number of episodes passed — end it when the STORY demands it
- When ending a season, write a satisfying conclusion that ties up threads and sets the stage for the next season
- Minimum 5 episodes per season (don't end too early)
- If this is a season finale, the arc_summary in bible_update should serve as the complete season recap`
}

/**
 * Build the narrator prompt split into cacheable prefix and dynamic content.
 * The prefix (identity + rules + schema) stays stable across pairs → cache hits on sequential runs.
 * The dynamic part (Gemini/DeepSeek output + market data + Bible + episodes) changes per pair.
 */
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
    forceSeasonFinale?: boolean,
    latestScenarioAnalysis?: string | null,
    activePosition?: ActivePositionContext | null,
    riskContext?: string | null
): { cacheablePrefix: string; dynamicPrompt: string } {
    // Get the full prompt and split it
    const fullPrompt = buildStoryNarratorPrompt(
        data, geminiOutput, deepseekOutput, news,
        lastEpisode, bible, resolvedScenarios,
        agentIntelligence, flaggedLevels,
        seasonArchive, forceSeasonFinale,
        latestScenarioAnalysis,
        activePosition,
        riskContext
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

    const { optimizer, news, crossMarket } = intelligence
    const hasAny = optimizer || news || crossMarket
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

    // ── News section ──
    if (news) {
        const risksBlock = news.key_risks
            .slice(0, 4)
            .map(r => `- ${r.risk} (${r.probability} probability, ${r.impact_direction})`)
            .join('\n')

        const catalystsBlock = news.upcoming_catalysts
            .slice(0, 4)
            .map(c => `- ${c.event} (${c.date}): ${c.expected_impact}`)
            .join('\n')

        sections.push(`### Macro & Fundamental Intelligence (News Agent)
${news.macro_environment.base_currency_outlook.split('/')[0] || 'Base'} Outlook: ${news.macro_environment.base_currency_outlook}
${news.macro_environment.quote_currency_outlook.split('/')[0] || 'Quote'} Outlook: ${news.macro_environment.quote_currency_outlook}
Relative Strength: ${news.macro_environment.relative_strength}
Central Banks: ${news.central_bank_analysis.base_currency_bank} (${news.central_bank_analysis.base_rate_path}) vs ${news.central_bank_analysis.quote_currency_bank} (${news.central_bank_analysis.quote_rate_path})
Rate Differential Trend: ${news.central_bank_analysis.rate_differential_trend}
Geopolitical Factors: ${news.geopolitical_factors.join('; ') || 'None significant'}
Sentiment: ${news.sentiment_indicators.overall} — Institutional: ${news.sentiment_indicators.institutional}, Retail: ${news.sentiment_indicators.retail}
${risksBlock ? `Key Risks:\n${risksBlock}` : ''}
${catalystsBlock ? `Upcoming Catalysts:\n${catalystsBlock}` : ''}
Fundamental Narrative: ${news.fundamental_narrative}`)
    } else {
        sections.push(`### Macro & Fundamental Intelligence (News Agent)
Report unavailable today.`)
    }

    // ── Cross-Market section ──
    if (crossMarket) {
        const indicesBlock = crossMarket.indices_analyzed
            .map(idx => `- ${idx.name}: ${idx.recent_trend} → ${idx.correlation_signal}`)
            .join('\n')

        sections.push(`### Cross-Market Effects (Cross-Market Agent)
Risk Appetite: ${crossMarket.risk_appetite} — ${crossMarket.risk_appetite_reasoning}
Index Analysis:
${indicesBlock}
Cross-Market Thesis: ${crossMarket.cross_market_thesis}
Currency Implications: ${crossMarket.currency_implications.base_currency} / ${crossMarket.currency_implications.quote_currency} → net ${crossMarket.currency_implications.net_effect}
${crossMarket.divergences.length > 0 ? `Divergences: ${crossMarket.divergences.join('; ')}` : 'No notable divergences.'}`)
    } else {
        sections.push(`### Cross-Market Effects (Cross-Market Agent)
Report unavailable today.`)
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

    return `## ACTIVE STORY POSITION
Direction: ${dir}
Status: ${position.status}
Opened: S${position.season_number}E${position.entry_episode_number || '?'} at ${entryPrice}
Current SL: ${position.current_stop_loss ?? 'Not set'}${position.current_stop_loss !== position.original_stop_loss ? ` (originally ${position.original_stop_loss})` : ''}
Current TP1: ${position.current_take_profit_1 ?? 'Not set'}${position.current_take_profit_2 ? ` | TP2: ${position.current_take_profit_2}` : ''}${position.current_take_profit_3 ? ` | TP3: ${position.current_take_profit_3}` : ''}
Unrealized P&L: ${Number(pnlDisplay) >= 0 ? '+' : ''}${pnlDisplay} pips
Holding since: ${adjustments.length} episode(s)

### Adjustment History
${adjustmentLog}

TASK: Consider this active position in your guidance. Should the trader hold, adjust (move SL/TP), take partial profits, or close? Your position_guidance.action must account for this existing position.`
}
