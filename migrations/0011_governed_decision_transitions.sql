-- Migration: Governed Decision Transition Log
-- Durable event log for every governed decision lifecycle transition.
-- Each row records one state change (review, approve, reject, escalate, etc.)

CREATE TABLE IF NOT EXISTS governed_decision_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Transition
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  action TEXT NOT NULL,

  -- Actor
  actor_id TEXT NOT NULL,
  actor_role TEXT,

  -- Context
  reason TEXT,
  notes TEXT,

  -- Linked objects
  linked_artifact_id TEXT,
  linked_package_id TEXT,
  linked_workflow_run_id TEXT,
  superseded_by_decision_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gdt_decision_id ON governed_decision_transitions(decision_id);
CREATE INDEX IF NOT EXISTS idx_gdt_org_project ON governed_decision_transitions(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_gdt_to_state ON governed_decision_transitions(to_state);
CREATE INDEX IF NOT EXISTS idx_gdt_created_at ON governed_decision_transitions(created_at);
