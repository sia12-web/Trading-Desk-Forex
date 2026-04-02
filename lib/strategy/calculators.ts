import { OandaCandle } from "@/lib/types/oanda"
import { CalculatedIndicators, PivotPointLevels } from "./types"
import {
    calculateEMA,
    calculateSMA,
    calculateRSI,
    calculateMACD,
    calculateATR,
    calculateADX,
    calculateStochastic,
    calculateBollingerBands,
    calculateParabolicSAR,
    calculatePivotPoints,
    calculateAlligator,
    calculateAwesomeOscillator,
    calculateAcceleratorOscillator,
    calculateFractals,
    calculateGatorOscillator,
} from "@/lib/utils/indicators"
import { buildVolumeProfile, calculateVWAP, detectVolumeExhaustion } from "@/lib/utils/volume-profile"

export function calculateAllIndicators(
    candles: OandaCandle[],
    pipLocation: number,
    dailyCandles?: OandaCandle[],
    optimizedParams?: Record<string, Record<string, number>> | null
): CalculatedIndicators {
    const closes = candles.map(c => parseFloat(c.mid.c))
    const highs = candles.map(c => parseFloat(c.mid.h))
    const lows = candles.map(c => parseFloat(c.mid.l))
    const volumes = candles.map(c => c.volume)

    // Extract optimized params or use defaults
    const rsiPeriod = optimizedParams?.RSI?.period ?? 14
    const macdFast = optimizedParams?.MACD?.fastPeriod ?? 12
    const macdSlow = optimizedParams?.MACD?.slowPeriod ?? 26
    const macdSignal = optimizedParams?.MACD?.signalPeriod ?? 9
    const adxPeriod = optimizedParams?.ADX?.period ?? 14
    const stochK = optimizedParams?.Stochastic?.kPeriod ?? 14
    const stochD = optimizedParams?.Stochastic?.dPeriod ?? 3
    const bbPeriod = optimizedParams?.['Bollinger Bands']?.period ?? 20
    const bbStdDev = optimizedParams?.['Bollinger Bands']?.stdDev ?? 2
    const sarStart = optimizedParams?.SAR?.afStart ?? 0.02
    const sarStep = optimizedParams?.SAR?.afStep ?? 0.02
    const sarMax = optimizedParams?.SAR?.afMax ?? 0.20
    const emaFast = optimizedParams?.['EMA Crossover']?.fastPeriod ?? 12
    const emaSlow = optimizedParams?.['EMA Crossover']?.slowPeriod ?? 26
    const smaFast = optimizedParams?.['SMA Crossover']?.fastPeriod ?? 20
    const smaSlow = optimizedParams?.['SMA Crossover']?.slowPeriod ?? 50

    // Bill Williams params
    const alligatorJawPeriod = optimizedParams?.Alligator?.jawPeriod ?? 13
    const alligatorTeethPeriod = optimizedParams?.Alligator?.teethPeriod ?? 8
    const alligatorLipsPeriod = optimizedParams?.Alligator?.lipsPeriod ?? 5
    const aoFastPeriod = optimizedParams?.['Awesome Oscillator']?.fastPeriod ?? 5
    const aoSlowPeriod = optimizedParams?.['Awesome Oscillator']?.slowPeriod ?? 34

    // Pivot points from daily candles if provided
    let pivotPoints: PivotPointLevels
    if (dailyCandles && dailyCandles.length >= 2) {
        const prevDay = dailyCandles[dailyCandles.length - 2]
        pivotPoints = calculatePivotPoints(
            parseFloat(prevDay.mid.h),
            parseFloat(prevDay.mid.l),
            parseFloat(prevDay.mid.c)
        )
    } else {
        pivotPoints = calculatePivotPoints(0, 0, 0)
    }

    const macdResult = calculateMACD(closes, macdFast, macdSlow, macdSignal)
    const adxResult = calculateADX(highs, lows, closes, adxPeriod)
    const stochResult = calculateStochastic(highs, lows, closes, stochK, stochD)
    const bbResult = calculateBollingerBands(closes, bbPeriod, bbStdDev)
    const sarResult = calculateParabolicSAR(highs, lows, sarStart, sarStep, sarMax)

    // Bill Williams indicators
    const alligatorResult = calculateAlligator(highs, lows, alligatorJawPeriod, 8, alligatorTeethPeriod, 5, alligatorLipsPeriod, 3)
    const aoResult = calculateAwesomeOscillator(highs, lows, aoFastPeriod, aoSlowPeriod)
    const acResult = calculateAcceleratorOscillator(highs, lows)
    const fractalResult = calculateFractals(highs, lows, candles.map(c => c.time))
    const gatorResult = calculateGatorOscillator(highs, lows)

    // Build EMA object with standard periods + optimized periods
    const emaObj: Record<number, number[]> = {
        8: calculateEMA(closes, 8),
        21: calculateEMA(closes, 21),
        50: calculateEMA(closes, 50),
        100: calculateEMA(closes, 100),
        200: calculateEMA(closes, 200)
    }
    // Add optimized EMA periods if they're different from standard ones
    if (![8, 21, 50, 100, 200].includes(emaFast)) {
        emaObj[emaFast] = calculateEMA(closes, emaFast)
    }
    if (![8, 21, 50, 100, 200].includes(emaSlow)) {
        emaObj[emaSlow] = calculateEMA(closes, emaSlow)
    }

    // Build SMA object with standard periods + optimized periods
    const smaObj: Record<number, number[]> = {
        20: calculateSMA(closes, 20),
        50: calculateSMA(closes, 50),
        200: calculateSMA(closes, 200)
    }
    // Add optimized SMA periods if they're different from standard ones
    if (![20, 50, 200].includes(smaFast)) {
        smaObj[smaFast] = calculateSMA(closes, smaFast)
    }
    if (![20, 50, 200].includes(smaSlow)) {
        smaObj[smaSlow] = calculateSMA(closes, smaSlow)
    }

    // Compute BB Width: (upper - lower) / middle * 100
    const bbWidth = bbResult.upper.map((u: number, i: number) => {
        const m = bbResult.middle[i]
        const l = bbResult.lower[i]
        if (!m || m === 0 || isNaN(u) || isNaN(l) || isNaN(m)) return NaN
        return ((u - l) / m) * 100
    })

    // Volume Flow Analysis
    const volumeProfile = buildVolumeProfile(candles)
    const vwap = calculateVWAP(candles)
    const exhaustion = detectVolumeExhaustion(candles)

    return {
        ema: emaObj,
        sma: smaObj,
        rsi: calculateRSI(closes, rsiPeriod),
        macd: {
            line: macdResult.macdLine,
            signal: macdResult.signalLine,
            histogram: macdResult.histogram
        },
        stochastic: { k: stochResult.kLine, d: stochResult.dLine },
        bollingerBands: { upper: bbResult.upper, middle: bbResult.middle, lower: bbResult.lower },
        bbWidth,
        atr: calculateATR(highs, lows, closes, 14),
        pivotPoints,
        parabolicSar: { sar: sarResult.sar, direction: sarResult.trend },
        adx: adxResult.adx,
        volume: volumes,
        volumeSma: calculateSMA(volumes, 20),
        // Volume Flow Analysis
        volumeFlow: {
            volumeProfile: {
                vpoc: volumeProfile.vpoc,
                valueAreaHigh: volumeProfile.valueAreaHigh,
                valueAreaLow: volumeProfile.valueAreaLow,
                hvn: volumeProfile.hvn,
                lvn: volumeProfile.lvn,
                totalVolume: volumeProfile.totalVolume,
            },
            vwap,
            exhaustion,
        },
        // Bill Williams
        alligator: {
            jaw: alligatorResult.jaw,
            teeth: alligatorResult.teeth,
            lips: alligatorResult.lips,
            state: alligatorResult.state,
        },
        awesomeOscillator: aoResult,
        acceleratorOscillator: acResult,
        fractals: fractalResult,
        gatorOscillator: gatorResult,
    }
}
