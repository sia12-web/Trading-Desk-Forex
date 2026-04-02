import type { OandaCandle } from '@/lib/types/oanda'
import type { CalculatedIndicators } from '@/lib/strategy/types'
import { confirmBreakoutVolume } from '@/lib/utils/volume-profile'

/**
 * Bill Williams Fractal Strategy Detector
 * Pure algorithmic analysis — no AI cost. Follows the same pattern as amd-detector.ts.
 *
 * Evaluates the complete BW system: Alligator state, Fractals, AO, AC
 * and produces a confluence score (0-100) with human-readable signals.
 */

export interface FractalSetup {
    recentBullishFractals: Array<{ price: number; time: string; aboveTeeth: boolean }>
    recentBearishFractals: Array<{ price: number; time: string; belowTeeth: boolean }>
    alligatorState: 'sleeping' | 'awakening' | 'eating' | 'sated'
    alligatorDirection: 'bullish' | 'bearish' | 'neutral'
    aoStatus: { value: number; trend: 'rising' | 'falling' | 'flat'; signal: string }
    acStatus: { value: number; consecutiveGreen: number; consecutiveRed: number }
    setupScore: number
    setupDirection: 'buy' | 'sell' | 'none'
    signals: string[]
    // Volume confirmation for fractal breakouts
    volumeConfirmation: {
        breakoutConfirmed: boolean     // true = volume supports the breakout
        volumeRatio: number            // breakout bar volume vs avg (>1.0 = above avg)
        verdict: string                // human-readable assessment
        trapWarning: boolean           // true = thin volume breakout, likely fake
    }
}

export function detectFractalSetup(
    candles: OandaCandle[],
    indicators: CalculatedIndicators
): FractalSetup {
    if (candles.length < 20) {
        return emptySetup()
    }

    const signals: string[] = []
    const lastIdx = candles.length - 1
    const currentPrice = parseFloat(candles[lastIdx].mid.c)

    // ── Alligator state & direction ──
    const alligatorState = indicators.alligator.state[lastIdx] || 'sleeping'
    const alligatorDirection = evaluateAlligatorDirection(indicators, lastIdx)

    // ── Recent fractals (last 30 bars), annotated with teeth position ──
    const teethLast = indicators.alligator.teeth[lastIdx]
    const lookbackStart = Math.max(0, indicators.fractals.length - 20)
    const recentFractals = indicators.fractals.slice(lookbackStart)

    const recentBullishFractals = recentFractals
        .filter(f => f.type === 'bullish')
        .slice(-5)
        .map(f => ({
            price: f.price,
            time: f.time || '',
            aboveTeeth: !isNaN(teethLast) && f.price > teethLast,
        }))

    const recentBearishFractals = recentFractals
        .filter(f => f.type === 'bearish')
        .slice(-5)
        .map(f => ({
            price: f.price,
            time: f.time || '',
            belowTeeth: !isNaN(teethLast) && f.price < teethLast,
        }))

    // ── AO status ──
    const aoStatus = evaluateAOSignals(indicators.awesomeOscillator)

    // ── AC status ──
    const acStatus = evaluateACSignals(indicators.acceleratorOscillator)

    // ── Score the setup ──
    let score = 0
    let direction: 'buy' | 'sell' | 'none' = 'none'

    // 1. Alligator awake + ordered (+25)
    if (alligatorState === 'eating' || alligatorState === 'awakening') {
        if (alligatorDirection === 'bullish') {
            score += 25
            signals.push(`Alligator ${alligatorState} (bullish order: Lips > Teeth > Jaw)`)
            direction = 'buy'
        } else if (alligatorDirection === 'bearish') {
            score += 25
            signals.push(`Alligator ${alligatorState} (bearish order: Lips < Teeth < Jaw)`)
            direction = 'sell'
        }
    } else if (alligatorState === 'sleeping') {
        signals.push('Alligator sleeping — no trend, wait for awakening')
    }

    // 2. Price beyond all Alligator lines (+15)
    const jaw = indicators.alligator.jaw[lastIdx]
    const teeth = indicators.alligator.teeth[lastIdx]
    const lips = indicators.alligator.lips[lastIdx]
    if (!isNaN(jaw) && !isNaN(teeth) && !isNaN(lips)) {
        if (direction === 'buy' && currentPrice > jaw && currentPrice > teeth && currentPrice > lips) {
            score += 15
            signals.push('Price above all Alligator lines')
        } else if (direction === 'sell' && currentPrice < jaw && currentPrice < teeth && currentPrice < lips) {
            score += 15
            signals.push('Price below all Alligator lines')
        }
    }

    // 3. Valid fractal beyond teeth (+20)
    if (direction === 'buy') {
        const validBullish = recentBullishFractals.filter(f => f.aboveTeeth)
        if (validBullish.length > 0) {
            score += 20
            signals.push(`Valid bullish fractal at ${validBullish[validBullish.length - 1].price.toFixed(5)} (above Teeth)`)
        }
    } else if (direction === 'sell') {
        const validBearish = recentBearishFractals.filter(f => f.belowTeeth)
        if (validBearish.length > 0) {
            score += 20
            signals.push(`Valid bearish fractal at ${validBearish[validBearish.length - 1].price.toFixed(5)} (below Teeth)`)
        }
    }

    // 4. AO confirming (+15, +5 saucer bonus)
    if (direction === 'buy' && aoStatus.value > 0) {
        score += 15
        signals.push(`AO positive (${aoStatus.value.toFixed(6)}) — ${aoStatus.signal}`)
        if (aoStatus.signal.includes('saucer')) score += 5
    } else if (direction === 'sell' && aoStatus.value < 0) {
        score += 15
        signals.push(`AO negative (${aoStatus.value.toFixed(6)}) — ${aoStatus.signal}`)
        if (aoStatus.signal.includes('saucer')) score += 5
    }

    // 5. AC confirming: 2+ consecutive green (buy) or red (sell) (+15)
    if (direction === 'buy' && acStatus.consecutiveGreen >= 2) {
        score += 15
        signals.push(`AC: ${acStatus.consecutiveGreen} consecutive green bars`)
    } else if (direction === 'sell' && acStatus.consecutiveRed >= 2) {
        score += 15
        signals.push(`AC: ${acStatus.consecutiveRed} consecutive red bars`)
    }

    // 6. Volume above average (+5)
    const vol = indicators.volume[lastIdx]
    const volSma = indicators.volumeSma[lastIdx]
    if (vol && volSma && vol > volSma * 1.2) {
        score += 5
        signals.push('Volume above average — confirmation')
    }

    // 7. Volume confirmation for the most recent fractal breakout
    let volumeConfirmation = { breakoutConfirmed: false, volumeRatio: 1, verdict: 'no fractal to confirm', trapWarning: false }
    const targetFractals = direction === 'buy' ? recentBullishFractals : direction === 'sell' ? recentBearishFractals : []
    if (targetFractals.length > 0 && candles.length > 10) {
        // Find the candle index of the most recent relevant fractal
        const latestFractal = targetFractals[targetFractals.length - 1]
        const fractalIdx = indicators.fractals.findIndex(
            f => f.price === latestFractal.price && f.time === latestFractal.time
        )
        if (fractalIdx >= 0) {
            // Check the bar AFTER the fractal (the breakout bar) or the last bar
            const breakoutIdx = Math.min(indicators.fractals[fractalIdx].index + 3, lastIdx)
            const vc = confirmBreakoutVolume(candles, breakoutIdx)
            volumeConfirmation = {
                breakoutConfirmed: vc.confirmed,
                volumeRatio: vc.ratio,
                verdict: vc.verdict,
                trapWarning: vc.ratio < 0.7,
            }

            if (vc.confirmed) {
                score += 5
                signals.push(`Fractal breakout volume confirmed (${vc.ratio.toFixed(1)}x avg) — ${vc.verdict}`)
            } else if (vc.ratio < 0.7) {
                score = Math.max(0, score - 10)
                signals.push(`⚠️ VOLUME TRAP WARNING: Fractal breakout on thin volume (${vc.ratio.toFixed(1)}x avg) — likely fake breakout`)
            } else {
                signals.push(`Fractal breakout volume weak (${vc.ratio.toFixed(1)}x avg) — ${vc.verdict}`)
            }
        }
    }

    // If no direction could be established, score stays 0
    if (direction === 'none') score = 0

    return {
        recentBullishFractals,
        recentBearishFractals,
        alligatorState,
        alligatorDirection,
        aoStatus,
        acStatus,
        setupScore: Math.min(100, score),
        setupDirection: direction,
        signals,
        volumeConfirmation,
    }
}

function evaluateAlligatorDirection(
    indicators: CalculatedIndicators,
    idx: number
): 'bullish' | 'bearish' | 'neutral' {
    const jaw = indicators.alligator.jaw[idx]
    const teeth = indicators.alligator.teeth[idx]
    const lips = indicators.alligator.lips[idx]
    if (isNaN(jaw) || isNaN(teeth) || isNaN(lips)) return 'neutral'
    if (lips > teeth && teeth > jaw) return 'bullish'
    if (lips < teeth && teeth < jaw) return 'bearish'
    return 'neutral'
}

function evaluateAOSignals(ao: number[]): FractalSetup['aoStatus'] {
    const valid = ao.filter(v => !isNaN(v))
    if (valid.length < 3) return { value: 0, trend: 'flat', signal: 'insufficient data' }

    const current = valid[valid.length - 1]
    const prev = valid[valid.length - 2]
    const prev2 = valid[valid.length - 3]

    // Trend
    const trend = current > prev ? 'rising' : current < prev ? 'falling' : 'flat'

    // Signal detection
    let signal = 'neutral'

    // Zero-line cross
    if (prev <= 0 && current > 0) signal = 'bullish zero-line cross'
    else if (prev >= 0 && current < 0) signal = 'bearish zero-line cross'
    // Saucer pattern (momentum resumption): 3 bars, middle closer to zero, third expanding
    else if (current > 0 && prev > 0 && prev2 > 0) {
        if (prev < prev2 && current > prev) signal = 'bullish saucer (momentum resuming)'
    } else if (current < 0 && prev < 0 && prev2 < 0) {
        if (prev > prev2 && current < prev) signal = 'bearish saucer (momentum resuming)'
    }

    return { value: current, trend, signal }
}

function evaluateACSignals(ac: number[]): FractalSetup['acStatus'] {
    const valid = ac.filter(v => !isNaN(v))
    if (valid.length < 2) return { value: 0, consecutiveGreen: 0, consecutiveRed: 0 }

    const current = valid[valid.length - 1]

    // Count consecutive green (rising) bars
    let green = 0
    for (let i = valid.length - 1; i > 0; i--) {
        if (valid[i] > valid[i - 1]) green++
        else break
    }

    // Count consecutive red (falling) bars
    let red = 0
    for (let i = valid.length - 1; i > 0; i--) {
        if (valid[i] < valid[i - 1]) red++
        else break
    }

    return { value: current, consecutiveGreen: green, consecutiveRed: red }
}

function emptySetup(): FractalSetup {
    return {
        recentBullishFractals: [],
        recentBearishFractals: [],
        alligatorState: 'sleeping',
        alligatorDirection: 'neutral',
        aoStatus: { value: 0, trend: 'flat', signal: 'insufficient data' },
        acStatus: { value: 0, consecutiveGreen: 0, consecutiveRed: 0 },
        setupScore: 0,
        setupDirection: 'none',
        signals: ['Insufficient data for fractal analysis'],
        volumeConfirmation: { breakoutConfirmed: false, volumeRatio: 1, verdict: 'insufficient data', trapWarning: false },
    }
}
