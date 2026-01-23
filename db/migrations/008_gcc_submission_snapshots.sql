-- ============================================================================
-- Concept2Cure "Global Command Center" - Submission Snapshots + Freeze/Lock
-- Migration: 005_gcc_submission_snapshots.sql
-- Purpose:
--   - Freeze an exact set of fragment versions as a "Submission Snapshot"
--   - Capture risk + drift + truth coverage at freeze time (reproducible)
--   - Prevent mutation once snapshot leaves DRAFT (regulated record behavior)
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times (Neon-friendly)
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS prose;
CREATE SCHEMA IF NOT EXISTS audit;

-- ============================================================================
-- A) Snapshot status enum (idempotent)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                 WHERE t.typname='snapshot_status' AND n.nspname='prose') THEN
    CREATE TYPE prose.snapshot_status AS ENUM ('DRAFT','FROZEN','SUBMITTED','ARCHIVED');
  END IF;
END $$;

-- ============================================================================
-- B) Snapshots header table
-- ============================================================================
CREATE TABLE IF NOT EXISTS prose.submission_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  snapshot_name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'Global',  -- FDA/EMA/etc or Global
  target_agency TEXT,                           -- FDA, EMA, PMDA, NMPA (optional)
  dossier_type TEXT,                            -- IND/NDA/BLA/MAA/etc (optional)
  notes TEXT,

  status prose.snapshot_status NOT NULL DEFAULT 'DRAFT',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',

  frozen_at TIMESTAMPTZ,
  frozen_by TEXT,

  submitted_at TIMESTAMPTZ,
  submitted_by TEXT,

  archived_at TIMESTAMPTZ,
  archived_by TEXT
);

-- Avoid duplicate snapshot names within a jurisdiction
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='submission_snapshots_name_jurisdiction_uniq') THEN
    ALTER TABLE prose.submission_snapshots
      ADD CONSTRAINT submission_snapshots_name_jurisdiction_uniq UNIQUE (snapshot_name, jurisdiction);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS submission_snapshots_status_idx
  ON prose.submission_snapshots (status);

CREATE INDEX IF NOT EXISTS submission_snapshots_jurisdiction_idx
  ON prose.submission_snapshots (jurisdiction);

CREATE INDEX IF NOT EXISTS submission_snapshots_created_at_idx
  ON prose.submission_snapshots (created_at DESC);

-- ============================================================================
-- C) Snapshot fragments table (the frozen set of fragment versions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS prose.submission_snapshot_fragments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  snapshot_id UUID NOT NULL REFERENCES prose.submission_snapshots(id) ON DELETE RESTRICT,

  fragment_id UUID NOT NULL REFERENCES prose.smart_fragments(id) ON DELETE RESTRICT,
  version_id INT NOT NULL,

  -- denormalized context at time of inclusion (avoid later ambiguity)
  ectd_section_path TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'Global',

  included_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  included_by TEXT NOT NULL DEFAULT 'unknown',

  -- frozen "quality state" at inclusion time (what was risk then?)
  truth_link_count_at_freeze INT,
  primary_endpoint_links_at_freeze INT,
  risk_status_at_freeze TEXT,
  drift_magnitude_at_freeze DOUBLE PRECISION,
  audit_log_id UUID REFERENCES audit.concomitant_audit_logs(id) ON DELETE SET NULL,

  CONSTRAINT submission_snapshot_fragments_version_positive CHECK (version_id >= 1)
);

-- One version per fragment per snapshot
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='snapshot_fragments_dedup') THEN
    ALTER TABLE prose.submission_snapshot_fragments
      ADD CONSTRAINT snapshot_fragments_dedup UNIQUE (snapshot_id, fragment_id);
  END IF;
END $$;

-- Enforce that (fragment_id, version_id) exists in the immutable versions table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='snapshot_fragments_version_fk') THEN
    ALTER TABLE prose.submission_snapshot_fragments
      ADD CONSTRAINT snapshot_fragments_version_fk
      FOREIGN KEY (fragment_id, version_id)
      REFERENCES prose.smart_fragment_versions(fragment_id, version_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS snapshot_fragments_snapshot_idx
  ON prose.submission_snapshot_fragments (snapshot_id);

CREATE INDEX IF NOT EXISTS snapshot_fragments_section_idx
  ON prose.submission_snapshot_fragments (ectd_section_path);

CREATE INDEX IF NOT EXISTS snapshot_fragments_risk_idx
  ON prose.submission_snapshot_fragments (risk_status_at_freeze);

CREATE INDEX IF NOT EXISTS snapshot_fragments_fragment_idx
  ON prose.submission_snapshot_fragments (fragment_id);

-- ============================================================================
-- D) Attribution helpers (read session vars set by the app)
-- Convention:
--   SET LOCAL app.user = 'user@company.com';
--   SET LOCAL app.reason = '...';
--   SET LOCAL app.request_id = '...';
-- ============================================================================

CREATE OR REPLACE FUNCTION prose.tg_submission_snapshots_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.created_by := COALESCE(NEW.created_by, current_setting('app.user', true), 'unknown');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submission_snapshots_before_insert ON prose.submission_snapshots;
CREATE TRIGGER trg_submission_snapshots_before_insert
  BEFORE INSERT ON prose.submission_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION prose.tg_submission_snapshots_before_insert();

-- ============================================================================
-- E) Snapshot state machine + immutability after leaving DRAFT
-- ============================================================================
CREATE OR REPLACE FUNCTION prose.tg_submission_snapshots_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user TEXT := COALESCE(current_setting('app.user', true), 'unknown');
BEGIN
  -- If status changes, enforce valid transitions and set timestamps/by
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'DRAFT' AND NEW.status IN ('FROZEN','ARCHIVED') THEN
      IF NEW.status = 'FROZEN' THEN
        NEW.frozen_at := COALESCE(NEW.frozen_at, NOW());
        NEW.frozen_by := COALESCE(NEW.frozen_by, v_user);
      ELSE
        NEW.archived_at := COALESCE(NEW.archived_at, NOW());
        NEW.archived_by := COALESCE(NEW.archived_by, v_user);
      END IF;

    ELSIF OLD.status = 'FROZEN' AND NEW.status IN ('SUBMITTED','ARCHIVED') THEN
      IF NEW.status = 'SUBMITTED' THEN
        NEW.submitted_at := COALESCE(NEW.submitted_at, NOW());
        NEW.submitted_by := COALESCE(NEW.submitted_by, v_user);
      ELSE
        NEW.archived_at := COALESCE(NEW.archived_at, NOW());
        NEW.archived_by := COALESCE(NEW.archived_by, v_user);
      END IF;

    ELSIF OLD.status = 'SUBMITTED' AND NEW.status = 'ARCHIVED' THEN
      NEW.archived_at := COALESCE(NEW.archived_at, NOW());
      NEW.archived_by := COALESCE(NEW.archived_by, v_user);

    ELSE
      RAISE EXCEPTION 'Invalid snapshot status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  -- After leaving DRAFT, snapshot metadata becomes immutable (except status + timestamps/by)
  IF OLD.status <> 'DRAFT' THEN
    IF (to_jsonb(NEW)
          - 'status'
          - 'frozen_at' - 'frozen_by'
          - 'submitted_at' - 'submitted_by'
          - 'archived_at' - 'archived_by')
       <> (to_jsonb(OLD)
          - 'status'
          - 'frozen_at' - 'frozen_by'
          - 'submitted_at' - 'submitted_by'
          - 'archived_at' - 'archived_by') THEN
      RAISE EXCEPTION 'Snapshot is immutable after leaving DRAFT';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submission_snapshots_before_update ON prose.submission_snapshots;
CREATE TRIGGER trg_submission_snapshots_before_update
  BEFORE UPDATE ON prose.submission_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION prose.tg_submission_snapshots_before_update();

-- Prevent DELETE unless still DRAFT
CREATE OR REPLACE FUNCTION prose.prevent_snapshot_delete_when_not_draft()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Cannot delete snapshot unless status is DRAFT';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_delete_snapshot_unless_draft ON prose.submission_snapshots;
CREATE TRIGGER trg_no_delete_snapshot_unless_draft
  BEFORE DELETE ON prose.submission_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION prose.prevent_snapshot_delete_when_not_draft();

-- ============================================================================
-- F) Snapshot fragments: auto-populate denormalized fields + freeze metrics
-- ============================================================================
CREATE OR REPLACE FUNCTION prose.tg_snapshot_fragments_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_sf RECORD;
  v_cov RECORD;
  v_lr RECORD;
BEGIN
  -- Ensure snapshot is editable
  PERFORM 1 FROM prose.submission_snapshots s
   WHERE s.id = NEW.snapshot_id AND s.status = 'DRAFT';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot must be DRAFT to add fragments';
  END IF;

  NEW.included_by := COALESCE(NEW.included_by, current_setting('app.user', true), 'unknown');

  -- Pull current fragment context (if caller didn't supply)
  SELECT id, ectd_section_path, jurisdiction, version_id
    INTO v_sf
  FROM prose.smart_fragments
  WHERE id = NEW.fragment_id;

  IF v_sf.id IS NULL THEN
    RAISE EXCEPTION 'Fragment not found: %', NEW.fragment_id;
  END IF;

  NEW.ectd_section_path := COALESCE(NEW.ectd_section_path, v_sf.ectd_section_path);
  NEW.jurisdiction := COALESCE(NEW.jurisdiction, v_sf.jurisdiction);
  NEW.version_id := COALESCE(NEW.version_id, v_sf.version_id);

  -- Capture truth coverage at inclusion time
  SELECT *
    INTO v_cov
  FROM prose.v_fragment_truth_coverage
  WHERE fragment_id = NEW.fragment_id;

  NEW.truth_link_count_at_freeze := COALESCE(NEW.truth_link_count_at_freeze, COALESCE(v_cov.truth_link_count, 0));
  NEW.primary_endpoint_links_at_freeze := COALESCE(NEW.primary_endpoint_links_at_freeze, COALESCE(v_cov.primary_endpoint_links, 0));

  -- Capture latest interrogation state at inclusion time
  SELECT *
    INTO v_lr
  FROM audit.v_fragment_latest_risk
  WHERE fragment_id = NEW.fragment_id;

  NEW.risk_status_at_freeze := COALESCE(NEW.risk_status_at_freeze, v_lr.risk_status);
  NEW.drift_magnitude_at_freeze := COALESCE(NEW.drift_magnitude_at_freeze, v_lr.drift_magnitude);
  NEW.audit_log_id := COALESCE(NEW.audit_log_id, v_lr.audit_log_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_fragments_before_insert ON prose.submission_snapshot_fragments;
CREATE TRIGGER trg_snapshot_fragments_before_insert
  BEFORE INSERT ON prose.submission_snapshot_fragments
  FOR EACH ROW
  EXECUTE FUNCTION prose.tg_snapshot_fragments_before_insert();

-- Prevent UPDATE/DELETE of snapshot fragments once snapshot is not DRAFT
CREATE OR REPLACE FUNCTION prose.prevent_snapshot_fragments_mutation_when_not_draft()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status prose.snapshot_status;
  v_snapshot_id UUID := COALESCE(NEW.snapshot_id, OLD.snapshot_id);
BEGIN
  SELECT status INTO v_status
  FROM prose.submission_snapshots
  WHERE id = v_snapshot_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Snapshot not found: %', v_snapshot_id;
  END IF;

  IF v_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Snapshot fragments are immutable once snapshot leaves DRAFT';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_no_update_delete_snapshot_fragments_when_not_draft
  ON prose.submission_snapshot_fragments;

CREATE TRIGGER trg_no_update_delete_snapshot_fragments_when_not_draft
  BEFORE UPDATE OR DELETE ON prose.submission_snapshot_fragments
  FOR EACH ROW
  EXECUTE FUNCTION prose.prevent_snapshot_fragments_mutation_when_not_draft();

-- ============================================================================
-- G) Gate metrics view (release governance)
-- Recommended default gate: no RED, no unlinked, max drift <= 0.15
-- ============================================================================
CREATE OR REPLACE VIEW prose.v_snapshot_gate_metrics AS
SELECT
  ss.id AS snapshot_id,
  ss.snapshot_name,
  ss.jurisdiction,
  ss.target_agency,
  ss.dossier_type,
  ss.status,

  COUNT(snf.id)::INT AS fragments_total,

  COUNT(*) FILTER (WHERE COALESCE(snf.truth_link_count_at_freeze,0) = 0)::INT AS unlinked_fragments,
  COUNT(*) FILTER (WHERE snf.risk_status_at_freeze = 'DATA_DRIFT')::INT AS red_fragments,
  COUNT(*) FILTER (WHERE snf.risk_status_at_freeze = 'IR_PREDICTED')::INT AS amber_fragments,
  COUNT(*) FILTER (WHERE snf.risk_status_at_freeze = 'ALIGNED')::INT AS green_fragments,
  COUNT(*) FILTER (WHERE snf.risk_status_at_freeze IS NULL)::INT AS never_interrogated_fragments,

  AVG(snf.drift_magnitude_at_freeze) AS avg_drift,
  MAX(snf.drift_magnitude_at_freeze) AS max_drift,

  -- recommended gate rule (tweak threshold later)
  (
    (COUNT(*) FILTER (WHERE snf.risk_status_at_freeze = 'DATA_DRIFT') = 0)
    AND (COUNT(*) FILTER (WHERE COALESCE(snf.truth_link_count_at_freeze,0) = 0) = 0)
    AND (COALESCE(MAX(snf.drift_magnitude_at_freeze), 0) <= 0.15)
  ) AS gate_pass_recommended

FROM prose.submission_snapshots ss
LEFT JOIN prose.submission_snapshot_fragments snf ON snf.snapshot_id = ss.id
GROUP BY
  ss.id, ss.snapshot_name, ss.jurisdiction, ss.target_agency, ss.dossier_type, ss.status;

COMMENT ON VIEW prose.v_snapshot_gate_metrics IS
  'Gate metrics for submission snapshots - use for release governance decisions';

-- ============================================================================
-- COMMENTS (for documentation)
-- ============================================================================
COMMENT ON TABLE prose.submission_snapshots IS
  'Frozen submission snapshots - captures exact fragment versions at filing time';

COMMENT ON TABLE prose.submission_snapshot_fragments IS
  'Fragment versions included in a snapshot with frozen risk state';

COMMENT ON FUNCTION prose.tg_submission_snapshots_before_update() IS
  'Enforces state machine transitions (DRAFT→FROZEN→SUBMITTED→ARCHIVED) and immutability';

COMMENT ON FUNCTION prose.prevent_snapshot_delete_when_not_draft() IS
  'Prevents deletion of snapshots that have left DRAFT status';

COMMENT ON FUNCTION prose.tg_snapshot_fragments_before_insert() IS
  'Auto-populates denormalized fields and captures current risk state at inclusion time';

COMMENT ON FUNCTION prose.prevent_snapshot_fragments_mutation_when_not_draft() IS
  'Prevents modification of snapshot fragments once snapshot leaves DRAFT';

COMMIT;
