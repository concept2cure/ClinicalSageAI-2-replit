-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (§11.10(c) protection of records, §11.10(e) audit
--             trail, §11.70 signature/record linking), ALCOA+ principles
-- Purpose: A project's Vault can be sealed: an e-signed, hash-verified record
--          of every current document as it stood, which nothing can alter
--          (VR-19, docs/design/VAULT_DATA_ROOM_SEAL_2026-10-29.md).
--
-- Determinism Contract:
--   - A seal row is written once and never changed. Its manifest_sha256 is
--     sha256(stableStringify(manifest)) (server/services/vault/vault-seal.service.ts),
--     carried also by its chained audit row and its electronic signature.
-- =============================================================================
-- 20261029d_vault_data_room_seals.sql
--
-- WHAT.
--   1. public.vault_data_room_seals: one row per seal, in public with
--      organization_id INTEGER NOT NULL, so the tenant sweep at the tail of
--      the set gives it its policy and FORCE (Rule 1). The signature that
--      makes the seal is an electronic_signatures row naming the seal as its
--      target (vault-data-room-seal:<id>) and binding manifest_sha256; the
--      seal row cannot point at it, because it is written first and is never
--      updated.
--   2. The same-organisation project key (program_id, organization_id) →
--      regulatory_programs (id, organization_id), NOT VALID (the table is new),
--      with no ON DELETE action: a seal is never orphaned by deleting its
--      project. The tenant purge removes seals first, through (4).
--   3. Append-only: UPDATE and TRUNCATE are refused from every role, DELETE
--      unless the caller owns the table (the owner-run purge door below).
--   4. public.purge_tenant_vault_seals(p_org): the tenant purge's door for
--      seals (tenant-offboarding.ts PURGE_DOORS), with the preconditions of
--      purge_tenant_vault_records (20260926): the platform scope, a tenant
--      pending deletion, no active legal hold.
--
-- RULE 1: replayed on every deploy. Every statement runs only when its object
-- is absent, or is a CREATE OR REPLACE of a function this file alone defines.
-- No DROP, no backfill, no rewrite of a row.
-- =============================================================================

-- 1. The table and its index.
CREATE TABLE IF NOT EXISTS public.vault_data_room_seals (
  id               uuid PRIMARY KEY,
  organization_id  INTEGER NOT NULL,
  program_id       uuid NOT NULL,
  reason           text NOT NULL CONSTRAINT vault_data_room_seals_reason_present CHECK (length(btrim(reason)) > 0),
  manifest         jsonb NOT NULL,
  manifest_sha256  text NOT NULL CONSTRAINT vault_data_room_seals_manifest_sha256_hex CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  document_count   integer NOT NULL CONSTRAINT vault_data_room_seals_document_count_nonneg CHECK (document_count >= 0),
  sealed_by        integer NOT NULL,
  sealed_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault_data_room_seals_org_program_idx
  ON public.vault_data_room_seals (organization_id, program_id, sealed_at DESC);

-- 2. The same-organisation project key.
DO $mig$
BEGIN
  IF to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE NOTICE 'regulatory_programs absent - Vault seal project key skipped';
    RETURN;
  END IF;
  IF to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS regulatory_programs_id_org_uq
      ON public.regulatory_programs (id, organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vault_data_room_seals_program_same_org_fk'
                    AND conrelid = 'public.vault_data_room_seals'::regclass) THEN
    ALTER TABLE public.vault_data_room_seals
      ADD CONSTRAINT vault_data_room_seals_program_same_org_fk
      FOREIGN KEY (program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      NOT VALID;
  END IF;
END
$mig$;

-- 3. Append-only.
CREATE OR REPLACE FUNCTION public.vault_data_room_seals_guard()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' AND pg_has_role(current_user, (SELECT tableowner FROM pg_tables
       WHERE schemaname = 'public' AND tablename = 'vault_data_room_seals'), 'USAGE') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'VAULT_SEAL_IMMUTABLE: a Vault seal is never changed or removed (%).', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$fn$;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vault_data_room_seals_guard_row'
                    AND tgrelid = 'public.vault_data_room_seals'::regclass) THEN
    CREATE TRIGGER vault_data_room_seals_guard_row
      BEFORE UPDATE OR DELETE ON public.vault_data_room_seals
      FOR EACH ROW EXECUTE FUNCTION public.vault_data_room_seals_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vault_data_room_seals_guard_truncate'
                    AND tgrelid = 'public.vault_data_room_seals'::regclass) THEN
    CREATE TRIGGER vault_data_room_seals_guard_truncate
      BEFORE TRUNCATE ON public.vault_data_room_seals
      FOR EACH STATEMENT EXECUTE FUNCTION public.vault_data_room_seals_guard();
  END IF;
END
$mig$;

-- 4. The tenant purge's door.
CREATE OR REPLACE FUNCTION public.purge_tenant_vault_seals(p_org integer)
RETURNS TABLE (seals integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_status text;
  v_holds integer := 0;
  v_count integer := 0;
BEGIN
  IF NULLIF(current_setting('app.rls_enforce', true), '') = 'on'
     AND current_setting('app.current_user_role', true) IS DISTINCT FROM 'app_super_admin' THEN
    RAISE EXCEPTION 'VAULT_SEAL_PURGE_REFUSED: the tenant purge runs in the platform scope, not a tenant scope (organization %).', p_org
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT status INTO v_status FROM public.organizations WHERE id = p_org;
  IF v_status IS DISTINCT FROM 'pending_deletion' THEN
    RAISE EXCEPTION 'VAULT_SEAL_PURGE_REFUSED: organization % is not pending deletion (status %).', p_org, COALESCE(v_status, 'not found')
      USING ERRCODE = 'raise_exception';
  END IF;
  IF to_regclass('vault.legal_holds') IS NOT NULL THEN
    SELECT count(*) INTO v_holds FROM vault.legal_holds WHERE organization_id = p_org AND lifted_at IS NULL;
  END IF;
  IF v_holds > 0 THEN
    RAISE EXCEPTION 'VAULT_SEAL_PURGE_REFUSED: organization % has % active legal hold(s); records under hold cannot be destroyed.', p_org, v_holds
      USING ERRCODE = 'raise_exception';
  END IF;
  DELETE FROM public.vault_data_room_seals WHERE organization_id = p_org;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$fn$;

-- The door deletes as its owner, which the guard admits only when that is the
-- table's owner (the pattern of purge_tenant_vault_records, 20260926).
DO $mig$
DECLARE
  v_owner text;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO v_owner FROM pg_class WHERE oid = 'public.vault_data_room_seals'::regclass;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc
       WHERE oid = 'public.purge_tenant_vault_seals(integer)'::regprocedure) <> v_owner THEN
    EXECUTE format('ALTER FUNCTION public.purge_tenant_vault_seals(integer) OWNER TO %I', v_owner);
  END IF;
  REVOKE ALL ON FUNCTION public.purge_tenant_vault_seals(integer) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
    GRANT EXECUTE ON FUNCTION public.purge_tenant_vault_seals(integer) TO app_service;
  END IF;
END
$mig$;
