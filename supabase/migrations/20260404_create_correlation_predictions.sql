-- Create correlation_predictions table for auto-generated daily predictions

CREATE TABLE correlation_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Prediction data
  predictions JSONB NOT NULL, -- Full TomorrowPrediction payload
  top_predictions JSONB NOT NULL, -- [{pair, direction, expectedMove, supportingPatterns, avgAccuracy}]
  confidence VARCHAR(10) NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  ai_synthesis TEXT NOT NULL,

  -- Metadata
  patterns_used INTEGER NOT NULL, -- How many patterns were active (≥75% conditions)
  avg_pattern_accuracy NUMERIC(5,2) NOT NULL,
  trading_day_status JSONB NOT NULL, -- {isTradingDay, reason, nextTradingDay}

  -- Tracking
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL, -- generated_at + 24 hours

  -- Outcome verification (filled next day by verification cron)
  verified BOOLEAN DEFAULT FALSE,
  actual_outcomes JSONB, -- [{pair, predictedDirection, predictedMove, actualMove, correct}]
  accuracy_percentage NUMERIC(5,2), -- % of correct predictions
  verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE correlation_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own predictions"
  ON correlation_predictions FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_correlation_predictions_user_generated
  ON correlation_predictions(user_id, generated_at DESC);

CREATE INDEX idx_correlation_predictions_expires
  ON correlation_predictions(expires_at);

CREATE INDEX idx_correlation_predictions_unverified
  ON correlation_predictions(verified, generated_at DESC)
  WHERE verified = FALSE;

-- Comments
COMMENT ON TABLE correlation_predictions IS
'Auto-generated daily correlation predictions. Created at 5:30 AM UTC using complete market close data.';

COMMENT ON COLUMN correlation_predictions.predictions IS
'Full TomorrowPrediction payload including all matching patterns and detailed analysis';

COMMENT ON COLUMN correlation_predictions.verified IS
'Set to true once actual outcomes are compared against predictions (next day verification)';

COMMENT ON COLUMN correlation_predictions.accuracy_percentage IS
'Percentage of predictions that matched actual market movements (verified next day)';
