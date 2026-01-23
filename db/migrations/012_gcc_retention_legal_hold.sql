-- Migration 012: Data Retention + Legal Hold + Archive Chain
-- Purpose: Implement regulated data lifecycle management
--
-- This migration provides:
--   1. Retention policies per table/record type
--   2. Legal hold flags that prevent any archival
--   3. Hash-linked archive manifests for provenance chain
--   4. "No physical deletes" enforcement for regulated schemas
--   5. Archive status tracking without data destruction
--
-- Part 11 / GxP alignment: Records must be retained for defined periods
-- and cannot be deleted while under legal hold or regulatory investigation.

BEGIN;

CREATE SCHEMA IF NOT EXISTS retention;

-- =============================================================================
-- A) Retention Policy Registry
-- =============================================================================

CREATE TABLE IF NOT EXISTS retention.policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_code TEXT NOT NULL UNIQUE,           -- e.g., "CLINICAL_TRUTH_7Y", "AUDIT_LOGS_25Y"
  policy_name TEXT NOT NULL,
  description TEXT,
  
  -- Target specification
  target_schema TEXT NOT NULL,                -- 'truth', 'prose', 'audit', etc.
  target_table TEXT NOT NULL,                 -- 'clinical_truth_store', 'smart_fragments', etc.
  
  -- Retention rules
  retention_years INT NOT NULL,               -- How long to retain (FDA typically requires 7+ years)
  retention_basis TEXT NOT NULL,              -- 'CREATED_AT', 'SUBMITTED_AT', 'LAST_MODIFIED'
  
  -- Archive behavior
  archive_eligible BOOLEAN NOT NULL DEFAULT TRUE,  -- Can records be archived after retention?
  archive_destination TEXT,                   -- Where archived data goes (cold storage, etc.)
  
  -- Destruction rules (for non-regulated data only)
  destruction_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  destruction_approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Audit
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE retention.policies IS 
  'Retention policy registry - defines how long records must be kept';

COMMENT ON COLUMN retention.policies.retention_years IS 
  'Minimum retention period in years - FDA typically requires 7+ for clinical data';

-- Insert standard policies
INSERT INTO retention.policies (
  policy_code, policy_name, description,
  target_schema, target_table,
  retention_years, retention_basis,
  archive_eligible, destruction_allowed, created_by
) VALUES
  ('CLINICAL_TRUTH_7Y', 'Clinical Truth Data', 'Clinical trial data must be retained 7+ years post-approval',
   'truth', 'clinical_truth_store', 7, 'CREATED_AT', TRUE, FALSE, 'migration-012'),
  ('PROSE_FRAGMENTS_7Y', 'Regulatory Prose', 'Submission prose retained for product lifecycle',
   'prose', 'smart_fragments', 7, 'CREATED_AT', TRUE, FALSE, 'migration-012'),
  ('FRAGMENT_VERSIONS_25Y', 'Fragment Version History', 'Version history is permanent record',
   'prose', 'smart_fragment_versions', 25, 'CREATED_AT', FALSE, FALSE, 'migration-012'),
  ('AUDIT_LOGS_25Y', 'Audit Trail', 'Audit logs must be retained for regulatory inspections',
   'audit', 'concomitant_audit_logs', 25, 'CREATED_AT', FALSE, FALSE, 'migration-012'),
  ('SIGNATURES_PERMANENT', 'Electronic Signatures', 'E-signatures are permanent legal records',
   'audit', 'e_signatures', 99, 'CREATED_AT', FALSE, FALSE, 'migration-012'),
  ('SNAPSHOTS_7Y', 'Submission Snapshots', 'Submission snapshots retained post-approval',
   'prose', 'submission_snapshots', 7, 'CREATED_AT', TRUE, FALSE, 'migration-012'),
  ('CONFIG_BUNDLES_25Y', 'Configuration Records', 'Config bundles for reproducibility',
   'audit', 'config_bundles', 25, 'CREATED_AT', FALSE, FALSE, 'migration-012')
ON CONFLICT (policy_code) DO NOTHING;

-- =============================================================================
-- B) Legal Hold Registry
-- =============================================================================

CREATE TYPE retention.hold_type AS ENUM (
  'LITIGATION',           -- Active or anticipated litigation
  'REGULATORY_INQUIRY',   -- FDA/EMA investigation
  'INTERNAL_AUDIT',       -- Internal compliance review
  'PATENT_DISPUTE',       -- IP-related hold
  'WHISTLEBLOWER',        -- Whistleblower investigation
  'GENERAL'               -- Other legal requirement
);

CREATE TABLE IF NOT EXISTS retention.legal_holds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hold_code TEXT NOT NULL UNIQUE,             -- e.g., "LH-2026-001"
  hold_name TEXT NOT NULL,
  hold_type retention.hold_type NOT NULL,
  description TEXT,
  
  -- Scope
  program_id UUID REFERENCES core.programs(id),  -- NULL = all programs
  target_schema TEXT,                         -- NULL = all schemas
  target_table TEXT,                          -- NULL = all tables in schema
  
  -- Date range of records to hold
  records_from TIMESTAMPTZ,                   -- Hold records created after this date
  records_to TIMESTAMPTZ,                     -- Hold records created before this date
  
  -- Hold lifecycle
  hold_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hold_end TIMESTAMPTZ,                       -- NULL = indefinite
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Legal matter reference
  matter_reference TEXT,                      -- Case number, docket, etc.
  custodian_email TEXT NOT NULL,              -- Person responsible for hold
  legal_counsel TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  released_at TIMESTAMPTZ,
  released_by TEXT,
  release_reason TEXT
);

COMMENT ON TABLE retention.legal_holds IS 
  'Legal hold registry - prevents archival/deletion of records under hold';

CREATE INDEX IF NOT EXISTS legal_holds_active_idx 
  ON retention.legal_holds (is_active, program_id);

CREATE INDEX IF NOT EXISTS legal_holds_scope_idx 
  ON retention.legal_holds (target_schema, target_table) WHERE is_active = TRUE;

-- Audit trigger for legal holds (important for compliance)
CREATE OR REPLACE FUNCTION retention.tg_legal_holds_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Log release
    IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
      NEW.released_at := NOW();
      NEW.released_by := COALESCE(current_setting('app.user', true), 'unknown');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_legal_holds_audit ON retention.legal_holds;
CREATE TRIGGER trg_legal_holds_audit
  BEFORE UPDATE ON retention.legal_holds
  FOR EACH ROW
  EXECUTE FUNCTION retention.tg_legal_holds_audit();

-- =============================================================================
-- C) Archive Manifests (Hash-Linked Chain)
-- =============================================================================

CREATE TYPE retention.archive_status AS ENUM (
  'PENDING',              -- Scheduled for archive
  'ARCHIVED',             -- Successfully archived
  'FAILED',               -- Archive failed
  'RESTORED',             -- Restored from archive
  'HELD'                  -- Blocked by legal hold
);

CREATE TABLE IF NOT EXISTS retention.archive_manifests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  manifest_number SERIAL,                     -- Sequential manifest number
  
  -- Chain linking (hash chain for integrity)
  previous_manifest_id UUID REFERENCES retention.archive_manifests(id),
  previous_manifest_hash TEXT,                -- SHA-256 of previous manifest
  manifest_hash TEXT NOT NULL,                -- SHA-256 of this manifest content
  
  -- Content
  source_schema TEXT NOT NULL,
  source_table TEXT NOT NULL,
  record_count INT NOT NULL,
  date_range_from TIMESTAMPTZ,
  date_range_to TIMESTAMPTZ,
  
  -- Archive details
  archive_status retention.archive_status NOT NULL DEFAULT 'PENDING',
  archive_location TEXT,                      -- S3 URI, cold storage path, etc.
  archive_format TEXT DEFAULT 'JSONL_GZ',     -- Format of archived data
  archive_size_bytes BIGINT,
  
  -- Checksums
  content_sha256 TEXT,                        -- SHA-256 of archived content
  record_ids_sha256 TEXT,                     -- SHA-256 of record ID list
  
  -- Retention reference
  retention_policy_id UUID REFERENCES retention.policies(id),
  retention_until TIMESTAMPTZ NOT NULL,       -- When this archive can be destroyed
  
  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  archived_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by TEXT
);

COMMENT ON TABLE retention.archive_manifests IS 
  'Hash-linked archive manifest chain - provides tamper-evident archive history';

CREATE INDEX IF NOT EXISTS archive_manifests_chain_idx 
  ON retention.archive_manifests (previous_manifest_id);

CREATE INDEX IF NOT EXISTS archive_manifests_status_idx 
  ON retention.archive_manifests (archive_status, source_schema, source_table);

-- Append-only enforcement
CREATE OR REPLACE FUNCTION retention.prevent_archive_manifest_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow status updates only
  IF TG_OP = 'UPDATE' THEN
    IF OLD.manifest_hash != NEW.manifest_hash 
       OR OLD.content_sha256 IS DISTINCT FROM NEW.content_sha256
       OR OLD.record_count != NEW.record_count THEN
      RAISE EXCEPTION 'Archive manifest content is immutable';
    END IF;
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Archive manifests cannot be deleted';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_manifests_immutable ON retention.archive_manifests;
CREATE TRIGGER trg_archive_manifests_immutable
  BEFORE UPDATE OR DELETE ON retention.archive_manifests
  FOR EACH ROW
  EXECUTE FUNCTION retention.prevent_archive_manifest_mutation();

-- =============================================================================
-- D) Record-Level Hold Tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS retention.record_holds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legal_hold_id UUID NOT NULL REFERENCES retention.legal_holds(id),
  
  -- Record reference (polymorphic)
  record_schema TEXT NOT NULL,
  record_table TEXT NOT NULL,
  record_id UUID NOT NULL,
  
  -- Status
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by TEXT NOT NULL DEFAULT 'unknown',
  released_at TIMESTAMPTZ,
  
  UNIQUE (legal_hold_id, record_schema, record_table, record_id)
);

COMMENT ON TABLE retention.record_holds IS 
  'Tracks which specific records are under which legal holds';

CREATE INDEX IF NOT EXISTS record_holds_record_idx 
  ON retention.record_holds (record_schema, record_table, record_id);

-- =============================================================================
-- E) Add retention columns to major tables
-- =============================================================================

-- Add retention_until and legal_hold columns to key tables
DO $$
BEGIN
  -- truth.clinical_truth_store
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='truth' AND table_name='clinical_truth_store') THEN
    ALTER TABLE truth.clinical_truth_store ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ;
    ALTER TABLE truth.clinical_truth_store ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN DEFAULT FALSE;
    ALTER TABLE truth.clinical_truth_store ADD COLUMN IF NOT EXISTS archive_status TEXT DEFAULT 'ACTIVE';
    CREATE INDEX IF NOT EXISTS clinical_truth_retention_idx ON truth.clinical_truth_store (retention_until) WHERE archive_status = 'ACTIVE';
  END IF;

  -- prose.smart_fragments
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='smart_fragments') THEN
    ALTER TABLE prose.smart_fragments ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ;
    ALTER TABLE prose.smart_fragments ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN DEFAULT FALSE;
    ALTER TABLE prose.smart_fragments ADD COLUMN IF NOT EXISTS archive_status TEXT DEFAULT 'ACTIVE';
    CREATE INDEX IF NOT EXISTS fragments_retention_idx ON prose.smart_fragments (retention_until) WHERE archive_status = 'ACTIVE';
  END IF;

  -- prose.submission_snapshots
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='submission_snapshots') THEN
    ALTER TABLE prose.submission_snapshots ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ;
    ALTER TABLE prose.submission_snapshots ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN DEFAULT FALSE;
    ALTER TABLE prose.submission_snapshots ADD COLUMN IF NOT EXISTS archive_status TEXT DEFAULT 'ACTIVE';
    CREATE INDEX IF NOT EXISTS snapshots_retention_idx ON prose.submission_snapshots (retention_until) WHERE archive_status = 'ACTIVE';
  END IF;

  -- adversarial.regulatory_adversarial_precedents
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='adversarial' AND table_name='regulatory_adversarial_precedents') THEN
    ALTER TABLE adversarial.regulatory_adversarial_precedents ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ;
    ALTER TABLE adversarial.regulatory_adversarial_precedents ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN DEFAULT FALSE;
    ALTER TABLE adversarial.regulatory_adversarial_precedents ADD COLUMN IF NOT EXISTS archive_status TEXT DEFAULT 'ACTIVE';
  END IF;
END $$;

-- =============================================================================
-- F) Helper Functions
-- =============================================================================

-- Check if a record is under legal hold
CREATE OR REPLACE FUNCTION retention.is_under_legal_hold(
  p_schema TEXT,
  p_table TEXT,
  p_record_id UUID,
  p_program_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    -- Check explicit record holds
    SELECT 1 FROM retention.record_holds rh
    JOIN retention.legal_holds lh ON lh.id = rh.legal_hold_id
    WHERE rh.record_schema = p_schema
      AND rh.record_table = p_table
      AND rh.record_id = p_record_id
      AND rh.released_at IS NULL
      AND lh.is_active = TRUE
  )
  OR EXISTS (
    -- Check blanket holds
    SELECT 1 FROM retention.legal_holds lh
    WHERE lh.is_active = TRUE
      AND (lh.target_schema IS NULL OR lh.target_schema = p_schema)
      AND (lh.target_table IS NULL OR lh.target_table = p_table)
      AND (lh.program_id IS NULL OR lh.program_id = p_program_id)
  );
$$;

-- Get retention date for a record
CREATE OR REPLACE FUNCTION retention.get_retention_until(
  p_schema TEXT,
  p_table TEXT,
  p_created_at TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE SQL
STABLE
AS $$
  SELECT p_created_at + (rp.retention_years || ' years')::INTERVAL
  FROM retention.policies rp
  WHERE rp.target_schema = p_schema
    AND rp.target_table = p_table
    AND rp.is_active = TRUE
  LIMIT 1;
$$;

-- View: Records eligible for archival
CREATE OR REPLACE VIEW retention.v_archive_eligible AS
SELECT
  'truth' AS schema_name,
  'clinical_truth_store' AS table_name,
  id AS record_id,
  created_at,
  retention_until,
  legal_hold,
  archive_status,
  CASE 
    WHEN legal_hold = TRUE THEN 'HELD'
    WHEN retention_until IS NULL THEN 'NO_POLICY'
    WHEN retention_until > NOW() THEN 'ACTIVE'
    ELSE 'ELIGIBLE'
  END AS eligibility
FROM truth.clinical_truth_store
WHERE archive_status = 'ACTIVE'

UNION ALL

SELECT
  'prose' AS schema_name,
  'smart_fragments' AS table_name,
  id AS record_id,
  created_at,
  retention_until,
  legal_hold,
  archive_status,
  CASE 
    WHEN legal_hold = TRUE THEN 'HELD'
    WHEN retention_until IS NULL THEN 'NO_POLICY'
    WHEN retention_until > NOW() THEN 'ACTIVE'
    ELSE 'ELIGIBLE'
  END AS eligibility
FROM prose.smart_fragments
WHERE archive_status = 'ACTIVE';

COMMENT ON VIEW retention.v_archive_eligible IS 
  'Shows records and their archive eligibility status';

-- =============================================================================
-- G) Prevent Physical Deletes on Regulated Tables
-- =============================================================================

CREATE OR REPLACE FUNCTION retention.prevent_physical_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Physical deletion not allowed on regulated table %.% - use archive instead', 
    TG_TABLE_SCHEMA, TG_TABLE_NAME;
END;
$$;

-- Apply to regulated tables
DO $$
BEGIN
  -- truth.clinical_truth_store
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='truth' AND table_name='clinical_truth_store') THEN
    DROP TRIGGER IF EXISTS trg_no_delete_truth ON truth.clinical_truth_store;
    CREATE TRIGGER trg_no_delete_truth
      BEFORE DELETE ON truth.clinical_truth_store
      FOR EACH ROW
      EXECUTE FUNCTION retention.prevent_physical_delete();
  END IF;

  -- prose.smart_fragment_versions (already has immutability, but add explicit no-delete)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='smart_fragment_versions') THEN
    DROP TRIGGER IF EXISTS trg_no_delete_versions ON prose.smart_fragment_versions;
    CREATE TRIGGER trg_no_delete_versions
      BEFORE DELETE ON prose.smart_fragment_versions
      FOR EACH ROW
      EXECUTE FUNCTION retention.prevent_physical_delete();
  END IF;

  -- prose.submission_snapshots
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='submission_snapshots') THEN
    DROP TRIGGER IF EXISTS trg_no_delete_snapshots ON prose.submission_snapshots;
    CREATE TRIGGER trg_no_delete_snapshots
      BEFORE DELETE ON prose.submission_snapshots
      FOR EACH ROW
      EXECUTE FUNCTION retention.prevent_physical_delete();
  END IF;
END $$;

COMMIT;
