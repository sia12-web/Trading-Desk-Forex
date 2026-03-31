// ── Agent Report Types ──

export interface IndicatorOptimizerReport {
    pair: string
    optimizations: Array<{
        timeframe: string
        indicator: string
        current_params: Record<string, number>
        recommended_params: Record<string, number>
        expected_improvement: string
        confidence: number
        reasoning: string
    }>
    market_regime: string
    regime_implications: string
    summary: string
}

export interface NewsIntelligenceReport {
    pair: string
    macro_environment: {
        base_currency_outlook: string
        quote_currency_outlook: string
        relative_strength: string
    }
    central_bank_analysis: {
        base_currency_bank: string
        base_rate_path: string
        quote_currency_bank: string
        quote_rate_path: string
        rate_differential_trend: string
    }
    geopolitical_factors: string[]
    sentiment_indicators: {
        institutional: string
        retail: string
        overall: 'bullish' | 'bearish' | 'neutral'
    }
    key_risks: Array<{
        risk: string
        probability: string
        impact_direction: 'bullish' | 'bearish'
    }>
    upcoming_catalysts: Array<{
        event: string
        date: string
        expected_impact: string
    }>
    fundamental_narrative: string
    summary: string
}

export interface CrossMarketReport {
    pair: string
    indices_analyzed: Array<{
        instrument: string
        name: string
        currency_affected: string
        recent_trend: string
        correlation_signal: string
    }>
    cross_market_thesis: string
    risk_appetite: 'risk_on' | 'risk_off' | 'mixed'
    risk_appetite_reasoning: string
    currency_implications: {
        base_currency: string
        quote_currency: string
        net_effect: 'bullish' | 'bearish' | 'neutral'
    }
    divergences: string[]
    summary: string
}

// ── Index-Specific Report Types ──

export interface IndexNewsIntelligenceReport {
    pair: string
    monetary_policy: {
        central_bank: string
        current_stance: 'hawkish' | 'dovish' | 'neutral'
        rate_path: string
        qt_status: string
        next_meeting: string
    }
    economic_outlook: {
        growth_trajectory: 'accelerating' | 'decelerating' | 'stable'
        inflation_status: string
        labor_market: string
        key_data_this_week: string[]
    }
    earnings_context: {
        season_status: 'peak' | 'early' | 'winding_down' | 'off_season'
        notable_reports: string[]
        sector_surprises: string
    }
    risk_appetite: {
        vix_assessment: string
        institutional_flow: string
        overall: 'risk_on' | 'risk_off' | 'neutral'
    }
    sector_dynamics: {
        leading_sectors: string[]
        lagging_sectors: string[]
        rotation_narrative: string
    }
    dollar_impact: {
        dxy_trend: string
        implication: string
    }
    key_risks: Array<{
        risk: string
        probability: string
        impact_direction: 'bullish' | 'bearish'
    }>
    upcoming_catalysts: Array<{
        event: string
        date: string
        expected_impact: string
    }>
    fundamental_narrative: string
    summary: string
}

export interface IndexCrossMarketReport {
    pair: string
    peer_indices: Array<{
        instrument: string
        name: string
        change1d: number
        change5d: number
        trend: string
        divergence_note: string
    }>
    bond_analysis: {
        instrument: string
        yield_trend: string
        implication: string
    } | null
    dollar_analysis: {
        trend: string
        implication: string
    }
    correlation_thesis: string
    risk_appetite: 'risk_on' | 'risk_off' | 'mixed'
    summary: string
}

export interface CMSIntelligenceReport {
    pair: string
    total_conditions: number
    top_conditions: Array<{
        condition: string
        outcome: string
        probability: number
        sample_size: number
        avg_move_pips: number
        category: string
    }>
    market_personality: string
    data_range: { from: string; to: string }
}

export interface AgentIntelligence {
    optimizer: IndicatorOptimizerReport | null
    news: NewsIntelligenceReport | IndexNewsIntelligenceReport | null
    crossMarket: CrossMarketReport | IndexCrossMarketReport | null
    cms: CMSIntelligenceReport | null
    generatedAt: string
}
