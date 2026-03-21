-- Migration 0007: Phase 3 Orchestration Infrastructure
-- Implements: Workflow Run Persistence, Approval Checkpoints, Readiness Rules Registry,
--             Readiness Evaluations, Project Intelligence Summaries
--
-- Supports 10 Phase 3 enhancement directives:
--   #1 Workflow Run Record, #2 Approval Checkpoints, #3 Diff/Review Surface (JSON),
--   #4 Readiness Rules Registry, #5 Deterministic/AI separation (step metadata),
--   #6 Confidence/Evidence Contract (JSON), #7 Resume/Retry (status fields),
--   #8 Project Intelligence Summary, #9 Single anchor workspace (query pattern),
--   #10 Scope discipline (workflow type + scope constraints)

-- ═══════════════════════════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE workflow_run_status AS ENUM (
    'pending', 'running', 'paused', 'awaiting_approval', 'completed', 'failed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE workflow_step_status AS ENUM (
    'proposed', 'awaiting_review', 'approved', 'executed', 'failed', 'skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE approval_gate_type AS ENUM (
    'manual', 'role_based', 'quorum', 'auto_on_pass'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trigger_source AS ENUM (
    'user_action', 'schedule', 'api_call', 'event_hook', 'ai_recommendation'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE actor_type AS ENUM (
    'user', 'ai_deterministic', 'ai_reasoning', 'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE evidence_class AS ENUM (
    'rules_based', 'validation_based', 'ai_inferred'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE confidence_level AS ENUM (
    'definitive', 'high', 'moderate', 'low', 'speculative'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE readiness_rule_type AS ENUM (
    'required_item', 'validation_check', 'quality_gate', 'cross_reference', 'completeness_check'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. WORKFLOW RUNS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,

  -- Identity
  workflow_type TEXT NOT NULL,
  workflow_version TEXT DEFAULT '1.0',
  display_name TEXT NOT NULL,

  -- Trigger
  trigger_source trigger_source NOT NULL,
  triggered_by TEXT NOT NULL,

  -- Scope
  project_id INTEGER,
  program_id UUID,
  module_scope TEXT,

  -- Execution state (supports pause/resume/retry)
  status workflow_run_status NOT NULL DEFAULT 'pending',
  current_step_index INTEGER DEFAULT 0,
  last_successful_step_index INTEGER,

  -- Steps executed (full record)
  steps_executed JSONB DEFAULT '[]'::jsonb,

  -- Objects touched and outputs created
  objects_touched JSONB DEFAULT '[]'::jsonb,
  outputs_created JSONB DEFAULT '[]'::jsonb,

  -- Blockers encountered
  blockers JSONB DEFAULT '[]'::jsonb,

  -- Error info
  error_message TEXT,
  error_step_index INTEGER,

  -- Diff summaries (enhancement #3)
  diff_summaries JSONB DEFAULT '[]'::jsonb,

  -- Recommendations (enhancement #6)
  recommendations JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  started_at TIMESTAMP,
  paused_at TIMESTAMP,
  resumed_at TIMESTAMP,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wf_runs_org_status ON workflow_runs(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_wf_runs_type ON workflow_runs(workflow_type);
CREATE INDEX IF NOT EXISTS idx_wf_runs_project ON workflow_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_wf_runs_program ON workflow_runs(program_id);
CREATE INDEX IF NOT EXISTS idx_wf_runs_created ON workflow_runs(created_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. APPROVAL CHECKPOINTS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS approval_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,

  -- Gate definition
  step_index INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  gate_type approval_gate_type NOT NULL,
  is_configurable BOOLEAN NOT NULL DEFAULT true,

  -- Status
  status workflow_step_status NOT NULL DEFAULT 'proposed',

  -- Approver requirements
  required_approver_roles JSONB DEFAULT '[]'::jsonb,
  required_approver_count INTEGER DEFAULT 1,

  -- Approvals received
  approvals JSONB DEFAULT '[]'::jsonb,

  -- Rejection / skip info
  rejection_reason TEXT,
  skip_reason TEXT,
  skipped_by TEXT,

  -- What this gate protects
  protected_action TEXT NOT NULL,
  protected_object_ids JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  proposed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  review_started_at TIMESTAMP,
  resolved_at TIMESTAMP,

  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_ckpts_run ON approval_checkpoints(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_approval_ckpts_status ON approval_checkpoints(status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. READINESS RULES REGISTRY
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS readiness_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,

  -- Scope
  program_type TEXT NOT NULL,
  module_type TEXT,
  document_type TEXT,

  -- Rule definition
  rule_type readiness_rule_type NOT NULL,
  rule_code VARCHAR(100) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- What must be present / pass
  expected_item TEXT NOT NULL,
  validation_expression TEXT,

  -- Severity if missing
  severity TEXT NOT NULL DEFAULT 'blocker',

  -- Regulatory reference
  regulatory_reference TEXT,
  guidance_reference TEXT,

  -- Active/versioned
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,

  -- Audit
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_readiness_rules_org_type ON readiness_rules(organization_id, program_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_readiness_rules_code ON readiness_rules(organization_id, rule_code);
CREATE INDEX IF NOT EXISTS idx_readiness_rules_active ON readiness_rules(is_active);

-- ═══════════════════════════════════════════════════════════════════════════════
-- READINESS EVALUATIONS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS readiness_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
  organization_id INTEGER NOT NULL,
  project_id INTEGER,
  program_id UUID,

  -- Evaluation results
  evaluated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  evaluated_by TEXT NOT NULL,

  -- Breakdown by class (rules-based vs validation vs AI-inferred)
  rules_based_findings JSONB DEFAULT '[]'::jsonb,
  validation_findings JSONB DEFAULT '[]'::jsonb,
  ai_inferred_findings JSONB DEFAULT '[]'::jsonb,

  -- Aggregate scores
  overall_score DECIMAL(5,2),
  blocker_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  advisory_count INTEGER DEFAULT 0,
  passed_count INTEGER DEFAULT 0,

  -- Readiness verdict
  is_ready BOOLEAN NOT NULL DEFAULT false,
  readiness_gate TEXT,

  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_readiness_evals_run ON readiness_evaluations(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_readiness_evals_project ON readiness_evaluations(project_id);
CREATE INDEX IF NOT EXISTS idx_readiness_evals_program ON readiness_evaluations(program_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. PROJECT INTELLIGENCE SUMMARIES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_intelligence_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  program_id UUID,

  -- Current blockers
  current_blockers JSONB DEFAULT '[]'::jsonb,

  -- Recent changes (rolling window)
  recent_changes JSONB DEFAULT '[]'::jsonb,

  -- Important decisions (append-only)
  important_decisions JSONB DEFAULT '[]'::jsonb,

  -- Unresolved risks
  unresolved_risks JSONB DEFAULT '[]'::jsonb,

  -- Readiness status snapshot
  readiness_status JSONB,

  -- Last workflow outcomes
  last_workflow_outcomes JSONB DEFAULT '[]'::jsonb,

  -- Next recommended actions
  next_recommended_actions JSONB DEFAULT '[]'::jsonb,

  -- Version counter
  version INTEGER NOT NULL DEFAULT 1,

  -- Timestamps
  last_updated_by TEXT,
  last_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proj_intel_project ON project_intelligence_summaries(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_proj_intel_program ON project_intelligence_summaries(program_id);
