-- Add title column to ai_threads for auto-generated conversation titles
-- Claude.ai parity: titles are auto-generated from first message

ALTER TABLE ai_threads ADD COLUMN IF NOT EXISTS title TEXT DEFAULT NULL;
ALTER TABLE ai_threads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index for sorting by recent activity
CREATE INDEX IF NOT EXISTS idx_ai_threads_updated ON ai_threads (updated_at DESC);
