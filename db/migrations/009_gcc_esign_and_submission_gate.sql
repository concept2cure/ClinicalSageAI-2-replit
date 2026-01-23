-- Migration 009: E-Signatures + Submission Gate Enforcement
-- Purpose: Make submissions legally defensible electronic records
-- Implements: Part 11-supporting signature manifestation records
-- 
-- After this migration:
--   - Exports are immutable manifest records with SHA-256
--   - E-signatures are append-only audit records
--   - DB ENFORCES: FROZEN->SUBMITTED requires all required approvals
--
-- This is the governance plane that turns the system from "smart authoring DB"
-- into a regulated release system.

BEGIN;

CREATE SCHEMA IF NOT EXISTS prose;
CREATE SCHEMA IF NOT EXISTS audit;

-- =============================================================================
-- A) Snapshot Exports: immutable manifest records
-- =============================================================================
-- Note: This may already exist from 008, but we ensure it's complete here

CREATE TABLE IF NOT EXISTS prose.submission_snapshot_exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_id UUID NOT NULL REFERENCES prose.submission_snapshots(id) ON DELETE RESTRICT,

  -- Export format and integrity
  export_format TEXT NOT NULL DEFAULT 'json',
  manifest_sha256 TEXT NOT NULL,
  manifest_json JSONB NOT NULL,

  -- Optional metadata
  export_purpose TEXT,       -- WEEKLY_QC | SUBMISSION_FREEZE | AUDIT_DEFENSE
  export_destination TEXT,   -- S3://bucket/path | LOCAL | VEEVA_VAULT

  -- Attribution (Part 11 compliance)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

COMMENT ON TABLE prose.submission_snapshot_exports IS 
  'Immutable manifest records for frozen snapshots - Part 11 controlled artifacts';

COMMENT ON COLUMN prose.submission_snapshot_exports.manifest_sha256 IS 
  'SHA-256 hash of canonical JSON for integrity verification and tamper detection';

CREATE INDEX IF NOT EXISTS snapshot_exports_snapshot_idx
  ON prose.submission_snapshot_exports (snapshot_id, created_at DESC);

CREATE INDEX IF NOT EXISTS snapshot_exports_sha256_idx
  ON prose.submission_snapshot_exports (manifest_sha256);

-- Make exports append-only (immutable for regulatory compliance)
CREATE OR REPLACE FUNCTION prose.prevent_snapshot_exports_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'submission_snapshot_exports is append-only (immutable for regulatory compliance)';
END;
$$;

DROP TRIGGER IF EXISTS trg_no_update_delete_snapshot_exports ON prose.submission_snapshot_exports;
CREATE TRIGGER trg_no_update_delete_snapshot_exports
  BEFORE UPDATE OR DELETE ON prose.submission_snapshot_exports
  FOR EACH ROW
  EXECUTE FUNCTION prose.prevent_snapshot_exports_mutation();

-- Attribution from session vars
CREATE OR REPLACE FUNCTION prose.tg_snapshot_exports_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.created_by := COALESCE(current_setting('app.user', true), NEW.created_by, 'unknown');
  NEW.request_id := COALESCE(current_setting('app.request_id', true), NEW.request_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_exports_attrib ON prose.submission_snapshot_exports;
CREATE TRIGGER trg_snapshot_exports_attrib
  BEFORE INSERT ON prose.submission_snapshot_exports
  FOR EACH ROW
  EXECUTE FUNCTION prose.tg_snapshot_exports_attribution();

-- =============================================================================
-- B) Electronic signatures table (append-only)
--    This is your "Part 11 signature manifestation" record.
-- =============================================================================

-- Enum: What type of object is being signed
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                 WHERE t.typname='signed_object_type' AND n.nspname='audit') THEN
    CREATE TYPE audit.signed_object_type AS ENUM (
      'SNAPSHOT',           -- Signing a snapshot directly (less common)
      'SNAPSHOT_EXPORT',    -- Signing an exported manifest (primary use)
      'FRAGMENT_VERSION'    -- Signing individual prose versions
    );
  END IF;
END $$;

-- Enum: What does the signature mean
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                 WHERE t.typname='signature_meaning' AND n.nspname='audit') THEN
    CREATE TYPE audit.signature_meaning AS ENUM (
      'AUTHOR',       -- I authored this content
      'REVIEW',       -- I reviewed this content
      'APPROVE',      -- I approve this for the next stage
      'SUBMIT',       -- I am submitting this to authority
      'ACKNOWLEDGE'   -- I acknowledge receipt/awareness
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS audit.e_signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- What is being signed
  signed_object_type audit.signed_object_type NOT NULL,
  signed_object_id UUID NOT NULL,  -- export_id, snapshot_id, or fragment_version composite

  -- Who signed and in what capacity
  signer_identity TEXT NOT NULL,   -- User email, system identity, or SSO subject
  signer_role TEXT NOT NULL,       -- QA, RA, CLINICAL, STATS, CMC, MEDICAL_WRITER, etc.
  meaning audit.signature_meaning NOT NULL,  -- APPROVE, REVIEW, AUTHOR, etc.

  -- Signature method and authentication context
  signature_method TEXT NOT NULL DEFAULT 'SSO',  -- SSO | PASSWORD_REAUTH | CERT | MFA | DEV
  signature_statement TEXT,        -- "I approve this export for FDA submission"
  signature_hash TEXT,             -- Should match manifest_sha256 for exports (integrity binding)

  -- Extended context for audit (IP, user-agent, auth provider, session info)
  signature_payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps (append-only, signed_at is the legal timestamp)
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id TEXT
);

COMMENT ON TABLE audit.e_signatures IS 
  'Part 11 signature manifestation records - immutable, append-only electronic signatures';

COMMENT ON COLUMN audit.e_signatures.signer_role IS 
  'Regulatory role: QA, RA, CLINICAL, STATS, CMC, MEDICAL_WRITER, SAFETY, etc.';

COMMENT ON COLUMN audit.e_signatures.meaning IS 
  'What the signature means: AUTHOR (I wrote it), REVIEW (I checked it), APPROVE (I authorize it)';

COMMENT ON COLUMN audit.e_signatures.signature_hash IS 
  'Should match manifest_sha256 of the export being signed - binds signature to specific artifact';

COMMENT ON COLUMN audit.e_signatures.signature_payload IS 
  'Auth context: IP address, user-agent, authentication method details, session ID, etc.';

-- Fast lookups by object
CREATE INDEX IF NOT EXISTS e_signatures_object_idx
  ON audit.e_signatures (signed_object_type, signed_object_id, signed_at DESC);

-- Fast lookups by signer
CREATE INDEX IF NOT EXISTS e_signatures_signer_idx
  ON audit.e_signatures (signer_identity, signed_at DESC);

-- Fast lookups by role + meaning (for gate checking)
CREATE INDEX IF NOT EXISTS e_signatures_role_meaning_idx
  ON audit.e_signatures (signer_role, meaning, signed_at DESC);

-- Prevent duplicate signatures: same (object, role, meaning) combination
-- This ensures one QA APPROVE per export, but allows QA REVIEW + QA APPROVE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='e_signatures_unique_role_meaning_per_object') THEN
    ALTER TABLE audit.e_signatures
      ADD CONSTRAINT e_signatures_unique_role_meaning_per_object
      UNIQUE (signed_object_type, signed_object_id, signer_role, meaning);
  END IF;
END $$;

-- Append-only enforcement (signatures are immutable legal records)
CREATE OR REPLACE FUNCTION audit.prevent_e_signatures_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'e_signatures is append-only (immutable legal records)';
END;
$$;

DROP TRIGGER IF EXISTS trg_no_update_delete_e_signatures ON audit.e_signatures;
CREATE TRIGGER trg_no_update_delete_e_signatures
  BEFORE UPDATE OR DELETE ON audit.e_signatures
  FOR EACH ROW
  EXECUTE FUNCTION audit.prevent_e_signatures_mutation();

-- Attribution (request_id from session vars)
CREATE OR REPLACE FUNCTION audit.tg_esign_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.request_id := COALESCE(current_setting('app.request_id', true), NEW.request_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_esign_attrib ON audit.e_signatures;
CREATE TRIGGER trg_esign_attrib
  BEFORE INSERT ON audit.e_signatures
  FOR EACH ROW
  EXECUTE FUNCTION audit.tg_esign_attribution();

-- =============================================================================
-- C) Add submission linkage + requirements to snapshots
-- =============================================================================

-- Which export was submitted (links snapshot to signed artifact)
ALTER TABLE prose.submission_snapshots
  ADD COLUMN IF NOT EXISTS submitted_export_id UUID;

-- Configurable approval requirements per snapshot
ALTER TABLE prose.submission_snapshots
  ADD COLUMN IF NOT EXISTS required_approver_roles TEXT[] NOT NULL DEFAULT ARRAY['QA','RA'];

-- What signature meaning is required (usually APPROVE)
DO $$
BEGIN
  -- Only add if column doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='prose' AND table_name='submission_snapshots' 
    AND column_name='required_approval_meaning'
  ) THEN
    ALTER TABLE prose.submission_snapshots
      ADD COLUMN required_approval_meaning TEXT NOT NULL DEFAULT 'APPROVE';
  END IF;
END $$;

COMMENT ON COLUMN prose.submission_snapshots.submitted_export_id IS 
  'The specific export manifest that was signed and submitted';

COMMENT ON COLUMN prose.submission_snapshots.required_approver_roles IS 
  'Roles that must sign APPROVE before FROZEN->SUBMITTED transition (default: QA, RA)';

-- FK: submitted_export_id must reference an export from THIS snapshot
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='submission_snapshots_submitted_export_fk') THEN
    ALTER TABLE prose.submission_snapshots
      ADD CONSTRAINT submission_snapshots_submitted_export_fk
      FOREIGN KEY (submitted_export_id)
      REFERENCES prose.submission_snapshot_exports(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- =============================================================================
-- D) DB-Level Enforcement: FROZEN -> SUBMITTED requires export + signatures
-- =============================================================================
-- This is the HARD GATE - no code can bypass this requirement

CREATE OR REPLACE FUNCTION prose.enforce_submission_signatures()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  export_snapshot_id UUID;
  required_roles TEXT[];
  required_meaning TEXT;
  missing_roles TEXT[] := ARRAY[]::TEXT[];
  role TEXT;
BEGIN
  -- Only enforce on status transition to SUBMITTED
  IF (OLD.status = 'FROZEN' AND NEW.status = 'SUBMITTED') THEN
    
    -- RULE 1: Must supply which export is being submitted
    IF NEW.submitted_export_id IS NULL THEN
      RAISE EXCEPTION 'Cannot transition to SUBMITTED without submitted_export_id. '
        'Export the frozen snapshot first, then collect required signatures.';
    END IF;

    -- RULE 2: Export must exist and belong to this snapshot
    SELECT snapshot_id INTO export_snapshot_id
    FROM prose.submission_snapshot_exports
    WHERE id = NEW.submitted_export_id;

    IF export_snapshot_id IS NULL THEN
      RAISE EXCEPTION 'submitted_export_id % does not exist', NEW.submitted_export_id;
    END IF;

    IF export_snapshot_id <> NEW.id THEN
      RAISE EXCEPTION 'Export % belongs to snapshot %, not snapshot %',
        NEW.submitted_export_id, export_snapshot_id, NEW.id;
    END IF;

    -- RULE 3: All required roles must have signed with required meaning
    required_roles := NEW.required_approver_roles;
    required_meaning := COALESCE(NEW.required_approval_meaning, 'APPROVE');

    FOREACH role IN ARRAY required_roles LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM audit.e_signatures s
        WHERE s.signed_object_type = 'SNAPSHOT_EXPORT'
          AND s.signed_object_id = NEW.submitted_export_id
          AND s.signer_role = role
          AND s.meaning::text = required_meaning
      ) THEN
        missing_roles := array_append(missing_roles, role);
      END IF;
    END LOOP;

    IF array_length(missing_roles, 1) IS NOT NULL THEN
      RAISE EXCEPTION 'Missing required % signatures for export %: roles [%]',
        required_meaning, NEW.submitted_export_id, array_to_string(missing_roles, ', ');
    END IF;

    -- All checks passed - submission allowed
    RAISE NOTICE 'Submission gate passed: export % has all required signatures', NEW.submitted_export_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_submission_signatures ON prose.submission_snapshots;
CREATE TRIGGER trg_enforce_submission_signatures
  BEFORE UPDATE ON prose.submission_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION prose.enforce_submission_signatures();

-- =============================================================================
-- E) Views for signature status and workflow tracking
-- =============================================================================

-- View: Export signoff status (who signed what)
CREATE OR REPLACE VIEW prose.v_export_signoff_status AS
SELECT
  e.id AS export_id,
  e.snapshot_id,
  e.manifest_sha256,
  e.export_format,
  e.created_at AS export_created_at,
  e.created_by AS export_created_by,

  -- Aggregate all signatures
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'signature_id', s.id,
        'signer_identity', s.signer_identity,
        'signer_role', s.signer_role,
        'meaning', s.meaning,
        'signed_at', s.signed_at,
        'method', s.signature_method,
        'statement', s.signature_statement
      )
      ORDER BY s.signed_at
    ) FILTER (WHERE s.id IS NOT NULL),
    '[]'::jsonb
  ) AS signatures,

  -- Count by meaning
  COUNT(*) FILTER (WHERE s.meaning = 'APPROVE') AS approve_count,
  COUNT(*) FILTER (WHERE s.meaning = 'REVIEW') AS review_count,
  COUNT(*) FILTER (WHERE s.meaning = 'AUTHOR') AS author_count

FROM prose.submission_snapshot_exports e
LEFT JOIN audit.e_signatures s
  ON s.signed_object_type = 'SNAPSHOT_EXPORT'
 AND s.signed_object_id = e.id
GROUP BY e.id, e.snapshot_id, e.manifest_sha256, e.export_format, e.created_at, e.created_by;

COMMENT ON VIEW prose.v_export_signoff_status IS 
  'Shows all signatures collected for each export manifest';

-- View: Snapshot submission readiness
CREATE OR REPLACE VIEW prose.v_snapshot_submission_readiness AS
WITH export_sigs AS (
  SELECT
    e.id AS export_id,
    e.snapshot_id,
    s.signer_role,
    s.meaning
  FROM prose.submission_snapshot_exports e
  JOIN audit.e_signatures s
    ON s.signed_object_type = 'SNAPSHOT_EXPORT'
   AND s.signed_object_id = e.id
)
SELECT
  snap.id AS snapshot_id,
  snap.label AS snapshot_label,
  snap.status,
  snap.jurisdiction,
  snap.required_approver_roles,
  snap.required_approval_meaning,
  snap.submitted_export_id,

  -- Latest export for this snapshot
  latest_export.id AS latest_export_id,
  latest_export.manifest_sha256 AS latest_export_sha256,
  latest_export.created_at AS latest_export_at,

  -- Which required roles have signed the latest export
  COALESCE(
    ARRAY(
      SELECT DISTINCT es.signer_role
      FROM export_sigs es
      WHERE es.export_id = latest_export.id
        AND es.meaning::text = COALESCE(snap.required_approval_meaning, 'APPROVE')
        AND es.signer_role = ANY(snap.required_approver_roles)
    ),
    ARRAY[]::TEXT[]
  ) AS signed_roles,

  -- Which required roles are missing
  COALESCE(
    ARRAY(
      SELECT role
      FROM unnest(snap.required_approver_roles) AS role
      WHERE role NOT IN (
        SELECT es.signer_role
        FROM export_sigs es
        WHERE es.export_id = latest_export.id
          AND es.meaning::text = COALESCE(snap.required_approval_meaning, 'APPROVE')
      )
    ),
    snap.required_approver_roles
  ) AS missing_roles,

  -- Is snapshot ready to submit?
  CASE
    WHEN snap.status = 'SUBMITTED' THEN TRUE
    WHEN snap.status != 'FROZEN' THEN FALSE
    WHEN latest_export.id IS NULL THEN FALSE
    ELSE NOT EXISTS (
      SELECT 1
      FROM unnest(snap.required_approver_roles) AS role
      WHERE role NOT IN (
        SELECT es.signer_role
        FROM export_sigs es
        WHERE es.export_id = latest_export.id
          AND es.meaning::text = COALESCE(snap.required_approval_meaning, 'APPROVE')
      )
    )
  END AS ready_to_submit

FROM prose.submission_snapshots snap
LEFT JOIN LATERAL (
  SELECT e.*
  FROM prose.submission_snapshot_exports e
  WHERE e.snapshot_id = snap.id
  ORDER BY e.created_at DESC
  LIMIT 1
) latest_export ON TRUE;

COMMENT ON VIEW prose.v_snapshot_submission_readiness IS 
  'Shows which signatures are collected and which are missing for snapshot submission';

-- =============================================================================
-- F) Helper function: Check if export has all required signatures
-- =============================================================================

CREATE OR REPLACE FUNCTION prose.fn_check_export_signatures(
  p_export_id UUID,
  p_required_roles TEXT[],
  p_required_meaning TEXT DEFAULT 'APPROVE'
)
RETURNS TABLE (
  is_complete BOOLEAN,
  signed_roles TEXT[],
  missing_roles TEXT[]
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_signed_roles TEXT[];
  v_missing_roles TEXT[];
BEGIN
  -- Get roles that have signed
  SELECT ARRAY_AGG(DISTINCT s.signer_role)
  INTO v_signed_roles
  FROM audit.e_signatures s
  WHERE s.signed_object_type = 'SNAPSHOT_EXPORT'
    AND s.signed_object_id = p_export_id
    AND s.meaning::text = p_required_meaning
    AND s.signer_role = ANY(p_required_roles);

  v_signed_roles := COALESCE(v_signed_roles, ARRAY[]::TEXT[]);

  -- Calculate missing roles
  SELECT ARRAY_AGG(role)
  INTO v_missing_roles
  FROM unnest(p_required_roles) AS role
  WHERE role != ALL(v_signed_roles);

  v_missing_roles := COALESCE(v_missing_roles, ARRAY[]::TEXT[]);

  RETURN QUERY SELECT
    (array_length(v_missing_roles, 1) IS NULL) AS is_complete,
    v_signed_roles AS signed_roles,
    v_missing_roles AS missing_roles;
END;
$$;

COMMENT ON FUNCTION prose.fn_check_export_signatures IS 
  'Check if an export has all required signatures - use before attempting submission';

-- =============================================================================
-- G) Audit log for submission events
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit.submission_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  snapshot_id UUID NOT NULL,
  export_id UUID,
  
  event_type TEXT NOT NULL,  -- EXPORT_CREATED | SIGNATURE_ADDED | SUBMISSION_ATTEMPTED | SUBMISSION_SUCCEEDED | SUBMISSION_BLOCKED
  event_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  actor TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS submission_events_snapshot_idx
  ON audit.submission_events (snapshot_id, created_at DESC);

CREATE INDEX IF NOT EXISTS submission_events_type_idx
  ON audit.submission_events (event_type, created_at DESC);

-- Append-only
CREATE OR REPLACE FUNCTION audit.prevent_submission_events_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'submission_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_no_update_delete_submission_events ON audit.submission_events;
CREATE TRIGGER trg_no_update_delete_submission_events
  BEFORE UPDATE OR DELETE ON audit.submission_events
  FOR EACH ROW
  EXECUTE FUNCTION audit.prevent_submission_events_mutation();

-- Attribution
CREATE OR REPLACE FUNCTION audit.tg_submission_events_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.actor := COALESCE(current_setting('app.user', true), NEW.actor, 'unknown');
  NEW.request_id := COALESCE(current_setting('app.request_id', true), NEW.request_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submission_events_attrib ON audit.submission_events;
CREATE TRIGGER trg_submission_events_attrib
  BEFORE INSERT ON audit.submission_events
  FOR EACH ROW
  EXECUTE FUNCTION audit.tg_submission_events_attribution();

COMMIT;
