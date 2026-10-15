-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — the Vault (vault.documents), the controlled store
--         of every admitted regulatory document version
-- Compliance: 21 CFR Part 11 §11.10(c) (protection of records to enable their
--             accurate and ready retrieval), §11.10(e) (a change must not
--             obscure previously recorded information), ALCOA+ (original,
--             enduring).
-- Purpose: The database refuses any change to a recorded version's identity,
--          bytes pointer, hash, uploader or lineage, whatever the role or code
--          path; descriptive fields and filing change only through their named
--          writers (VR-06, docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md).
--
-- eCTD/CTD Context:
--   - Module(s): every module; a Vault version is what a submission leaf pins
--     (content_hash) and what an inspector is shown as admitted.
--   - Integrity Risk Addressed: `UPDATE vault.documents SET content_hash = …`
--     succeeded for the runtime role, and TRUNCATE for the owner.
--
-- Determinism Contract:
--   - A pinned content_hash never changes under the leaf that cites it.
--
-- Notes:
--   - Replays on every deploy (CLAUDE.md Rule 1): CREATE OR REPLACE for the
--     functions, each trigger created only when absent, no DROP. A future
--     change to the column rules amends THIS file in place with a dated note.
--   - Every backfill that replays before this file on a deploy writes
--     `WHERE x IS NULL` (20260821_vault_documents_canonical_shape.sql,
--     20260905_vault_documents_organization_id.sql), which the write-once rule
--     admits; so do the storage adoption (storage-migration.service.ts) and the
--     ingest's same-bytes retry (vault-ingest.service.ts).
--   - Only the table owner can disable these triggers; production refuses to
--     boot with the runtime role owning an RLS table (server/db/rlsEnforcement.ts),
--     and refuses to boot with any of them missing or disabled
--     (server/services/audit/audit-immutability-triggers.ts).
--
-- AMENDED 2026-09-29 (VR-07, rows D5/D6,
-- docs/evidence/D5/2026-09-29-vault-record-no-delete/), in place per CLAUDE.md
-- Rule 1: a recorded version cannot be deleted either. Any runtime-role DELETE
-- succeeded, and the retention job hard-deleted when a policy said so.
--   - vault_documents_delete_guard refuses DELETE from anyone but the table's
--     owner. It reads no session setting, so no SET makes a DELETE pass.
--   - public.purge_tenant_vault_records(integer) is the runtime role's one way
--     to remove versions. It is SECURITY DEFINER, owned by the table's owner,
--     and runs with a pinned search_path. It refuses unless the caller is in
--     the platform scope the purge route runs in, the organization is
--     pending_deletion (tenant-offboarding.ts) and no legal hold on it is
--     active. It then deletes that organization's chunks and versions with
--     VAULT_DOCUMENT_TENANCY's predicate (server/services/tenant/vault-tenancy.ts;
--     tenant-purge-vault-scope.pglite.integration.test.ts pins the two
--     together), and returns each deleted version's storage address, so the
--     purge erases those bytes after it commits. EXECUTE is revoked from PUBLIC.
--   - It also closes an erasure gap. The purge route runs as the runtime role in
--     the platform scope, and the Vault's policies have no platform arm. So the
--     purge's own DELETE and its read of the bytes' addresses matched nothing:
--     a purged tenant kept every Vault version and its bytes, and the purge
--     reported success. The function deletes as the table's owner, and the
--     table does not FORCE row security, so it reaches the whole predicate.
--   - Nothing is dropped. Replays: CREATE OR REPLACE, triggers only when absent.
--
-- AMENDED 2026-10-01 (plan critique 13, rows D5/D6,
-- docs/evidence/D5/2026-10-01-vault-archives/), in place per CLAUDE.md Rule 1:
-- vault.document_archives, the snapshot the retention job takes before it
-- disposes of a document (its full record, extracted text included), is held
-- to the same rules as the versions it preserves.
--   - Its creating file (migrations/20260608_vault_retention.sql) joins the
--     deploy set just before this one; until now a database built by
--     deploy-migrate had no archive to write to.
--   - vault_document_archives_guard refuses every UPDATE, and
--     vault_document_archives_delete_guard every DELETE but the table owner's.
--     vault_document_archives_truncate_guard refuses TRUNCATE.
--   - Row security mirrors vault.documents: read with core.can_access_program,
--     insert, update and delete with core.can_write_program (so the guards
--     answer an update or delete with a refusal), so another organisation
--     cannot read an archive. Not FORCEd, like vault.documents, so the owner-run purge
--     reaches it.
--   - purge_tenant_vault_records also deletes the organisation's archives.
--   - Nothing is dropped. Replays: CREATE OR REPLACE, triggers and policies
--     only when absent.
-- =============================================================================

DO $vr06$
DECLARE
  v_owner name;
BEGIN
  IF to_regclass('vault.documents') IS NULL THEN
    RAISE NOTICE 'vault.documents not present - record guard not installed';
    RETURN;
  END IF;

  -- Row guard. Columns are compared through to_jsonb so a column that a given
  -- database does not carry (legacy `filename`, `s3_version_id`) is simply
  -- absent from the comparison rather than an error.
  --   Frozen:      never changes.
  --   Write-once:  NULL → value only (the replayed backfills, an adoption,
  --                a soft delete). value → other value, or back to NULL, is refused.
  --   Adoption:    s3_key, s3_bucket and storage_provider may change value →
  --                value only in the UPDATE that sets storage_version_id
  --                NULL → value (the hash, being frozen, is unchanged).
  --   Everything else (title, type, classification, filing, processing,
  --   retention_until, updated_at) is mutable here and governed by its writer.
  CREATE OR REPLACE FUNCTION vault.documents_record_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  DECLARE
    o jsonb := to_jsonb(OLD);
    n jsonb := to_jsonb(NEW);
    col text;
    adopting boolean;
  BEGIN
    FOREACH col IN ARRAY ARRAY['id', 'program_id', 'version', 'content_hash', 'file_size',
                               'mime_type', 'created_by', 'created_at'] LOOP
      IF o ? col AND (o -> col) IS DISTINCT FROM (n -> col) THEN
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: vault.documents.% of version % is recorded and cannot change (21 CFR 11.10(e)). Upload a new version instead.', col, OLD.id
          USING ERRCODE = 'raise_exception';
      END IF;
    END LOOP;

    adopting := jsonb_typeof(o -> 'storage_version_id') IS DISTINCT FROM 'string'
                AND jsonb_typeof(n -> 'storage_version_id') = 'string';

    FOREACH col IN ARRAY ARRAY['organization_id', 'document_code', 'file_name', 'filename',
                               's3_key', 's3_bucket', 'storage_version_id', 'storage_provider',
                               's3_version_id', 'retention_policy', 'supersedes_id',
                               'parent_document_id', 'deleted_at'] LOOP
      IF o ? col AND (o -> col) IS DISTINCT FROM (n -> col) THEN
        CONTINUE WHEN jsonb_typeof(o -> col) = 'null';
        CONTINUE WHEN adopting AND col IN ('s3_key', 's3_bucket', 'storage_provider');
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: vault.documents.% of version % is set once and cannot be changed or cleared (21 CFR 11.10(e)).', col, OLD.id
          USING ERRCODE = 'raise_exception';
      END IF;
    END LOOP;

    RETURN NEW;
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION vault.documents_truncate_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: vault.documents holds recorded versions and cannot be truncated (21 CFR 11.10(c)).'
      USING ERRCODE = 'raise_exception';
  END;
  $fn$;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'vault.documents'::regclass AND tgname = 'vault_documents_record_guard'
  ) THEN
    CREATE TRIGGER vault_documents_record_guard
      BEFORE UPDATE ON vault.documents
      FOR EACH ROW EXECUTE FUNCTION vault.documents_record_guard();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'vault.documents'::regclass AND tgname = 'vault_documents_truncate_guard'
  ) THEN
    CREATE TRIGGER vault_documents_truncate_guard
      BEFORE TRUNCATE ON vault.documents
      FOR EACH STATEMENT EXECUTE FUNCTION vault.documents_truncate_guard();
  END IF;

  -- VR-07: only the table's owner deletes a recorded version. Inside
  -- purge_tenant_vault_records, current_user is that owner.
  CREATE OR REPLACE FUNCTION vault.documents_delete_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    IF current_user = (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = TG_RELID) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: vault.documents version % is recorded and cannot be deleted (21 CFR 11.10(c)). Only the tenant purge removes recorded versions.', OLD.id
      USING ERRCODE = 'raise_exception';
  END;
  $fn$;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'vault.documents'::regclass AND tgname = 'vault_documents_delete_guard'
  ) THEN
    CREATE TRIGGER vault_documents_delete_guard
      BEFORE DELETE ON vault.documents
      FOR EACH ROW EXECUTE FUNCTION vault.documents_delete_guard();
  END IF;

  -- The tenant purge's door (tenant-offboarding.ts purgeTenant). It restates at
  -- the database the preconditions the purge checks in code. The DELETE is
  -- VAULT_DOCUMENT_TENANCY with $1 as p_org.
  CREATE OR REPLACE FUNCTION public.purge_tenant_vault_records(p_org integer)
  RETURNS TABLE (storage_version_id text, storage_provider text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, vault, public
  AS $fn$
  #variable_conflict use_column
  DECLARE
    v_status text;
    v_holds integer := 0;
  BEGIN
    IF NULLIF(current_setting('app.rls_enforce', true), '') = 'on'
       AND current_setting('app.current_user_role', true) IS DISTINCT FROM 'app_super_admin' THEN
      RAISE EXCEPTION 'VAULT_PURGE_REFUSED: the tenant purge runs in the platform scope, not a tenant scope (organization %).', p_org
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT status INTO v_status FROM public.organizations WHERE id = p_org;
    IF v_status IS DISTINCT FROM 'pending_deletion' THEN
      RAISE EXCEPTION 'VAULT_PURGE_REFUSED: organization % is not pending deletion (status %).', p_org, COALESCE(v_status, 'not found')
        USING ERRCODE = 'raise_exception';
    END IF;
    IF to_regclass('vault.legal_holds') IS NOT NULL THEN
      SELECT count(*) INTO v_holds FROM vault.legal_holds WHERE organization_id = p_org AND lifted_at IS NULL;
    END IF;
    IF v_holds > 0 THEN
      RAISE EXCEPTION 'VAULT_PURGE_REFUSED: organization % has % active legal hold(s); records under hold cannot be destroyed.', p_org, v_holds
        USING ERRCODE = 'raise_exception';
    END IF;
    -- The deletion archive's snapshots of this organisation's documents
    -- (critique 13, 2026-10-01).
    IF to_regclass('vault.document_archives') IS NOT NULL THEN
      DELETE FROM vault.document_archives
       WHERE program_id IN (SELECT id FROM public.regulatory_programs WHERE organization_id = p_org);
    END IF;
    DELETE FROM vault.document_chunks
     WHERE document_id IN (
       SELECT id FROM vault.documents
        WHERE (organization_id = p_org OR program_id IN (SELECT id FROM public.regulatory_programs WHERE organization_id = p_org)));
    -- One row per version deleted, with where its bytes are stored, so the
    -- purge erases exactly those after it commits.
    RETURN QUERY
      DELETE FROM vault.documents d
       WHERE (d.organization_id = p_org OR d.program_id IN (SELECT id FROM public.regulatory_programs WHERE organization_id = p_org))
      RETURNING d.storage_version_id::text, d.storage_provider::text;
  END;
  $fn$;

  -- The deletion archive (critique 13, 2026-10-01): append-only, owner-only
  -- delete, no TRUNCATE, and row security mirroring vault.documents.
  IF to_regclass('vault.document_archives') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION vault.document_archives_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: vault.document_archives snapshot % is a record of a disposal and cannot be changed (21 CFR 11.10(e)).', OLD.id
        USING ERRCODE = 'raise_exception';
    END;
    $fn$;

    CREATE OR REPLACE FUNCTION vault.document_archives_delete_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      IF current_user = (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = TG_RELID) THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: vault.document_archives snapshot % is a record of a disposal and cannot be deleted (21 CFR 11.10(c)). Only the tenant purge removes it.', OLD.id
        USING ERRCODE = 'raise_exception';
    END;
    $fn$;

    CREATE OR REPLACE FUNCTION vault.document_archives_truncate_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: vault.document_archives holds the record of every disposal and cannot be truncated (21 CFR 11.10(c)).'
        USING ERRCODE = 'raise_exception';
    END;
    $fn$;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'vault.document_archives'::regclass AND tgname = 'vault_document_archives_guard') THEN
      CREATE TRIGGER vault_document_archives_guard
        BEFORE UPDATE ON vault.document_archives
        FOR EACH ROW EXECUTE FUNCTION vault.document_archives_guard();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'vault.document_archives'::regclass AND tgname = 'vault_document_archives_delete_guard') THEN
      CREATE TRIGGER vault_document_archives_delete_guard
        BEFORE DELETE ON vault.document_archives
        FOR EACH ROW EXECUTE FUNCTION vault.document_archives_delete_guard();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'vault.document_archives'::regclass AND tgname = 'vault_document_archives_truncate_guard') THEN
      CREATE TRIGGER vault_document_archives_truncate_guard
        BEFORE TRUNCATE ON vault.document_archives
        FOR EACH STATEMENT EXECUTE FUNCTION vault.document_archives_truncate_guard();
    END IF;

    IF to_regprocedure('core.can_access_program(uuid)') IS NOT NULL
       AND to_regprocedure('core.can_write_program(uuid)') IS NOT NULL THEN
      ALTER TABLE vault.document_archives ENABLE ROW LEVEL SECURITY;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'vault.document_archives'::regclass AND polname = 'vault_document_archives_select_policy') THEN
        CREATE POLICY vault_document_archives_select_policy ON vault.document_archives
          FOR SELECT USING (core.can_access_program(program_id));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'vault.document_archives'::regclass AND polname = 'vault_document_archives_insert_policy') THEN
        CREATE POLICY vault_document_archives_insert_policy ON vault.document_archives
          FOR INSERT WITH CHECK (core.can_write_program(program_id));
      END IF;
      -- UPDATE and DELETE are admitted here so the guards above answer with an
      -- explicit refusal, as on vault.documents, rather than a silent no-op.
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'vault.document_archives'::regclass AND polname = 'vault_document_archives_update_policy') THEN
        CREATE POLICY vault_document_archives_update_policy ON vault.document_archives
          FOR UPDATE USING (core.can_write_program(program_id));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'vault.document_archives'::regclass AND polname = 'vault_document_archives_delete_policy') THEN
        CREATE POLICY vault_document_archives_delete_policy ON vault.document_archives
          FOR DELETE USING (core.can_write_program(program_id));
      END IF;
    ELSE
      RAISE NOTICE 'core.can_access_program / can_write_program absent: vault.document_archives row security not installed';
    END IF;
  END IF;

  -- The function deletes as its owner, which the delete guard admits only when
  -- that is the table's owner.
  SELECT pg_get_userbyid(relowner) INTO v_owner FROM pg_class WHERE oid = 'vault.documents'::regclass;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc
       WHERE oid = 'public.purge_tenant_vault_records(integer)'::regprocedure) <> v_owner THEN
    EXECUTE format('ALTER FUNCTION public.purge_tenant_vault_records(integer) OWNER TO %I', v_owner);
  END IF;
  REVOKE ALL ON FUNCTION public.purge_tenant_vault_records(integer) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
    GRANT EXECUTE ON FUNCTION public.purge_tenant_vault_records(integer) TO app_service;
  END IF;
END
$vr06$;
