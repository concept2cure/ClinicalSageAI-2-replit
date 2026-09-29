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
--     and refuses to boot with either trigger missing or disabled
--     (server/services/audit/audit-immutability-triggers.ts).
-- =============================================================================

DO $vr06$
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
END
$vr06$;
