-- Operating-System Foundation Migration
-- Structured Assumptions, Auditable Decisions, Governance Boundaries,
-- Contradiction-Readiness Linkage
--
-- This migration creates the substrate for Concept2Cure's institutional operating logic.

-- ═══════════════════════════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE assumption_category AS ENUM (
    'effect_size', 'variance', 'event_rate', 'attrition',
    'endpoint', 'analysis_population', 'comparator', 'scenario',
    'regulator_overlay', 'missing_data', 'multiplicity', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE assumption_value_type AS ENUM ('numeric', 'text', 'enum', 'range', 'json');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE assumption_source_type AS ENUM ('artifact', 'manual', 'ana_generated', 'imported', 'historical_comparator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE assumption_confidence AS ENUM ('strong', 'moderate', 'provisional', 'uncertain');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE assumption_status AS ENUM ('draft', 'review', 'approved', 'superseded', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE decision_context_type AS ENUM (
    'regulatory_analysis', 'biostatistics_analysis', 'artifact_review',
    'scenario_comparison', 'risk_assessment', 'document_generation',
    'submission_readiness', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE decision_action_state AS ENUM ('recommended_only', 'prepared', 'executed', 'rejected', 'superseded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE decision_approval_state AS ENUM ('not_required', 'pending_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE decision_escalation_state AS ENUM ('none', 'recommended', 'opened', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE decision_confidence AS ENUM ('strong', 'moderate', 'provisional', 'uncertain');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE governance_boundary AS ENUM ('advisory', 'governed_draft', 'approved', 'locked', 'submission_ready');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE domain_track AS ENUM ('biotech', 'device', 'diagnostics', 'combination', 'biosimilar');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ASSUMPTION RECORDS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assumption_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Classification
  category assumption_category NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- Value
  value_type assumption_value_type NOT NULL DEFAULT 'text',
  numeric_value REAL,
  text_value TEXT,
  json_value JSONB,
  unit TEXT,

  -- Rationale
  rationale TEXT,

  -- Source attribution
  source_type assumption_source_type DEFAULT 'manual',
  source_artifact_id INTEGER REFERENCES concept2cure_artifacts(id),
  source_artifact_version_id INTEGER REFERENCES concept2cure_artifact_versions(id),
  source_run_id UUID,
  source_description TEXT,

  -- Domain & regulatory context
  domain_track domain_track,
  regulator_body TEXT,
  jurisdiction TEXT,
  regulatory_reference TEXT,

  -- Confidence & lifecycle
  confidence assumption_confidence DEFAULT 'provisional',
  status assumption_status NOT NULL DEFAULT 'draft',

  -- Version & supersession
  version INTEGER NOT NULL DEFAULT 1,
  superseded_by_id UUID,
  supersession_reason TEXT,

  -- Contradiction-readiness linkage
  linked_artifact_ids JSONB DEFAULT '[]'::jsonb,
  linked_artifact_version_ids JSONB DEFAULT '[]'::jsonb,
  linked_section_codes JSONB DEFAULT '[]'::jsonb,
  linked_decision_ids JSONB DEFAULT '[]'::jsonb,

  -- Review/approval
  reviewed_by_id INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  approved_by_id INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  rejected_by_id INTEGER REFERENCES users(id),
  rejected_at TIMESTAMP,
  rejection_reason TEXT,

  -- Audit
  created_by_id INTEGER REFERENCES users(id),
  updated_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assumption_project_idx ON assumption_records(project_id);
CREATE INDEX IF NOT EXISTS assumption_org_idx ON assumption_records(organization_id);
CREATE INDEX IF NOT EXISTS assumption_category_idx ON assumption_records(category);
CREATE INDEX IF NOT EXISTS assumption_status_idx ON assumption_records(status);
CREATE INDEX IF NOT EXISTS assumption_confidence_idx ON assumption_records(confidence);
CREATE INDEX IF NOT EXISTS assumption_regulator_body_idx ON assumption_records(regulator_body);
CREATE INDEX IF NOT EXISTS assumption_source_artifact_idx ON assumption_records(source_artifact_id);
CREATE INDEX IF NOT EXISTS assumption_superseded_by_idx ON assumption_records(superseded_by_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ASSUMPTION HISTORY
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assumption_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assumption_id UUID NOT NULL,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),

  version INTEGER NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  value_type TEXT NOT NULL,
  numeric_value REAL,
  text_value TEXT,
  json_value JSONB,
  unit TEXT,
  rationale TEXT,
  confidence TEXT,
  status TEXT NOT NULL,
  regulator_body TEXT,
  jurisdiction TEXT,

  change_action TEXT NOT NULL,
  change_reason TEXT,
  changed_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assumption_history_assumption_idx ON assumption_history(assumption_id);
CREATE INDEX IF NOT EXISTS assumption_history_org_idx ON assumption_history(organization_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. DECISION RECORDS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS decision_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Context
  context_type decision_context_type NOT NULL,
  context_description TEXT,

  -- Related objects
  related_artifact_id INTEGER REFERENCES concept2cure_artifacts(id),
  related_artifact_version_id INTEGER REFERENCES concept2cure_artifact_versions(id),
  related_run_id UUID,
  related_assumption_ids JSONB DEFAULT '[]'::jsonb,

  -- Recommendation
  recommendation_type TEXT,
  recommendation_summary TEXT NOT NULL,
  recommendation_detail TEXT,

  -- Confidence
  confidence decision_confidence NOT NULL DEFAULT 'provisional',
  evidence_sources JSONB DEFAULT '[]'::jsonb,

  -- Action state
  action_state decision_action_state NOT NULL DEFAULT 'recommended_only',
  action_description TEXT,

  -- Approval state
  approval_state decision_approval_state DEFAULT 'not_required',

  -- Escalation
  escalation_state decision_escalation_state DEFAULT 'none',
  escalation_reason TEXT,
  escalation_resolved_at TIMESTAMP,

  -- Executed artifact linkage
  executed_artifact_id INTEGER REFERENCES concept2cure_artifacts(id),
  executed_artifact_version_id INTEGER REFERENCES concept2cure_artifact_versions(id),

  -- Domain & regulatory context
  domain_track domain_track,
  regulator_body TEXT,
  jurisdiction TEXT,
  regulatory_reference TEXT,

  -- Governance boundary
  governance_boundary governance_boundary DEFAULT 'advisory',

  -- Supersession
  superseded_by_id UUID,
  supersession_reason TEXT,

  -- Contradiction-readiness
  linked_section_codes JSONB DEFAULT '[]'::jsonb,
  linked_assumption_ids JSONB DEFAULT '[]'::jsonb,

  -- Notes / provenance
  notes TEXT,
  provenance JSONB,

  -- Approval tracking
  approved_by_id INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  rejected_by_id INTEGER REFERENCES users(id),
  rejected_at TIMESTAMP,
  rejection_reason TEXT,

  -- Audit
  created_by_id INTEGER REFERENCES users(id),
  updated_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS decision_project_idx ON decision_records(project_id);
CREATE INDEX IF NOT EXISTS decision_org_idx ON decision_records(organization_id);
CREATE INDEX IF NOT EXISTS decision_context_type_idx ON decision_records(context_type);
CREATE INDEX IF NOT EXISTS decision_action_state_idx ON decision_records(action_state);
CREATE INDEX IF NOT EXISTS decision_approval_state_idx ON decision_records(approval_state);
CREATE INDEX IF NOT EXISTS decision_confidence_idx ON decision_records(confidence);
CREATE INDEX IF NOT EXISTS decision_regulator_body_idx ON decision_records(regulator_body);
CREATE INDEX IF NOT EXISTS decision_related_artifact_idx ON decision_records(related_artifact_id);
CREATE INDEX IF NOT EXISTS decision_executed_artifact_idx ON decision_records(executed_artifact_id);
CREATE INDEX IF NOT EXISTS decision_governance_boundary_idx ON decision_records(governance_boundary);
CREATE INDEX IF NOT EXISTS decision_superseded_by_idx ON decision_records(superseded_by_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. GOVERNANCE BOUNDARY RULES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS governance_boundary_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,

  rule_name TEXT NOT NULL,
  rule_description TEXT,

  from_boundary governance_boundary NOT NULL,
  to_boundary governance_boundary NOT NULL,

  requires_review BOOLEAN NOT NULL DEFAULT false,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  requires_all_assumptions_approved BOOLEAN NOT NULL DEFAULT false,
  requires_all_decisions_resolved BOOLEAN NOT NULL DEFAULT false,
  minimum_confidence TEXT,
  required_roles JSONB DEFAULT '[]'::jsonb,

  artifact_types JSONB DEFAULT '[]'::jsonb,
  domain_track domain_track,
  regulator_body TEXT,

  is_active BOOLEAN NOT NULL DEFAULT true,

  created_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS governance_rule_org_idx ON governance_boundary_rules(organization_id);
CREATE INDEX IF NOT EXISTS governance_rule_project_idx ON governance_boundary_rules(project_id);
CREATE INDEX IF NOT EXISTS governance_rule_transition_idx ON governance_boundary_rules(from_boundary, to_boundary);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. GOVERNANCE BOUNDARY TRANSITIONS LOG
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS governance_boundary_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),

  artifact_id INTEGER REFERENCES concept2cure_artifacts(id),
  decision_id UUID,
  assumption_id UUID,

  from_boundary governance_boundary NOT NULL,
  to_boundary governance_boundary NOT NULL,
  rule_id UUID,

  transition_allowed BOOLEAN NOT NULL,
  blocked_reasons JSONB DEFAULT '[]'::jsonb,

  actor_id INTEGER REFERENCES users(id),
  actor_role TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS governance_transition_org_idx ON governance_boundary_transitions(organization_id);
CREATE INDEX IF NOT EXISTS governance_transition_project_idx ON governance_boundary_transitions(project_id);
CREATE INDEX IF NOT EXISTS governance_transition_artifact_idx ON governance_boundary_transitions(artifact_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. CONTRADICTION LINKS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contradiction_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_label TEXT,

  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_label TEXT,

  comparison_type TEXT NOT NULL,
  field_path TEXT,

  domain_track domain_track,
  regulator_body TEXT,
  section_codes JSONB DEFAULT '[]'::jsonb,

  is_active BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMP,
  inconsistency_detected BOOLEAN DEFAULT false,
  inconsistency_detail TEXT,

  created_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contradiction_link_org_idx ON contradiction_links(organization_id);
CREATE INDEX IF NOT EXISTS contradiction_link_project_idx ON contradiction_links(project_id);
CREATE INDEX IF NOT EXISTS contradiction_link_source_idx ON contradiction_links(source_type, source_id);
CREATE INDEX IF NOT EXISTS contradiction_link_target_idx ON contradiction_links(target_type, target_id);
CREATE INDEX IF NOT EXISTS contradiction_link_comparison_idx ON contradiction_links(comparison_type);
