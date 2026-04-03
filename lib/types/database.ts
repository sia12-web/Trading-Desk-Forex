export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            trades: {
                Row: {
                    id: string
                    user_id: string
                    pair: string
                    direction: 'long' | 'short'
                    entry_price: number | null
                    exit_price: number | null
                    stop_loss: number | null
                    take_profit: number | null
                    lot_size: number | null
                    status: 'planned' | 'open' | 'closed' | 'cancelled'
                    oanda_trade_id: string | null
                    oanda_account_id: string | null
                    strategy_template_id: string | null
                    voice_transcript: string | null
                    parsed_strategy: Json | null
                    tags: string[] | null
                    source: string | null
                    opened_at: string | null
                    closed_at: string | null
                    created_at: string
                    updated_at: string
                    name: string | null
                    strategy_explanation: string | null
                    trade_reasoning: Json | null
                }
                Insert: {
                    id?: string
                    user_id: string
                    pair: string
                    direction: 'long' | 'short'
                    entry_price?: number | null
                    exit_price?: number | null
                    stop_loss?: number | null
                    take_profit?: number | null
                    lot_size?: number | null
                    status?: 'planned' | 'open' | 'closed' | 'cancelled'
                    oanda_trade_id?: string | null
                    oanda_account_id?: string | null
                    strategy_template_id?: string | null
                    voice_transcript?: string | null
                    parsed_strategy?: Json | null
                    tags?: string[] | null
                    source?: string | null
                    opened_at?: string | null
                    closed_at?: string | null
                    created_at?: string
                    updated_at?: string
                    name?: string | null
                    strategy_explanation?: string | null
                    trade_reasoning?: Json | null
                }
                Update: {
                    id?: string
                    user_id?: string
                    pair?: string
                    direction?: 'long' | 'short'
                    entry_price?: number | null
                    exit_price?: number | null
                    stop_loss?: number | null
                    take_profit?: number | null
                    lot_size?: number | null
                    status?: 'planned' | 'open' | 'closed' | 'cancelled'
                    oanda_trade_id?: string | null
                    oanda_account_id?: string | null
                    strategy_template_id?: string | null
                    voice_transcript?: string | null
                    parsed_strategy?: Json | null
                    tags?: string[] | null
                    source?: string | null
                    opened_at?: string | null
                    closed_at?: string | null
                    created_at?: string
                    updated_at?: string
                    name?: string | null
                    strategy_explanation?: string | null
                    trade_reasoning?: Json | null
                }
            }
            trade_screenshots: {
                Row: {
                    id: string
                    trade_id: string
                    user_id: string
                    storage_path: string
                    label: string | null
                    notes: string | null
                    uploaded_at: string
                }
                Insert: {
                    id?: string
                    trade_id: string
                    user_id: string
                    storage_path: string
                    label?: string | null
                    notes?: string | null
                    uploaded_at?: string
                }
                Update: {
                    id?: string
                    trade_id?: string
                    user_id?: string
                    storage_path?: string
                    label?: string | null
                    notes?: string | null
                    uploaded_at?: string
                }
            }
            trade_strategies: {
                Row: {
                    id: string
                    trade_id: string
                    user_id: string
                    step_number: number
                    title: string
                    description: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    trade_id: string
                    user_id: string
                    step_number: number
                    title: string
                    description: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    trade_id?: string
                    user_id?: string
                    step_number?: number
                    title?: string
                    description?: string
                    created_at?: string
                }
            }
            trade_pnl: {
                Row: {
                    id: string
                    trade_id: string
                    user_id: string
                    pnl_amount: number
                    pnl_pips: number | null
                    fees: number
                    notes: string | null
                    recorded_at: string
                }
                Insert: {
                    id?: string
                    trade_id: string
                    user_id: string
                    pnl_amount: number
                    pnl_pips?: number | null
                    fees?: number
                    notes?: string | null
                    recorded_at?: string
                }
                Update: {
                    id?: string
                    trade_id?: string
                    user_id?: string
                    pnl_amount?: number
                    pnl_pips?: number | null
                    fees?: number
                    notes?: string | null
                    recorded_at?: string
                }
            }
            risk_rules: {
                Row: {
                    id: string
                    user_id: string
                    rule_name: string
                    rule_type: 'max_position_size' | 'max_daily_loss' | 'max_open_trades' | 'max_risk_per_trade' | 'min_reward_risk' | 'custom'
                    value: Json
                    is_active: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    rule_name: string
                    rule_type: 'max_position_size' | 'max_daily_loss' | 'max_open_trades' | 'max_risk_per_trade' | 'min_reward_risk' | 'custom'
                    value: Json
                    is_active?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    rule_name?: string
                    rule_type?: 'max_position_size' | 'max_daily_loss' | 'max_open_trades' | 'max_risk_per_trade' | 'min_reward_risk' | 'custom'
                    value?: Json
                    is_active?: boolean
                    created_at?: string
                }
            }
            ai_coaching_sessions: {
                Row: {
                    id: string
                    trade_id: string | null
                    user_id: string
                    oanda_account_id: string | null
                    session_type: 'review' | 'pre_trade' | 'general'
                    prompt_summary: string | null
                    response: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    trade_id?: string | null
                    user_id: string
                    oanda_account_id?: string | null
                    session_type: 'review' | 'pre_trade' | 'general'
                    prompt_summary?: string | null
                    response?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    trade_id?: string | null
                    user_id?: string
                    oanda_account_id?: string | null
                    session_type?: 'review' | 'pre_trade' | 'general'
                    prompt_summary?: string | null
                    response?: string | null
                    created_at?: string
                }
            }
            strategy_templates: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    description: string | null
                    checklist_items: Json
                    usage_count: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    name: string
                    description?: string | null
                    checklist_items?: Json
                    usage_count?: number
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    description?: string | null
                    checklist_items?: Json
                    usage_count?: number
                    created_at?: string
                    updated_at?: string
                }
            }
            wave_analysis: {
                Row: {
                    id: string
                    user_id: string
                    oanda_account_id: string | null
                    trade_id: string | null
                    pair: string
                    monthly_screenshot_path: string | null
                    monthly_wave_count: Json | null
                    weekly_screenshot_path: string | null
                    weekly_wave_count: Json | null
                    daily_screenshot_path: string | null
                    daily_wave_count: Json | null
                    h4_screenshot_path: string | null
                    h4_wave_count: Json | null
                    m1_screenshot_path: string | null
                    m1_wave_count: Json | null
                    analysis_result: Json
                    trade_setup: Json | null
                    drawing_instructions: Json | null
                    is_valid: boolean
                    confidence: string | null
                    analysis_type: string | null
                    data_payload: Json | null
                    strategy_config: Json | null
                    source_analysis_id: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    oanda_account_id?: string | null
                    trade_id?: string | null
                    pair: string
                    monthly_screenshot_path?: string | null
                    monthly_wave_count?: Json | null
                    weekly_screenshot_path?: string | null
                    weekly_wave_count?: Json | null
                    daily_screenshot_path?: string | null
                    daily_wave_count?: Json | null
                    h4_screenshot_path?: string | null
                    h4_wave_count?: Json | null
                    m1_screenshot_path?: string | null
                    m1_wave_count?: Json | null
                    analysis_result: Json
                    trade_setup?: Json | null
                    drawing_instructions?: Json | null
                    is_valid: boolean
                    confidence?: string | null
                    analysis_type?: string | null
                    data_payload?: Json | null
                    strategy_config?: Json | null
                    source_analysis_id?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    oanda_account_id?: string | null
                    trade_id?: string | null
                    pair?: string
                    monthly_screenshot_path?: string | null
                    monthly_wave_count?: Json | null
                    weekly_screenshot_path?: string | null
                    weekly_wave_count?: Json | null
                    daily_screenshot_path?: string | null
                    daily_wave_count?: Json | null
                    h4_screenshot_path?: string | null
                    h4_wave_count?: Json | null
                    m1_screenshot_path?: string | null
                    m1_wave_count?: Json | null
                    analysis_result?: Json
                    trade_setup?: Json | null
                    drawing_instructions?: Json | null
                    is_valid?: boolean
                    confidence?: string | null
                    analysis_type?: string | null
                    data_payload?: Json | null
                    strategy_config?: Json | null
                    source_analysis_id?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            technical_analyses: {
                Row: {
                    id: string
                    user_id: string
                    oanda_account_id: string | null
                    pair: string
                    timeframe: string
                    analysis_type: 'macd' | 'volume' | 'pivot' | 'institutional'
                    structured_data: Json
                    narrative: string
                    full_text: string
                    screenshot_base64: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    oanda_account_id?: string | null
                    pair: string
                    timeframe: string
                    analysis_type: 'macd' | 'volume' | 'pivot' | 'institutional'
                    structured_data: Json
                    narrative: string
                    full_text: string
                    screenshot_base64?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    oanda_account_id?: string | null
                    pair?: string
                    timeframe?: string
                    analysis_type?: 'macd' | 'volume' | 'pivot' | 'institutional'
                    structured_data?: Json
                    narrative?: string
                    full_text?: string
                    screenshot_base64?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            indicator_optimizations: {
                Row: {
                    id: string
                    user_id: string
                    oanda_account_id: string | null
                    pair: string
                    timeframe: string
                    indicator: string
                    optimized_params: Json
                    consistency_score: number
                    periods_positive: number
                    total_periods: number
                    win_rate: number
                    profit_factor: number
                    total_trades: number
                    default_params: Json | null
                    default_win_rate: number | null
                    default_profit_factor: number | null
                    improvement_percent: number | null
                    recommendation: string | null
                    reasoning: string | null
                    optimized_at: string
                    expires_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    oanda_account_id?: string | null
                    pair: string
                    timeframe: string
                    indicator: string
                    optimized_params: Json
                    consistency_score: number
                    periods_positive: number
                    total_periods: number
                    win_rate: number
                    profit_factor: number
                    total_trades: number
                    default_params?: Json | null
                    default_win_rate?: number | null
                    default_profit_factor?: number | null
                    improvement_percent?: number | null
                    recommendation?: string | null
                    reasoning?: string | null
                    optimized_at?: string
                    expires_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    oanda_account_id?: string | null
                    pair?: string
                    timeframe?: string
                    indicator?: string
                    optimized_params?: Json
                    consistency_score?: number
                    periods_positive?: number
                    total_periods?: number
                    win_rate?: number
                    profit_factor?: number
                    total_trades?: number
                    default_params?: Json | null
                    default_win_rate?: number | null
                    default_profit_factor?: number | null
                    improvement_percent?: number | null
                    recommendation?: string | null
                    reasoning?: string | null
                    optimized_at?: string
                    expires_at?: string
                }
            }
            scalp_sessions: {
                Row: {
                    id: string
                    user_id: string
                    oanda_account_id: string | null
                    source_analysis_id: string | null
                    instrument: string
                    sar_params: Json
                    risk_per_scalp: number
                    session_loss_limit: number
                    max_trades: number
                    max_hold_minutes: number
                    starting_balance: number
                    status: string
                    trend_direction: string | null
                    trend_score: number | null
                    adx_value: number | null
                    current_sar: number | null
                    active_oanda_trade_id: string | null
                    active_trade_direction: string | null
                    active_trade_entry: number | null
                    active_trade_sl: number | null
                    active_trade_units: number | null
                    active_trade_opened_at: string | null
                    trades_taken: number
                    wins: number
                    losses: number
                    session_pnl: number
                    session_pnl_pips: number
                    consecutive_errors: number
                    trade_log: Json
                    last_trend_check_at: string | null
                    last_tick_at: string | null
                    stop_reason: string | null
                    started_at: string | null
                    stopped_at: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    oanda_account_id?: string | null
                    source_analysis_id?: string | null
                    instrument: string
                    sar_params: Json
                    risk_per_scalp: number
                    session_loss_limit: number
                    max_trades: number
                    max_hold_minutes: number
                    starting_balance: number
                    status: string
                    trend_direction?: string | null
                    trend_score?: number | null
                    adx_value?: number | null
                    current_sar?: number | null
                    active_oanda_trade_id?: string | null
                    active_trade_direction?: string | null
                    active_trade_entry?: number | null
                    active_trade_sl?: number | null
                    active_trade_units?: number | null
                    active_trade_opened_at?: string | null
                    trades_taken?: number
                    wins?: number
                    losses?: number
                    session_pnl?: number
                    session_pnl_pips?: number
                    consecutive_errors?: number
                    trade_log?: Json
                    last_trend_check_at?: string | null
                    last_tick_at?: string | null
                    stop_reason?: string | null
                    started_at?: string | null
                    stopped_at?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    oanda_account_id?: string | null
                    source_analysis_id?: string | null
                    instrument?: string
                    sar_params?: Json
                    risk_per_scalp?: number
                    session_loss_limit?: number
                    max_trades?: number
                    max_hold_minutes?: number
                    starting_balance?: number
                    status?: string
                    trend_direction?: string | null
                    trend_score?: number | null
                    adx_value?: number | null
                    current_sar?: number | null
                    active_oanda_trade_id?: string | null
                    active_trade_direction?: string | null
                    active_trade_entry?: number | null
                    active_trade_sl?: number | null
                    active_trade_units?: number | null
                    active_trade_opened_at?: string | null
                    trades_taken?: number
                    wins?: number
                    losses?: number
                    session_pnl?: number
                    session_pnl_pips?: number
                    consecutive_errors?: number
                    trade_log?: Json
                    last_trend_check_at?: string | null
                    last_tick_at?: string | null
                    stop_reason?: string | null
                    started_at?: string | null
                    stopped_at?: string | null
                    created_at?: string
                }
            }
            scalp_trades: {
                Row: {
                    id: string
                    session_id: string
                    direction: 'long' | 'short'
                    entry_price: number
                    exit_price: number | null
                    pnl: number | null
                    pnl_pips: number | null
                    opened_at: string
                    closed_at: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    session_id: string
                    direction: 'long' | 'short'
                    entry_price: number
                    exit_price?: number | null
                    pnl?: number | null
                    pnl_pips?: number | null
                    opened_at: string
                    closed_at?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    session_id?: string
                    direction?: 'long' | 'short'
                    entry_price?: number
                    exit_price?: number | null
                    pnl?: number | null
                    pnl_pips?: number | null
                    opened_at?: string
                    closed_at?: string | null
                    created_at?: string
                }
            }
            bb_sessions: {
                Row: {
                    id: string
                    user_id: string
                    instrument: string
                    bb_period: number
                    bb_std_dev: number
                    stoch_period: number
                    stoch_smooth: number
                    oversold_level: number
                    overbought_level: number
                    capital_allocation: number
                    risk_per_trade: number
                    take_profit_pips: number | null
                    stop_loss_pips: number | null
                    status: 'running' | 'paused' | 'stopped'
                    source_analysis_id: string | null
                    started_at: string | null
                    stopped_at: string | null
                    stop_reason: string | null
                    total_trades: number
                    winning_trades: number
                    total_pnl: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    instrument: string
                    bb_period?: number
                    bb_std_dev?: number
                    stoch_period?: number
                    stoch_smooth?: number
                    oversold_level?: number
                    overbought_level?: number
                    capital_allocation: number
                    risk_per_trade: number
                    take_profit_pips?: number | null
                    stop_loss_pips?: number | null
                    status: 'running' | 'paused' | 'stopped'
                    source_analysis_id?: string | null
                    started_at?: string | null
                    stopped_at?: string | null
                    stop_reason?: string | null
                    total_trades?: number
                    winning_trades?: number
                    total_pnl?: number
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    instrument?: string
                    bb_period?: number
                    bb_std_dev?: number
                    stoch_period?: number
                    stoch_smooth?: number
                    oversold_level?: number
                    overbought_level?: number
                    capital_allocation?: number
                    risk_per_trade?: number
                    take_profit_pips?: number | null
                    stop_loss_pips?: number | null
                    status?: 'running' | 'paused' | 'stopped'
                    source_analysis_id?: string | null
                    started_at?: string | null
                    stopped_at?: string | null
                    stop_reason?: string | null
                    total_trades?: number
                    winning_trades?: number
                    total_pnl?: number
                    created_at?: string
                    updated_at?: string
                }
            }
            bb_trades: {
                Row: {
                    id: string
                    session_id: string
                    direction: 'long' | 'short'
                    entry_price: number
                    exit_price: number | null
                    bb_upper: number
                    bb_middle: number
                    bb_lower: number
                    stoch_k: number
                    stoch_d: number
                    stop_loss: number
                    take_profit: number
                    pnl: number | null
                    pnl_pips: number | null
                    opened_at: string
                    closed_at: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    session_id: string
                    direction: 'long' | 'short'
                    entry_price: number
                    exit_price?: number | null
                    bb_upper: number
                    bb_middle: number
                    bb_lower: number
                    stoch_k: number
                    stoch_d: number
                    stop_loss: number
                    take_profit: number
                    pnl?: number | null
                    pnl_pips?: number | null
                    opened_at: string
                    closed_at?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    session_id?: string
                    direction?: 'long' | 'short'
                    entry_price?: number
                    exit_price?: number | null
                    bb_upper?: number
                    bb_middle?: number
                    bb_lower?: number
                    stoch_k?: number
                    stoch_d?: number
                    stop_loss?: number
                    take_profit?: number
                    pnl?: number | null
                    pnl_pips?: number | null
                    opened_at?: string
                    closed_at?: string | null
                    created_at?: string
                }
            }
            trader_profile: {
                Row: {
                    id: string
                    user_id: string
                    oanda_account_id: string | null
                    trading_style: string | null
                    risk_personality: string | null
                    experience_months: number | null
                    primary_pairs: string[] | null
                    trading_goals: string | null
                    observed_strengths: string[] | null
                    observed_weaknesses: string[] | null
                    emotional_triggers: string[] | null
                    current_focus: string | null
                    personality_notes: string | null
                    compact_profile: string | null
                    updated_at: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    oanda_account_id?: string | null
                    trading_style?: string | null
                    risk_personality?: string | null
                    experience_months?: number | null
                    primary_pairs?: string[] | null
                    trading_goals?: string | null
                    observed_strengths?: string[] | null
                    observed_weaknesses?: string[] | null
                    emotional_triggers?: string[] | null
                    current_focus?: string | null
                    personality_notes?: string | null
                    compact_profile?: string | null
                    updated_at?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    oanda_account_id?: string | null
                    trading_style?: string | null
                    risk_personality?: string | null
                    experience_months?: number | null
                    primary_pairs?: string[] | null
                    trading_goals?: string | null
                    observed_strengths?: string[] | null
                    observed_weaknesses?: string[] | null
                    emotional_triggers?: string[] | null
                    current_focus?: string | null
                    personality_notes?: string | null
                    compact_profile?: string | null
                    updated_at?: string
                    created_at?: string
                }
            }
            coaching_memory: {
                Row: {
                    id: string
                    user_id: string
                    oanda_account_id: string | null
                    session_id: string | null
                    session_date: string
                    session_type: string
                    key_topics: string[] | null
                    advice_given: string | null
                    commitments: string[] | null
                    follow_up_needed: boolean
                    follow_up_note: string | null
                    is_compressed: boolean
                    compressed_from_count: number | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    oanda_account_id?: string | null
                    session_id?: string | null
                    session_date: string
                    session_type: string
                    key_topics?: string[] | null
                    advice_given?: string | null
                    commitments?: string[] | null
                    follow_up_needed?: boolean
                    follow_up_note?: string | null
                    is_compressed?: boolean
                    compressed_from_count?: number | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    oanda_account_id?: string | null
                    session_id?: string | null
                    session_date?: string
                    session_type?: string
                    key_topics?: string[] | null
                    advice_given?: string | null
                    commitments?: string[] | null
                    follow_up_needed?: boolean
                    follow_up_note?: string | null
                    is_compressed?: boolean
                    compressed_from_count?: number | null
                    created_at?: string
                }
            }
            behavioral_analysis: {
                Row: {
                    id: string
                    user_id: string
                    oanda_account_id: string | null
                    period_start: string
                    period_end: string
                    trade_count: number
                    win_rate_by_pair: Json | null
                    win_rate_by_day: Json | null
                    win_rate_by_hour: Json | null
                    win_rate_by_strategy: Json | null
                    avg_hold_winners_minutes: number | null
                    avg_hold_losers_minutes: number | null
                    revenge_trade_count: number | null
                    early_exit_count: number | null
                    late_exit_count: number | null
                    rule_violation_attempts: number | null
                    overtrading_days: number | null
                    avg_risk_percent: number | null
                    max_risk_percent: number | null
                    avg_rr_planned: number | null
                    avg_rr_actual: number | null
                    strategy_logged_percent: number | null
                    screenshots_logged_percent: number | null
                    template_usage: Json | null
                    longest_win_streak: number | null
                    longest_loss_streak: number | null
                    behavior_after_3_losses: string | null
                    behavior_after_3_wins: string | null
                    compact_summary: string | null
                    generated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    oanda_account_id?: string | null
                    period_start: string
                    period_end: string
                    trade_count: number
                    win_rate_by_pair?: Json | null
                    win_rate_by_day?: Json | null
                    win_rate_by_hour?: Json | null
                    win_rate_by_strategy?: Json | null
                    avg_hold_winners_minutes?: number | null
                    avg_hold_losers_minutes?: number | null
                    revenge_trade_count?: number | null
                    early_exit_count?: number | null
                    late_exit_count?: number | null
                    rule_violation_attempts?: number | null
                    overtrading_days?: number | null
                    avg_risk_percent?: number | null
                    max_risk_percent?: number | null
                    avg_rr_planned?: number | null
                    avg_rr_actual?: number | null
                    strategy_logged_percent?: number | null
                    screenshots_logged_percent?: number | null
                    template_usage?: Json | null
                    longest_win_streak?: number | null
                    longest_loss_streak?: number | null
                    behavior_after_3_losses?: string | null
                    behavior_after_3_wins?: string | null
                    compact_summary?: string | null
                    generated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    oanda_account_id?: string | null
                    period_start?: string
                    period_end?: string
                    trade_count?: number
                    win_rate_by_pair?: Json | null
                    win_rate_by_day?: Json | null
                    win_rate_by_hour?: Json | null
                    win_rate_by_strategy?: Json | null
                    avg_hold_winners_minutes?: number | null
                    avg_hold_losers_minutes?: number | null
                    revenge_trade_count?: number | null
                    early_exit_count?: number | null
                    late_exit_count?: number | null
                    rule_violation_attempts?: number | null
                    overtrading_days?: number | null
                    avg_risk_percent?: number | null
                    max_risk_percent?: number | null
                    avg_rr_planned?: number | null
                    avg_rr_actual?: number | null
                    strategy_logged_percent?: number | null
                    screenshots_logged_percent?: number | null
                    template_usage?: Json | null
                    longest_win_streak?: number | null
                    longest_loss_streak?: number | null
                    behavior_after_3_losses?: string | null
                    behavior_after_3_wins?: string | null
                    compact_summary?: string | null
                    generated_at?: string
                }
            }
            ai_session_reviews: {
                Row: {
                    id: string
                    user_id: string
                    session_id: string
                    analysis_id: string | null
                    predicted_outcome: Json
                    predicted_confidence: string
                    recommended_strategy: string
                    total_pnl_percent: number
                    win_rate: number
                    total_trades: number
                    session_duration_minutes: number
                    stop_reason: string
                    review_result: Json
                    accuracy_assessment: string
                    root_cause: string | null
                    learning: string | null
                    confidence_adjustment: string | null
                    reviewed_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    session_id: string
                    analysis_id?: string | null
                    predicted_outcome: Json
                    predicted_confidence: string
                    recommended_strategy: string
                    total_pnl_percent: number
                    win_rate: number
                    total_trades: number
                    session_duration_minutes: number
                    stop_reason: string
                    review_result: Json
                    accuracy_assessment: string
                    root_cause?: string | null
                    learning?: string | null
                    confidence_adjustment?: string | null
                    reviewed_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    session_id?: string
                    analysis_id?: string | null
                    predicted_outcome?: Json
                    predicted_confidence?: string
                    recommended_strategy?: string
                    total_pnl_percent?: number
                    win_rate?: number
                    total_trades?: number
                    session_duration_minutes?: number
                    stop_reason?: string
                    review_result?: Json
                    accuracy_assessment?: string
                    root_cause?: string | null
                    learning?: string | null
                    confidence_adjustment?: string | null
                    reviewed_at?: string
                }
            }
            user_story_entries: {
                Row: {
                    id: string
                    user_id: string
                    pair: string
                    entry_date: string
                    content: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    pair: string
                    entry_date: string
                    content?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    pair?: string
                    entry_date?: string
                    content?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            user_story_screenshots: {
                Row: {
                    id: string
                    entry_id: string
                    user_id: string
                    storage_path: string
                    label: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    entry_id: string
                    user_id: string
                    storage_path: string
                    label?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    entry_id?: string
                    user_id?: string
                    storage_path?: string
                    label?: string | null
                    created_at?: string
                }
            }
        }
    }
}

export interface StrategyTemplate {
    id: string
    user_id: string
    name: string
    description: string | null
    checklist_items: ChecklistItem[]
    usage_count: number
    created_at: string
    updated_at: string
}

export interface ChecklistItem {
    id: string
    label: string
    category: "trend" | "indicator" | "level" | "pattern" | "confirmation"
    logical_condition?: string
}

export interface ParsedStrategy {
    template_match: string | null
    major_trend?: { direction: 'bullish' | 'bearish' | 'sideways'; timeframe: string; reasoning: string }
    intermediate_trend?: { direction: 'bullish' | 'bearish' | 'sideways'; timeframe: string; reasoning: string }
    checklist?: {
        item: string;
        status: "supports" | "neutral" | "contradicts";
        finding: string;
        category?: "trend" | "indicator" | "level" | "pattern" | "confirmation";
        logical_condition?: string;
    }[]
    key_levels?: { type: 'support' | 'resistance' | 'round_number' | 'pivot'; price: number; label: string }[]
    confluences?: { count: number; total: number; details: string[] }
    missing?: string[]
    suggested_entry?: { price: number | null; trigger: string } | null
    suggested_sl?: { price: number | null; reasoning: string } | null
    suggested_tp?: { price: number | null; reasoning: string } | null
}
