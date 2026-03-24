-- Kernel agent protocol events
-- Captures structured collaboration messages for plan runs.

CREATE TABLE IF NOT EXISTS ai_kernel_agent_protocol_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  plan_run_id TEXT NOT NULL,
  organization_id INTEGER,
  actor_type TEXT NOT NULL,      -- agent | human | system
  actor_id TEXT,
  message_type TEXT NOT NULL,    -- proposal | critique | evidence_request | decision
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_agent_protocol_plan_created
  ON ai_kernel_agent_protocol_events(plan_run_id, created_at DESC);

