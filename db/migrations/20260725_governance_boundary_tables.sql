-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Governance boundary rules + transitions (canonical lineage)
-- Date: 2026-07-25
-- Conflict: C-8 / C-9 (docs/architecture/C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md)
--
-- WHY THIS EXISTS
-- These two tables were previously defined ONLY in
-- migrations/0010_operating_system_foundation.sql — a file with no execution
-- path (not journaled by Drizzle, not in shared/schema.ts's push surface, not
-- applied by apply-c2c-migrations.mjs). In every deployed environment the
-- tables therefore do not exist, evaluateTransition() throws on first touch,
-- callers swallow the throw, and the entire governance boundary layer —
-- promotion gates AND the transition audit trail — has never executed.
--
-- This migration gives the layer real storage in the manifest-managed lineage.
-- Shapes mirror shared/schema/operating-system.ts (governanceBoundaryRules /
-- governanceBoundaryTransitions) so the service's Drizzle queries work
-- unchanged; column style (TEXT + CHECK, TIMESTAMPTZ, JSONB) follows this
-- lineage's conventions per ADR-0006/C-9.
--
-- ROLLBACK: both tables are new and start empty.
--   DROP TABLE IF EXISTS governance_boundary_transitions;
--   DROP TABLE IF EXISTS governance_boundary_rules;
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS governance_boundary_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,

  -- Rule definition
  rule_name TEXT NOT NULL,
  rule_description TEXT,

  -- Transition being governed
  from_boundary TEXT NOT NULL CHECK (from_boundary IN (
    'advisory', 'governed_draft', 'approved', 'locked', 'submission_ready'
  )),
  to_boundary TEXT NOT NULL CHECK (to_boundary IN (
    'advisory', 'governed_draft', 'approved', 'locked', 'submission_ready'
  )),

  -- Conditions
  requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  requires_all_assumptions_approved BOOLEAN NOT NULL DEFAULT FALSE,
  requires_all_decisions_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  minimum_confidence TEXT,
  required_roles JSONB DEFAULT '[]'::jsonb,

  -- Scope
  artifact_types JSONB DEFAULT '[]'::jsonb,
  -- Deliberately unconstrained TEXT: the two lineages assign this column
  -- different concepts (modality vs discipline). ADR-0007 splits it; a CHECK
  -- here would prejudge that decision.
  domain_track TEXT,
  regulator_body TEXT,

  -- State
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Audit
  created_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS governance_rule_org_idx
  ON governance_boundary_rules(organization_id);
CREATE INDEX IF NOT EXISTS governance_rule_project_idx
  ON governance_boundary_rules(project_id);
CREATE INDEX IF NOT EXISTS governance_rule_transition_idx
  ON governance_boundary_rules(from_boundary, to_boundary);

-- Append-only log of every boundary transition attempt (allowed or blocked).
-- This is the audit trail master §2 requires; it must survive even when the
-- transition is denied.
CREATE TABLE IF NOT EXISTS governance_boundary_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),

  -- What transitioned
  artifact_id INTEGER REFERENCES concept2cure_artifacts(id),
  decision_id UUID,
  assumption_id UUID,

  -- Transition
  from_boundary TEXT NOT NULL CHECK (from_boundary IN (
    'advisory', 'governed_draft', 'approved', 'locked', 'submission_ready'
  )),
  to_boundary TEXT NOT NULL CHECK (to_boundary IN (
    'advisory', 'governed_draft', 'approved', 'locked', 'submission_ready'
  )),
  rule_id UUID,

  -- Outcome
  transition_allowed BOOLEAN NOT NULL,
  blocked_reasons JSONB DEFAULT '[]'::jsonb,

  -- Actor
  actor_id INTEGER REFERENCES users(id),
  actor_role TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS governance_transition_org_idx
  ON governance_boundary_transitions(organization_id);
CREATE INDEX IF NOT EXISTS governance_transition_project_idx
  ON governance_boundary_transitions(project_id);
CREATE INDEX IF NOT EXISTS governance_transition_artifact_idx
  ON governance_boundary_transitions(artifact_id);
