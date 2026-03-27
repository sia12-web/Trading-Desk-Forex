-- ==============================================================
-- 001_initial_core: Consolidated Trade Desk Core Schema
-- Support for: Journal (Trades/PnL), AI Story (Agents), Indicator Optimizations
-- ==============================================================

-- CLEANUP: Remove legacy tables and prepare for clean core start
DROP TABLE IF EXISTS trades, trade_screenshots, trade_strategies, trade_pnl, trade_sync_log, execution_log CASCADE;
DROP TABLE IF EXISTS trader_profile, indicator_optimizations, story_agent_reports CASCADE;
DROP TABLE IF EXISTS wave_analysis, ai_coaching_sessions, coaching_memory, behavioral_analysis CASCADE;
DROP TABLE IF EXISTS risk_rules, strategy_templates, scalp_sessions, scalp_trades CASCADE;
DROP TABLE IF EXISTS bb_sessions, bb_trades, strategy_signals, strategy_engines CASCADE;
DROP TABLE IF EXISTS daily_tasks, daily_plans, radar_settings, radar_alerts CASCADE;
DROP TABLE IF EXISTS strategy_discoveries, lab_signals, lab_settings, lab_performance_snapshots, lab_scan_history CASCADE;
DROP TABLE IF EXISTS structural_analysis_cache_v2, ai_usage_tracking, notification_preferences CASCADE;
DROP TABLE IF EXISTS technical_analyses, candle_analysis CASCADE;

-- 1. Trader Profile (One per user+account)
CREATE TABLE trader_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  oanda_account_id VARCHAR(50),
  
  -- Self-assessment
  trading_style VARCHAR(20) CHECK (trading_style IN ('scalper', 'day_trader', 'swing_trader', 'position_trader')),
  risk_personality VARCHAR(20) CHECK (risk_personality IN ('aggressive', 'moderate', 'conservative')),
  experience_months INTEGER,
  primary_pairs TEXT[],
  trading_goals TEXT,
  
  -- AI-observed traits
  observed_strengths JSONB DEFAULT '[]', 
  observed_weaknesses JSONB DEFAULT '[]',
  emotional_triggers JSONB DEFAULT '[]',
  current_focus TEXT,
  personality_notes TEXT,
  
  -- Communications
  telegram_chat_id TEXT,
  
  -- Settings
  last_demo_reset_at TIMESTAMPTZ,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, oanda_account_id)
);

ALTER TABLE trader_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own profile" ON trader_profile FOR ALL USING (auth.uid() = user_id);

-- 2. Trades (The heart of the Journal)
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  oanda_account_id VARCHAR(50),
  pair VARCHAR(10) NOT NULL, -- e.g., 'EUR/USD'
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('long', 'short')),
  
  -- Pricing/Size
  entry_price DECIMAL(10,5),
  exit_price DECIMAL(10,5),
  stop_loss DECIMAL(10,5),
  take_profit DECIMAL(10,5),
  lot_size DECIMAL(10,4),
  
  -- Status / Metadata
  status VARCHAR(10) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'open', 'closed', 'cancelled')),
  oanda_trade_id VARCHAR(50),
  source VARCHAR(10) NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'external')),
  
  -- Human input
  name VARCHAR(200),
  strategy_explanation TEXT,
  trade_reasoning JSONB, -- { "entry": "...", "stop_loss": "...", ... }
  voice_transcript TEXT,
  
  -- Timestamps
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own trades" ON trades FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_trades_user_account ON trades (user_id, oanda_account_id);
CREATE INDEX idx_trades_pair_status ON trades (pair, status);

-- 3. Trade Screenshots & Strategies
CREATE TABLE trade_screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES trades(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  storage_path TEXT NOT NULL,
  label VARCHAR(50), -- 'entry', 'exit', 'analysis'
  notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trade_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES trades(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  step_number INTEGER NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trade_screenshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own screenshots" ON trade_screenshots FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own strategies" ON trade_strategies FOR ALL USING (auth.uid() = user_id);

-- 4. Profit & Loss Tracking
CREATE TABLE trade_pnl (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES trades(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  pnl_amount DECIMAL(12,2) NOT NULL, -- in account currency
  pnl_pips DECIMAL(8,1),
  fees DECIMAL(8,2) DEFAULT 0,
  notes TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trade_pnl ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own pnl" ON trade_pnl FOR ALL USING (auth.uid() = user_id);

-- 5. Execution Logs & Sync Tracking
CREATE TABLE execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  oanda_account_id VARCHAR(50),
  action VARCHAR(20) NOT NULL CHECK (action IN ('place_order', 'modify_trade', 'close_trade', 'cancel_order', 'sync_import', 'sync_close')),
  trade_id UUID REFERENCES trades(id),
  oanda_trade_id VARCHAR(50),
  request_payload JSONB NOT NULL,
  response_payload JSONB,
  risk_validation JSONB,
  status VARCHAR(10) NOT NULL CHECK (status IN ('success', 'failed', 'blocked')),
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trade_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  oanda_account_id VARCHAR(50),
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  open_imported INTEGER DEFAULT 0,
  closed_imported INTEGER DEFAULT 0,
  closed_updated INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]'
);

ALTER TABLE execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own logs" ON execution_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own sync logs" ON trade_sync_log FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_execution_log_account ON execution_log (user_id, oanda_account_id);

-- 6. Indicator Optimizations (Dashboard)
CREATE TABLE indicator_optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  oanda_account_id VARCHAR(50),
  pair VARCHAR(10) NOT NULL,
  timeframe VARCHAR(5) NOT NULL,
  indicator VARCHAR(30) NOT NULL,
  
  -- Params & Results
  optimized_params JSONB NOT NULL,
  default_params JSONB NOT NULL,
  improvement_percent DECIMAL(5,2),
  
  -- Recommendation
  recommendation VARCHAR(200),
  reasoning TEXT,
  
  optimized_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  
  UNIQUE(user_id, pair, timeframe, indicator)
);

ALTER TABLE indicator_optimizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own optimizations" ON indicator_optimizations FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_indicator_opt_lookup ON indicator_optimizations(user_id, pair, indicator);

-- 7. Story Agent Reports (AI Story Feature - New table to support code)
CREATE TABLE story_agent_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pair VARCHAR(10) NOT NULL,
  agent_type VARCHAR(30) NOT NULL, -- 'indicator_optimizer', 'news_intelligence', etc.
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  report JSONB NOT NULL DEFAULT '{}',
  raw_ai_output TEXT,
  model_used VARCHAR(50),
  duration_ms INTEGER,
  status VARCHAR(20) DEFAULT 'completed',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, pair, agent_type, report_date)
);

ALTER TABLE story_agent_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own agent reports" ON story_agent_reports FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_story_agent_reports_lookup ON story_agent_reports(user_id, pair, report_date);

-- Trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER update_trader_profile_updated_at BEFORE UPDATE ON trader_profile FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
