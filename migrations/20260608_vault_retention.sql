-- Vault retention: policies + document archives
--
-- Backs the rebuilt document-retention job (server/jobs/retentionCron.ts), which
-- drives off the canonical vault.documents model (retention_policy / retention_until
-- / deleted_at) rather than the removed Supabase-era tables.
--
-- retention_policies : named rules (how long, archive-before-delete, hard vs soft).
-- document_archives  : immutable JSON snapshot taken immediately before deletion,
--                      so a deleted document's metadata + the who/why/when of its
--                      deletion survive for audit and legal hold. (Snapshots the
--                      DB record, not the S3 object bytes.)
--
-- Idempotent: safe to re-run.

CREATE SCHEMA IF NOT EXISTS vault;

CREATE TABLE IF NOT EXISTS vault.retention_policies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name           TEXT NOT NULL UNIQUE,
  description           TEXT,
  retention_days        INTEGER NOT NULL,
  archive_before_delete BOOLEAN NOT NULL DEFAULT TRUE,
  hard_delete           BOOLEAN NOT NULL DEFAULT FALSE,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vault.document_archives (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_document_id UUID NOT NULL,
  program_id           UUID NOT NULL,
  document_code        TEXT,
  document_title       TEXT,
  document_type        TEXT,
  retention_policy     TEXT,
  snapshot             JSONB NOT NULL,
  archive_reason       TEXT NOT NULL DEFAULT 'retention_policy',
  archived_by          TEXT NOT NULL DEFAULT 'system:retention-job',
  archived_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault_document_archives_original_idx
  ON vault.document_archives (original_document_id);
CREATE INDEX IF NOT EXISTS vault_document_archives_program_idx
  ON vault.document_archives (program_id);
