-- Goal plan step events (append-only runtime audit trail)

CREATE TABLE IF NOT EXISTS ai_goal_plan_step_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  plan_run_id TEXT NOT NULL,
  step_id TEXT,
  event_type TEXT NOT NULL,     -- run_created | step_advanced | step_executed | run_completed | run_failed
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_goal_step_events_plan_created
  ON ai_goal_plan_step_events(plan_run_id, created_at DESC);

