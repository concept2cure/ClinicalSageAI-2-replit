-- Goal plan runtime persistence
-- Stores generated plan graphs and step status transitions for auditable execution.

CREATE TABLE IF NOT EXISTS ai_goal_plan_runs (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  organization_id INTEGER,
  thread_id TEXT,
  route TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  goal_plan JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_goal_plan_runs_org_created
  ON ai_goal_plan_runs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_goal_plan_runs_thread
  ON ai_goal_plan_runs(thread_id);

