-- Migration 0006: CTD Client Onboarding Pipeline
-- Creates tables for CTD project management, document ingestion, and compliance gap analysis

-- ============================================================================
-- CTD Onboarding Projects
-- ============================================================================

CREATE TABLE IF NOT EXISTS ctd_onboarding_projects (
  id                    SERIAL PRIMARY KEY,
  uuid                  UUID DEFAULT gen_random_uuid() NOT NULL,
  organization_id       INTEGER NOT NULL REFERENCES organizations(id),
  project_id            INTEGER REFERENCES projects(id),
  name                  TEXT NOT NULL,
  regulatory_region     TEXT NOT NULL,
  submission_type       TEXT NOT NULL,
  product_name          TEXT NOT NULL,
  product_type          TEXT NOT NULL,
  therapeutic_area      TEXT,
  indication            TEXT,
  status                TEXT NOT NULL DEFAULT 'setup',
  completion_percentage INTEGER NOT NULL DEFAULT 0,
  metadata              JSON,
  created_by            INTEGER NOT NULL REFERENCES users(id),
  created_at            TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at            TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS ctd_onb_proj_org_idx ON ctd_onboarding_projects(organization_id);
CREATE INDEX IF NOT EXISTS ctd_onb_proj_status_idx ON ctd_onboarding_projects(status);
CREATE INDEX IF NOT EXISTS ctd_onb_proj_region_idx ON ctd_onboarding_projects(regulatory_region);

-- ============================================================================
-- CTD Onboarding Documents
-- ============================================================================

CREATE TABLE IF NOT EXISTS ctd_onboarding_documents (
  id                    SERIAL PRIMARY KEY,
  uuid                  UUID DEFAULT gen_random_uuid() NOT NULL,
  ctd_project_id        INTEGER NOT NULL REFERENCES ctd_onboarding_projects(id) ON DELETE CASCADE,
  organization_id       INTEGER NOT NULL REFERENCES organizations(id),
  file_name             TEXT NOT NULL,
  file_size             INTEGER NOT NULL,
  mime_type             TEXT NOT NULL,
  storage_path          TEXT NOT NULL,
  ctd_module            INTEGER NOT NULL,
  ctd_section           TEXT NOT NULL,
  section_title         TEXT NOT NULL,
  document_type         TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'uploaded',
  extraction_confidence REAL,
  extracted_data        JSON,
  validation_errors     JSON,
  created_at            TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at            TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS ctd_onb_doc_project_idx ON ctd_onboarding_documents(ctd_project_id);
CREATE INDEX IF NOT EXISTS ctd_onb_doc_org_idx ON ctd_onboarding_documents(organization_id);
CREATE INDEX IF NOT EXISTS ctd_onb_doc_module_idx ON ctd_onboarding_documents(ctd_module);
CREATE INDEX IF NOT EXISTS ctd_onb_doc_status_idx ON ctd_onboarding_documents(status);

-- ============================================================================
-- CTD Compliance Gaps
-- ============================================================================

CREATE TABLE IF NOT EXISTS ctd_compliance_gaps (
  id                SERIAL PRIMARY KEY,
  ctd_project_id    INTEGER NOT NULL REFERENCES ctd_onboarding_projects(id) ON DELETE CASCADE,
  organization_id   INTEGER NOT NULL REFERENCES organizations(id),
  ctd_module        INTEGER NOT NULL,
  ctd_section       TEXT NOT NULL,
  requirement_type  TEXT NOT NULL,
  severity          TEXT NOT NULL,
  description       TEXT NOT NULL,
  recommendation    TEXT,
  resolved          BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at       TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS ctd_gap_project_idx ON ctd_compliance_gaps(ctd_project_id);
CREATE INDEX IF NOT EXISTS ctd_gap_org_idx ON ctd_compliance_gaps(organization_id);
CREATE INDEX IF NOT EXISTS ctd_gap_severity_idx ON ctd_compliance_gaps(severity);
CREATE INDEX IF NOT EXISTS ctd_gap_resolved_idx ON ctd_compliance_gaps(resolved);
