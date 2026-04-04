/**
 * AI Pattern Explainer
 *
 * Uses Gemini for fundamental analysis and Claude for narrative synthesis
 * to explain WHY correlation patterns work.
 */

import { callGemini, callClaude, callDeepSeek } from '@/lib/ai/clients'
import type { CorrelationScenarioRow } from './types'

interface PatternExplanation {
  fundamental_factors: string // Gemini's analysis
  narrative: string // Claude's synthesis
  confidence: number // 0-100
  key_drivers: string[]
}

/**
 * Generate comprehensive explanation for a correlation pattern
 * using both Gemini (structural) and Claude (narrative)
 */
export async function explainPattern(
  scenario: CorrelationScenarioRow
): Promise<PatternExplanation> {
  console.log(`[AIExplainer] Analyzing pattern: ${scenario.pattern_description}`)

  // Step 1: Gemini analyzes fundamental factors
  const geminiPrompt = buildGeminiPrompt(scenario)
  const fundamentalAnalysis = await callGemini(geminiPrompt, {
    maxTokens: 500
  })

  // Step 2: Claude synthesizes narrative explanation
  const claudePrompt = buildClaudePrompt(scenario, fundamentalAnalysis)
  const narrative = await callClaude(claudePrompt, {
    maxTokens: 600
  })

  // Extract key drivers from Gemini's analysis
  const keyDrivers = extractKeyDrivers(fundamentalAnalysis)

  // Calculate confidence based on pattern accuracy and occurrence count
  const confidence = calculateExplanationConfidence(scenario)

  return {
    fundamental_factors: fundamentalAnalysis,
    narrative,
    confidence,
    key_drivers: keyDrivers
  }
}

/**
 * Build Gemini prompt for fundamental analysis
 */
function buildGeminiPrompt(scenario: CorrelationScenarioRow): string {
  const conditions = scenario.conditions as Array<{ pair: string; movement: string; threshold: number }>
  const outcome = scenario.expected_outcome as { pair: string; direction: string; minMove: number }

  return `You are a forex market analyst. Analyze this correlation pattern and explain the fundamental economic factors that might cause it.

## ANTI-HALLUCINATION RULES
1. ONLY reference the pattern data provided below
2. DO NOT invent specific dates, events, or news releases
3. DO NOT mention specific central bank officials or statements unless universally known principles
4. Focus on general economic relationships (e.g., "risk appetite," "safe haven flows")
5. If uncertain about causation, use phrases like "may be related to" or "could suggest"

PATTERN:
${scenario.pattern_description}

CONDITIONS:
${conditions.map((c, i) => `${i + 1}. ${c.pair} shows ${c.movement.replace(/_/g, ' ')} (≥${(c.threshold * 100).toFixed(1)}%)`).join('\n')}

OUTCOME:
${outcome.pair} moves ${outcome.direction.toUpperCase()} by ≥${(outcome.minMove * 100).toFixed(1)}%

STATISTICS:
- Accuracy: ${scenario.accuracy_percentage.toFixed(1)}%
- Occurrences: ${scenario.total_occurrences}
- Best day: ${scenario.best_day}
- Average move: ${scenario.avg_outcome_pips?.toFixed(1) || 'N/A'} pips

Analyze:
1. What fundamental economic factors might explain this correlation?
2. Which central bank policies could be at play?
3. What market sentiment (risk-on/risk-off) does this suggest?
4. Are there commodity price relationships involved?
5. Why might this pattern occur more frequently on ${scenario.best_day}?

Provide a concise analysis (200-300 words) focusing on the economic logic behind this pattern.`
}

/**
 * Build Claude prompt for narrative synthesis
 */
function buildClaudePrompt(
  scenario: CorrelationScenarioRow,
  fundamentalAnalysis: string
): string {
  return `You are a trading coach explaining a forex correlation pattern to a trader.

## STRICT ANTI-HALLUCINATION PROTOCOL
1. ONLY use data from the pattern statistics and fundamental analysis provided
2. DO NOT invent:
   - Specific price levels or entry/exit points
   - Upcoming economic events or data releases
   - Historical examples or past occurrences beyond the statistics shown
   - Technical indicators not mentioned in the data
3. Base recommendations ONLY on the pattern's accuracy percentage and occurrence count
4. If you lack data to answer something, say "The pattern data doesn't show..."

PATTERN:
${scenario.pattern_description}

FUNDAMENTAL ANALYSIS (from market analyst):
${fundamentalAnalysis}

STATISTICS:
- ${scenario.accuracy_percentage.toFixed(1)}% accuracy over ${scenario.total_occurrences} occurrences
- Average move: ${scenario.avg_outcome_pips?.toFixed(1) || 'N/A'} pips
- Best day: ${scenario.best_day}

Your task: Write a clear, actionable explanation (250-350 words) that:
1. Explains WHY this pattern works in simple terms
2. Connects the fundamental factors to the price movements
3. Provides context on WHEN to watch for this pattern
4. Warns of potential risks or false signals
5. Suggests how to confirm the pattern before trading

Write in a direct, educational tone. Use "you" to address the trader. Be specific and actionable.`
}

/**
 * Extract key economic drivers from Gemini's analysis
 */
function extractKeyDrivers(fundamentalAnalysis: string): string[] {
  const drivers: string[] = []

  // Common forex drivers to look for
  const driverKeywords = [
    'interest rate', 'central bank', 'inflation', 'employment',
    'GDP', 'risk sentiment', 'safe haven', 'commodity',
    'trade balance', 'monetary policy', 'fiscal policy',
    'risk-on', 'risk-off', 'dollar strength', 'yen strength'
  ]

  const lowerText = fundamentalAnalysis.toLowerCase()

  for (const keyword of driverKeywords) {
    if (lowerText.includes(keyword)) {
      // Capitalize first letter
      const formatted = keyword.charAt(0).toUpperCase() + keyword.slice(1)
      drivers.push(formatted)
    }
  }

  // Return top 5 unique drivers
  return [...new Set(drivers)].slice(0, 5)
}

/**
 * Calculate confidence in the explanation based on pattern statistics
 */
function calculateExplanationConfidence(scenario: CorrelationScenarioRow): number {
  let confidence = 0

  // Base confidence from accuracy
  confidence += scenario.accuracy_percentage * 0.6

  // Bonus for high occurrence count
  if (scenario.total_occurrences >= 30) confidence += 15
  else if (scenario.total_occurrences >= 20) confidence += 10
  else if (scenario.total_occurrences >= 15) confidence += 5

  // Bonus for strong day concentration
  const dayDist = scenario.day_distribution as Record<string, number>
  const maxDayCount = Math.max(...Object.values(dayDist))
  const dayConcentration = maxDayCount / scenario.total_occurrences
  if (dayConcentration >= 0.5) confidence += 10 // 50%+ on one day
  else if (dayConcentration >= 0.4) confidence += 5

  // Cap at 100
  return Math.min(100, Math.round(confidence))
}

/**
 * Batch explain multiple patterns
 */
export async function explainPatternsBatch(
  scenarios: CorrelationScenarioRow[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, PatternExplanation>> {
  const explanations = new Map<string, PatternExplanation>()

  for (let i = 0; i < scenarios.length; i++) {
    try {
      const explanation = await explainPattern(scenarios[i])
      explanations.set(scenarios[i].id, explanation)

      if (onProgress) {
        onProgress(i + 1, scenarios.length)
      }

      // Rate limiting: wait 2s between API calls
      if (i < scenarios.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    } catch (error) {
      console.error(`[AIExplainer] Failed to explain pattern ${scenarios[i].id}:`, error)
    }
  }

  return explanations
}
