import { getCandles, getCurrentPrices } from '@/lib/oanda/client'
import { calculateAllIndicators } from '@/lib/strategy/calculators'
import { assessTrend } from '@/lib/utils/trend-detector'
import { calculateATR } from '@/lib/utils/atr'
import { detectAMDPhase } from './amd-detector'
import { mapLiquidityZones } from './liquidity-mapper'
import type { OandaCandle } from '@/lib/types/oanda'
import type { StoryDataPayload, TimeframeData, PriceLevel } from './types'

const TIMEFRAME_CONFIG: { tf: TimeframeData['timeframe']; granularity: string; count: number }[] = [
    { tf: 'M', granularity: 'M', count: 120 },
    { tf: 'W', granularity: 'W', count: 200 },
    { tf: 'D', granularity: 'D', count: 200 },
    { tf: 'H4', granularity: 'H4', count: 200 },
    { tf: 'H1', granularity: 'H1', count: 300 },
]

// Standard pip locations per pair type
function getPipLocation(pair: string): number {
    const jpyPairs = ['USD/JPY', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'NZD/JPY', 'CAD/JPY', 'CHF/JPY']
    return jpyPairs.includes(pair) ? -2 : -4
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Collect multi-timeframe data for Story analysis.
 * Fetches OANDA candles, calculates indicators, detects patterns + AMD phases.
 * ALSO fetches the user's recent trades for narrative context.
 */
export async function collectStoryData(
    userId: string,
    pair: string,
    client?: SupabaseClient
): Promise<StoryDataPayload> {
    const instrument = pair.replace('/', '_')
    const pipLocation = getPipLocation(pair)
    const supabase = client || await createClient()

    // Fetch current price + trades (with episode linkage) and candles in parallel
    const [{ data: prices }, { data: tradesRaw }] = await Promise.all([
        getCurrentPrices([instrument]),
        supabase
            .from('trades')
            .select('direction, status, entry_price, exit_price, stop_loss, take_profit, closed_at, story_season_number, story_episode_id')
            .eq('user_id', userId)
            .eq('pair', pair)
            .order('created_at', { ascending: false })
            .limit(10) // last 10 activities
    ])

    // Enrich trades with episode numbers for linked trades
    const linkedEpisodeIds = (tradesRaw || [])
        .map(t => t.story_episode_id)
        .filter((id): id is string => id != null)

    let episodeLookup: Record<string, { episode_number: number; title: string }> = {}
    if (linkedEpisodeIds.length > 0) {
        const { data: eps } = await supabase
            .from('story_episodes')
            .select('id, episode_number, title')
            .in('id', linkedEpisodeIds)
        if (eps) {
            episodeLookup = Object.fromEntries(eps.map(e => [e.id, { episode_number: e.episode_number, title: e.title }]))
        }
    }

    const trades = (tradesRaw || []).map(t => {
        const ep = t.story_episode_id ? episodeLookup[t.story_episode_id] : null
        return {
            direction: t.direction,
            status: t.status,
            entry_price: t.entry_price,
            exit_price: t.exit_price,
            stop_loss: t.stop_loss,
            take_profit: t.take_profit,
            closed_at: t.closed_at,
            story_season_number: t.story_season_number,
            episode_number: ep?.episode_number ?? null,
            episode_title: ep?.title ?? null,
        }
    })

    const currentPrice = prices?.[0]
        ? (parseFloat(prices[0].asks[0].price) + parseFloat(prices[0].bids[0].price)) / 2
        : 0

    // Fetch all timeframes in parallel
    const candleResults = await Promise.all(
        TIMEFRAME_CONFIG.map(async ({ tf, granularity, count }) => {
            const { data } = await getCandles({ instrument, granularity, count })
            return { tf, candles: data || [] }
        })
    )

    // Find daily candles for indicator calculations that need them
    const dailyCandles = candleResults.find(r => r.tf === 'D')?.candles || []

    // Calculate indicators + trend for each timeframe
    const timeframes: TimeframeData[] = candleResults.map(({ tf, candles }) => {
        const indicators = calculateAllIndicators(candles, pipLocation, dailyCandles)
        const trend = assessTrend(candles)
        const patterns = detectSimplePatterns(candles)
        const swingHighs = findSwingHighs(candles)
        const swingLows = findSwingLows(candles)

        return { timeframe: tf, candles, indicators, trend, patterns, swingHighs, swingLows }
    })

    // Detect AMD phases per timeframe
    const amdPhases: StoryDataPayload['amdPhases'] = {}
    for (const tfd of timeframes) {
        amdPhases[tfd.timeframe] = detectAMDPhase(tfd.candles, tfd.indicators)
    }

    // Map liquidity zones from all timeframes
    const liquidityZones = timeframes.flatMap(tfd =>
        mapLiquidityZones(tfd.candles, tfd.timeframe)
    )

    // ATR status from daily
    const dailyTFData = timeframes.find(t => t.timeframe === 'D')
    const atr14 = dailyTFData ? calculateATR(dailyTFData.candles, 14, pipLocation) : 0
    const atr50 = dailyTFData ? calculateATR(dailyTFData.candles, 50, pipLocation) : 0
    const ratio = atr50 > 0 ? atr14 / atr50 : 1
    const volatilityStatus = ratio > 1.5 ? 'spike' : ratio > 1.1 ? 'hot' : ratio < 0.7 ? 'cold' : 'normal'

    return {
        pair,
        instrument,
        pipLocation,
        currentPrice,
        timeframes,
        amdPhases,
        liquidityZones,
        volatilityStatus,
        atr14,
        atr50,
        atrRatio: ratio,
        recent_trades: trades,
        collectedAt: new Date().toISOString(),
    }
}

// ── Simple pattern detection from candle structure ──

function detectSimplePatterns(candles: OandaCandle[]): string[] {
    if (candles.length < 3) return []
    const patterns: string[] = []
    const last3 = candles.slice(-3)

    for (let i = 0; i < last3.length; i++) {
        const c = last3[i]
        const o = parseFloat(c.mid.o)
        const h = parseFloat(c.mid.h)
        const l = parseFloat(c.mid.l)
        const cl = parseFloat(c.mid.c)
        const body = Math.abs(cl - o)
        const range = h - l
        if (range === 0) continue

        const bodyRatio = body / range
        const upperWick = h - Math.max(o, cl)
        const lowerWick = Math.min(o, cl) - l

        // Doji
        if (bodyRatio < 0.1) patterns.push('doji')
        // Hammer (bullish)
        if (lowerWick > body * 2 && upperWick < body * 0.5 && cl > o) patterns.push('hammer')
        // Shooting star (bearish)
        if (upperWick > body * 2 && lowerWick < body * 0.5 && cl < o) patterns.push('shooting_star')
        // Marubozu
        if (bodyRatio > 0.85) patterns.push(cl > o ? 'bullish_marubozu' : 'bearish_marubozu')
    }

    // Engulfing (last 2 candles)
    if (candles.length >= 2) {
        const prev = candles[candles.length - 2]
        const curr = candles[candles.length - 1]
        const po = parseFloat(prev.mid.o), pc = parseFloat(prev.mid.c)
        const co = parseFloat(curr.mid.o), cc = parseFloat(curr.mid.c)

        if (pc < po && cc > co && cc > po && co < pc) patterns.push('bullish_engulfing')
        if (pc > po && cc < co && cc < po && co > pc) patterns.push('bearish_engulfing')
    }

    return [...new Set(patterns)]
}

// ── Swing High/Low detection ──

function findSwingHighs(candles: OandaCandle[], lookback: number = 5): PriceLevel[] {
    const levels: PriceLevel[] = []
    for (let i = lookback; i < candles.length - lookback; i++) {
        const high = parseFloat(candles[i].mid.h)
        let isSwing = true
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j === i) continue
            if (parseFloat(candles[j].mid.h) >= high) { isSwing = false; break }
        }
        if (isSwing) {
            levels.push({ price: high, time: candles[i].time, strength: 1 })
        }
    }
    return consolidateLevels(levels)
}

function findSwingLows(candles: OandaCandle[], lookback: number = 5): PriceLevel[] {
    const levels: PriceLevel[] = []
    for (let i = lookback; i < candles.length - lookback; i++) {
        const low = parseFloat(candles[i].mid.l)
        let isSwing = true
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j === i) continue
            if (parseFloat(candles[j].mid.l) <= low) { isSwing = false; break }
        }
        if (isSwing) {
            levels.push({ price: low, time: candles[i].time, strength: 1 })
        }
    }
    return consolidateLevels(levels)
}

/** Merge nearby levels within 0.1% of each other */
function consolidateLevels(levels: PriceLevel[]): PriceLevel[] {
    if (levels.length === 0) return []
    const sorted = [...levels].sort((a, b) => a.price - b.price)
    const consolidated: PriceLevel[] = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
        const last = consolidated[consolidated.length - 1]
        const threshold = last.price * 0.001
        if (Math.abs(sorted[i].price - last.price) < threshold) {
            last.strength++
            last.price = (last.price + sorted[i].price) / 2 // average
        } else {
            consolidated.push(sorted[i])
        }
    }
    return consolidated
}
