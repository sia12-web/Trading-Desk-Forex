// ── CMS Engine Types (Conditional Market Shaping) ──

import type { OandaCandle } from '@/lib/types/oanda'

// ── Output Schema ──

export interface CMSCondition {
    id: string                    // "cms_daily_1"
    condition: string             // "IF Friday fails to break Thursday's high"
    outcome: string               // "THEN Monday tests Friday's low"
    sample_size: number           // 156
    probability: number           // 72
    avg_move_pips: number         // 45
    time_to_play_out: string      // "Same day"
    implication: string           // "Bias short Monday until Friday's low tested"
    confidence: 'high' | 'medium' | 'low'
    category: 'daily' | 'weekly' | 'session' | 'volatility' | 'cross_market'
    source: 'programmatic' | 'ai'
}

// ── Programmatic Condition (Phase 0 output, before AI ranking) ──

export interface ProgrammaticCondition {
    id: string
    category: 'daily' | 'weekly' | 'session' | 'volatility' | 'cross_market'
    condition: string
    outcome: string
    sample_size: number           // exact count of times condition occurred
    hits: number                  // exact count of times outcome followed
    probability: number           // Math.round((hits / sample_size) * 100)
    avg_move_pips: number         // average pip move when outcome occurred
    time_to_play_out: string
}

export interface CMSResult {
    pair: string
    generated_at: string
    total_conditions: number
    categories: {
        daily: CMSCondition[]
        weekly: CMSCondition[]
        session: CMSCondition[]
        volatility: CMSCondition[]
        cross_market: CMSCondition[]
    }
    summary: string               // Market personality paragraph
    data_stats: {
        daily_candles: number
        weekly_candles: number
        h1_candles: number
        h4_candles: number
        date_range: { from: string; to: string }
    }
}

// ── Data Collection Payloads (pre-computed for AI prompts) ──

export interface DailyRelationship {
    date: string
    dayOfWeek: string             // "Monday", "Tuesday", etc.
    open: number
    high: number
    low: number
    close: number
    range_pips: number
    body_pips: number
    direction: 'bullish' | 'bearish' | 'doji'
    broke_prev_high: boolean
    broke_prev_low: boolean
    inside_day: boolean
    outside_day: boolean
    gap_pips: number              // gap from previous close to open
}

export interface WeeklyRelationship {
    week_start: string
    week_direction: 'bullish' | 'bearish' | 'doji'
    week_range_pips: number
    day_of_high: string           // "Monday", "Tuesday", etc.
    day_of_low: string
    monday_range_pips: number
    monday_direction: 'bullish' | 'bearish' | 'doji'
    friday_closed_above_open: boolean
    weekly_open: number
    weekly_close: number
    weekly_high: number
    weekly_low: number
}

export interface SessionAnnotatedH1 {
    time: string
    session: 'tokyo' | 'london' | 'new_york' | 'overlap' | 'off_hours'
    open: number
    high: number
    low: number
    close: number
    range_pips: number
}

export interface SessionStats {
    session: string
    avg_range_pips: number
    avg_open_to_high_pips: number
    avg_open_to_low_pips: number
    trend_continuation_pct: number  // % of time session continues prior session's direction
    reversal_pct: number            // % of time session reverses
    sample_size: number
}

export interface VolatilityProfile {
    atr14_daily: number
    avg_daily_range_pips: number
    trend_day_pct: number           // % of days where range > 1.5x ATR
    quiet_day_pct: number           // % of days where range < 0.5x ATR
    first_hour_avg_pips: number
    first_hour_to_daily_range_ratio: number
}

export interface CrossMarketCorrelation {
    index_name: string              // "SPX500_USD", "NAS100_USD", etc.
    sample_days: number
    positive_correlation_pct: number  // % of days both moved same direction
    avg_lag_hours: number             // average lag between index move and forex pair move
}

export interface CMSDataPayload {
    pair: string
    instrument: string
    pipMultiplier: number
    dailyRelationships: DailyRelationship[]
    weeklyRelationships: WeeklyRelationship[]
    sessionAnnotated: SessionAnnotatedH1[]
    sessionStats: SessionStats[]
    volatilityProfile: VolatilityProfile
    crossMarketCorrelations: CrossMarketCorrelation[]
    // Summary stats (for AI prompts — keeps them small)
    summaryStats: {
        total_daily_candles: number
        total_weekly_candles: number
        total_h1_candles: number
        total_h4_candles: number
        date_range: { from: string; to: string }
        broke_prev_high_pct: number
        broke_prev_low_pct: number
        inside_day_pct: number
        outside_day_pct: number
        avg_gap_pips: number
        monday_sets_weekly_high_pct: number
        monday_sets_weekly_low_pct: number
        friday_bullish_close_pct: number
    }
}
