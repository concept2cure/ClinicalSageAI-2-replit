-- Decision Receipts Persistence — Pass 12
-- Creates the decision_receipts table for durable receipt storage.
-- Receipts prove what happened after a decision was confirmed/executed.

CREATE TABLE IF NOT EXISTS decision_receipts (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  project_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL DEFAULT 1,

  -- Recommendation
  recommendation_summary TEXT,
  recommendation_action_ids JSONB DEFAULT '[]',
  recommendation_rationale TEXT,

  -- Confirmation
  confirmation_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_by_id TEXT,
  confirmed_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Execution
  execution_executed BOOLEAN NOT NULL DEFAULT FALSE,
  executed_at TIMESTAMPTZ,
  executed_by_id TEXT,
  execution_method TEXT,
  execution_error TEXT,

  -- Affected objects
  affected_objects JSONB DEFAULT '[]',

  -- Pending approvals
  pending_approvals JSONB DEFAULT '[]',

  -- Provisional items
  provisional_items JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_receipts_decision ON decision_receipts(decision_id);
CREATE INDEX IF NOT EXISTS idx_decision_receipts_project ON decision_receipts(project_id);
CREATE INDEX IF NOT EXISTS idx_decision_receipts_org ON decision_receipts(organization_id);
