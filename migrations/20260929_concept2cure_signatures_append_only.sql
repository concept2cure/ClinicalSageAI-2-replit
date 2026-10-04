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
-- AMENDED 2026-10-01 (rows D5/D6,
-- docs/evidence/D6/2026-10-01-purge-signed-tenant/), in place per CLAUDE.md
-- Rule 1: the tenant purge reaches these two tables, and nothing else can.
--   * Why. The tenant purge deletes `projects`, which cascades to the
--     artifacts. This file refused that cascade, so a purge of any tenant that
--     had approved or locked an artifact failed, and the tenant could not be
--     offboarded. MSA §10.2 / DPA §3.5 delete Customer Data and retain
--     audit-trail records. Each signing's audit-trail record is its chained
--     ledger row (recordGovernedAction in server/services/artifact-signed-act.ts),
--     which the purge keeps. The signature and snapshot rows are the tenant's
--     records: the tenant export returns them, then the purge erases them.
--   * How. This is the turn-record door's shape (20260926_ana_turn_records.sql).
--     A row DELETE passes c2c_artifact_record_block_row_mutation only when
--     current_user is artifact_record_purger: NOLOGIN, NOINHERIT, NOBYPASSRLS,
--     created here. The only thing that runs as it is
--     public.purge_tenant_artifact_records(integer). That function is
--     SECURITY DEFINER, search_path pinned, EXECUTE revoked from PUBLIC. It
--     refuses outside the platform scope, for an organization not pending
--     deletion, and under an active legal hold. UPDATE is refused for everyone.
--     A direct DELETE or a cascade from any other caller is still refused, so
--     a signed artifact still cannot be deleted with its signatures. TRUNCATE
--     is refused for everyone.
--   * Called by purgeArtifactRecords in server/services/tenant/tenant-offboarding.ts,
--     inside the purge's transaction and before `projects`. Pinned by
--     tests/db/tenant-purge-artifact-records.dbtest.ts.
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
  -- 2026-10-01: the tenant purge's door, and only it. current_user is
  -- artifact_record_purger inside public.purge_tenant_artifact_records alone.
  IF TG_OP = 'DELETE' AND current_user = 'artifact_record_purger' THEN
    RETURN OLD;
  END IF;
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

-- =============================================================================
-- The tenant purge's door (2026-10-01; see the AMENDED note in the header).
-- =============================================================================
DO $purge$
DECLARE
  v_applier_is_super boolean;
  v_applier_can_set  boolean;
BEGIN
  IF to_regclass('public.concept2cure_signatures') IS NULL
     OR to_regclass('public.concept2cure_submission_snapshots') IS NULL THEN
    RAISE NOTICE '[c2c-append-only] tables not present — purge door not installed.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'artifact_record_purger') THEN
    CREATE ROLE artifact_record_purger
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
  END IF;
  -- A non-superuser applier (the RDS master) must be able to SET ROLE to the
  -- owner it hands the function to: ask, grant itself membership if it created
  -- the role, otherwise fail closed with the remedy.
  SELECT rolsuper INTO v_applier_is_super FROM pg_roles WHERE rolname = current_user;
  IF NOT COALESCE(v_applier_is_super, false) THEN
    IF current_setting('server_version_num')::int >= 160000 THEN
      v_applier_can_set := pg_has_role(current_user, 'artifact_record_purger', 'SET');
    ELSE
      v_applier_can_set := pg_has_role(current_user, 'artifact_record_purger', 'MEMBER');
    END IF;
    IF NOT v_applier_can_set THEN
      BEGIN
        EXECUTE format('GRANT artifact_record_purger TO %I', current_user);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE EXCEPTION '[c2c-append-only] % cannot become a member of artifact_record_purger and so cannot install the purge door', current_user
          USING HINT = format('Have a superuser run: GRANT artifact_record_purger TO %I; then re-run the migration set.', current_user);
      END;
    END IF;
  END IF;
  -- What the door reads and deletes, and nothing more.
  GRANT USAGE, CREATE ON SCHEMA public TO artifact_record_purger;
  GRANT SELECT, DELETE ON public.concept2cure_signatures, public.concept2cure_submission_snapshots TO artifact_record_purger;
  IF to_regclass('public.organizations') IS NOT NULL THEN
    GRANT SELECT ON public.organizations TO artifact_record_purger;
  END IF;
  IF to_regclass('vault.legal_holds') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA vault TO artifact_record_purger;
    GRANT SELECT ON vault.legal_holds TO artifact_record_purger;
  END IF;

  -- The preconditions are purge_tenant_vault_records' and
  -- purge_tenant_turn_records'. Both tables' tenant policies, organizations'
  -- and vault.legal_holds' admit the platform scope this requires.
  CREATE OR REPLACE FUNCTION public.purge_tenant_artifact_records(p_org integer)
  RETURNS TABLE (signatures integer, snapshots integer)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $fn$
  DECLARE
    v_status     text;
    v_holds      integer := 0;
    v_signatures integer;
    v_snapshots  integer;
  BEGIN
    IF NULLIF(current_setting('app.rls_enforce', true), '') = 'on'
       AND current_setting('app.current_user_role', true) IS DISTINCT FROM 'app_super_admin' THEN
      RAISE EXCEPTION 'ARTIFACT_RECORD_PURGE_REFUSED: the tenant purge runs in the platform scope, not a tenant scope (organization %).', p_org
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT o.status INTO v_status FROM public.organizations o WHERE o.id = p_org;
    IF v_status IS DISTINCT FROM 'pending_deletion' THEN
      RAISE EXCEPTION 'ARTIFACT_RECORD_PURGE_REFUSED: organization % is not pending deletion (status %).', p_org, COALESCE(v_status, 'not found')
        USING ERRCODE = 'raise_exception';
    END IF;
    IF to_regclass('vault.legal_holds') IS NOT NULL THEN
      EXECUTE 'SELECT count(*)::int FROM vault.legal_holds WHERE organization_id = $1 AND lifted_at IS NULL'
        INTO v_holds USING p_org;
    END IF;
    IF v_holds > 0 THEN
      RAISE EXCEPTION 'ARTIFACT_RECORD_PURGE_REFUSED: organization % has % active legal hold(s); records under hold cannot be destroyed.', p_org, v_holds
        USING ERRCODE = 'raise_exception';
    END IF;
    DELETE FROM public.concept2cure_submission_snapshots s WHERE s.organization_id = p_org;
    GET DIAGNOSTICS v_snapshots = ROW_COUNT;
    DELETE FROM public.concept2cure_signatures g WHERE g.organization_id = p_org;
    GET DIAGNOSTICS v_signatures = ROW_COUNT;
    RETURN QUERY SELECT v_signatures, v_snapshots;
  END;
  $fn$;

  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc
       WHERE oid = 'public.purge_tenant_artifact_records(integer)'::regprocedure) <> 'artifact_record_purger' THEN
    ALTER FUNCTION public.purge_tenant_artifact_records(integer) OWNER TO artifact_record_purger;
  END IF;
  REVOKE ALL ON FUNCTION public.purge_tenant_artifact_records(integer) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
    GRANT EXECUTE ON FUNCTION public.purge_tenant_artifact_records(integer) TO app_service;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE oid = 'public.purge_tenant_artifact_records(integer)'::regprocedure
       AND prosecdef AND pg_get_userbyid(proowner) = 'artifact_record_purger'
  ) THEN
    RAISE EXCEPTION '[c2c-append-only] the purge door is not SECURITY DEFINER owned by artifact_record_purger';
  END IF;
  IF has_function_privilege('public', 'public.purge_tenant_artifact_records(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '[c2c-append-only] the purge door is executable by PUBLIC';
  END IF;
END
$purge$;
