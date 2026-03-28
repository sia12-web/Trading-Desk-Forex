import type { CMSDataPayload, ProgrammaticCondition } from '../types'

/**
 * Claude "Decision Architect" prompt — synthesizes validated patterns into trading intelligence.
 *
 * V2: Receives programmatic conditions with REAL stats + Gemini ranking + DeepSeek validation.
 * Claude writes implications and market personality. MUST NOT alter statistics.
 */
export function buildClaudeSynthesisPrompt(
    data: CMSDataPayload,
    conditions: ProgrammaticCondition[],
    deepseekOutput: string,
): string {
    const { pair, summaryStats: s, volatilityProfile: vp } = data

    const conditionBlock = conditions.map(c =>
        `- [${c.id}] ${c.category}: "${c.condition}" → "${c.outcome}" | prob=${c.probability}%, n=${c.sample_size}, hits=${c.hits}, avg_move=${c.avg_move_pips} pips, plays out: ${c.time_to_play_out}`
    ).join('\n')

    return `You are the Decision Architect — an AI that synthesizes validated market patterns into actionable trading intelligence.

## CRITICAL: STATISTICS ARE PROGRAMMATICALLY COMPUTED — DO NOT CHANGE THEM
Every probability, sample_size, hits, and avg_move_pips value below was computed by TypeScript code iterating real OANDA candle data. They are EXACT integer values.

**YOU MUST NOT:**
- Change any probability value
- Change any sample_size value
- Change any avg_move_pips value
- Invent new conditions not in the list below
- Round or "improve" any numbers

**YOU MUST:**
- Use the exact statistics as provided
- Write a trader-friendly implication for each condition
- Rank conditions by usefulness within each category
- Write a market personality summary
- Structure the final JSON output

## CONTEXT
- **Pair**: ${pair}
- **Data range**: ${s.date_range.from} to ${s.date_range.to}
- **Daily candles**: ${s.total_daily_candles}, Weekly: ${s.total_weekly_candles}, H1: ${s.total_h1_candles}, H4: ${s.total_h4_candles}
- **ATR14**: ${vp.atr14_daily} pips, Avg daily range: ${vp.avg_daily_range_pips} pips

## PRE-COMPUTED CONDITIONS (${conditions.length} total — all verified n≥15, prob≥55%)
${conditionBlock}

## DEEPSEEK'S STRUCTURAL VALIDATION
${deepseekOutput}

## OUTPUT FORMAT
Return JSON with EXACTLY this structure:
\`\`\`json
{
  "pair": "${pair}",
  "generated_at": "${new Date().toISOString()}",
  "total_conditions": 0,
  "categories": {
    "daily": [
      {
        "id": "d1",
        "condition": "IF Friday fails to break Thursday's high",
        "outcome": "THEN Monday tests Friday's low",
        "sample_size": 45,
        "probability": 72,
        "avg_move_pips": 35,
        "time_to_play_out": "Next trading day",
        "implication": "When Friday shows rejection at Thursday's high, prepare a short bias for Monday...",
        "confidence": "high",
        "category": "daily",
        "source": "programmatic"
      }
    ],
    "weekly": [],
    "session": [],
    "volatility": [],
    "cross_market": []
  },
  "summary": "Market personality paragraph",
  "data_stats": {
    "daily_candles": ${s.total_daily_candles},
    "weekly_candles": ${s.total_weekly_candles},
    "h1_candles": ${s.total_h1_candles},
    "h4_candles": ${s.total_h4_candles},
    "date_range": { "from": "${s.date_range.from}", "to": "${s.date_range.to}" }
  }
}
\`\`\`

## IMPLICATION WRITING RULES
Each implication should be 1-3 sentences that:
- Tell the trader WHAT to do (bias direction, entry timing)
- Tell them WHEN (which session, which day)
- Give a target and/or stop reference
- Reference the pair's typical ATR of ${vp.atr14_daily} pips
- Incorporate DeepSeek's structural validation where relevant

## CONFIDENCE ASSIGNMENT
Based on DeepSeek's structural validation:
- "high": structural_verdict="valid" AND persistence_rating="high"
- "medium": structural_verdict="valid" AND persistence_rating="medium", OR verdict="weak"
- "low": structural_verdict="coincidental" or persistence_rating="low"

## IMPORTANT
- "source" field MUST be "programmatic" for every condition
- total_conditions must equal the sum of all conditions across categories
- Remove conditions that DeepSeek marked as "coincidental" (rejected_conditions)
- Keep ALL other conditions — do not remove valid patterns
- Within each category, order by tradability (highest probability + sample first)
- The summary should describe this pair's unique trading personality based on the patterns`
}
