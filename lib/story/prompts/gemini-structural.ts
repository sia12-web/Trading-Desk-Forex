import type { StoryDataPayload } from '../types'
import type { StoryNewsContext } from '../types'
import type { CrossMarketReport, IndexCrossMarketReport } from '../agents/types'

/**
 * Gemini "Pattern Archaeologist" prompt for Story.
 * Processes ALL raw data across 5 TFs, outputs structural map.
 */
export function buildStoryStructuralPrompt(
    data: StoryDataPayload,
    news: StoryNewsContext,
    crossMarket?: CrossMarketReport | IndexCrossMarketReport | null
): string {
    const tfSummaries = data.timeframes.map(tf => {
        const lastCandle = tf.candles[tf.candles.length - 1]
        const last5 = tf.candles.slice(-5)
        const adx = tf.indicators.adx
        const rsi = tf.indicators.rsi
        const macd = tf.indicators.macd
        const bbWidth = tf.indicators.bbWidth

        return `### ${tf.timeframe} Timeframe (${tf.candles.length} candles)
- **Trend**: ${tf.trend.direction} (score: ${tf.trend.score}/100, ADX: ${tf.trend.adxValue.toFixed(1)})
- **Last Close**: ${parseFloat(lastCandle.mid.c).toFixed(5)}
- **RSI**: ${rsi[rsi.length - 1]?.toFixed(1) || 'N/A'}
- **MACD**: line=${macd.line[macd.line.length - 1]?.toFixed(6) || 'N/A'}, histogram=${macd.histogram[macd.histogram.length - 1]?.toFixed(6) || 'N/A'}
- **ADX**: ${adx[adx.length - 1]?.toFixed(1) || 'N/A'}
- **BB Width**: ${bbWidth[bbWidth.length - 1]?.toFixed(2) || 'N/A'}%
- **Patterns**: ${tf.patterns.length > 0 ? tf.patterns.join(', ') : 'none'}
- **Swing Highs**: ${tf.swingHighs.slice(-3).map(s => s.price.toFixed(5)).join(', ') || 'none'}
- **Swing Lows**: ${tf.swingLows.slice(-3).map(s => s.price.toFixed(5)).join(', ') || 'none'}
- **Gann Levels** (low of swing high bars): ${tf.swingHighs.slice(-3).filter(s => s.oppositeExtreme).map(s => s.oppositeExtreme!.toFixed(5)).join(', ') || 'none'}
- **Gann Levels** (high of swing low bars): ${tf.swingLows.slice(-3).filter(s => s.oppositeExtreme).map(s => s.oppositeExtreme!.toFixed(5)).join(', ') || 'none'}
- **Volume trend**: ${describeVolume(tf.indicators.volume, tf.indicators.volumeSma)}
- **EMA alignment**: ${describeEMAs(tf.indicators.ema)}
- **Alligator**: ${tf.fractalAnalysis?.alligatorState ?? 'N/A'} (${tf.fractalAnalysis?.alligatorDirection ?? 'N/A'}), Jaw: ${tf.indicators.alligator.jaw.slice(-1)[0]?.toFixed(5) ?? 'N/A'}, Teeth: ${tf.indicators.alligator.teeth.slice(-1)[0]?.toFixed(5) ?? 'N/A'}, Lips: ${tf.indicators.alligator.lips.slice(-1)[0]?.toFixed(5) ?? 'N/A'}
- **Fractals**: Bullish: ${tf.fractalAnalysis?.recentBullishFractals.slice(-3).map(f => f.price.toFixed(5)).join(', ') || 'none'} | Bearish: ${tf.fractalAnalysis?.recentBearishFractals.slice(-3).map(f => f.price.toFixed(5)).join(', ') || 'none'}
- **AO**: ${tf.fractalAnalysis?.aoStatus.value.toFixed(6) ?? 'N/A'} (${tf.fractalAnalysis?.aoStatus.signal ?? 'N/A'})
- **BW Setup**: ${tf.fractalAnalysis?.setupScore ?? 0}/100 → ${tf.fractalAnalysis?.setupDirection ?? 'none'}${tf.fractalAnalysis?.volumeConfirmation?.trapWarning ? ' ⚠️ VOLUME TRAP WARNING' : tf.fractalAnalysis?.volumeConfirmation?.breakoutConfirmed ? ' ✓ Volume confirmed' : ''}
- **Volume Profile**: VPOC: ${tf.indicators.volumeFlow.volumeProfile.vpoc.toFixed(5)}, VA: ${tf.indicators.volumeFlow.volumeProfile.valueAreaLow.toFixed(5)}–${tf.indicators.volumeFlow.volumeProfile.valueAreaHigh.toFixed(5)}
- **HVN (Real S/R)**: ${tf.indicators.volumeFlow.volumeProfile.hvn.slice(0, 3).map(p => p.toFixed(5)).join(', ') || 'none'}
- **LVN (Fast-move zones)**: ${tf.indicators.volumeFlow.volumeProfile.lvn.slice(0, 3).map(p => p.toFixed(5)).join(', ') || 'none'}
- **VWAP**: ${tf.indicators.volumeFlow.vwap[tf.indicators.volumeFlow.vwap.length - 1]?.toFixed(5) || 'N/A'}
- **Volume Exhaustion**: ${tf.indicators.volumeFlow.exhaustion.detected ? `${tf.indicators.volumeFlow.exhaustion.type} (${tf.indicators.volumeFlow.exhaustion.severity}) — ${tf.indicators.volumeFlow.exhaustion.description}` : 'None detected'}
- **Last 5 candles**: ${last5.map(c => `${parseFloat(c.mid.o).toFixed(5)}->${parseFloat(c.mid.c).toFixed(5)} (H:${parseFloat(c.mid.h).toFixed(5)} L:${parseFloat(c.mid.l).toFixed(5)})`).join(' | ')}`
    }).join('\n\n')

    const amdSummary = Object.entries(data.amdPhases)
        .map(([tf, phase]) => `- ${tf}: ${phase.phase} (confidence: ${phase.confidence}%) — ${phase.signals.join('; ')}`)
        .join('\n')

    const liquiditySummary = data.liquidityZones.length > 0
        ? data.liquidityZones.map(z => `- [${z.timeframe}] ${z.type}: ${z.description}${z.swept ? ' (SWEPT)' : ''}`).join('\n')
        : 'No significant liquidity zones detected.'

    return `You are the Pattern Archaeologist — a structural analyst for forex markets.
Your job is to dig through multi-timeframe data and find the structural story.

## GROUNDING RULES (MANDATORY)
- ONLY reference price levels that appear in the candle data below (swing highs, swing lows, OHLC values).
- NEVER fabricate or estimate price levels. Every level you cite must be traceable to a specific candle or swing point.
- If data is insufficient for a particular timeframe, explicitly state "insufficient data" rather than guessing.
- All key_levels must come from actual swing highs/lows or candle boundaries provided below.

## GANN LEVELS (W.D. Gann Methodology)
In addition to standard swing highs/lows, you are provided with Gann-based key levels:
- **Low of swing high bars**: When a bar makes a swing high, its LOW often becomes resistance on pullbacks (marks the extreme volatility at the peak)
- **High of swing low bars**: When a bar makes a swing low, its HIGH often becomes support on rallies (marks the extreme volatility at the bottom)
These are REAL levels from actual candle data, not projections. Use them as additional confluence points for support/resistance.

## PAIR: ${data.pair}
**Current Price**: ${data.currentPrice.toFixed(5)}
**Volatility**: ${data.volatilityStatus} (ATR14: ${data.atr14.toFixed(1)} pips)
**Data collected at**: ${data.collectedAt}

## FUNDAMENTAL CONTEXT
- Sentiment: ${news.sentiment}
- Key drivers: ${news.key_drivers.join(', ')}
- ${news.fundamental_narrative}
${news.avoidTrading ? '⚠️ HIGH-IMPACT NEWS IMMINENT — trading avoidance recommended' : ''}

## CROSS-MARKET INTELLIGENCE
${buildCrossMarketBlock(crossMarket)}

## MULTI-TIMEFRAME DATA
${tfSummaries}

## AMD PHASE ASSESSMENT (algorithmic)
${amdSummary}

## LIQUIDITY ZONES
${liquiditySummary}

## YOUR TASK
Analyze ALL the data above and produce a JSON response:
{
  "structural_bias": "bullish" | "bearish" | "neutral",
  "bias_confidence": 0-100,
  "key_levels": {
    "major_resistance": [price1, price2],
    "major_support": [price1, price2],
    "liquidity_targets": [price1, price2]
  },
  "pattern_confluences": ["description of pattern alignment across TFs..."],
  "cycle_assessment": "Where is this pair in its cycle? Accumulation, markup, distribution, markdown?",
  "multi_tf_alignment": "Do all TFs agree? Where are conflicts?",
  "structural_narrative": "A 3-4 sentence paragraph summarizing the structural story of this pair right now.",
  "optimization_suggestions": ["What indicators are most relevant given current structure?"]
}

**Bill Williams Fractal Analysis**: When the Alligator is 'eating' or 'awakening', note the direction and nearest valid fractals (those beyond the Teeth line). These are high-probability confluence zones. When the Alligator is 'sleeping', flag it as a compression/range phase — a breakout setup is building. If a fractal breakout has a VOLUME TRAP WARNING, flag it as a likely fake breakout regardless of other signals.

**Volume Flow Intelligence**: Use volume data as the SECOND LAYER of S/R validation:
- **VPOC** is the single strongest price level — where the most business was done. Treat it as the most important S/R level on each timeframe.
- **HVN (High Volume Nodes)** are the "real" support/resistance — where big money has been placed. Price approaching an HVN will likely bounce or stall.
- **LVN (Low Volume Nodes)** are "thin air" zones — price moves fast through these. They are weak S/R.
- **Value Area** (70% of volume) is the "fair value" range. Price outside the VA is overextended and likely to revert.
- **VWAP** is the institutional average price — it acts as dynamic S/R. Price below VWAP = undervalued, above = overvalued.
- **Volume Exhaustion**: If detected, it means the current trend is losing steam. Flag this in your structural narrative.
- When citing key_levels, PRIORITIZE levels that align with HVN over traditional swing highs/lows. A swing high that also sits at an HVN is far more significant than one at an LVN.

**Cross-Market Validation**: If your structural bias contradicts the cross-market risk appetite (e.g., you're bullish but risk is off and equities are dumping), note this tension explicitly. Cross-market divergences often precede reversals.

Be precise with price levels. Reference specific timeframes. Look for confluences where multiple TFs tell the same story.`
}

function describeVolume(volume: number[], volumeSma: number[]): string {
    if (volume.length === 0 || volumeSma.length === 0) return 'N/A'
    const current = volume[volume.length - 1]
    const avg = volumeSma[volumeSma.length - 1]
    if (!avg) return 'N/A'
    const ratio = current / avg
    if (ratio > 2) return `spike (${ratio.toFixed(1)}x avg)`
    if (ratio > 1.3) return `above average (${ratio.toFixed(1)}x)`
    if (ratio < 0.5) return `very low (${ratio.toFixed(1)}x avg)`
    return `normal (${ratio.toFixed(1)}x avg)`
}

function buildCrossMarketBlock(crossMarket?: CrossMarketReport | IndexCrossMarketReport | null): string {
    if (!crossMarket) return 'Cross-market data unavailable today.'

    const parts: string[] = []
    parts.push(`- Risk Appetite: ${crossMarket.risk_appetite}`)
    parts.push(`- Summary: ${crossMarket.summary}`)

    // CrossMarketReport (forex pairs)
    if ('indices_analyzed' in crossMarket && crossMarket.indices_analyzed) {
        parts.push('- Index Trends:')
        for (const idx of crossMarket.indices_analyzed) {
            parts.push(`  - ${idx.name} (${idx.instrument}): ${idx.recent_trend} — ${idx.correlation_signal}`)
        }
        if (crossMarket.currency_implications) {
            const ci = crossMarket.currency_implications
            parts.push(`- Currency Flow: base=${ci.base_currency}, quote=${ci.quote_currency}, net=${ci.net_effect}`)
        }
        if (crossMarket.divergences.length > 0) {
            parts.push(`- Divergences: ${crossMarket.divergences.join('; ')}`)
        }
        parts.push(`- Thesis: ${crossMarket.cross_market_thesis}`)
    }

    // IndexCrossMarketReport (index pairs)
    if ('peer_indices' in crossMarket && crossMarket.peer_indices) {
        parts.push('- Peer Indices:')
        for (const idx of crossMarket.peer_indices) {
            parts.push(`  - ${idx.name}: 1D=${idx.change1d > 0 ? '+' : ''}${idx.change1d.toFixed(1)}%, 5D=${idx.change5d > 0 ? '+' : ''}${idx.change5d.toFixed(1)}% | ${idx.trend}${idx.divergence_note ? ` (${idx.divergence_note})` : ''}`)
        }
        if (crossMarket.bond_analysis) {
            parts.push(`- Bonds: ${crossMarket.bond_analysis.yield_trend} — ${crossMarket.bond_analysis.implication}`)
        }
        parts.push(`- Dollar: ${crossMarket.dollar_analysis.trend} — ${crossMarket.dollar_analysis.implication}`)
        parts.push(`- Thesis: ${crossMarket.correlation_thesis}`)
    }

    return parts.join('\n')
}

function describeEMAs(ema: Record<number, number[]>): string {
    const periods = [8, 21, 50, 200].filter(p => ema[p]?.length > 0)
    if (periods.length < 2) return 'N/A'

    const values = periods.map(p => ({ period: p, value: ema[p][ema[p].length - 1] }))
    const bullish = values.every((v, i) => i === 0 || v.value < values[i - 1].value)
    const bearish = values.every((v, i) => i === 0 || v.value > values[i - 1].value)

    if (bullish) return 'bullish stack (short > long)'
    if (bearish) return 'bearish stack (short < long)'
    return 'mixed/crossing'
}
