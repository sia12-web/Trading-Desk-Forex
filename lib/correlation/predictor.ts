/**
 * Tomorrow's Predictions Engine
 *
 * Analyzes current market conditions against discovered patterns
 * to predict tomorrow's movements using AI synthesis.
 */

import { callGemini, callClaude } from '@/lib/ai/clients'
import { checkTomorrowTradingDay } from './calendar-checker'
import type { CorrelationScenarioRow } from './types'
import type { OandaPrice } from '@/lib/types/oanda'
import type { TradingDayStatus } from './calendar-checker'

export interface PredictionMatch {
  scenario: CorrelationScenarioRow
  conditionsMet: number
  totalConditions: number
  matchPercentage: number
  currentValues: Array<{
    pair: string
    movement: string
    currentChange: number
    required: number
  }>
}

export interface TomorrowPrediction {
  predictions: PredictionMatch[]
  aiSynthesis: string
  confidence: 'high' | 'medium' | 'low'
  topPredictions: Array<{
    pair: string
    direction: 'up' | 'down'
    expectedMove: number
    supportingPatterns: number
    avgAccuracy: number
  }>
  tradingDayStatus: TradingDayStatus
}

/**
 * Analyze current market conditions and predict tomorrow's movements
 */
export async function predictTomorrow(
  scenarios: CorrelationScenarioRow[],
  currentPrices: Map<string, OandaPrice>,
  previousClose: Map<string, number>
): Promise<TomorrowPrediction> {
  console.log('[Predictor] Analyzing current conditions against patterns...')

  // Check if tomorrow is a trading day
  const tradingDayStatus = await checkTomorrowTradingDay()

  // Step 1: Find matching patterns
  const matches: PredictionMatch[] = []

  for (const scenario of scenarios) {
    const conditions = scenario.conditions as Array<{
      pair: string
      movement: string
      threshold: number
    }>

    let conditionsMet = 0
    const currentValues = []

    for (const condition of conditions) {
      const price = currentPrices.get(condition.pair)
      const prevClose = previousClose.get(condition.pair)

      if (!price || !prevClose) continue

      // Calculate current change percentage
      const mid = (parseFloat(price.asks[0].price) + parseFloat(price.bids[0].price)) / 2
      const changePercent = ((mid - prevClose) / prevClose) * 100

      // Check if condition is met
      const movement = condition.movement // e.g., 'jpy_weak', 'usd_strong'
      const isNegative = movement.includes('weak') || movement.includes('down')
      const expectedSign = isNegative ? -1 : 1
      const actualSign = changePercent < 0 ? -1 : 1

      const met =
        expectedSign === actualSign &&
        Math.abs(changePercent) >= condition.threshold

      if (met) conditionsMet++

      currentValues.push({
        pair: condition.pair,
        movement: condition.movement,
        currentChange: changePercent,
        required: condition.threshold
      })
    }

    const matchPercentage = (conditionsMet / conditions.length) * 100

    // Include patterns with at least 75% conditions met
    if (matchPercentage >= 75) {
      matches.push({
        scenario,
        conditionsMet,
        totalConditions: conditions.length,
        matchPercentage,
        currentValues
      })
    }
  }

  console.log(`[Predictor] Found ${matches.length} matching patterns`)

  // Step 2: Aggregate predictions by outcome pair
  const pairPredictions = new Map<
    string,
    {
      direction: 'up' | 'down'
      patterns: PredictionMatch[]
      totalAccuracy: number
      expectedMove: number
    }
  >()

  for (const match of matches) {
    const outcome = match.scenario.expected_outcome as {
      pair: string
      direction: string
      minMove: number
    }
    const key = `${outcome.pair}:${outcome.direction}`

    if (!pairPredictions.has(key)) {
      pairPredictions.set(key, {
        direction: outcome.direction as 'up' | 'down',
        patterns: [],
        totalAccuracy: 0,
        expectedMove: 0
      })
    }

    const pred = pairPredictions.get(key)!
    pred.patterns.push(match)
    pred.totalAccuracy += match.scenario.accuracy_percentage
    pred.expectedMove += outcome.minMove
  }

  // Step 3: Build top predictions
  const topPredictions = Array.from(pairPredictions.entries())
    .map(([key, data]) => {
      const [pair] = key.split(':')
      return {
        pair,
        direction: data.direction,
        expectedMove: (data.expectedMove / data.patterns.length) * 100, // Average as percentage
        supportingPatterns: data.patterns.length,
        avgAccuracy: data.totalAccuracy / data.patterns.length
      }
    })
    .sort((a, b) => b.avgAccuracy - a.avgAccuracy)
    .slice(0, 5) // Top 5 predictions

  // Step 4: Use AI to synthesize predictions
  const aiSynthesis = await synthesizePredictions(matches, topPredictions, tradingDayStatus)

  // Step 5: Calculate overall confidence
  const avgAccuracy =
    matches.length > 0
      ? matches.reduce((sum, m) => sum + m.scenario.accuracy_percentage, 0) / matches.length
      : 0

  const confidence: 'high' | 'medium' | 'low' =
    avgAccuracy >= 70 && matches.length >= 3
      ? 'high'
      : avgAccuracy >= 60 && matches.length >= 2
      ? 'medium'
      : 'low'

  return {
    predictions: matches,
    aiSynthesis,
    confidence,
    topPredictions,
    tradingDayStatus
  }
}

/**
 * Use Gemini + Claude to synthesize prediction insights
 */
async function synthesizePredictions(
  matches: PredictionMatch[],
  topPredictions: Array<{
    pair: string
    direction: 'up' | 'down'
    expectedMove: number
    supportingPatterns: number
    avgAccuracy: number
  }>,
  tradingDayStatus: TradingDayStatus
): Promise<string> {
  // If tomorrow is not a trading day, return calendar message
  if (!tradingDayStatus.isTradingDay) {
    return `${tradingDayStatus.reason}\n\nForex markets will be closed tomorrow. Current patterns will be evaluated for the next trading day (${new Date(tradingDayStatus.nextTradingDay!).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}). Monitor positions carefully as weekend gaps or post-holiday volatility may affect pattern reliability.`
  }

  if (matches.length === 0) {
    return 'No strong patterns detected in current market conditions. Monitor for clearer signals.'
  }

  // Step 1: Gemini analyzes structural patterns
  const geminiPrompt = `You are analyzing forex correlation patterns to predict tomorrow's market movements.

## CRITICAL ANTI-HALLUCINATION RULES
1. ONLY reference the patterns and data provided below. DO NOT invent patterns, percentages, or outcomes.
2. DO NOT mention specific news events, central bank actions, or economic data unless provided.
3. DO NOT fabricate price levels, support/resistance zones, or technical indicators.
4. If data is insufficient, say so. Do NOT make up information to fill gaps.
5. Stick to the statistical evidence from the patterns. DO NOT add speculative market narratives.

CURRENT MARKET CONDITIONS:
${matches
  .slice(0, 3)
  .map(
    (m, i) => `
Pattern ${i + 1} (${m.scenario.accuracy_percentage.toFixed(1)}% accurate, ${m.scenario.total_occurrences} occurrences):
${m.currentValues.map(v => `- ${v.pair}: ${v.currentChange >= 0 ? '+' : ''}${v.currentChange.toFixed(2)}% (${v.movement})`).join('\n')}
Expected outcome: ${(m.scenario.expected_outcome as any).pair} moves ${(m.scenario.expected_outcome as any).direction.toUpperCase()}
`
  )
  .join('\n')}

TOP PREDICTIONS FOR TOMORROW:
${topPredictions
  .map(
    p =>
      `${p.pair}: ${p.direction.toUpperCase()} by ~${p.expectedMove.toFixed(1)}% (${p.supportingPatterns} patterns, ${p.avgAccuracy.toFixed(1)}% avg accuracy)`
  )
  .join('\n')}

Analyze these patterns and identify:
1. The strongest prediction signals
2. Key currency relationships at play
3. Potential risks or conflicting signals
4. Market sentiment (risk-on/risk-off)

Keep your analysis concise (150-200 words).`

  const geminiAnalysis = await callGemini(geminiPrompt, {
    maxTokens: 400
  })

  // Step 2: Claude synthesizes actionable narrative
  const claudePrompt = `You are a trading analyst briefing a trader on tomorrow's forex predictions.

## STRICT ANTI-HALLUCINATION PROTOCOL
1. ONLY use information from the analytical insights and predictions below
2. DO NOT invent:
   - News events or economic data releases
   - Central bank statements or policy changes
   - Specific price targets or stop-loss levels
   - Technical patterns not mentioned in the data
   - Historical precedents or "similar situations"
3. If you don't have enough data, acknowledge limitations
4. Focus on the statistical patterns provided, not market speculation
5. Every claim must trace back to a specific pattern number and accuracy percentage

ANALYTICAL INSIGHTS:
${geminiAnalysis}

TOP PREDICTIONS:
${topPredictions
  .map(
    p =>
      `• ${p.pair}: Expected ${p.direction.toUpperCase()} move (~${p.expectedMove.toFixed(1)}%) — ${p.supportingPatterns} patterns, ${p.avgAccuracy.toFixed(1)}% accuracy`
  )
  .join('\n')}

Your task: Write a clear, actionable prediction brief (200-250 words) that:
1. States the TOP 2-3 predictions with confidence levels
2. Explains WHY these moves are expected (based on current correlations)
3. Warns of any risks or conflicting signals
4. Suggests what to monitor before taking positions

Write in a direct, professional tone. Use "you" to address the trader. Be specific.`

  const synthesis = await callClaude(claudePrompt, {
    maxTokens: 500
  })

  return synthesis
}
