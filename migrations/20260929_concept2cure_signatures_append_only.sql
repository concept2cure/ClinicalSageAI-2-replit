-- ============================================================================
-- 20260929_concept2cure_signatures_append_only.sql
--
-- 21 CFR Part 11 §11.10(e) / §11.70: the artifact signature and the lock
-- snapshot are append-only in the database, not by convention.
--
-- WHY (D5, 2026-09-29; found by the adversarial review of
-- docs/evidence/D5/2026-09-28-artifact-approval-signature/):
-- `concept2cure_signatures` holds the approval and release signatures of
-- concept2cure artifacts, the ones the readiness engine, the Artifacts Center
-- and the DOCX signature block read. `concept2cure_submission_snapshots` holds
-- the record of each lock. Neither was protected on any applier:
--   * the only trigger on concept2cure_signatures is in
--     db/migrations/_legacy/20260128_concept2cure_signatures.sql, which no
--     applier runs (scripts/db/migration-set.mjs);
--   * db/migrations/20260318_ga_immutability_hardening.sql, which touched the
--     snapshots, is not in C2C_MIGRATION_FILES either.
-- So an UPDATE could rewrite a signer's printed name, meaning or hash, and a
-- DELETE, including the ON DELETE CASCADE from concept2cure_artifacts and
-- concept2cure_artifact_versions, could remove a signature while the artifact
-- stayed approved.
--
-- POLICY: strictly append-only. UPDATE, DELETE and TRUNCATE are refused for
-- every role. No server code updates or deletes either table (census,
-- 2026-09-29: no UPDATE / DELETE / .update() / .delete() on them in server/ or
-- scripts/). A correction is a new row. A cascade from deleting an artifact or
-- a version is refused with it, so a signed artifact cannot be deleted
-- together with its signatures.
--
-- Function names are new (c2c_artifact_record_*), so this never replaces the
-- legacy function where a legacy database still carries it.
--
-- Idempotent and replay-safe (CLAUDE.md Rule 1: every file here re-runs on
-- every deploy): CREATE OR REPLACE FUNCTION, CREATE TRIGGER only when absent,
-- tables guarded with to_regclass. Required at boot by
-- server/services/audit/audit-immutability-triggers.ts.
-- Pinned by server/services/audit/__tests__/concept2cure-signatures-append-only.pglite.test.ts.
-- ============================================================================

CREATE OR REPLACE FUNCTION c2c_artifact_record_block_row_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: % is append-only (21 CFR Part 11 §11.70) — % refused. Insert a new record instead.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE OR REPLACE FUNCTION c2c_artifact_record_block_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: % is append-only (21 CFR Part 11 §11.70) — TRUNCATE refused.',
    TG_TABLE_NAME
    USING ERRCODE = 'raise_exception';
END;
$$;

-- ── concept2cure_signatures ─────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.concept2cure_signatures') IS NULL THEN
    RAISE NOTICE '[c2c-append-only] concept2cure_signatures not present — nothing to protect.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.concept2cure_signatures'::regclass
                    AND tgname = 'trg_concept2cure_signatures_append_only' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_concept2cure_signatures_append_only
      BEFORE UPDATE OR DELETE ON public.concept2cure_signatures
      FOR EACH ROW EXECUTE FUNCTION c2c_artifact_record_block_row_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.concept2cure_signatures'::regclass
                    AND tgname = 'trg_concept2cure_signatures_no_truncate' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_concept2cure_signatures_no_truncate
      BEFORE TRUNCATE ON public.concept2cure_signatures
      FOR EACH STATEMENT EXECUTE FUNCTION c2c_artifact_record_block_truncate();
  END IF;
END;
$$;

-- ── concept2cure_submission_snapshots ───────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.concept2cure_submission_snapshots') IS NULL THEN
    RAISE NOTICE '[c2c-append-only] concept2cure_submission_snapshots not present — nothing to protect.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.concept2cure_submission_snapshots'::regclass
                    AND tgname = 'trg_concept2cure_submission_snapshots_append_only' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_concept2cure_submission_snapshots_append_only
      BEFORE UPDATE OR DELETE ON public.concept2cure_submission_snapshots
      FOR EACH ROW EXECUTE FUNCTION c2c_artifact_record_block_row_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.concept2cure_submission_snapshots'::regclass
                    AND tgname = 'trg_concept2cure_submission_snapshots_no_truncate' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_concept2cure_submission_snapshots_no_truncate
      BEFORE TRUNCATE ON public.concept2cure_submission_snapshots
      FOR EACH STATEMENT EXECUTE FUNCTION c2c_artifact_record_block_truncate();
  END IF;
END;
$$;
