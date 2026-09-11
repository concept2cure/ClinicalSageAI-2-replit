-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Assumption Registry + Decision Records + Contradiction Engine + Overlays
-- Date: 2026-03-23
-- Sprint: Assumption Registry, Decision Architecture, Contradiction Detection,
--         Regulator/Body Overlays, Consequence Paths
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- AMENDED IN PLACE 2026-09-11 — WO-15 finding 7. Two columns, no DROP.
--
-- RULE 1: this file is in C2C_MIGRATION_FILES (index 42) and re-executes on
-- every deploy, so schema is removed by amending the creating statement, never
-- by appending a DROP. Both changes below are to CREATE TABLE IF NOT EXISTS
-- blocks and so affect only a database where the table does not yet exist.
--
-- 1. contradiction_consequence_log.execution_notes  ->  notes
--
--    The same table is created by migrations/20260524_contradiction_engine_
--    schema.sql with the column named `notes`, and THAT file is the one every
--    real database gets: deploy-migrate refuses an unprovisioned database, so
--    install-fresh provisions all of them and its step-3 overlay applies all of
--    migrations/*.sql. This file then runs later against a table that already
--    exists and no-ops — CREATE TABLE IF NOT EXISTS converges nothing.
--
--    So `execution_notes` was a name no provisioned database ever had, and the
--    four INSERTs in contradiction-resolution-orchestrator.ts that used it
--    raised 42703 on every database, every time, inside catch blocks that
--    discard the error. Verified by executing one verbatim against a
--    canonically provisioned database. Those writes now name `notes`; this file
--    is amended to agree so the two creators cannot diverge again.
--
-- 2. contradiction_findings.detected_by  ->  nullable, no default
--
--    Was `TEXT NOT NULL DEFAULT 'system'`; 20260524 declares it plain `TEXT`.
--    No code in the repository writes this column. A default of 'system' would
--    therefore stamp every finding with an attribution nothing recorded, which
--    is exactly the fabrication this codebase forbids. The honest shape is the
--    nullable one, and ContradictionFinding.detectedBy is retyped
--    `string | null` to match.
--
-- Convergence for any database that took the other path is in
-- migrations/20260911_contradiction_consequence_log_convergence.sql, since this
-- amendment alone cannot alter a table that already exists.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: ASSUMPTION REGISTRY
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assumption_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,

  -- Identity
  assumption_code TEXT NOT NULL,        -- e.g., 'ASM-CLIN-001'
  title TEXT NOT NULL,
  domain_track TEXT NOT NULL CHECK (domain_track IN (
    'clinical', 'nonclinical', 'cmc', 'biostatistics', 'regulatory',
    'pharmacology', 'safety', 'labeling', 'commercial'
  )),

  -- Structured value
  category TEXT NOT NULL CHECK (category IN (
    'efficacy', 'safety', 'statistical', 'design', 'population',
    'endpoint', 'dosing', 'manufacturing', 'regulatory_pathway',
    'comparator', 'dropout', 'missing_data', 'effect_size',
    'prevalence', 'enrollment', 'timeline', 'cost'
  )),
  assumed_value TEXT NOT NULL,          -- The actual assumption value
  unit TEXT,                            -- e.g., '%', 'mg', 'days'
  rationale TEXT NOT NULL,

  -- Source attribution
  source_type TEXT NOT NULL CHECK (source_type IN (
    'protocol', 'sap', 'literature', 'precedent', 'expert_opinion',
    'regulatory_guidance', 'historical_data', 'modeling', 'sponsor_decision'
  )),
  source_reference TEXT,               -- e.g., 'Protocol v3.0, Section 9.2'

  -- Confidence
  confidence_level TEXT NOT NULL CHECK (confidence_level IN (
    'definitive', 'high', 'moderate', 'low', 'speculative'
  )) DEFAULT 'moderate',

  -- Regulator/body compatibility
  applicable_regulators TEXT[],         -- ['FDA', 'EMA', 'PMDA'] or empty for universal

  -- Artifact linkage
  linked_artifact_id INTEGER,
  linked_artifact_version INTEGER,
  linked_section_code TEXT,            -- CTD section: '2.7.1', '3.2.P.5'

  -- Status / lifecycle
  status TEXT NOT NULL CHECK (status IN (
    'active', 'under_review', 'superseded', 'withdrawn', 'challenged'
  )) DEFAULT 'active',
  superseded_by UUID,                  -- FK to replacement assumption
  supersession_reason TEXT,

  -- Audit
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2: DECISION RECORDS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS decision_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,

  -- Identity
  decision_code TEXT NOT NULL,          -- e.g., 'DEC-REG-001'
  title TEXT NOT NULL,
  domain_track TEXT NOT NULL CHECK (domain_track IN (
    'clinical', 'nonclinical', 'cmc', 'biostatistics', 'regulatory',
    'pharmacology', 'safety', 'labeling', 'commercial'
  )),

  -- Recommendation
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN (
    'regulatory_strategy', 'study_design', 'endpoint_selection',
    'dose_selection', 'comparator_selection', 'statistical_method',
    'manufacturing_change', 'labeling_change', 'submission_timing',
    'risk_mitigation', 'protocol_amendment', 'data_package'
  )),
  recommendation_summary TEXT NOT NULL,
  recommendation_rationale TEXT,

  -- Confidence
  confidence_level TEXT NOT NULL CHECK (confidence_level IN (
    'definitive', 'high', 'moderate', 'low', 'speculative'
  )) DEFAULT 'moderate',
  evidence_basis TEXT CHECK (evidence_basis IN (
    'rules_based', 'validation_based', 'ai_inferred', 'expert_judgment', 'precedent_based'
  )),

  -- Action state (provisional vs executed distinction)
  action_state TEXT NOT NULL CHECK (action_state IN (
    'proposed', 'under_review', 'approved', 'rejected',
    'executed', 'deferred', 'escalated', 'superseded'
  )) DEFAULT 'proposed',

  -- Approval
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Executed artifact linkage
  executed_artifact_id INTEGER,
  executed_artifact_version INTEGER,
  executed_workflow_run_id UUID,

  -- Related assumptions
  related_assumption_ids UUID[],

  -- Escalation
  escalated_to TEXT,
  escalation_reason TEXT,

  -- Notes / provenance
  notes TEXT,
  decision_context JSONB DEFAULT '{}', -- Structured context at time of decision

  -- Audit
  decided_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 4: CONTRADICTION FINDINGS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contradiction_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  project_id INTEGER,

  -- Source classification (MANDATORY per §3)
  source_classification TEXT NOT NULL CHECK (source_classification IN (
    'structured_record_conflict',
    'deterministic_rule_conflict',
    'overlay_rule_conflict',
    'llm_assisted_semantic_conflict',
    'hybrid_conflict'
  )),

  -- Compared objects (§3: what structured objects are being compared?)
  object_a_type TEXT NOT NULL,
  object_a_id TEXT NOT NULL,
  object_a_label TEXT,
  object_b_type TEXT NOT NULL,
  object_b_id TEXT NOT NULL,
  object_b_label TEXT,

  -- Contradiction
  contradiction_type TEXT NOT NULL CHECK (contradiction_type IN (
    'assumption_drift', 'summary_body_tension',
    'recommendation_action_inconsistency', 'parameter_mismatch',
    'factual_contradiction', 'temporal_inconsistency',
    'regulatory_discrepancy', 'dosage_conflict',
    'outcome_divergence', 'procedural_conflict',
    'superseded_information', 'cross_jurisdictional_divergence',
    'protocol_sap_inconsistency', 'decision_action_inconsistency',
    'status_conflict'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),

  -- Source-of-truth hierarchy level (1=highest, 7=lowest)
  truth_hierarchy_level INTEGER NOT NULL CHECK (truth_hierarchy_level BETWEEN 1 AND 7),

  -- Confidence
  confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  confidence_level TEXT NOT NULL CHECK (confidence_level IN (
    'definitive', 'high', 'moderate', 'low', 'speculative'
  )),

  -- Content
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_summary TEXT,

  -- Deterministic rule used (§3)
  deterministic_rule TEXT,

  -- LLM role (§1, §3: explicit role)
  llm_role TEXT NOT NULL CHECK (llm_role IN (
    'none', 'explanation_only', 'refinement', 'primary_detection'
  )) DEFAULT 'none',
  llm_explanation TEXT,

  -- Regulator/body awareness
  regulator_body TEXT,
  overlay_rule_id UUID,
  regulator_severity_override TEXT CHECK (regulator_severity_override IN ('critical', 'high', 'medium', 'low')),

  -- Approval authority state (§2)
  authority_state TEXT NOT NULL CHECK (authority_state IN (
    'advisory_only', 'requires_review', 'requires_approval',
    'blocks_promotion', 'requires_escalation'
  )) DEFAULT 'advisory_only',

  -- Review state (§2: distinguishable from authority)
  review_state TEXT NOT NULL CHECK (review_state IN (
    'unresolved', 'under_review', 'reviewed',
    'approved_resolution', 'superseded'
  )) DEFAULT 'unresolved',

  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT,

  -- Consequence (§4)
  consequence_type TEXT CHECK (consequence_type IN (
    'contradiction_memo', 'review_thread', 'harmonization_rewrite',
    'assumption_supersession', 'escalation', 'dossier_review_attachment'
  )),
  consequence_object_id TEXT,
  consequence_executed BOOLEAN DEFAULT FALSE,

  -- Audit
  detected_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 5: OVERLAY RULES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contradiction_overlay_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,

  rule_code TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  regulator_body TEXT NOT NULL,
  jurisdiction TEXT,

  -- What it applies to
  contradiction_type TEXT NOT NULL,
  applicable_domains TEXT[],
  applicable_program_types TEXT[],

  -- Overrides
  severity_override TEXT CHECK (severity_override IN ('critical', 'high', 'medium', 'low')),
  authority_override TEXT CHECK (authority_override IN (
    'advisory_only', 'requires_review', 'requires_approval',
    'blocks_promotion', 'requires_escalation'
  )),
  consequence_override TEXT CHECK (consequence_override IN (
    'contradiction_memo', 'review_thread', 'harmonization_rewrite',
    'assumption_supersession', 'escalation', 'dossier_review_attachment'
  )),

  description TEXT NOT NULL,
  regulatory_reference TEXT,
  rationale TEXT,
  priority INTEGER DEFAULT 100,
  active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 6: CONSEQUENCE LOG
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contradiction_consequence_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  finding_id UUID NOT NULL REFERENCES contradiction_findings(id) ON DELETE CASCADE,

  consequence_type TEXT NOT NULL,
  consequence_object_id TEXT,
  consequence_object_type TEXT,

  executed_by TEXT NOT NULL,
  execution_status TEXT NOT NULL CHECK (execution_status IN ('pending', 'executed', 'failed')),
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_assumptions_org_project ON assumption_records(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_assumptions_domain ON assumption_records(domain_track);
CREATE INDEX IF NOT EXISTS idx_assumptions_status ON assumption_records(status);
CREATE INDEX IF NOT EXISTS idx_assumptions_category ON assumption_records(category);

CREATE INDEX IF NOT EXISTS idx_decisions_org_project ON decision_records(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_decisions_domain ON decision_records(domain_track);
CREATE INDEX IF NOT EXISTS idx_decisions_action_state ON decision_records(action_state);
CREATE INDEX IF NOT EXISTS idx_decisions_type ON decision_records(recommendation_type);

CREATE INDEX IF NOT EXISTS idx_contradictions_org ON contradiction_findings(organization_id);
CREATE INDEX IF NOT EXISTS idx_contradictions_project ON contradiction_findings(project_id);
CREATE INDEX IF NOT EXISTS idx_contradictions_type ON contradiction_findings(contradiction_type);
CREATE INDEX IF NOT EXISTS idx_contradictions_severity ON contradiction_findings(severity);
CREATE INDEX IF NOT EXISTS idx_contradictions_review ON contradiction_findings(review_state);
CREATE INDEX IF NOT EXISTS idx_contradictions_authority ON contradiction_findings(authority_state);

CREATE INDEX IF NOT EXISTS idx_overlay_org ON contradiction_overlay_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_overlay_body ON contradiction_overlay_rules(regulator_body);
CREATE INDEX IF NOT EXISTS idx_overlay_type ON contradiction_overlay_rules(contradiction_type);

CREATE INDEX IF NOT EXISTS idx_consequence_finding ON contradiction_consequence_log(finding_id);
