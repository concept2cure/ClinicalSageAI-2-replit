-- Kernel adaptive-policy outcomes (bandit seed data)
-- Captures per-route/task/strategy execution quality to inform policy hints.

CREATE TABLE IF NOT EXISTS ai_kernel_policy_outcomes (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  organization_id INTEGER,
  route TEXT NOT NULL,
  task_type TEXT NOT NULL,
  strategy TEXT NOT NULL,

  request_id TEXT,
  thread_id TEXT,
  model_provider TEXT,
  model_name TEXT,

  quality_score NUMERIC(6,5) NOT NULL,
  latency_ms INTEGER,
  estimated_cost_usd NUMERIC(12,6),
  success BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_kernel_policy_route_task
  ON ai_kernel_policy_outcomes(route, task_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kernel_policy_org_route
  ON ai_kernel_policy_outcomes(organization_id, route, created_at DESC);

