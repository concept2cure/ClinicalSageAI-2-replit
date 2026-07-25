-- Background deep-research investigations
--
-- A deep investigation is an agentic research run that outlives the chat
-- request that started it: AnA kicks it off with start_deep_investigation,
-- the runner executes a thorough multi-round tool loop out-of-band, progress
-- events + a heartbeat are persisted here, and the user (via AnA's
-- check_deep_investigation tool) gets honest status — including "stalled"
-- when a server restart orphaned a run. Idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS ana_deep_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INT,
  user_id INT,
  project_id INT,
  question TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | running | completed | failed
  -- Append-only progress events: [{at, note}] — one per tool execution.
  progress JSONB NOT NULL DEFAULT '[]'::jsonb,
  result_text TEXT,
  error TEXT,
  tool_call_count INT NOT NULL DEFAULT 0,
  model TEXT,
  provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ana_deep_investigations_org_recent
  ON ana_deep_investigations (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ana_deep_investigations_running
  ON ana_deep_investigations (status) WHERE status IN ('queued', 'running');
