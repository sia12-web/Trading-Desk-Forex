-- 20260401_create_indicator_calibrations.sql
-- Store optimized indicator settings per user/pair/timeframe

CREATE TABLE IF NOT EXISTS public.indicator_calibrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pair TEXT NOT NULL,
    timeframe TEXT NOT NULL, -- M, W, D, H4, H1
    settings JSONB NOT NULL, -- { RSI: { period: 10, ... }, MACD: { ... } }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, pair, timeframe)
);

-- Enable RLS
ALTER TABLE public.indicator_calibrations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own calibrations"
    ON public.indicator_calibrations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert/update their own calibrations"
    ON public.indicator_calibrations FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.indicator_calibrations
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Add index for performance
CREATE INDEX idx_indicator_calibrations_user_pair ON public.indicator_calibrations(user_id, pair);
