import { getSubscribedPairs } from '@/lib/data/stories'
import { getCandles } from '@/lib/oanda/client'
import { callDeepSeek } from '@/lib/ai/clients/deepseek'
import { createServiceClient } from '@/lib/supabase/service'
import { OandaCandle } from '@/lib/types/oanda'

export type Timeframe = 'M' | 'W' | 'D' | 'H4' | 'H3' | 'H1'

export interface IndicatorSettings {
    RSI: { period: number; overbought: number; oversold: number }
    MACD: { fastPeriod: number; slowPeriod: number; signalPeriod: number }
    Stochastic: { kPeriod: number; dPeriod: number; overbought: number; oversold: number }
    'Bollinger Bands': { period: number; stdDev: number }
    EMA: { period: number }
    SMA: { period: number }
    'EMA Crossover': { fastPeriod: number; slowPeriod: number }
    'SMA Crossover': { fastPeriod: number; slowPeriod: number }
    Momentum: { period: number }
    SAR: { afStart: number; afStep: number; afMax: number }
    ADX: { period: number }
    Alligator: { jawPeriod: number; teethPeriod: number; lipsPeriod: number }
    'Awesome Oscillator': { fastPeriod: number; slowPeriod: number }
}

/**
 * Main orchestrator for global indicator optimization.
 * Runs for all subscribed instruments across 5 timeframes.
 */
export async function runGlobalOptimization(userId: string, onProgress?: (msg: string) => void) {
    const subscriptions = await getSubscribedPairs(userId)
    const timeframes: Timeframe[] = ['M', 'W', 'D', 'H4', 'H3', 'H1']
    
    onProgress?.(`Found ${subscriptions.length} instruments to calibrate...`)

    for (const sub of subscriptions) {
        for (const tf of timeframes) {
            onProgress?.(`Calibrating ${sub.pair} on ${tf} timeframe...`)
            try {
                await calibrateForPairAndTimeframe(userId, sub.pair, tf)
            } catch (err) {
                console.error(`Failed to calibrate ${sub.pair} ${tf}:`, err)
            }
        }
    }
    
    onProgress?.(`Global calibration complete!`)
}

/**
 * Individual calibration for a single pair and timeframe.
 */
export async function calibrateForPairAndTimeframe(userId: string, pair: string, timeframe: Timeframe) {
    // 1. Fetch historical data (250 candles should be enough for DeepSeek to see trends/volatility)
    const { data: candles, error } = await getCandles({
        instrument: pair,
        granularity: timeframe,
        count: 250
    })

    if (error || !candles || candles.length === 0) {
        throw new Error(`Could not fetch candles for ${pair} ${timeframe}: ${JSON.stringify(error)}`)
    }

    // 2. Prepare data summary for DeepSeek
    const summary = prepareDataSummary(candles)

    // 3. Prompt DeepSeek for optimized parameters
    const settings = await promptDeepSeekForCalibration(userId, pair, timeframe, summary)

    // 4. Save to database
    await saveCalibration(userId, pair, timeframe, settings)
    
    return settings
}

function prepareDataSummary(candles: OandaCandle[]) {
    const closes = candles.map(c => parseFloat(c.mid.c))
    const highs = candles.map(c => parseFloat(c.mid.h))
    const lows = candles.map(c => parseFloat(c.mid.l))
    
    const lastPrice = closes[closes.length - 1]
    const range = Math.max(...highs) - Math.min(...lows)
    const avgRange = (highs.reduce((a, b) => a + b, 0) - lows.reduce((a, b) => a + b, 0)) / candles.length
    
    // Check for "Choppiness" (range vs displacement)
    const totalDisplacement = Math.abs(closes[closes.length - 1] - closes[0])
    const choppiness = range / (totalDisplacement || 1)

    return {
        lastPrice,
        range,
        avgRange,
        choppiness,
        sampleCount: candles.length,
        recentPriceAction: closes.slice(-20).map(p => p.toFixed(5)) // Provide recent trend
    }
}

async function promptDeepSeekForCalibration(userId: string, pair: string, timeframe: Timeframe, summary: any): Promise<IndicatorSettings> {
    const prompt = `
Act as a professional quantitative trading analyst. 
You are optimizing technical indicator parameters for the instrument ${pair} on the ${timeframe} timeframe.

MARKET CONTEXT:
- Last Price: ${summary.lastPrice}
- Total Range: ${summary.range}
- Avg Candle Range: ${summary.avgRange}
- Choppiness Index (High is range-bound, Low is trending): ${summary.choppiness.toFixed(2)}
- Recent Price Action: ${summary.recentPriceAction.join(', ')}

OBJECTIVE:
Analyze the market characteristics above. If the market is choppy, indicators should be more sensitive or have wider thresholds. If trending, they should be smoother.
Return the OPTIMAL parameters for the following indicators in STRICT JSON format. 

REQUIRED JSON STRUCTURE:
{
  "RSI": { "period": 14, "overbought": 70, "oversold": 30 },
  "MACD": { "fastPeriod": 12, "slowPeriod": 26, "signalPeriod": 9 },
  "Stochastic": { "kPeriod": 14, "dPeriod": 3, "overbought": 80, "oversold": 20 },
  "Bollinger Bands": { "period": 20, "stdDev": 2 },
  "EMA": { "period": 21 },
  "SMA": { "period": 50 },
  "EMA Crossover": { "fastPeriod": 12, "slowPeriod": 26 },
  "SMA Crossover": { "fastPeriod": 20, "slowPeriod": 50 },
  "Momentum": { "period": 10 },
  "SAR": { "afStart": 0.02, "afStep": 0.02, "afMax": 0.20 },
  "ADX": { "period": 14 },
  "Alligator": { "jawPeriod": 13, "teethPeriod": 8, "lipsPeriod": 5 },
  "Awesome Oscillator": { "fastPeriod": 5, "slowPeriod": 34 }
}

Provide ONLY the JSON object. Do not explain your reasoning.
`

    const response = await callDeepSeek(prompt, {
        maxTokens: 1000,
        usage: { feature: 'indicator-calibration', userId }
    })

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
        throw new Error('DeepSeek did not return valid JSON for calibration')
    }

    return JSON.parse(jsonMatch[0]) as IndicatorSettings
}

async function saveCalibration(userId: string, pair: string, timeframe: Timeframe, settings: IndicatorSettings) {
    const supabase = createServiceClient()
    const { error } = await supabase
        .from('indicator_calibrations')
        .upsert({
            user_id: userId,
            pair,
            timeframe,
            settings,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,pair,timeframe' })

    if (error) throw error
}
