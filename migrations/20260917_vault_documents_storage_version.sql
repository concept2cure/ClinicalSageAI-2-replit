-- ============================================================================
-- vault.documents — record the storage provider's version id
-- ============================================================================
--
-- WHY. `server/services/storage/` is this repo's canonical storage seam: one
-- interface, a local and an S3 implementation, and a `get(vaultVersionId,
-- orgId)` whose org argument is REQUIRED because object storage sits outside
-- Postgres RLS and that argument is the only tenant boundary the bytes get.
--
-- The vault does not use it. `vault-ingest.service.ts` writes bytes straight to
-- `uploads/vault/{programId}/{contentHash}{ext}` and stores that relative PATH
-- in `s3_key`, with `s3_bucket = 'local'` and no provider record of any kind.
-- Two consequences:
--
--   1. A vault document CANNOT become a submission leaf. The eCTD packager
--      fetches non-local bytes through `getStorageProvider().get(...)`, which
--      resolves a PROVIDER-MINTED version uuid under
--      `storage/vault/{orgId}/{projectId}/versions/`. A vault `s3_key` is a
--      path in a different root and a different key space, so the provider
--      cannot find it even given a correct id. This is the blocker behind
--      `leaf-document-tables.ts`'s refusal of `vault_documents` — see
--      VAULT_DATA_ROOM_ASSESSMENT §4.5 — and it is not an id-space problem.
--
--   2. The vault's bytes cannot move to S3 with the rest of the platform,
--      because nothing about them goes through the abstraction that would.
--
-- WHAT THIS ADDS. Two nullable columns, and nothing else changes shape:
--   storage_version_id — the id `IStorageProvider.put()` returns, which is what
--                        `get()` takes. NULL means this row predates the
--                        provider and is still addressed by `s3_key`.
--   storage_provider   — which provider minted it ('local' | 's3' | ...), so a
--                        row is readable after the platform default changes.
--
-- BOTH NULLABLE, DELIBERATELY. Every vault document already on a deployed
-- database was written by the path-based ingest and has no provider version.
-- Making the column NOT NULL would require inventing a value for rows whose
-- bytes were never handed to a provider — a stored id that resolves to nothing
-- is exactly the "record that lies" the ingest path was hardened against.
-- NULL states the truth: this row is addressed the old way.
--
-- So the read path is a dual-read, not a cutover: prefer the provider when a
-- version id is present, fall back to `s3_key` when it is not, and hash-verify
-- either way against `content_hash`, which stays authoritative. No bytes are
-- moved by this migration and no existing row is touched. Migrating the bytes
-- already under `uploads/vault/` is a separate, deliberate backfill; until it
-- runs, old documents keep working unchanged.
--
-- Additive and IF NOT EXISTS-guarded, so it re-runs cleanly on every deploy
-- (CLAUDE.md RULE 1). It drops nothing.
--
-- ROLLBACK
--   ALTER TABLE vault.documents DROP COLUMN IF EXISTS storage_version_id;
--   ALTER TABLE vault.documents DROP COLUMN IF EXISTS storage_provider;
-- Rollback loses the provider handle; `s3_key` still addresses every row that
-- has one, and rows written through the provider would need their bytes
-- re-associated. Do not roll back after the backfill.
-- ============================================================================

DO $vault_storage_version$
BEGIN
  IF to_regclass('vault.documents') IS NULL THEN
    RAISE NOTICE 'vault.documents absent — storage version columns skipped';
    RETURN;
  END IF;

  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS storage_version_id TEXT;
  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS storage_provider   TEXT;

  -- The read path looks a document up by id and then follows its version id;
  -- this index serves the reverse question — "which document is this stored
  -- object?" — which the backfill and any orphan sweep both ask. Partial
  -- because the column is NULL for every row that predates the provider, and
  -- those are the majority until the backfill runs.
  CREATE INDEX IF NOT EXISTS vault_documents_storage_version_idx
    ON vault.documents (storage_version_id)
    WHERE storage_version_id IS NOT NULL;

  EXECUTE $q$COMMENT ON COLUMN vault.documents.storage_version_id IS
    'Version id minted by IStorageProvider.put(); pass to get(id, orgId). NULL means the row predates the storage provider and its bytes are addressed by s3_key. Never invent a value here — an id that resolves to nothing is a record that lies.'$q$;
  EXECUTE $q$COMMENT ON COLUMN vault.documents.storage_provider IS
    'Which provider minted storage_version_id (local | s3 | azure | gcs), so the row stays readable after the platform default changes.'$q$;
END
$vault_storage_version$;
