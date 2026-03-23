-- Migration: Biostats Signal Engine Tables
-- Creates tables for biostatistics signals, proof receipts,
-- assumption findings, resolution plans, and regulatory conflicts.

-- ═══════════════════════════════════════════════════════════════════════════
-- BIOSTAT SIGNALS (core signal records)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS biostat_signals (
  id UUID PRIMARY KEY,
  signal_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  study_id INTEGER,
  source_artifacts JSONB DEFAULT '[]',
  affected_artifacts JSONB DEFAULT '[]',
  computation JSONB NOT NULL,
  actions JSONB DEFAULT '[]',
  contradiction_ids JSONB DEFAULT '[]',
  resolution_plan_id UUID,
  evidence_class TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'superseded')),
  resolved_at TIMESTAMP,
  resolved_by TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biostat_signals_org_project
  ON biostat_signals (organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_biostat_signals_status
  ON biostat_signals (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_biostat_signals_type
  ON biostat_signals (signal_type);
CREATE INDEX IF NOT EXISTS idx_biostat_signals_severity
  ON biostat_signals (severity);

-- ═══════════════════════════════════════════════════════════════════════════
-- BIOSTAT SIGNAL RECEIPTS (audit proof for every evaluation)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS biostat_signal_receipts (
  id UUID PRIMARY KEY,
  signal_id UUID NOT NULL REFERENCES biostat_signals(id),
  signal_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  project_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  evaluation_context JSONB,
  computation JSONB NOT NULL,
  actions_triggered JSONB DEFAULT '[]',
  contradictions_created JSONB DEFAULT '[]',
  assumptions_updated JSONB DEFAULT '[]',
  resolution_plans_created JSONB DEFAULT '[]',
  source_artifacts JSONB DEFAULT '[]',
  affected_artifacts JSONB DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biostat_receipts_signal
  ON biostat_signal_receipts (signal_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- BIOSTAT ASSUMPTION FINDINGS (wired into assumption registry)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS biostat_assumption_findings (
  id UUID PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  study_id INTEGER,
  rule_code TEXT NOT NULL,
  finding_type TEXT NOT NULL CHECK (finding_type IN ('passed', 'missing', 'incomplete', 'invalid', 'warning')),
  severity TEXT NOT NULL CHECK (severity IN ('blocker', 'warning', 'advisory', 'info')),
  expected_item TEXT NOT NULL,
  actual_state TEXT NOT NULL,
  evidence_class TEXT NOT NULL,
  regulatory_reference TEXT,
  recommendation TEXT,
  signal_id UUID REFERENCES biostat_signals(id),
  signal_type TEXT,
  computation_proof JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biostat_assumptions_org_project
  ON biostat_assumption_findings (organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_biostat_assumptions_severity
  ON biostat_assumption_findings (severity);

-- ═══════════════════════════════════════════════════════════════════════════
-- BIOSTAT RESOLUTION PLANS (wired into resolution orchestrator)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS biostat_resolution_plans (
  id UUID PRIMARY KEY,
  signal_id UUID NOT NULL REFERENCES biostat_signals(id),
  signal_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  study_id INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  required_actions JSONB DEFAULT '[]',
  computation_proof JSONB,
  source_artifacts JSONB DEFAULT '[]',
  blocking_submission BOOLEAN NOT NULL DEFAULT FALSE,
  requires_human_review BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'deferred', 'cancelled')),
  resolved_at TIMESTAMP,
  resolved_by TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biostat_resolutions_org_project
  ON biostat_resolution_plans (organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_biostat_resolutions_status
  ON biostat_resolution_plans (status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_biostat_resolutions_blocking
  ON biostat_resolution_plans (blocking_submission) WHERE blocking_submission = TRUE;

-- ═══════════════════════════════════════════════════════════════════════════
-- REGULATORY CONFLICTS (for contradiction engine integration)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS regulatory_conflicts (
  id UUID PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  conflict_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence JSONB,
  source_signal_id UUID,
  source_signal_type TEXT,
  suggested_resolution TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed')),
  resolved_at TIMESTAMP,
  resolved_by TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regulatory_conflicts_org_project
  ON regulatory_conflicts (organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_regulatory_conflicts_status
  ON regulatory_conflicts (status) WHERE status = 'open';
