-- Migration: Project Charter, Timeline Phases & Commitments
-- Date: 2026-03-27
-- Description: Regulatory project charter system with submission-specific templates,
--              phase-based timeline, and commitment tracking with 21 CFR Part 11 signing.

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROJECT CHARTERS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_charters (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,

  -- Submission classification
  submission_type TEXT NOT NULL,      -- IND, NDA, BLA, 510K, PMA, MAA, DE_NOVO, EUA, IVDR
  regulatory_region TEXT NOT NULL,    -- FDA, EMA, PMDA, MHRA, HealthCanada, TGA, NMPA
  product_name TEXT NOT NULL,
  product_type TEXT,                  -- drug, biologic, device, combination, ivd
  indication TEXT,
  target_population TEXT,

  -- Device-specific
  predicate_devices JSONB,
  device_class TEXT,
  product_code TEXT,

  -- Strategy
  regulatory_strategy TEXT,
  critical_success_factors JSONB,
  risk_mitigation_plan TEXT,
  communication_plan TEXT,
  quality_targets JSONB,

  -- Dates
  target_submission_date TIMESTAMP,
  target_approval_date TIMESTAMP,

  -- Custom instructions
  custom_instructions TEXT,

  -- Approval workflow
  approval_status TEXT DEFAULT 'draft',
  approved_by INTEGER,
  approved_at TIMESTAMP,

  -- Audit
  created_by INTEGER,
  updated_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS proj_charter_org_idx ON project_charters(organization_id);
CREATE INDEX IF NOT EXISTS proj_charter_project_idx ON project_charters(project_id);
CREATE INDEX IF NOT EXISTS proj_charter_type_idx ON project_charters(submission_type);
CREATE INDEX IF NOT EXISTS proj_charter_status_idx ON project_charters(approval_status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CHARTER SECTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS charter_sections (
  id SERIAL PRIMARY KEY,
  charter_id INTEGER NOT NULL REFERENCES project_charters(id) ON DELETE CASCADE,
  parent_section_id INTEGER,
  section_key TEXT NOT NULL,
  section_label TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'empty',
  sort_order INTEGER DEFAULT 0,
  owner_role TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS charter_sections_charter_idx ON charter_sections(charter_id);
CREATE INDEX IF NOT EXISTS charter_sections_parent_idx ON charter_sections(parent_section_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TIMELINE PHASES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS timeline_phases (
  id SERIAL PRIMARY KEY,
  charter_id INTEGER NOT NULL REFERENCES project_charters(id) ON DELETE CASCADE,
  phase_name TEXT NOT NULL,
  phase_number INTEGER NOT NULL,
  description TEXT,

  -- Dates
  start_date TIMESTAMP,
  target_end_date TIMESTAMP,
  actual_end_date TIMESTAMP,

  -- Progress
  status TEXT DEFAULT 'not_started',
  progress INTEGER DEFAULT 0,

  -- Dependencies
  predecessors JSONB,
  is_critical_path BOOLEAN DEFAULT FALSE,

  -- Deliverables
  deliverables JSONB,
  owner_role TEXT,

  -- Duration
  estimated_weeks INTEGER,
  actual_weeks INTEGER,

  -- Rendering
  color TEXT,

  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS timeline_phases_charter_idx ON timeline_phases(charter_id);
CREATE INDEX IF NOT EXISTS timeline_phases_status_idx ON timeline_phases(status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROJECT COMMITMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_commitments (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  charter_id INTEGER REFERENCES project_charters(id),
  phase_id INTEGER REFERENCES timeline_phases(id),

  -- Commitment details
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,

  -- Source
  source TEXT NOT NULL,
  source_document_id INTEGER,
  extraction_confidence REAL,

  -- Timeline
  due_date TIMESTAMP,
  completed_at TIMESTAMP,

  -- Status
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  urgency TEXT,

  -- Assignment
  owner_user_id INTEGER,
  owner_role TEXT,

  -- Fulfillment
  fulfillment_proof TEXT,
  fulfillment_artifact_id INTEGER,

  -- Signature (21 CFR Part 11)
  requires_signature BOOLEAN DEFAULT FALSE,
  signed_by INTEGER,
  signed_at TIMESTAMP,
  signature_meaning TEXT,

  -- Audit
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS proj_commitments_org_idx ON project_commitments(organization_id);
CREATE INDEX IF NOT EXISTS proj_commitments_project_idx ON project_commitments(project_id);
CREATE INDEX IF NOT EXISTS proj_commitments_charter_idx ON project_commitments(charter_id);
CREATE INDEX IF NOT EXISTS proj_commitments_status_idx ON project_commitments(status);
CREATE INDEX IF NOT EXISTS proj_commitments_due_idx ON project_commitments(due_date);
