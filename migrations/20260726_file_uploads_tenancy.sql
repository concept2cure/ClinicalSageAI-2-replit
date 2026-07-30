-- ═══════════════════════════════════════════════════════════════════════════
-- file_uploads — canonical tenancy contract
--
-- PROBLEM THIS FIXES
-- `file_uploads` was never defined by a migration. Its shape existed only in
-- whatever the live database happened to have, so five call sites drifted into
-- four mutually incompatible tenancy contracts:
--
--   server/services/ana/uploaded-file-access.ts  path prefix only; its header
--                                                asserts "no organization column"
--   server/routes/ana-ri/stream.ts               WHERE organization_id = $2
--   server/routes/ana-ri/chat.ts                 WHERE organization_id = $2
--   server/services/ana-ri/chat-context-builder  NO tenant filter at all
--   server/routes/workspace-summary.ts           WHERE organization_id = $1
--
-- Meanwhile the only INSERT (chat/upload.ts) never wrote organization_id. So
-- every `organization_id = $n` lookup matched zero rows — silently, because the
-- callers wrap the query in a bare catch. A user could attach a file, see the
-- chip in chat, send the turn, and have the attachment dropped with no error.
--
-- DECISION
-- Tenancy is carried BOTH ways, and this migration is the single owner of that
-- contract:
--   1. `organization_id` — the explicit, indexable column queries filter on.
--   2. `uploads/org-{id}/{fileId}` storage-path prefix — retained as a second,
--      independent check so a row whose org column is wrong (or NULL from a
--      legacy write) still cannot serve another tenant's bytes.
-- Reads enforce both (see uploaded-file-access.ts). Neither alone is trusted.
--
-- SAFETY
-- Idempotent and non-destructive. CREATE TABLE IF NOT EXISTS is a no-op when
-- the table already exists — it does NOT reshape a live table, so a database
-- whose columns differ is left exactly as-is and only gains organization_id.
-- The backfill only ever writes organization_id, and only for rows where it is
-- currently NULL and the storage path names an org.
--
-- ROLLBACK
--   ALTER TABLE file_uploads DROP COLUMN IF EXISTS organization_id;
--   DROP INDEX IF EXISTS idx_file_uploads_org;
-- The table itself predates this migration; do not drop it.
-- ═══════════════════════════════════════════════════════════════════════════

-- Codify the shape the application actually writes today. The column list
-- mirrors the INSERT in server/routes/chat/upload.ts and the derived-upload
-- INSERT in server/services/ana/uploaded-file-access.ts.
CREATE TABLE IF NOT EXISTS file_uploads (
  id             TEXT PRIMARY KEY,
  user_id        INTEGER,
  original_name  TEXT,
  mime_type      TEXT,
  file_size      BIGINT,
  storage_path   TEXT,
  status         TEXT NOT NULL DEFAULT 'uploaded',
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- The explicit tenancy column. Nullable on purpose: uploads made with no
-- authenticated org land under `uploads/unscoped/` and legitimately have no
-- owner, and NULL must never be readable by a tenant-scoped query.
ALTER TABLE file_uploads ADD COLUMN IF NOT EXISTS organization_id INTEGER;

-- Backfill from the storage-path prefix written since the tenant-scoped
-- storage layout landed. Rows under `uploads/unscoped/` and legacy flat
-- `uploads/file_*` rows deliberately stay NULL — they have no provable owner,
-- and inventing one would hand a tenant a file it may never have uploaded.
UPDATE file_uploads
   SET organization_id = CAST(SUBSTRING(storage_path FROM '^uploads/org-([0-9]+)/') AS INTEGER)
 WHERE organization_id IS NULL
   AND storage_path ~ '^uploads/org-[0-9]+/';

-- Tenant-scoped reads filter on (organization_id, id); the id is already the
-- primary key, so an org index is what the ANY($1) batch lookups need.
CREATE INDEX IF NOT EXISTS idx_file_uploads_org ON file_uploads (organization_id);
