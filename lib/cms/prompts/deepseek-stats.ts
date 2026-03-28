import type { CMSDataPayload, ProgrammaticCondition } from '../types'

/**
 * DeepSeek "Structure Validator" prompt — validates MARKET STRUCTURE logic of ranked patterns.
 * Does NOT validate statistics (those are already exact from the condition engine).
 *
 * V2: AI validates structural causation, not statistical accuracy.
 */
export function buildDeepSeekStatsPrompt(
    data: CMSDataPayload,
    conditions: ProgrammaticCondition[],
    geminiOutput: string,
): string {
    const { pair, summaryStats: s, volatilityProfile: vp } = data

    const conditionBlock = conditions.map(c =>
        `- [${c.id}] ${c.category}: "${c.condition}" → "${c.outcome}" | prob=${c.probability}%, n=${c.sample_size}, avg_move=${c.avg_move_pips} pips`
    ).join('\n')

    return `You are the Structure Validator — a quantitative analyst specializing in market microstructure.

## CRITICAL: STATISTICS ARE ALREADY EXACT
The probabilities and sample sizes below are computed programmatically from real OANDA candles. They are NOT estimates. Your job is NOT to validate statistics — they are mathematically correct.

Your job IS to validate the MARKET STRUCTURE LOGIC behind each pattern:
1. Does this pattern have a real cause-effect relationship? (institutional order flow, session liquidity, carry trade dynamics)
2. Or is it a spurious correlation that passed the statistical filter by chance?
3. What is the structural mechanism that would cause this pattern to persist?

## DATA CONTEXT
- **Pair**: ${pair}
- **Data range**: ${s.date_range.from} to ${s.date_range.to}
- **Daily candles**: ${s.total_daily_candles}
- **ATR14**: ${vp.atr14_daily} pips
- **Avg daily range**: ${vp.avg_daily_range_pips} pips
- **Trend days**: ${vp.trend_day_pct}%, Quiet days: ${vp.quiet_day_pct}%
- **First hour avg**: ${vp.first_hour_avg_pips} pips

## PRE-COMPUTED CONDITIONS (${conditions.length} total)
${conditionBlock}

## GEMINI'S RANKING & CLUSTERING
${geminiOutput}

## YOUR TASK
For each condition, assess whether the market structure logic is sound. Return JSON:
\`\`\`json
{
  "validated_conditions": [
    {
      "id": "d1",
      "structural_verdict": "valid",
      "mechanism": "Thursday's high represents the weekly buying climax. When Friday fails to break it, it signals institutional profit-taking. Monday's gap down to test Friday's low is the classic Smart Money distribution sequence.",
      "persistence_rating": "high",
      "regime_dependency": "Works best in ranging/consolidating markets. Less reliable during strong trends.",
      "trading_note": "Most effective when combined with weekly bias (w1/w2). Watch for Monday's first hour — if it gaps down, the pattern is activating."
    }
  ],
  "rejected_conditions": [
    {
      "id": "cm3",
      "reason": "NAS/SPX divergence metric is too derived — the correlation between index divergence and forex pair reversal has no clear microstructure mechanism"
    }
  ],
  "structural_insights": [
    "This pair shows strong session-transition patterns, suggesting it is heavily traded by institutional desks that rebalance at session boundaries",
    "The day-of-week patterns suggest carry trade influence — Monday positioning and Friday unwinding are consistent with institutional carry management"
  ]
}
\`\`\`

## VALIDATION CRITERIA
1. **Mechanism**: Can you explain WHY this pattern exists using market microstructure? (e.g., institutional order flow, session liquidity transitions, central bank fixing, option expiry effects)
2. **Persistence**: Is this pattern likely to persist? (structural patterns persist, statistical artifacts don't)
3. **Regime dependency**: Does this pattern only work in certain market conditions? (trending, ranging, high/low volatility)
4. **Actionability**: Does the structural logic suggest a clear trading approach?

## structural_verdict values:
- "valid": Clear microstructure explanation, likely to persist
- "weak": Plausible but mechanism is unclear or pattern may be regime-dependent
- "coincidental": No clear mechanism — likely spurious correlation

## persistence_rating values:
- "high": Based on structural features (session times, institutional behavior) that don't change
- "medium": Based on current market regime — will break when regime shifts
- "low": Likely an artifact of the sample period

## RULES
- DO NOT modify any statistics (probability, sample_size, hits, avg_move_pips)
- Focus entirely on structural causation, not statistical significance
- Be skeptical — not every statistically significant pattern has a real cause
- Provide specific microstructure mechanisms, not vague "supply and demand"
- rejected_conditions should only contain patterns with "coincidental" verdict
- structural_insights: 2-4 high-level observations about this pair's institutional behavior`
}
