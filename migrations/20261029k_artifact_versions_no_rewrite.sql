-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: a recorded artifact version is never rewritten (MR-12 CAT2-20,
--          2026-10-29).
--
-- eCTD/CTD Context:
--   - Module(s): every artifact-backed CTD document whose versions are signed,
--     locked or placed.
--   - Integrity Risk Addressed: a signed version's content and hash could be
--     rewritten in place while its signature still pointed at it.
--
-- Determinism Contract:
--   - No existing row is rewritten, moved or dropped.
-- =============================================================================
-- 20261029k_artifact_versions_no_rewrite.sql
--
-- 21 CFR Part 11 §11.10(e) / §11.70: a recorded artifact version is never
-- rewritten. An UPDATE of a concept2cure_artifact_versions row and a TRUNCATE
-- of the table are refused in the database, for every role.
--
-- WHY (MR-12, CAT2-20, 2026-10-29; evidence
-- docs/evidence/MR-12/2026-10-29-artifact-versions-no-rewrite/):
--   concept2cure_artifact_versions holds each artifact's version history: the
--   content and hash that a version's approval and release signatures
--   (concept2cure_signatures.artifact_version_id) and the lock snapshots point
--   at. The append-only trigger written for it is in
--   db/migrations/20260318_ga_immutability_hardening.sql, which no applier runs
--   (scripts/db/migration-set.mjs; 20260929_concept2cure_signatures_append_only.sql
--   records the same gap for the signatures). So an UPDATE could rewrite a
--   signed version's content while its signature still pointed at it.
--
-- POLICY. UPDATE refused per row, TRUNCATE per statement. Census of 2026-10-29
-- (server/, shared/, scripts/): every writer INSERTs a new version and nothing
-- else (artifactVersionStore.ts, exportGovernance.ts, artifactWriteback.ts,
-- verifiedSealService.ts, workflow-integrator.ts, AnaToolExecutor.ts). A new
-- version moves the artifact's head row (concept2cure_artifacts), never a
-- version row.
--
-- DELETE IS NOT REFUSED. The tenant purge deletes `projects`, whose cascade
-- reaches the artifacts and their versions; a signed version is still kept,
-- because its signatures refuse that cascade (20260929). No foreign key into
-- this table is ON DELETE SET NULL, so no cascade from anything is an UPDATE
-- here (baseline migrations/0000_sweet_joseph.sql).
--
-- The 20260318 file's own trigger (trg_no_update_delete_artifact_versions,
-- UPDATE and DELETE) is left alone where a database still carries it.
--
-- Idempotent and replay-safe (CLAUDE.md Rule 1): CREATE OR REPLACE FUNCTION,
-- then per trigger DROP TRIGGER IF EXISTS of this file's own names and CREATE
-- TRIGGER, so each deploy re-arms a trigger someone disabled. Guarded with
-- to_regclass. Creates no table and drops nothing another file creates.
-- Required at boot by server/services/audit/audit-immutability-triggers.ts.
-- Pinned by server/services/audit/__tests__/artifact-versions-no-rewrite.pglite.test.ts.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.c2c_artifact_version_no_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: concept2cure_artifact_versions is append-only (21 CFR Part 11 §11.70) — % refused. Record a new version instead.',
    TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$;

COMMENT ON FUNCTION public.c2c_artifact_version_no_rewrite() IS
  'Refuses UPDATE and TRUNCATE on concept2cure_artifact_versions (MR-12 CAT2-20, 2026-10-29). DELETE stays open for the tenant purge''s cascade.';

DO $$
BEGIN
  IF to_regclass('public.concept2cure_artifact_versions') IS NULL THEN
    RAISE NOTICE '[c2c-artifact-versions] concept2cure_artifact_versions not present; nothing to guard.';
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS trg_c2c_artifact_versions_no_rewrite ON public.concept2cure_artifact_versions;
  CREATE TRIGGER trg_c2c_artifact_versions_no_rewrite
    BEFORE UPDATE ON public.concept2cure_artifact_versions
    FOR EACH ROW EXECUTE FUNCTION public.c2c_artifact_version_no_rewrite();
  DROP TRIGGER IF EXISTS trg_c2c_artifact_versions_no_truncate ON public.concept2cure_artifact_versions;
  CREATE TRIGGER trg_c2c_artifact_versions_no_truncate
    BEFORE TRUNCATE ON public.concept2cure_artifact_versions
    FOR EACH STATEMENT EXECUTE FUNCTION public.c2c_artifact_version_no_rewrite();
END;
$$;
