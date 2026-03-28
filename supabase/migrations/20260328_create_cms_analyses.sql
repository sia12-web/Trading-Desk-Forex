-- CMS Engine V2: Conditional Market Shaping Analysis Results
-- Stores programmatic condition analysis results per user+pair

CREATE TABLE cms_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pair VARCHAR(10) NOT NULL,
    result JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE(user_id, pair)
);

-- RLS
ALTER TABLE cms_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own CMS analyses"
    ON cms_analyses FOR ALL
    USING (auth.uid() = user_id);

-- Index for efficient lookups
CREATE INDEX idx_cms_analyses_user_pair
    ON cms_analyses(user_id, pair);

CREATE INDEX idx_cms_analyses_expires
    ON cms_analyses(expires_at);

-- Auto-cleanup trigger (optional, but good practice)
-- Deletes expired results daily to keep table lean
CREATE OR REPLACE FUNCTION delete_expired_cms_analyses()
RETURNS void AS $$
BEGIN
    DELETE FROM cms_analyses WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Note: Actual cleanup would be triggered by a cron job or pg_cron
-- This function just provides the cleanup logic
