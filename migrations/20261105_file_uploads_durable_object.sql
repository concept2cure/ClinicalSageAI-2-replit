-- ═══════════════════════════════════════════════════════════════════════════
-- file_uploads: where an upload's bytes are durably kept (LX-02, 2026-11-05)
--
-- A Data Room upload, an AnA paperclip file and every derived upload wrote its
-- bytes only to `process.cwd()/uploads/org-<id>/<fileId>`: the serving task's
-- own container disk. Production runs up to two API tasks on Fargate with no
-- volume mounted there, so a file uploaded through one task could not be read
-- through the other, and every deploy erased every upload's bytes while its
-- file_uploads and cre_evidence_sources rows kept a checksum nothing could be
-- verified against again (docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md
-- hop A1, finding DR-ANA-11; tests/lineage/founder-path-lineage.baseline.json
-- capture/bytes-durable).
--
-- The bytes now also go through the one byte store vault ingest and rendered
-- leaves use (server/services/storage, STORAGE_PROVIDER=s3 in production).
-- These two columns record where: the provider's name, as getStorageProviderFor
-- reads it, and the object's version id. storage_path is unchanged: it stays
-- the upload's tenancy key (`uploads/org-<id>/<fileId>`), which the reader, the
-- Data Room processing sweep and disposition check, and the task's local
-- working copy the path-based AnA tools read.
--
-- NULL in both on every row written before this change, and on an upload with
-- no authenticated organization (`uploads/unscoped/…`): those are read from the
-- local path as before (server/services/ana/uploaded-file-access.ts).
--
-- Replay-safe (CLAUDE.md RULE 1): additive and IF NOT EXISTS; creates no table,
-- drops nothing, defines no constraint. file_uploads keeps its tenancy contract
-- (20260726_file_uploads_tenancy.sql), so the tenant sweeps are unaffected and
-- this file sits anywhere after that one and above the final pair.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE file_uploads ADD COLUMN IF NOT EXISTS storage_provider TEXT;
ALTER TABLE file_uploads ADD COLUMN IF NOT EXISTS storage_object_id TEXT;

COMMENT ON COLUMN file_uploads.storage_provider IS
  'The byte store holding this upload (local or s3, as server/services/storage names it); NULL for rows read from storage_path on local disk.';
COMMENT ON COLUMN file_uploads.storage_object_id IS
  'The object version id in storage_provider; NULL exactly when storage_provider is NULL.';
