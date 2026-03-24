-- Kernel Decision Records (KDR)
-- Purpose: Persist orchestration/model/tool routing decisions for auditability
-- and future adaptive scheduling policy training.

CREATE TABLE IF NOT EXISTS ai_kernel_decision_records (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  request_id TEXT,
  thread_id TEXT,
  route TEXT NOT NULL,

  organization_id INTEGER,
  user_id INTEGER,
  project_id INTEGER,

  planner_version TEXT NOT NULL DEFAULT 'ana-ri-kernel-v1',
  orchestrator_name TEXT NOT NULL,

  intent_lens TEXT,
  intent_confidence NUMERIC(6,5),
  submission_type TEXT,

  selected_task_type TEXT,
  selected_provider TEXT,
  selected_model TEXT,
  routing_strategy TEXT,
  selected_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  alternatives JSONB NOT NULL DEFAULT '[]'::jsonb,
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,

  decision_rationale TEXT,
  estimated_cost_usd NUMERIC(12,6),
  latency_ms INTEGER,
  outcome TEXT CHECK (outcome IN ('success', 'failed', 'partial')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_kdr_created_at
  ON ai_kernel_decision_records(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kdr_thread
  ON ai_kernel_decision_records(thread_id);

CREATE INDEX IF NOT EXISTS idx_kdr_org_route_created
  ON ai_kernel_decision_records(organization_id, route, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kdr_project_created
  ON ai_kernel_decision_records(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kdr_outcome_created
  ON ai_kernel_decision_records(outcome, created_at DESC);

