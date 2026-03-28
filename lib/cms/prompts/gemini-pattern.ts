import type { CMSDataPayload, ProgrammaticCondition } from '../types'

/**
 * Gemini "Pattern Ranker" prompt — receives pre-computed conditions with REAL statistics
 * and ranks/groups them by tradability and market structure logic.
 *
 * V2: AI no longer discovers patterns or generates statistics. It only interprets.
 */
export function buildGeminiPatternPrompt(data: CMSDataPayload, conditions: ProgrammaticCondition[]): string {
    const { pair, summaryStats: s, volatilityProfile: vp } = data

    const conditionBlock = conditions.map(c =>
        `- [${c.id}] ${c.category.toUpperCase()}: "${c.condition}" → "${c.outcome}" | prob=${c.probability}%, n=${c.sample_size}, hits=${c.hits}, avg_move=${c.avg_move_pips} pips, plays out: ${c.time_to_play_out}`
    ).join('\n')

    return `You are the Pattern Ranker — an AI that evaluates pre-computed conditional market patterns for trading relevance.

## CRITICAL: YOU DO NOT GENERATE STATISTICS
All statistics below were computed programmatically from real OANDA candle data. The probabilities, sample sizes, and hit counts are EXACT — do NOT modify, round, or "correct" them. Your job is ONLY to:
1. Rank which patterns are INTERESTING and TRADEABLE
2. Group related patterns into logical clusters
3. Identify which patterns have structural market logic (not just coincidence)
4. Flag patterns that appear statistically significant but lack market logic

## DATA CONTEXT
- **Pair**: ${pair}
- **Data range**: ${s.date_range.from} to ${s.date_range.to}
- **Daily candles**: ${s.total_daily_candles}
- **Weekly candles**: ${s.total_weekly_candles}
- **H1 candles**: ${s.total_h1_candles}
- **ATR14**: ${vp.atr14_daily} pips
- **Avg daily range**: ${vp.avg_daily_range_pips} pips

## PRE-COMPUTED CONDITIONS (${conditions.length} total, all with n≥15 and prob≥55%)
${conditionBlock}

## YOUR TASK
Analyze these conditions and return JSON:
\`\`\`json
{
  "ranked_conditions": [
    {
      "id": "d1",
      "rank": 1,
      "tradability_score": 85,
      "reasoning": "Strong structural logic — Friday rejection at Thursday's high suggests exhaustion, Monday gap fill is a classic Smart Money pattern",
      "cluster": "end_of_week_exhaustion",
      "structural_logic": "valid"
    }
  ],
  "pattern_clusters": [
    {
      "name": "end_of_week_exhaustion",
      "description": "Patterns showing Friday/Thursday exhaustion leading to Monday reversals",
      "condition_ids": ["d1", "d10"],
      "combined_insight": "This pair shows strong end-of-week exhaustion patterns — when Thursday/Friday fail to extend, Monday typically reverses"
    }
  ],
  "flagged_coincidental": [
    {
      "id": "cm3",
      "reason": "Correlation divergence metric is too abstract to be actionable"
    }
  ],
  "market_personality": "A 2-3 sentence summary of what these patterns reveal about this pair's behavioral personality"
}
\`\`\`

## RANKING CRITERIA
1. **Structural logic**: Does the pattern have a market microstructure explanation? (institutional order flow, session transitions, liquidity cycles)
2. **Actionability**: Can a trader directly act on this pattern? (clear entry timing, direction)
3. **Sample + probability combo**: Higher sample sizes with maintained probability = more reliable
4. **Uniqueness**: Patterns that reveal non-obvious behaviors rank higher
5. **Cluster synergy**: Patterns that form logical groups rank higher

## RULES
- Rank ALL conditions (do not remove any)
- tradability_score: 0-100 (how useful for active trading)
- structural_logic: "valid" | "weak" | "coincidental"
- Group related patterns into clusters (2-5 clusters)
- DO NOT modify any statistics (probability, sample_size, hits, avg_move_pips)
- Flag patterns that look coincidental despite passing the statistical threshold
- market_personality should be pair-specific and reference actual pattern behaviors`
}
