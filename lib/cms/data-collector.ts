import { getCandles } from '@/lib/oanda/client'
import { isTimeInSession } from '@/lib/utils/market-sessions'
import { displayToOandaPair } from '@/lib/utils/forex'
import type { OandaCandle } from '@/lib/types/oanda'
import type {
    CMSDataPayload,
    DailyRelationship,
    WeeklyRelationship,
    SessionAnnotatedH1,
    SessionStats,
    VolatilityProfile,
    CrossMarketCorrelation,
} from './types'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function getPipMultiplier(pair: string): number {
    return pair.toUpperCase().includes('JPY') ? 100 : 10000
}

function candleMid(c: OandaCandle) {
    return {
        o: parseFloat(c.mid.o),
        h: parseFloat(c.mid.h),
        l: parseFloat(c.mid.l),
        c: parseFloat(c.mid.c),
    }
}

function direction(open: number, close: number): 'bullish' | 'bearish' | 'doji' {
    const diff = Math.abs(close - open)
    const range = Math.max(Math.abs(close - open), 0.00001)
    if (diff / range < 0.1) return 'doji'
    return close > open ? 'bullish' : 'bearish'
}

// ── Phase 0: Data Collection ──

export async function collectCMSData(pair: string): Promise<CMSDataPayload> {
    const instrument = displayToOandaPair(pair)
    const pipMult = getPipMultiplier(pair)

    // Parallel fetch: Daily, Weekly, H1, H4 + cross-market indices
    const [dailyRes, weeklyRes, h1Res, h4Res, ...indexResults] = await Promise.all([
        getCandles({ instrument, granularity: 'D', count: 500 }),
        getCandles({ instrument, granularity: 'W', count: 200 }),
        getCandles({ instrument, granularity: 'H1', count: 500 }),
        getCandles({ instrument, granularity: 'H4', count: 300 }),
        // Cross-market indices (best-effort)
        getCandles({ instrument: 'SPX500_USD', granularity: 'D', count: 250 }).catch(() => ({ data: undefined })),
        getCandles({ instrument: 'NAS100_USD', granularity: 'D', count: 250 }).catch(() => ({ data: undefined })),
        getCandles({ instrument: 'US30_USD', granularity: 'D', count: 250 }).catch(() => ({ data: undefined })),
    ])

    const dailyCandles = dailyRes.data || []
    const weeklyCandles = weeklyRes.data || []
    const h1Candles = h1Res.data || []
    const h4Candles = h4Res.data || []

    // Pre-compute relationships
    const dailyRelationships = computeDailyRelationships(dailyCandles, pipMult)
    const weeklyRelationships = computeWeeklyRelationships(dailyCandles, weeklyCandles, pipMult)
    const sessionAnnotated = annotateH1WithSessions(h1Candles, pipMult)
    const sessionStats = computeSessionStats(sessionAnnotated)
    const volatilityProfile = computeVolatilityProfile(dailyCandles, h1Candles, pipMult)
    const crossMarketCorrelations = computeCrossMarketCorrelations(
        dailyCandles,
        [
            { name: 'SPX500_USD', candles: indexResults[0]?.data || [] },
            { name: 'NAS100_USD', candles: indexResults[1]?.data || [] },
            { name: 'US30_USD', candles: indexResults[2]?.data || [] },
        ],
    )

    // Summary stats
    const brokePrevHighCount = dailyRelationships.filter(d => d.broke_prev_high).length
    const brokePrevLowCount = dailyRelationships.filter(d => d.broke_prev_low).length
    const insideDayCount = dailyRelationships.filter(d => d.inside_day).length
    const outsideDayCount = dailyRelationships.filter(d => d.outside_day).length
    const totalDR = dailyRelationships.length || 1
    const avgGap = dailyRelationships.reduce((s, d) => s + Math.abs(d.gap_pips), 0) / totalDR
    const mondayHighWeeks = weeklyRelationships.filter(w => w.day_of_high === 'Monday').length
    const mondayLowWeeks = weeklyRelationships.filter(w => w.day_of_low === 'Monday').length
    const totalWR = weeklyRelationships.length || 1
    const fridayBullish = weeklyRelationships.filter(w => w.friday_closed_above_open).length

    const dateRange = {
        from: dailyCandles[0]?.time?.split('T')[0] || '',
        to: dailyCandles[dailyCandles.length - 1]?.time?.split('T')[0] || '',
    }

    return {
        pair,
        instrument,
        pipMultiplier: pipMult,
        dailyRelationships,
        weeklyRelationships,
        sessionAnnotated,
        sessionStats,
        volatilityProfile,
        crossMarketCorrelations,
        summaryStats: {
            total_daily_candles: dailyCandles.length,
            total_weekly_candles: weeklyCandles.length,
            total_h1_candles: h1Candles.length,
            total_h4_candles: h4Candles.length,
            date_range: dateRange,
            broke_prev_high_pct: Math.round((brokePrevHighCount / totalDR) * 100),
            broke_prev_low_pct: Math.round((brokePrevLowCount / totalDR) * 100),
            inside_day_pct: Math.round((insideDayCount / totalDR) * 100),
            outside_day_pct: Math.round((outsideDayCount / totalDR) * 100),
            avg_gap_pips: Math.round(avgGap * 10) / 10,
            monday_sets_weekly_high_pct: Math.round((mondayHighWeeks / totalWR) * 100),
            monday_sets_weekly_low_pct: Math.round((mondayLowWeeks / totalWR) * 100),
            friday_bullish_close_pct: Math.round((fridayBullish / totalWR) * 100),
        },
    }
}

// ── Daily Relationships ──

function computeDailyRelationships(candles: OandaCandle[], pipMult: number): DailyRelationship[] {
    const results: DailyRelationship[] = []

    for (let i = 1; i < candles.length; i++) {
        const prev = candleMid(candles[i - 1])
        const curr = candleMid(candles[i])
        const date = new Date(candles[i].time)

        results.push({
            date: candles[i].time.split('T')[0],
            dayOfWeek: DAYS[date.getUTCDay()],
            open: curr.o,
            high: curr.h,
            low: curr.l,
            close: curr.c,
            range_pips: Math.round((curr.h - curr.l) * pipMult * 10) / 10,
            body_pips: Math.round(Math.abs(curr.c - curr.o) * pipMult * 10) / 10,
            direction: direction(curr.o, curr.c),
            broke_prev_high: curr.h > prev.h,
            broke_prev_low: curr.l < prev.l,
            inside_day: curr.h <= prev.h && curr.l >= prev.l,
            outside_day: curr.h > prev.h && curr.l < prev.l,
            gap_pips: Math.round((curr.o - prev.c) * pipMult * 10) / 10,
        })
    }

    return results
}

// ── Weekly Relationships ──

function computeWeeklyRelationships(
    dailyCandles: OandaCandle[],
    weeklyCandles: OandaCandle[],
    pipMult: number,
): WeeklyRelationship[] {
    // Group daily candles by ISO week
    const weekGroups = new Map<string, OandaCandle[]>()
    for (const c of dailyCandles) {
        const d = new Date(c.time)
        // Get Monday of the week
        const day = d.getUTCDay()
        const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
        const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff))
        const key = monday.toISOString().split('T')[0]
        if (!weekGroups.has(key)) weekGroups.set(key, [])
        weekGroups.get(key)!.push(c)
    }

    const results: WeeklyRelationship[] = []

    for (const [weekStart, days] of weekGroups) {
        if (days.length < 3) continue // skip incomplete weeks

        let weekHigh = -Infinity, weekLow = Infinity
        let dayOfHigh = '', dayOfLow = ''
        let mondayRange = 0, mondayDir: 'bullish' | 'bearish' | 'doji' = 'doji'

        for (const d of days) {
            const m = candleMid(d)
            const dayName = DAYS[new Date(d.time).getUTCDay()]

            if (m.h > weekHigh) { weekHigh = m.h; dayOfHigh = dayName }
            if (m.l < weekLow) { weekLow = m.l; dayOfLow = dayName }

            if (dayName === 'Monday') {
                mondayRange = Math.round((m.h - m.l) * pipMult * 10) / 10
                mondayDir = direction(m.o, m.c)
            }
        }

        const firstDay = candleMid(days[0])
        const lastDay = candleMid(days[days.length - 1])

        // Find matching weekly candle for accurate weekly OHLC
        const wc = weeklyCandles.find(w => {
            const wDate = w.time.split('T')[0]
            return wDate === weekStart || Math.abs(new Date(wDate).getTime() - new Date(weekStart).getTime()) < 3 * 86400000
        })

        const weekOpen = wc ? parseFloat(wc.mid.o) : firstDay.o
        const weekClose = wc ? parseFloat(wc.mid.c) : lastDay.c
        const wHigh = wc ? parseFloat(wc.mid.h) : weekHigh
        const wLow = wc ? parseFloat(wc.mid.l) : weekLow

        // Check if Friday closed above weekly open
        const friday = days.find(d => DAYS[new Date(d.time).getUTCDay()] === 'Friday')
        const fridayClose = friday ? parseFloat(friday.mid.c) : lastDay.c

        results.push({
            week_start: weekStart,
            week_direction: direction(weekOpen, weekClose),
            week_range_pips: Math.round((wHigh - wLow) * pipMult * 10) / 10,
            day_of_high: dayOfHigh,
            day_of_low: dayOfLow,
            monday_range_pips: mondayRange,
            monday_direction: mondayDir,
            friday_closed_above_open: fridayClose > weekOpen,
            weekly_open: weekOpen,
            weekly_close: weekClose,
            weekly_high: wHigh,
            weekly_low: wLow,
        })
    }

    return results
}

// ── Session Annotation ──

function annotateH1WithSessions(candles: OandaCandle[], pipMult: number): SessionAnnotatedH1[] {
    return candles.map(c => {
        const m = candleMid(c)
        const date = new Date(c.time)
        const inTokyo = isTimeInSession(date, 'Tokyo')
        const inLondon = isTimeInSession(date, 'London')
        const inNY = isTimeInSession(date, 'New York')

        let session: SessionAnnotatedH1['session'] = 'off_hours'
        if (inLondon && inNY) session = 'overlap'
        else if (inTokyo) session = 'tokyo'
        else if (inLondon) session = 'london'
        else if (inNY) session = 'new_york'

        return {
            time: c.time,
            session,
            open: m.o,
            high: m.h,
            low: m.l,
            close: m.c,
            range_pips: Math.round((m.h - m.l) * pipMult * 10) / 10,
        }
    })
}

function computeSessionStats(annotated: SessionAnnotatedH1[]): SessionStats[] {
    const sessions = ['tokyo', 'london', 'new_york', 'overlap'] as const
    const results: SessionStats[] = []

    for (const sessionName of sessions) {
        const bars = annotated.filter(a => a.session === sessionName)
        if (bars.length < 10) continue

        const ranges = bars.map(b => b.range_pips)
        const openToHighs = bars.map(b => Math.abs(b.high - b.open))
        const openToLows = bars.map(b => Math.abs(b.open - b.low))

        // Continuation vs reversal (compare each bar's direction to previous bar)
        let continuations = 0, reversals = 0
        for (let i = 1; i < bars.length; i++) {
            const prevDir = bars[i - 1].close > bars[i - 1].open ? 'up' : 'down'
            const currDir = bars[i].close > bars[i].open ? 'up' : 'down'
            if (prevDir === currDir) continuations++
            else reversals++
        }

        const total = continuations + reversals || 1
        const pipMult = ranges[0] > 0 ? 1 : 1 // already in pips

        results.push({
            session: sessionName,
            avg_range_pips: Math.round((ranges.reduce((s, r) => s + r, 0) / bars.length) * 10) / 10,
            avg_open_to_high_pips: Math.round((openToHighs.reduce((s, v) => s + v, 0) / bars.length) * 10) / 10,
            avg_open_to_low_pips: Math.round((openToLows.reduce((s, v) => s + v, 0) / bars.length) * 10) / 10,
            trend_continuation_pct: Math.round((continuations / total) * 100),
            reversal_pct: Math.round((reversals / total) * 100),
            sample_size: bars.length,
        })
    }

    return results
}

// ── Volatility Profile ──

function computeVolatilityProfile(dailyCandles: OandaCandle[], h1Candles: OandaCandle[], pipMult: number): VolatilityProfile {
    const dailyRanges = dailyCandles.map(c => {
        const m = candleMid(c)
        return (m.h - m.l) * pipMult
    })

    const avgRange = dailyRanges.reduce((s, r) => s + r, 0) / (dailyRanges.length || 1)

    // ATR14 approximation
    const atr14Slice = dailyRanges.slice(-14)
    const atr14 = atr14Slice.reduce((s, r) => s + r, 0) / (atr14Slice.length || 1)

    // Trend days (range > 1.5x ATR) and quiet days (range < 0.5x ATR)
    const trendDays = dailyRanges.filter(r => r > atr14 * 1.5).length
    const quietDays = dailyRanges.filter(r => r < atr14 * 0.5).length
    const total = dailyRanges.length || 1

    // First hour stats from H1 candles
    // Group H1 by day, take the first candle of each day
    const dayFirstH1 = new Map<string, number>()
    for (const c of h1Candles) {
        const dayKey = c.time.split('T')[0]
        if (!dayFirstH1.has(dayKey)) {
            const m = candleMid(c)
            dayFirstH1.set(dayKey, (m.h - m.l) * pipMult)
        }
    }
    const firstHourRanges = Array.from(dayFirstH1.values())
    const firstHourAvg = firstHourRanges.reduce((s, r) => s + r, 0) / (firstHourRanges.length || 1)

    return {
        atr14_daily: Math.round(atr14 * 10) / 10,
        avg_daily_range_pips: Math.round(avgRange * 10) / 10,
        trend_day_pct: Math.round((trendDays / total) * 100),
        quiet_day_pct: Math.round((quietDays / total) * 100),
        first_hour_avg_pips: Math.round(firstHourAvg * 10) / 10,
        first_hour_to_daily_range_ratio: avgRange > 0 ? Math.round((firstHourAvg / avgRange) * 100) / 100 : 0,
    }
}

// ── Cross-Market Correlations ──

function computeCrossMarketCorrelations(
    fxCandles: OandaCandle[],
    indices: { name: string; candles: OandaCandle[] }[],
): CrossMarketCorrelation[] {
    const results: CrossMarketCorrelation[] = []

    // Build daily direction map for FX pair
    const fxDirMap = new Map<string, 'up' | 'down'>()
    for (const c of fxCandles) {
        const m = candleMid(c)
        const day = c.time.split('T')[0]
        fxDirMap.set(day, m.c >= m.o ? 'up' : 'down')
    }

    for (const idx of indices) {
        if (idx.candles.length < 50) continue

        let sameDir = 0, total = 0
        for (const c of idx.candles) {
            const m = candleMid(c)
            const day = c.time.split('T')[0]
            const idxDir = m.c >= m.o ? 'up' : 'down'
            const fxDir = fxDirMap.get(day)
            if (fxDir) {
                total++
                if (fxDir === idxDir) sameDir++
            }
        }

        if (total < 30) continue

        results.push({
            index_name: idx.name,
            sample_days: total,
            positive_correlation_pct: Math.round((sameDir / total) * 100),
            avg_lag_hours: 0, // simplified — would need intraday data for accurate lag
        })
    }

    return results
}
