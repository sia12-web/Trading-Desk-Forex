import type { StoryDataPayload } from '../types'
import type { CrossMarketReport, IndexCrossMarketReport } from '../agents/types'

/**
 * DeepSeek "Quantitative Engine" prompt for Story.
 * Validates Gemini's structural analysis and computes precise levels.
 */
export function buildStoryQuantPrompt(
    data: StoryDataPayload,
    geminiOutput: string,
    scenarioAnalysisLevels?: Array<{ price: number; type: string; timeframe: string; significance: string }> | null,
    crossMarket?: CrossMarketReport | IndexCrossMarketReport | null
): string {
    // Extract indicator data for quant analysis
    const indicatorSummary = data.timeframes.map(tf => {
        const i = tf.indicators
        const adxValues = i.adx.slice(-10)
        const rsiValues = i.rsi.slice(-10)
        const macdHist = i.macd.histogram.slice(-10)
        const bbWidthValues = i.bbWidth.slice(-10)
        const stochK = i.stochastic.k.slice(-5)
        const stochD = i.stochastic.d.slice(-5)

        const vf = i.volumeFlow
        return `### ${tf.timeframe}
- ADX (last 10): [${adxValues.map(v => v.toFixed(1)).join(', ')}]
- RSI (last 10): [${rsiValues.map(v => v.toFixed(1)).join(', ')}]
- MACD histogram (last 10): [${macdHist.map(v => v.toFixed(6)).join(', ')}]
- BB Width % (last 10): [${bbWidthValues.map(v => v.toFixed(2)).join(', ')}]
- Stochastic K/D (last 5): K=[${stochK.map(v => v.toFixed(1)).join(', ')}] D=[${stochD.map(v => v.toFixed(1)).join(', ')}]
- ATR (last): ${i.atr[i.atr.length - 1]?.toFixed(6) || 'N/A'}
- Parabolic SAR direction: ${i.parabolicSar.direction[i.parabolicSar.direction.length - 1] || 'N/A'}
- Alligator: jaw=${i.alligator.jaw.slice(-1)[0]?.toFixed(6) || 'N/A'}, teeth=${i.alligator.teeth.slice(-1)[0]?.toFixed(6) || 'N/A'}, lips=${i.alligator.lips.slice(-1)[0]?.toFixed(6) || 'N/A'}, state=${i.alligator.state.slice(-1)[0] || 'N/A'}
- AO (last 5): [${i.awesomeOscillator.slice(-5).map(v => isNaN(v) ? 'NaN' : v.toFixed(6)).join(', ')}]
- AC (last 5): [${i.acceleratorOscillator.slice(-5).map(v => isNaN(v) ? 'NaN' : v.toFixed(6)).join(', ')}]
- BW Setup: score=${tf.fractalAnalysis?.setupScore ?? 0}/100, direction=${tf.fractalAnalysis?.setupDirection ?? 'none'}${tf.fractalAnalysis?.volumeConfirmation?.trapWarning ? ' ⚠️ TRAP' : tf.fractalAnalysis?.volumeConfirmation?.breakoutConfirmed ? ' ✓VOL' : ''}
- BW Signals: ${tf.fractalAnalysis?.signals.join('; ') || 'none'}
- Volume Profile: VPOC=${vf.volumeProfile.vpoc.toFixed(6)}, VA=${vf.volumeProfile.valueAreaLow.toFixed(6)}–${vf.volumeProfile.valueAreaHigh.toFixed(6)}
- HVN (real S/R): [${vf.volumeProfile.hvn.slice(0, 4).map(p => p.toFixed(6)).join(', ') || 'none'}]
- LVN (thin zones): [${vf.volumeProfile.lvn.slice(0, 4).map(p => p.toFixed(6)).join(', ') || 'none'}]
- VWAP: ${vf.vwap[vf.vwap.length - 1]?.toFixed(6) || 'N/A'}
- Volume Exhaustion: ${vf.exhaustion.detected ? `${vf.exhaustion.type} (${vf.exhaustion.severity})` : 'none'}
- Trend score: ${tf.trend.score}/100 (${tf.trend.direction})`
    }).join('\n\n')

    // Cross-TF divergence data
    const rsiByTF = data.timeframes.map(tf => ({
        tf: tf.timeframe,
        rsi: tf.indicators.rsi[tf.indicators.rsi.length - 1] || 50,
        macdHist: tf.indicators.macd.histogram[tf.indicators.macd.histogram.length - 1] || 0,
    }))

    return `You are the Quantitative Engine — a statistical validator for forex trading signals.
Your job is to validate the structural analysis with hard numbers and compute precise levels.

## CROSS-VALIDATION MANDATE (MANDATORY)
- Cross-check EVERY price level from Gemini's analysis against actual swing highs/lows in the indicator data.
- Flag any Gemini level that does NOT correspond to an actual swing high/low or candle boundary within 1 ATR tolerance.
- Cross-check fractal levels against Alligator teeth position — fractals inside the "mouth" (between jaw and teeth) are NOT valid Bill Williams signals.
- **Elliott Wave Validation**: Verify that proposed entry/exit levels align with Elliott Wave Fibonacci retracements/extensions. If entering on a "Wave 3" setup, confirm we're bouncing off 38.2-61.8% retracement. If targeting, use 127.2-161.8% extensions.
- **Wave Structure Confirmation**: If Elliott Wave shows "corrective" pattern but Gemini suggests trend continuation, flag this as conflicting signals. Corrective waves (A-B-C) move counter-trend.
- Include a "flagged_levels" array in your output listing any suspicious levels with reasons.
- Your own precise_levels must ONLY use prices derivable from actual candle data.

## VOLUME FLOW VALIDATION (MANDATORY)
- Cross-validate Gemini's key levels against Volume Profile HVN. Levels at HVN are STRONGER than levels at LVN.
- If Gemini cites a support/resistance that sits at an LVN (thin volume), downgrade its reliability in your assessment.
- VPOC is the single most statistically significant price level — if Gemini misses it, add it to your own levels.
- If Volume Exhaustion is detected on D or H4, flag it as a potential trend reversal risk regardless of other indicators.
- If a fractal breakout has a VOLUME TRAP WARNING, it must be flagged as unreliable even if other BW indicators confirm.

## PAIR: ${data.pair}
**Current Price**: ${data.currentPrice.toFixed(5)}
**Pip Location**: ${data.pipLocation}
**Volatility**: ${data.volatilityStatus} (ATR14: ${data.atr14.toFixed(1)} pips)

## GEMINI'S STRUCTURAL ANALYSIS (to validate)
${geminiOutput}

## RAW INDICATOR DATA
${indicatorSummary}

## CROSS-TF COMPARISON
${rsiByTF.map(r => `${r.tf}: RSI=${r.rsi.toFixed(1)}, MACD Hist=${r.macdHist.toFixed(6)}`).join('\n')}

## AMD ALGORITHMIC ASSESSMENT
${Object.entries(data.amdPhases).map(([tf, p]) => `${tf}: ${p.phase} (${p.confidence}%)`).join('\n')}

## CROSS-MARKET DIVERGENCE CHECK
${buildCrossMarketCheck(crossMarket)}

${scenarioAnalysisLevels && scenarioAnalysisLevels.length > 0 ? `## PRE-VALIDATED LEVELS (from Scenario Analysis)
The following levels were validated in a recent institutional scenario analysis. Use them as REFERENCE anchors when validating Gemini's levels — if Gemini cites a level that is close to one of these, it is more likely legitimate.
${scenarioAnalysisLevels.map(l => `- ${l.price.toFixed(5)} (${l.type}, ${l.timeframe}): ${l.significance}`).join('\n')}
` : ''}## YOUR TASK
Validate Gemini's analysis statistically and provide precise trading levels.

Respond with JSON:
{
  "validation": {
    "agrees_with_gemini": true/false,
    "disagreements": ["specific disagreements if any"],
    "confidence_adjustment": number (-20 to +20, how much to adjust Gemini's confidence)
  },
  "divergences": [
    {"type": "bullish_hidden" | "bearish_hidden" | "bullish_regular" | "bearish_regular", "timeframes": ["D", "H4"], "indicator": "RSI|MACD", "description": "..."}
  ],
  "precise_levels": {
    "primary_entry": number,
    "secondary_entry": number,
    "stop_loss": number,
    "take_profit_1": number,
    "take_profit_2": number,
    "take_profit_3": number
  },
  "risk_metrics": {
    "risk_reward_ratio": number,
    "pip_risk": number,
    "pip_reward": number,
    "confluence_score": 0-100
  },
  "indicator_health": {
    "strongest_signal": "which indicator gives the clearest signal",
    "weakest_signal": "which indicator is least reliable right now",
    "overall_reliability": 0-100
  },
  "probability_assessment": {
    "bullish_probability": 0-100,
    "bearish_probability": 0-100,
    "reasoning": "Brief explanation"
  },
  "flagged_levels": [
    {"level": 1.2345, "source": "gemini_resistance", "reason": "No corresponding swing high within 1 ATR in candle data"}
  ]
}

IMPORTANT: The "flagged_levels" array is MANDATORY. If all Gemini levels check out, return an empty array [].

Be mathematically precise. Use exact pip values. Show your reasoning in the descriptions.`
}

function buildCrossMarketCheck(crossMarket?: CrossMarketReport | IndexCrossMarketReport | null): string {
    if (!crossMarket) return 'Cross-market data unavailable — skip this check.'

    const parts: string[] = []
    parts.push(`Risk Appetite: ${crossMarket.risk_appetite}`)
    parts.push(`Summary: ${crossMarket.summary}`)

    // Forex pair cross-market report
    if ('indices_analyzed' in crossMarket && crossMarket.indices_analyzed) {
        const trends = crossMarket.indices_analyzed.map(idx =>
            `${idx.name}: ${idx.recent_trend}`
        ).join(', ')
        parts.push(`Index Trends: ${trends}`)
        if (crossMarket.currency_implications) {
            parts.push(`Currency Flow: net effect = ${crossMarket.currency_implications.net_effect}`)
        }
    }

    // Index cross-market report
    if ('peer_indices' in crossMarket && crossMarket.peer_indices) {
        const trends = crossMarket.peer_indices.map(idx =>
            `${idx.name}: ${idx.change1d > 0 ? '+' : ''}${idx.change1d.toFixed(1)}%`
        ).join(', ')
        parts.push(`Peer Indices: ${trends}`)
        parts.push(`Dollar: ${crossMarket.dollar_analysis.trend}`)
    }

    parts.push('')
    parts.push('VALIDATION RULE: If Gemini\'s bullish bias is CONTRADICTED by risk-off conditions')
    parts.push('(equities dumping, dollar strengthening), flag in disagreements and reduce')
    parts.push('confidence_adjustment. If aligned, boost confidence.')

    return parts.join('\n')
}
