-- ============================================================================
-- Migration 082: eCTD Submission Agent Schema
-- Purpose: Tables supporting direct eCTD submissions to regulatory agency
--          gateways (FDA ESG, EMA eSubmission, PMDA, Health Canada CESG)
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times
-- Reference: ICH M8 v4.0, FDA ESG Technical Conformance Guide
-- ============================================================================

BEGIN;

-- =============================================================================
-- A) eCTD AGENCY GATEWAY CONFIGURATIONS
-- Stores per-agency gateway connection details and regional XML templates
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd_agency_configs (
    id                      SERIAL PRIMARY KEY,
    agency_code             TEXT NOT NULL UNIQUE,           -- 'FDA', 'EMA', 'PMDA', 'HC'
    agency_name             TEXT NOT NULL,                  -- 'U.S. Food and Drug Administration'
    gateway_url             TEXT,                           -- e.g. 'https://esg.fda.gov/as2'
    gateway_protocol        TEXT NOT NULL DEFAULT 'AS2',    -- 'AS2', 'HTTP', 'SFTP', 'MANUAL'
    auth_type               TEXT NOT NULL DEFAULT 'certificate', -- 'certificate', 'oauth2', 'api_key', 'manual'
    regional_xml_template   TEXT,                           -- XML template for regional backbone
    regional_xml_root       TEXT,                           -- e.g. 'us-regional', 'eu-regional'
    supported_ectd_versions TEXT[] NOT NULL DEFAULT ARRAY['v4.0'],
    requires_digital_signature BOOLEAN NOT NULL DEFAULT TRUE,
    max_file_size_mb        INTEGER NOT NULL DEFAULT 100,
    accepted_file_types     TEXT[] NOT NULL DEFAULT ARRAY['pdf', 'xml', 'xpt', 'svg'],
    pdf_version_required    TEXT DEFAULT '1.4-1.7',
    module1_specifics       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- agency-specific Module 1 requirements
    contact_info            JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ectd_agency_configs IS
  'Gateway configuration for each regulatory agency that accepts eCTD submissions';

-- Seed agency configurations
INSERT INTO ectd_agency_configs (agency_code, agency_name, gateway_url, gateway_protocol, auth_type, regional_xml_root, module1_specifics)
VALUES
  ('FDA', 'U.S. Food and Drug Administration', 'https://esg.fda.gov/as2', 'AS2', 'certificate',
   'us-regional', '{"forms": ["356h", "1571", "1572"], "centers": ["CDER", "CBER"], "cover_letter_required": true}'::jsonb),
  ('EMA', 'European Medicines Agency', 'https://esubmission.ema.europa.eu/gateway', 'HTTP', 'oauth2',
   'eu-regional', '{"smpc_template": true, "eu_module1_sections": ["1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9"], "rapporteur_required": true}'::jsonb),
  ('PMDA', 'Pharmaceuticals and Medical Devices Agency', 'https://gateway.pmda.go.jp/ectd', 'SFTP', 'certificate',
   'jp-regional', '{"jp_module1_required": true, "ctd_q_specifics": true, "language": "ja"}'::jsonb),
  ('HC', 'Health Canada', 'https://cesg.hc-sc.gc.ca/gateway', 'HTTP', 'api_key',
   'ca-regional', '{"din_required": true, "bilingual": true, "languages": ["en", "fr"]}'::jsonb)
ON CONFLICT (agency_code) DO NOTHING;


-- =============================================================================
-- B) eCTD SUBMISSIONS
-- Master table tracking each submission attempt to a regulatory agency
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd_submissions (
    id                  SERIAL PRIMARY KEY,
    submission_uid      TEXT NOT NULL UNIQUE DEFAULT 'sub_' || gen_random_uuid(),
    org_id              INTEGER NOT NULL,               -- tenant isolation
    project_id          INTEGER,                        -- optional link to project
    submission_type     TEXT NOT NULL,                   -- 'initial', 'amendment', 'supplement', 'annual_report'
    application_type    TEXT NOT NULL DEFAULT 'IND',     -- 'IND', 'NDA', 'BLA', 'ANDA', 'MAA', 'CTD'
    application_number  TEXT,                           -- e.g. 'IND-123456'
    sequence_number     TEXT NOT NULL DEFAULT '0000',
    agency              TEXT NOT NULL REFERENCES ectd_agency_configs(agency_code),
    center              TEXT,                           -- 'CDER', 'CBER' (FDA-specific)
    status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'assembling', 'validated', 'submitted',
                                          'acknowledged', 'under_review', 'approved',
                                          'rejected', 'withdrawn', 'amendment_required')),
    package_path        TEXT,                           -- path or S3 key to assembled package
    package_size_bytes  BIGINT,
    receipt_number      TEXT,                           -- agency-issued receipt/tracking number
    receipt_timestamp   TIMESTAMPTZ,
    acknowledgment_id   TEXT,                           -- agency acknowledgment identifier
    applicant_name      TEXT,
    drug_name           TEXT,
    indication          TEXT,
    parent_submission_id INTEGER REFERENCES ectd_submissions(id),  -- for amendments
    submitted_by        INTEGER,                       -- user who triggered submission
    submitted_at        TIMESTAMPTZ,
    validation_summary  JSONB DEFAULT '{}'::jsonb,     -- summary of pre-submission validation
    agency_response     JSONB DEFAULT '{}'::jsonb,     -- raw agency response data
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ectd_submissions_org ON ectd_submissions(org_id);
CREATE INDEX IF NOT EXISTS idx_ectd_submissions_status ON ectd_submissions(org_id, status);
CREATE INDEX IF NOT EXISTS idx_ectd_submissions_agency ON ectd_submissions(org_id, agency);
CREATE INDEX IF NOT EXISTS idx_ectd_submissions_app ON ectd_submissions(application_number);

COMMENT ON TABLE ectd_submissions IS
  'Tracks each eCTD submission lifecycle from draft through agency decision';


-- =============================================================================
-- C) eCTD SUBMISSION DOCUMENTS
-- Leaf-level document references within a submission package
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd_submission_documents (
    id                  SERIAL PRIMARY KEY,
    submission_id       INTEGER NOT NULL REFERENCES ectd_submissions(id) ON DELETE CASCADE,
    org_id              INTEGER NOT NULL,
    module              TEXT NOT NULL,                  -- 'm1', 'm2', 'm3', 'm4', 'm5'
    section_code        TEXT NOT NULL,                  -- e.g. '2.5', '3.2.P.1'
    section_title       TEXT,
    document_path       TEXT NOT NULL,                  -- path within eCTD package
    file_name           TEXT NOT NULL,
    file_size_bytes     BIGINT,
    md5_checksum        TEXT NOT NULL,                  -- MD5 hash for integrity
    sha256_checksum     TEXT,                           -- optional SHA-256
    lifecycle_operation TEXT NOT NULL DEFAULT 'new'
                        CHECK (lifecycle_operation IN ('new', 'replace', 'append', 'delete')),
    replaced_document_id INTEGER REFERENCES ectd_submission_documents(id),
    document_type       TEXT DEFAULT 'pdf',             -- 'pdf', 'xml', 'xpt', 'svg'
    pdf_a_compliant     BOOLEAN,
    page_count          INTEGER,
    word_count          INTEGER,
    language            TEXT DEFAULT 'en',
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ectd_subdocs_submission ON ectd_submission_documents(submission_id);
CREATE INDEX IF NOT EXISTS idx_ectd_subdocs_org ON ectd_submission_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_ectd_subdocs_module ON ectd_submission_documents(submission_id, module);

COMMENT ON TABLE ectd_submission_documents IS
  'Leaf-level document entries within an eCTD submission package with checksums and lifecycle operations';


-- =============================================================================
-- D) eCTD SUBMISSION VALIDATIONS
-- Per-rule validation results for pre-submission checks
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd_submission_validations (
    id              SERIAL PRIMARY KEY,
    submission_id   INTEGER NOT NULL REFERENCES ectd_submissions(id) ON DELETE CASCADE,
    org_id          INTEGER NOT NULL,
    rule_id         TEXT NOT NULL,                     -- e.g. 'FILE_NAMING', 'PDF_A_CHECK', 'DTD_VALID'
    rule_category   TEXT NOT NULL DEFAULT 'structural', -- 'structural', 'content', 'naming', 'checksum', 'lifecycle', 'agency_specific'
    severity        TEXT NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
    message         TEXT NOT NULL,
    section_code    TEXT,                              -- affected section, if applicable
    document_path   TEXT,                              -- affected file, if applicable
    passed          BOOLEAN NOT NULL,
    fix_suggestion  TEXT,
    validated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ectd_validations_submission ON ectd_submission_validations(submission_id);
CREATE INDEX IF NOT EXISTS idx_ectd_validations_org ON ectd_submission_validations(org_id);
CREATE INDEX IF NOT EXISTS idx_ectd_validations_failed ON ectd_submission_validations(submission_id, passed)
    WHERE passed = FALSE;

COMMENT ON TABLE ectd_submission_validations IS
  'Stores individual validation rule results for each pre-submission check run';


-- =============================================================================
-- E) eCTD SUBMISSION STATUS HISTORY
-- Audit trail for status transitions
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd_submission_status_history (
    id              SERIAL PRIMARY KEY,
    submission_id   INTEGER NOT NULL REFERENCES ectd_submissions(id) ON DELETE CASCADE,
    org_id          INTEGER NOT NULL,
    from_status     TEXT,
    to_status       TEXT NOT NULL,
    changed_by      INTEGER,                          -- user ID
    change_reason   TEXT,
    agency_message  TEXT,                             -- message from agency, if any
    metadata        JSONB DEFAULT '{}'::jsonb,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ectd_status_history_submission ON ectd_submission_status_history(submission_id);
CREATE INDEX IF NOT EXISTS idx_ectd_status_history_org ON ectd_submission_status_history(org_id);

COMMENT ON TABLE ectd_submission_status_history IS
  'Audit trail recording every status transition for an eCTD submission';


-- =============================================================================
-- F) TENANT ISOLATION (ledger C-32)
-- =============================================================================
-- migrations/0021_enable_rls_everywhere.sql dynamically policies every table
-- carrying organization_id/org_id/tenant_id — but only on the install-fresh path,
-- and only for tables that exist WHEN IT RUNS. This file is applied on the
-- apply-c2c / deploy-migrate path, where 0021 has already run and will never
-- revisit a newly-added table. Under RLS_ENFORCE=on a table with no RLS is fully
-- readable across tenants, so without this block standing the subsystem up would
-- open every tenant's submission history, package paths and agency
-- correspondence to every other tenant.
--
-- The four lifecycle tables key on org_id (the service filters `WHERE org_id = $n`
-- in every query); each takes the canonical tenant_isolation_policy, shape copied
-- from 0021 so the two converge: shadow-mode bypass when app.rls_enforce != 'on',
-- match against either session var, super-admin escape hatch.
--
-- ectd_agency_configs is deliberately NOT policied: it is GLOBAL reference data
-- (the FDA/EMA/PMDA/HC gateway catalogue seeded above), has no org_id, and is
-- read by every tenant. It holds no tenant content.
--
-- Guarded by pg_policies so re-running is a no-op.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ectd_submissions',
    'ectd_submission_documents',
    'ectd_submission_validations',
    'ectd_submission_status_history'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation_policy'
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format($pol$
        CREATE POLICY tenant_isolation_policy ON %I USING (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR org_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
          OR org_id = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
      $pol$, t);
    END IF;
  END LOOP;
END $$;

COMMIT;
