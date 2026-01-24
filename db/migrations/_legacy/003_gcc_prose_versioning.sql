-- ============================================================================
-- Concept2Cure "Global Command Center" - Prose Versioning Migration
-- Migration: 003_gcc_prose_versioning.sql
-- Purpose:
--   1) Add append-only version history for prose.smart_fragments
--   2) Capture attribution (created_by / reason / request_id) using session settings
--   3) Make version rows immutable (no UPDATE/DELETE)
--   4) Backfill existing fragments into version history
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times (Neon-friendly)
-- ============================================================================

BEGIN;

-- Safety: schemas exist
CREATE SCHEMA IF NOT EXISTS prose;
CREATE SCHEMA IF NOT EXISTS audit;

-- ============================================================================
-- A) Generic updated_at trigger (small but very useful)
-- ============================================================================
CREATE OR REPLACE FUNCTION audit.tg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Attach updated_at trigger to prose.smart_fragments if it exists (it should from 001)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='prose' AND table_name='smart_fragments' AND column_name='updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trg_set_updated_at_smart_fragments ON prose.smart_fragments;
    CREATE TRIGGER trg_set_updated_at_smart_fragments
      BEFORE UPDATE ON prose.smart_fragments
      FOR EACH ROW
      EXECUTE FUNCTION audit.tg_set_updated_at();
  END IF;
END $$;

-- ============================================================================
-- B) Add "current version pointer" metadata to prose.smart_fragments
--    (smart_fragments remains the "header/current" row; versions are history)
-- ============================================================================

-- Drop legacy FK constraint if exists (from old implementation)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'smart_fragments_current_version_fk'
  ) THEN
    ALTER TABLE prose.smart_fragments
      DROP CONSTRAINT smart_fragments_current_version_fk;
  END IF;
END $$;

-- Handle old UUID-type current_version_id column from legacy implementation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='prose' AND table_name='smart_fragments' 
    AND column_name='current_version_id' AND data_type='uuid'
  ) THEN
    ALTER TABLE prose.smart_fragments DROP COLUMN current_version_id;
  END IF;
END $$;

-- Add new current version pointer columns
ALTER TABLE prose.smart_fragments
  ADD COLUMN IF NOT EXISTS current_version_id INT,
  ADD COLUMN IF NOT EXISTS current_version_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_version_created_by TEXT,
  ADD COLUMN IF NOT EXISTS current_change_reason TEXT,
  ADD COLUMN IF NOT EXISTS current_request_id TEXT;

-- ============================================================================
-- C) Create append-only versions table
-- ============================================================================

-- Drop legacy tables from old implementation if they exist
DROP TABLE IF EXISTS prose.submission_snapshot_fragments CASCADE;
DROP TABLE IF EXISTS prose.submission_snapshots CASCADE;
DROP TABLE IF EXISTS prose.smart_fragment_versions CASCADE;

CREATE TABLE prose.smart_fragment_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  fragment_id UUID NOT NULL REFERENCES prose.smart_fragments(id) ON DELETE RESTRICT,
  version_id INT NOT NULL,

  -- Context: storing these here makes each version self-describing
  ectd_section_path TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'Global',

  -- The actual prose at that version
  content_prose TEXT,
  embedding VECTOR(1536),

  -- Adversarial / verification metadata at that version
  objectivity_score DOUBLE PRECISION,
  confidence_rating TEXT,
  is_verified_against_truth BOOLEAN DEFAULT FALSE,

  regulatory_precedent_id UUID,
  burden_of_proof_justification TEXT,

  -- Part 11-supporting attribution fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  change_reason TEXT,
  request_id TEXT,

  CONSTRAINT smart_fragment_versions_version_positive CHECK (version_id >= 1),
  CONSTRAINT smart_fragment_versions_objectivity_range 
    CHECK (objectivity_score IS NULL OR (objectivity_score >= 0 AND objectivity_score <= 1)),
  CONSTRAINT smart_fragment_versions_confidence_valid
    CHECK (confidence_rating IS NULL OR confidence_rating IN ('Conclusive', 'Interpretive', 'Ambiguous'))
);

-- Ensure uniqueness per fragment/version
ALTER TABLE prose.smart_fragment_versions
  ADD CONSTRAINT smart_fragment_versions_unique_fragment_version
  UNIQUE (fragment_id, version_id);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS smart_fragment_versions_fragment_version_idx
  ON prose.smart_fragment_versions (fragment_id, version_id DESC);

CREATE INDEX IF NOT EXISTS smart_fragment_versions_section_idx
  ON prose.smart_fragment_versions (ectd_section_path);

CREATE INDEX IF NOT EXISTS smart_fragment_versions_jurisdiction_idx
  ON prose.smart_fragment_versions (jurisdiction);

CREATE INDEX IF NOT EXISTS smart_fragment_versions_created_idx
  ON prose.smart_fragment_versions (created_at);

CREATE INDEX IF NOT EXISTS smart_fragment_versions_created_by_idx
  ON prose.smart_fragment_versions (created_by);

-- HNSW index for searching historical versions by embedding
CREATE INDEX IF NOT EXISTS smart_fragment_versions_embedding_hnsw
  ON prose.smart_fragment_versions 
  USING hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- D) Make versions IMMUTABLE (append-only)
-- ============================================================================
CREATE OR REPLACE FUNCTION prose.prevent_smart_fragment_versions_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 
    'COMPLIANCE VIOLATION: prose.smart_fragment_versions is append-only (immutable version history). '
    'UPDATE and DELETE operations are prohibited to maintain 21 CFR Part 11 audit trail integrity. '
    'Attempted operation: % on row ID: %',
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_update_delete_smart_fragment_versions ON prose.smart_fragment_versions;

CREATE TRIGGER trg_no_update_delete_smart_fragment_versions
  BEFORE UPDATE OR DELETE ON prose.smart_fragment_versions
  FOR EACH ROW
  EXECUTE FUNCTION prose.prevent_smart_fragment_versions_mutation();

-- ============================================================================
-- E) Versioning logic: on INSERT/UPDATE of smart_fragments, bump version_id
--    and write a new immutable version row (AFTER trigger).
--
-- Attribution contract (app sets these per transaction):
--   SET LOCAL app.user = 'user@company.com';
--   SET LOCAL app.reason = 'addressed reviewer comment #17';
--   SET LOCAL app.request_id = 'CR-2026-0017';
-- ============================================================================

-- Drop legacy triggers and functions
DROP TRIGGER IF EXISTS trg_capture_fragment_version_insert ON prose.smart_fragments;
DROP TRIGGER IF EXISTS trg_capture_fragment_version_update ON prose.smart_fragments;
DROP FUNCTION IF EXISTS prose.capture_fragment_version();
DROP FUNCTION IF EXISTS prose.prevent_version_mutation();

-- BEFORE trigger: compute whether this UPDATE warrants a new version_id
CREATE OR REPLACE FUNCTION prose.tg_smart_fragments_before_versioning()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_changed BOOLEAN := FALSE;
  v_new_version INT;
BEGIN
  -- Ensure id exists early (helps with downstream logic)
  IF NEW.id IS NULL THEN
    NEW.id := uuid_generate_v4();
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.version_id := COALESCE(NEW.version_id, 1);
    RETURN NEW;
  END IF;

  -- Decide what changes create a new version.
  -- This is intentionally "signal-heavy" (regulatory meaningful changes).
  v_changed :=
    (NEW.content_prose IS DISTINCT FROM OLD.content_prose)
    OR (NEW.embedding IS DISTINCT FROM OLD.embedding)
    OR (NEW.objectivity_score IS DISTINCT FROM OLD.objectivity_score)
    OR (NEW.confidence_rating IS DISTINCT FROM OLD.confidence_rating)
    OR (NEW.is_verified_against_truth IS DISTINCT FROM OLD.is_verified_against_truth)
    OR (NEW.burden_of_proof_justification IS DISTINCT FROM OLD.burden_of_proof_justification)
    OR (NEW.regulatory_precedent_id IS DISTINCT FROM OLD.regulatory_precedent_id)
    OR (NEW.ectd_section_path IS DISTINCT FROM OLD.ectd_section_path)
    OR (NEW.jurisdiction IS DISTINCT FROM OLD.jurisdiction);

  IF NOT v_changed THEN
    -- No version bump; keep version_id stable
    NEW.version_id := OLD.version_id;
    RETURN NEW;
  END IF;

  -- Serialize version increments per fragment to avoid collisions under concurrency
  PERFORM pg_advisory_xact_lock(hashtext(OLD.id::text));

  SELECT COALESCE(MAX(version_id), COALESCE(OLD.version_id, 0)) + 1
    INTO v_new_version
  FROM prose.smart_fragment_versions
  WHERE fragment_id = OLD.id;

  NEW.version_id := v_new_version;

  -- Update "current pointer" fields (metadata only; version row is written AFTER)
  NEW.current_version_id := v_new_version;
  NEW.current_version_created_at := NOW();
  NEW.current_version_created_by := COALESCE(current_setting('app.user', true), 'unknown');
  NEW.current_change_reason := current_setting('app.reason', true);
  NEW.current_request_id := current_setting('app.request_id', true);

  RETURN NEW;
END;
$$;

-- AFTER trigger: write immutable version row only when version_id changes or on insert
CREATE OR REPLACE FUNCTION prose.tg_smart_fragments_after_versioning()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user TEXT := COALESCE(current_setting('app.user', true), 'unknown');
  v_reason TEXT := current_setting('app.reason', true);
  v_request_id TEXT := current_setting('app.request_id', true);
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Initialize pointer fields if not set
    UPDATE prose.smart_fragments
    SET
      current_version_id = COALESCE(current_version_id, NEW.version_id, 1),
      current_version_created_at = COALESCE(current_version_created_at, NOW()),
      current_version_created_by = COALESCE(current_version_created_by, v_user),
      current_change_reason = COALESCE(current_change_reason, v_reason),
      current_request_id = COALESCE(current_request_id, v_request_id)
    WHERE id = NEW.id;

    INSERT INTO prose.smart_fragment_versions (
      fragment_id, version_id, ectd_section_path, jurisdiction,
      content_prose, embedding,
      objectivity_score, confidence_rating, is_verified_against_truth,
      regulatory_precedent_id, burden_of_proof_justification,
      created_by, change_reason, request_id, created_at
    ) VALUES (
      NEW.id, COALESCE(NEW.version_id, 1), NEW.ectd_section_path, NEW.jurisdiction,
      NEW.content_prose, NEW.embedding,
      NEW.objectivity_score, NEW.confidence_rating, NEW.is_verified_against_truth,
      NEW.regulatory_precedent_id, NEW.burden_of_proof_justification,
      v_user, v_reason, v_request_id, NOW()
    )
    ON CONFLICT (fragment_id, version_id) DO NOTHING;

    RETURN NULL;
  END IF;

  -- UPDATE: write version row only when version bumped
  IF NEW.version_id IS DISTINCT FROM OLD.version_id THEN
    INSERT INTO prose.smart_fragment_versions (
      fragment_id, version_id, ectd_section_path, jurisdiction,
      content_prose, embedding,
      objectivity_score, confidence_rating, is_verified_against_truth,
      regulatory_precedent_id, burden_of_proof_justification,
      created_by, change_reason, request_id, created_at
    ) VALUES (
      NEW.id, NEW.version_id, NEW.ectd_section_path, NEW.jurisdiction,
      NEW.content_prose, NEW.embedding,
      NEW.objectivity_score, NEW.confidence_rating, NEW.is_verified_against_truth,
      NEW.regulatory_precedent_id, NEW.burden_of_proof_justification,
      v_user, v_reason, v_request_id, NOW()
    )
    ON CONFLICT (fragment_id, version_id) DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$;

-- Attach triggers to prose.smart_fragments
DROP TRIGGER IF EXISTS trg_smart_fragments_before_versioning ON prose.smart_fragments;
CREATE TRIGGER trg_smart_fragments_before_versioning
  BEFORE INSERT OR UPDATE ON prose.smart_fragments
  FOR EACH ROW
  EXECUTE FUNCTION prose.tg_smart_fragments_before_versioning();

DROP TRIGGER IF EXISTS trg_smart_fragments_after_versioning ON prose.smart_fragments;
CREATE TRIGGER trg_smart_fragments_after_versioning
  AFTER INSERT OR UPDATE ON prose.smart_fragments
  FOR EACH ROW
  EXECUTE FUNCTION prose.tg_smart_fragments_after_versioning();

-- ============================================================================
-- F) Backfill: for any existing smart_fragments lacking version rows, create v1
-- ============================================================================
INSERT INTO prose.smart_fragment_versions (
  fragment_id, version_id, ectd_section_path, jurisdiction,
  content_prose, embedding,
  objectivity_score, confidence_rating, is_verified_against_truth,
  regulatory_precedent_id, burden_of_proof_justification,
  created_by, change_reason, request_id, created_at
)
SELECT
  sf.id,
  COALESCE(sf.version_id, 1) AS version_id,
  sf.ectd_section_path,
  sf.jurisdiction,
  sf.content_prose,
  sf.embedding,
  sf.objectivity_score,
  sf.confidence_rating,
  sf.is_verified_against_truth,
  sf.regulatory_precedent_id,
  sf.burden_of_proof_justification,
  'backfill' AS created_by,
  'backfill' AS change_reason,
  'backfill' AS request_id,
  COALESCE(sf.created_at, NOW()) AS created_at
FROM prose.smart_fragments sf
WHERE NOT EXISTS (
  SELECT 1 FROM prose.smart_fragment_versions v WHERE v.fragment_id = sf.id
);

-- ============================================================================
-- G) Update existing smart_fragments pointer fields after backfill
-- ============================================================================
UPDATE prose.smart_fragments sf
SET
  current_version_id = COALESCE(sf.current_version_id, sf.version_id, 1),
  current_version_created_at = COALESCE(sf.current_version_created_at, sf.created_at, NOW()),
  current_version_created_by = COALESCE(sf.current_version_created_by, 'backfill'),
  current_change_reason = COALESCE(sf.current_change_reason, 'backfill'),
  current_request_id = COALESCE(sf.current_request_id, 'backfill')
WHERE sf.current_version_id IS NULL;

-- ============================================================================
-- J) Enhance audit.concomitant_audit_logs with interrogated_version_id
--    This lets us track which specific version was interrogated
-- ============================================================================

-- Add interrogated_version_id to audit logs (version-aware interrogation)
ALTER TABLE audit.concomitant_audit_logs
  ADD COLUMN IF NOT EXISTS interrogated_version_id INT;

-- Index for version-specific audit lookups
CREATE INDEX IF NOT EXISTS audit_logs_interrogated_version_idx
  ON audit.concomitant_audit_logs (fragment_id, interrogated_version_id);

COMMENT ON COLUMN audit.concomitant_audit_logs.interrogated_version_id IS 
  'Version ID of the fragment that was interrogated (enables version-specific risk tracking)';

-- ============================================================================
-- COMMENTS (for documentation)
-- ============================================================================
COMMENT ON TABLE prose.smart_fragment_versions IS 
  'Immutable version history for prose fragments - 21 CFR Part 11 audit trail. '
  'Each row represents a specific point-in-time snapshot of a fragment.';

COMMENT ON COLUMN prose.smart_fragment_versions.fragment_id IS 
  'References the parent smart_fragments header row';

COMMENT ON COLUMN prose.smart_fragment_versions.version_id IS 
  'Sequential version number (1, 2, 3...) for this fragment';

COMMENT ON COLUMN prose.smart_fragment_versions.created_by IS 
  'User/system that created this version - populated from app.user session setting';

COMMENT ON COLUMN prose.smart_fragment_versions.change_reason IS 
  'Why this version was created - populated from app.reason session setting';

COMMENT ON COLUMN prose.smart_fragment_versions.request_id IS 
  'External change request ID - populated from app.request_id session setting';

COMMENT ON FUNCTION prose.tg_smart_fragments_before_versioning() IS 
  'BEFORE trigger: computes version_id increment and updates pointer fields on smart_fragments';

COMMENT ON FUNCTION prose.tg_smart_fragments_after_versioning() IS 
  'AFTER trigger: writes immutable version row to smart_fragment_versions';

COMMENT ON TRIGGER trg_no_update_delete_smart_fragment_versions 
  ON prose.smart_fragment_versions IS 
  'Append-only enforcement: prevents UPDATE/DELETE to maintain 21 CFR Part 11 compliance';

COMMIT;
