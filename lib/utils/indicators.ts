/**
 * Technical Indicator Utilities
 * Implementation for standard manual trading tools.
 */

export function calculateSMA(data: number[], period: number): number[] {
    const sma: number[] = []
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(NaN)
            continue
        }
        let sum = 0
        for (let j = 0; j < period; j++) {
            sum += data[i - j]
        }
        sma.push(sum / period)
    }
    return sma
}

export function calculateEMA(data: number[], period: number): number[] {
    const ema: number[] = []
    const k = 2 / (period + 1)
    let prevEMA = NaN

    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            ema.push(NaN)
            continue
        }
        if (i === period - 1) {
            let sum = 0
            for (let j = 0; j < period; j++) {
                sum += data[i - j]
            }
            prevEMA = sum / period
            ema.push(prevEMA)
            continue
        }
        const currentEMA = (data[i] - prevEMA) * k + prevEMA
        ema.push(currentEMA)
        prevEMA = currentEMA
    }
    return ema
}

export function calculateRSI(data: number[], period: number): number[] {
    const rsi: number[] = []
    let avgGain = 0
    let avgLoss = 0

    for (let i = 0; i < data.length; i++) {
        if (i === 0) {
            rsi.push(NaN)
            continue
        }

        const diff = data[i] - data[i - 1]
        const gain = Math.max(0, diff)
        const loss = Math.max(0, -diff)

        if (i < period) {
            avgGain += gain
            avgLoss += loss
            rsi.push(NaN)
            if (i === period - 1) {
                avgGain /= period
                avgLoss /= period
            }
            continue
        }

        avgGain = (avgGain * (period - 1) + gain) / period
        avgLoss = (avgLoss * (period - 1) + loss) / period

        if (avgLoss === 0) {
            rsi.push(100)
        } else {
            const rs = avgGain / avgLoss
            rsi.push(100 - 100 / (1 + rs))
        }
    }
    return rsi
}

/**
 * Momentum Indicator - Rate of change over N periods
 * Returns the difference between current price and price N periods ago
 */
export function calculateMomentum(data: number[], period: number): number[] {
    const momentum: number[] = []
    for (let i = 0; i < data.length; i++) {
        if (i < period) {
            momentum.push(NaN)
        } else {
            momentum.push(data[i] - data[i - period])
        }
    }
    return momentum
}

export function calculateMACD(data: number[], fast: number = 12, slow: number = 26, signal: number = 9) {
    const emaFast = calculateEMA(data, fast)
    const emaSlow = calculateEMA(data, slow)
    const macdLine: number[] = []
    
    for (let i = 0; i < data.length; i++) {
        if (isNaN(emaFast[i]) || isNaN(emaSlow[i])) {
            macdLine.push(NaN)
        } else {
            macdLine.push(emaFast[i] - emaSlow[i])
        }
    }

    const signalLine = calculateEMA(macdLine.filter(v => !isNaN(v)), signal)
    const paddedSignal: number[] = new Array(macdLine.length - signalLine.length).fill(NaN).concat(signalLine)
    
    const histogram: number[] = macdLine.map((m, i) => {
        if (isNaN(m) || isNaN(paddedSignal[i])) return NaN
        return m - paddedSignal[i]
    })

    return { macdLine: macdLine, signalLine: paddedSignal, histogram }
}

export function calculateATR(highs: number[], lows: number[], closes: number[], period: number): number[] {
    if (closes.length < 2) return closes.map(() => 0)
    const tr: number[] = [0]
    for (let i = 1; i < closes.length; i++) {
        const h = highs[i], l = lows[i], pc = closes[i - 1]
        tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
    }
    return calculateEMA(tr, period)
}

export function calculateStochastic(highs: number[], lows: number[], closes: number[], kPeriod: number, dPeriod: number) {
    const kLine: number[] = []
    for (let i = 0; i < closes.length; i++) {
        if (i < kPeriod - 1) {
            kLine.push(NaN)
            continue
        }
        const hSlice = highs.slice(i - kPeriod + 1, i + 1)
        const lSlice = lows.slice(i - kPeriod + 1, i + 1)
        const highest = Math.max(...hSlice)
        const lowest = Math.min(...lSlice)
        kLine.push(((closes[i] - lowest) / (highest - lowest)) * 100)
    }
    const filteredK = kLine.filter(v => !isNaN(v))
    const dLine = calculateSMA(filteredK, dPeriod)
    const padding = new Array(closes.length - dLine.length).fill(NaN)
    return { kLine, dLine: [...padding, ...dLine] }
}

export function calculateBollingerBands(data: number[], period: number, stdDev: number) {
    const middle = calculateSMA(data, period)
    const upper: number[] = []
    const lower: number[] = []
    for (let i = 0; i < data.length; i++) {
        if (isNaN(middle[i]) || i < period - 1) {
            upper.push(NaN); lower.push(NaN)
            continue
        }
        const slice = data.slice(i - period + 1, i + 1)
        const avg = middle[i]
        const squareDiffs = slice.map(v => Math.pow(v - avg, 2))
        const variance = squareDiffs.reduce((a, b) => a + b, 0) / period
        const sd = Math.sqrt(variance)
        upper.push(avg + (sd * stdDev))
        lower.push(avg - (sd * stdDev))
    }
    return { upper, middle, lower }
}

export function calculateParabolicSAR(highs: number[], lows: number[], afStart: number, afStep: number, afMax: number) {
    if (highs.length < 2) return { sar: highs.map(() => NaN), trend: highs.map(() => 'neutral' as const) }
    const sar: number[] = [lows[0]]
    const trend: ('long' | 'short')[] = ['long']
    let ep = highs[0]
    let af = afStart
    for (let i = 1; i < highs.length; i++) {
        let nextSar = sar[i - 1] + af * (ep - sar[i - 1])
        if (trend[i - 1] === 'long') {
            if (lows[i] < nextSar) {
                trend.push('short'); sar.push(ep); af = afStart; ep = lows[i]
            } else {
                trend.push('long'); if (highs[i] > ep) { ep = highs[i]; af = Math.min(af + afStep, afMax) }
                sar.push(Math.min(nextSar, lows[i - 1], i > 1 ? lows[i - 2] : lows[i - 1]))
            }
        } else {
            if (highs[i] > nextSar) {
                trend.push('long'); sar.push(ep); af = afStart; ep = highs[i]
            } else {
                trend.push('short'); if (lows[i] < ep) { ep = lows[i]; af = Math.min(af + afStep, afMax) }
                sar.push(Math.max(nextSar, highs[i - 1], i > 1 ? highs[i - 2] : highs[i - 1]))
            }
        }
    }
    return { sar, trend }
}

export function calculateADX(highs: number[], lows: number[], closes: number[], period: number) {
    const tr: number[] = [NaN]
    const plusDM: number[] = [NaN]
    const minusDM: number[] = [NaN]

    for (let i = 1; i < closes.length; i++) {
        const h = highs[i], l = lows[i]
        const prevH = highs[i - 1], prevL = lows[i - 1], prevC = closes[i - 1]

        tr.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)))

        const moveUp = h - prevH
        const moveDown = prevL - l

        if (moveUp > moveDown && moveUp > 0) plusDM.push(moveUp)
        else plusDM.push(0)

        if (moveDown > moveUp && moveDown > 0) minusDM.push(moveDown)
        else minusDM.push(0)
    }

    const smoothTR = calculateEMA(tr.filter(v => !isNaN(v)), period)
    const smoothPlusDM = calculateEMA(plusDM.filter(v => !isNaN(v)), period)
    const smoothMinusDM = calculateEMA(minusDM.filter(v => !isNaN(v)), period)

    const diPlus: number[] = []
    const diMinus: number[] = []
    const dx: number[] = []

    const offset = tr.length - smoothTR.length
    for (let i = 0; i < smoothTR.length; i++) {
        const p = (smoothPlusDM[i] / smoothTR[i]) * 100
        const m = (smoothMinusDM[i] / smoothTR[i]) * 100
        diPlus.push(p)
        diMinus.push(m)
        dx.push((Math.abs(p - m) / (p + m)) * 100)
    }

    const adxValues = calculateEMA(dx.filter(v => !isNaN(v)), period)
    const fullADX = new Array(closes.length - adxValues.length).fill(NaN).concat(adxValues)

    return { adx: fullADX, diPlus, diMinus }
}

export interface PivotPointLevels {
    pp: number;
    r1: number;
    r2: number;
    r3: number;
    s1: number;
    s2: number;
    s3: number;
    m1: number;
    m2: number;
    m3: number;
    m4: number;
}

export function calculatePivotPoints(prevHigh: number, prevLow: number, prevClose: number): PivotPointLevels {
    const pp = (prevHigh + prevLow + prevClose) / 3;
    const r1 = (2 * pp) - prevLow;
    const r2 = pp + (prevHigh - prevLow);
    const r3 = prevHigh + 2 * (pp - prevLow);
    const s1 = (2 * pp) - prevHigh;
    const s2 = pp - (prevHigh - prevLow);
    const s3 = prevLow - 2 * (prevHigh - pp);

    return {
        pp, r1, r2, r3, s1, s2, s3,
        m1: (s1 + pp) / 2,
        m2: (pp + r1) / 2,
        m3: (r1 + r2) / 2,
        m4: (s1 + s2) / 2
    };
}

// ── Bill Williams Indicators ──

/**
 * Smoothed Moving Average (SMMA) — foundation for Alligator.
 * NOT the same as EMA. Uses multiplier 1/period (EMA uses 2/(period+1)).
 * First value seeded with SMA.
 */
export function calculateSMMA(data: number[], period: number): number[] {
    const smma: number[] = []
    let prev = NaN

    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            smma.push(NaN)
            continue
        }
        if (i === period - 1) {
            let sum = 0
            for (let j = 0; j < period; j++) sum += data[i - j]
            prev = sum / period
            smma.push(prev)
            continue
        }
        prev = (prev * (period - 1) + data[i]) / period
        smma.push(prev)
    }
    return smma
}

/** Shift array forward: shifted[i] = raw[i - shift]. Earlier indices become NaN. */
function applyForwardShift(data: number[], shift: number): number[] {
    const result: number[] = []
    for (let i = 0; i < data.length; i++) {
        const src = i - shift
        result.push(src < 0 || isNaN(data[src]) ? NaN : data[src])
    }
    return result
}

export type AlligatorState = 'sleeping' | 'awakening' | 'eating' | 'sated'

export interface AlligatorResult {
    jaw: number[]
    teeth: number[]
    lips: number[]
    state: AlligatorState[]
}

/**
 * Bill Williams Alligator — 3 SMMA lines on median price with forward shifts.
 * Jaw (Blue): SMMA(13) shifted 8 forward
 * Teeth (Red): SMMA(8) shifted 5 forward
 * Lips (Green): SMMA(5) shifted 3 forward
 */
export function calculateAlligator(
    highs: number[],
    lows: number[],
    jawPeriod = 13, jawShift = 8,
    teethPeriod = 8, teethShift = 5,
    lipsPeriod = 5, lipsShift = 3
): AlligatorResult {
    const median = highs.map((h, i) => (h + lows[i]) / 2)

    const jaw = applyForwardShift(calculateSMMA(median, jawPeriod), jawShift)
    const teeth = applyForwardShift(calculateSMMA(median, teethPeriod), teethShift)
    const lips = applyForwardShift(calculateSMMA(median, lipsPeriod), lipsShift)

    const state: AlligatorState[] = []
    for (let i = 0; i < highs.length; i++) {
        if (isNaN(jaw[i]) || isNaN(teeth[i]) || isNaN(lips[i])) {
            state.push('sleeping')
            continue
        }
        const spread = Math.abs(lips[i] - jaw[i])
        const avgPrice = (highs[i] + lows[i]) / 2
        const spreadPct = avgPrice > 0 ? (spread / avgPrice) * 100 : 0

        const bullOrder = lips[i] > teeth[i] && teeth[i] > jaw[i]
        const bearOrder = lips[i] < teeth[i] && teeth[i] < jaw[i]
        const ordered = bullOrder || bearOrder

        const prevSpread = i > 0 && !isNaN(lips[i - 1]) && !isNaN(jaw[i - 1])
            ? Math.abs(lips[i - 1] - jaw[i - 1]) : spread
        const converging = spread < prevSpread * 0.95

        if (!ordered && spreadPct < 0.05) {
            state.push('sleeping')
        } else if (ordered && !converging && spreadPct > 0.1) {
            state.push('eating')
        } else if (ordered && converging) {
            state.push('sated')
        } else {
            state.push('awakening')
        }
    }

    return { jaw, teeth, lips, state }
}

/**
 * Awesome Oscillator — SMA(fast) minus SMA(slow) of median price.
 * Default: 5/34. Uses SMA (not EMA).
 */
export function calculateAwesomeOscillator(
    highs: number[], lows: number[],
    fastPeriod = 5, slowPeriod = 34
): number[] {
    const median = highs.map((h, i) => (h + lows[i]) / 2)
    const fast = calculateSMA(median, fastPeriod)
    const slow = calculateSMA(median, slowPeriod)
    return fast.map((f, i) => isNaN(f) || isNaN(slow[i]) ? NaN : f - slow[i])
}

/**
 * Accelerator Oscillator — AO minus SMA(5) of AO.
 * Measures rate of change of momentum.
 */
export function calculateAcceleratorOscillator(
    highs: number[], lows: number[],
    aoPeriod = 5
): number[] {
    const ao = calculateAwesomeOscillator(highs, lows)
    const aoValid = ao.filter(v => !isNaN(v))
    const aoSma = calculateSMA(aoValid, aoPeriod)
    const padded = new Array(ao.length - aoSma.length).fill(NaN).concat(aoSma)
    return ao.map((v, i) => isNaN(v) || isNaN(padded[i]) ? NaN : v - padded[i])
}

export interface FractalPoint {
    index: number
    price: number
    type: 'bullish' | 'bearish'
    time?: string
}

/**
 * Bill Williams Fractals — 5-bar pattern detection.
 * Bullish fractal: middle bar has the LOWEST low (potential reversal up).
 * Bearish fractal: middle bar has the HIGHEST high (potential reversal down).
 */
export function calculateFractals(
    highs: number[], lows: number[], times?: string[]
): FractalPoint[] {
    const fractals: FractalPoint[] = []
    for (let i = 2; i < highs.length - 2; i++) {
        // Bearish fractal — highest high
        if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] &&
            highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
            fractals.push({ index: i, price: highs[i], type: 'bearish', time: times?.[i] })
        }
        // Bullish fractal — lowest low
        if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] &&
            lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
            fractals.push({ index: i, price: lows[i], type: 'bullish', time: times?.[i] })
        }
    }
    return fractals
}

export interface GatorResult {
    upper: number[]   // |Jaw - Teeth| (positive)
    lower: number[]   // -|Teeth - Lips| (negative, plotted below zero)
}

/**
 * Gator Oscillator — shows Alligator convergence/divergence.
 */
export function calculateGatorOscillator(highs: number[], lows: number[]): GatorResult {
    const { jaw, teeth, lips } = calculateAlligator(highs, lows)
    const upper = jaw.map((j, i) => isNaN(j) || isNaN(teeth[i]) ? NaN : Math.abs(j - teeth[i]))
    const lower = teeth.map((t, i) => isNaN(t) || isNaN(lips[i]) ? NaN : -Math.abs(t - lips[i]))
    return { upper, lower }
}
