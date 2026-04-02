/**
 * Volume Flow Analysis Engine
 *
 * Builds Volume Profile, VWAP, exhaustion detection, and breakout volume confirmation
 * from existing OANDA candle data. No extra API needed.
 *
 * Volume Profile distributes total volume across price levels to find:
 * - VPOC (Volume Point of Control): price with the most trading activity = strongest S/R
 * - Value Area (70% of volume): the price range where most business was done
 * - HVN (High Volume Nodes): prices with heavy volume = likely bounce zones
 * - LVN (Low Volume Nodes): prices with thin volume = fast-move zones, weak S/R
 */

import type { OandaCandle } from '@/lib/types/oanda'

// ── Types ──

export interface VolumeProfileLevel {
    price: number
    volume: number
    percentage: number  // % of total volume at this level
}

export interface VolumeProfile {
    vpoc: number              // Volume Point of Control — single strongest level
    valueAreaHigh: number     // Upper bound of 70% value area
    valueAreaLow: number      // Lower bound of 70% value area
    hvn: number[]             // High Volume Nodes (>1.5x avg volume per level)
    lvn: number[]             // Low Volume Nodes (<0.5x avg volume per level)
    levels: VolumeProfileLevel[]  // Full distribution (sorted by price)
    totalVolume: number
}

export interface VolumeExhaustion {
    detected: boolean
    type: 'bullish_exhaustion' | 'bearish_exhaustion' | 'none'
    severity: 'mild' | 'moderate' | 'strong'
    description: string
}

export interface VolumeFlowData {
    volumeProfile: VolumeProfile
    vwap: number[]
    exhaustion: VolumeExhaustion
}

// ── Volume Profile Builder ──

/**
 * Build a Volume Profile from OHLCV candles.
 *
 * For each candle, distributes its volume across the price range (O-H-L-C).
 * Uses a configurable number of price bins across the full range.
 *
 * @param candles - OANDA candles with volume
 * @param numBins - Number of price levels to divide the range into (default: 50)
 */
export function buildVolumeProfile(candles: OandaCandle[], numBins = 50): VolumeProfile {
    if (candles.length < 10) {
        return emptyProfile()
    }

    // Find the total price range
    let globalHigh = -Infinity
    let globalLow = Infinity
    for (const c of candles) {
        const h = parseFloat(c.mid.h)
        const l = parseFloat(c.mid.l)
        if (h > globalHigh) globalHigh = h
        if (l < globalLow) globalLow = l
    }

    const range = globalHigh - globalLow
    if (range <= 0) return emptyProfile()

    const binSize = range / numBins
    const bins: number[] = new Array(numBins).fill(0)
    let totalVolume = 0

    // Distribute each candle's volume across its price range
    for (const c of candles) {
        const h = parseFloat(c.mid.h)
        const l = parseFloat(c.mid.l)
        const vol = c.volume
        if (vol <= 0) continue

        totalVolume += vol

        // Find which bins this candle spans
        const startBin = Math.max(0, Math.floor((l - globalLow) / binSize))
        const endBin = Math.min(numBins - 1, Math.floor((h - globalLow) / binSize))
        const binsSpanned = endBin - startBin + 1

        // Distribute volume evenly across spanned bins
        const volPerBin = vol / binsSpanned
        for (let b = startBin; b <= endBin; b++) {
            bins[b] += volPerBin
        }
    }

    if (totalVolume === 0) return emptyProfile()

    // Build level objects
    const levels: VolumeProfileLevel[] = bins.map((vol, i) => ({
        price: globalLow + (i + 0.5) * binSize,  // mid-point of bin
        volume: vol,
        percentage: (vol / totalVolume) * 100,
    }))

    // VPOC = bin with highest volume
    let vpocIdx = 0
    for (let i = 1; i < bins.length; i++) {
        if (bins[i] > bins[vpocIdx]) vpocIdx = i
    }
    const vpoc = levels[vpocIdx].price

    // Value Area: expand from VPOC until 70% of volume is captured
    const targetVolume = totalVolume * 0.70
    let vaVolume = bins[vpocIdx]
    let vaLow = vpocIdx
    let vaHigh = vpocIdx

    while (vaVolume < targetVolume && (vaLow > 0 || vaHigh < numBins - 1)) {
        const belowVol = vaLow > 0 ? bins[vaLow - 1] : -1
        const aboveVol = vaHigh < numBins - 1 ? bins[vaHigh + 1] : -1

        if (belowVol >= aboveVol && vaLow > 0) {
            vaLow--
            vaVolume += bins[vaLow]
        } else if (vaHigh < numBins - 1) {
            vaHigh++
            vaVolume += bins[vaHigh]
        } else {
            break
        }
    }

    const valueAreaHigh = levels[vaHigh].price + binSize / 2
    const valueAreaLow = levels[vaLow].price - binSize / 2

    // HVN and LVN detection
    const avgVolPerBin = totalVolume / numBins
    const hvn: number[] = []
    const lvn: number[] = []

    for (let i = 0; i < levels.length; i++) {
        if (levels[i].volume > avgVolPerBin * 1.5) {
            hvn.push(levels[i].price)
        } else if (levels[i].volume < avgVolPerBin * 0.5 && levels[i].volume > 0) {
            lvn.push(levels[i].price)
        }
    }

    // Consolidate HVN/LVN: merge nodes within 3 bins of each other
    const consolidatedHVN = consolidateNodes(hvn, binSize * 3)
    const consolidatedLVN = consolidateNodes(lvn, binSize * 3)

    return {
        vpoc,
        valueAreaHigh,
        valueAreaLow,
        hvn: consolidatedHVN.slice(0, 5),  // Top 5 HVN
        lvn: consolidatedLVN.slice(0, 5),  // Top 5 LVN
        levels,
        totalVolume,
    }
}

// ── VWAP (Volume-Weighted Average Price) ──

/**
 * Calculate VWAP series from candles.
 * Cumulative: VWAP[i] = sum(typical_price * volume) / sum(volume) up to bar i.
 * Resets are not applied (continuous VWAP over the whole dataset).
 */
export function calculateVWAP(candles: OandaCandle[]): number[] {
    const vwap: number[] = []
    let cumulativeTPV = 0  // cumulative (typical_price * volume)
    let cumulativeVol = 0

    for (const c of candles) {
        const h = parseFloat(c.mid.h)
        const l = parseFloat(c.mid.l)
        const cl = parseFloat(c.mid.c)
        const tp = (h + l + cl) / 3
        const vol = c.volume

        cumulativeTPV += tp * vol
        cumulativeVol += vol

        vwap.push(cumulativeVol > 0 ? cumulativeTPV / cumulativeVol : tp)
    }

    return vwap
}

// ── Volume Exhaustion Detection ──

/**
 * Detect volume exhaustion: when price makes new highs/lows but volume is declining.
 * This is a classic sign of trend weakness — big players are stepping back.
 *
 * Checks the last `lookback` candles for:
 * - Price trending up but volume declining = bullish exhaustion (sellers about to win)
 * - Price trending down but volume declining = bearish exhaustion (buyers about to win)
 */
export function detectVolumeExhaustion(
    candles: OandaCandle[],
    lookback = 10
): VolumeExhaustion {
    if (candles.length < lookback + 5) {
        return { detected: false, type: 'none', severity: 'mild', description: 'Insufficient data' }
    }

    const recent = candles.slice(-lookback)
    const closes = recent.map(c => parseFloat(c.mid.c))
    const volumes = recent.map(c => c.volume)

    // Calculate linear regression slopes for price and volume
    const priceSlope = linearSlope(closes)
    const volumeSlope = linearSlope(volumes)

    // Normalize slopes relative to their averages
    const avgPrice = closes.reduce((a, b) => a + b, 0) / closes.length
    const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length
    const priceSlopeNorm = avgPrice > 0 ? priceSlope / avgPrice : 0
    const volumeSlopeNorm = avgVol > 0 ? volumeSlope / avgVol : 0

    // Exhaustion = price trending but volume declining
    const priceUp = priceSlopeNorm > 0.001    // price rising meaningfully
    const priceDown = priceSlopeNorm < -0.001  // price falling meaningfully
    const volDeclining = volumeSlopeNorm < -0.01  // volume declining

    // Also check: are recent volumes below average?
    const prevCandles = candles.slice(-lookback * 2, -lookback)
    const prevAvgVol = prevCandles.length > 0
        ? prevCandles.reduce((sum, c) => sum + c.volume, 0) / prevCandles.length
        : avgVol
    const volRatio = prevAvgVol > 0 ? avgVol / prevAvgVol : 1

    if (priceUp && volDeclining) {
        const severity = volRatio < 0.6 ? 'strong' : volRatio < 0.8 ? 'moderate' : 'mild'
        return {
            detected: true,
            type: 'bullish_exhaustion',
            severity,
            description: `Price rising but volume declining (${(volRatio * 100).toFixed(0)}% of prior avg) — buyers losing conviction, reversal risk`,
        }
    }

    if (priceDown && volDeclining) {
        const severity = volRatio < 0.6 ? 'strong' : volRatio < 0.8 ? 'moderate' : 'mild'
        return {
            detected: true,
            type: 'bearish_exhaustion',
            severity,
            description: `Price falling but volume declining (${(volRatio * 100).toFixed(0)}% of prior avg) — sellers losing conviction, bounce likely`,
        }
    }

    return {
        detected: false,
        type: 'none',
        severity: 'mild',
        description: 'No volume exhaustion detected — volume confirms price action',
    }
}

// ── Breakout Volume Confirmation ──

/**
 * Check if a breakout (fractal break, level break) has volume support.
 * Compares breakout bar volume to the average of the prior N bars.
 *
 * Returns a ratio and verdict:
 * - ratio > 1.5: Strong volume confirmation (real breakout likely)
 * - ratio 1.0-1.5: Moderate confirmation
 * - ratio < 1.0: Thin volume (potential trap / fake breakout)
 * - ratio < 0.7: Volume rejection (high probability trap)
 */
export function confirmBreakoutVolume(
    candles: OandaCandle[],
    breakoutBarIndex: number,
    lookback = 10
): { ratio: number; confirmed: boolean; verdict: string } {
    if (breakoutBarIndex < lookback || breakoutBarIndex >= candles.length) {
        return { ratio: 1, confirmed: false, verdict: 'insufficient data' }
    }

    const breakoutVol = candles[breakoutBarIndex].volume
    const priorCandles = candles.slice(breakoutBarIndex - lookback, breakoutBarIndex)
    const avgVol = priorCandles.reduce((sum, c) => sum + c.volume, 0) / priorCandles.length

    if (avgVol === 0) return { ratio: 1, confirmed: false, verdict: 'no prior volume data' }

    const ratio = breakoutVol / avgVol

    if (ratio >= 1.5) {
        return { ratio, confirmed: true, verdict: 'strong volume — real breakout likely' }
    }
    if (ratio >= 1.0) {
        return { ratio, confirmed: true, verdict: 'moderate volume — breakout has some support' }
    }
    if (ratio >= 0.7) {
        return { ratio, confirmed: false, verdict: 'thin volume — breakout suspect, possible trap' }
    }
    return { ratio, confirmed: false, verdict: 'volume rejection — high probability fake breakout' }
}

// ── Helpers ──

/** Simple linear regression slope (least squares). */
function linearSlope(data: number[]): number {
    const n = data.length
    if (n < 2) return 0

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    for (let i = 0; i < n; i++) {
        sumX += i
        sumY += data[i]
        sumXY += i * data[i]
        sumX2 += i * i
    }

    const denom = n * sumX2 - sumX * sumX
    if (denom === 0) return 0
    return (n * sumXY - sumX * sumY) / denom
}

/** Consolidate nearby nodes: merge prices within `threshold` of each other. */
function consolidateNodes(prices: number[], threshold: number): number[] {
    if (prices.length === 0) return []
    const sorted = [...prices].sort((a, b) => a - b)
    const result: number[] = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
        const last = result[result.length - 1]
        if (Math.abs(sorted[i] - last) < threshold) {
            // Average them
            result[result.length - 1] = (last + sorted[i]) / 2
        } else {
            result.push(sorted[i])
        }
    }

    return result
}

function emptyProfile(): VolumeProfile {
    return {
        vpoc: 0,
        valueAreaHigh: 0,
        valueAreaLow: 0,
        hvn: [],
        lvn: [],
        levels: [],
        totalVolume: 0,
    }
}
