-- 20260729b_unified_workflow_companion_tables.sql
--
-- Close the last three-table gap in the unified_workflow family, on the same
-- terms — and for the same reason — as 20260729_unified_documents_provision.sql.
--
-- BACKGROUND. shared/schema/unified_workflow.ts defines the whole family, but
-- that module is reachable only through the shared/schema/index.ts barrel, and
-- drizzle.config.ts pushes shared/schema.ts (which does NOT re-export it). So
-- push creates none of them, and the raw tree has to. 20260729 did that for
-- unified_documents + workflow_document_versions; document_workflows,
-- workflow_templates, workflow_steps, workflow_approvals and workflow_history
-- come from the workflow-approval migrations. That left exactly three tables
-- with no creator on any provisioning path:
--
--   module_documents      — module→document mapping, tenant-scoped
--   document_audit_logs   — per-document audit trail (Part 11 surface)
--   document_attachments  — file attachments on a unified document
--
-- The only rival creator for them is
-- db/migrations/_consolidated/20250108_unified_documents_complete_schema.sql,
-- which the install-fresh overlay never walks and which also redefines
-- users/tenants with TEXT keys — the ledger C-29 collision with push's integer
-- keys. So the fix is the 20260729 one, not that file.
--
-- WHAT THIS UNBLOCKS. Two migrations were classified as expected fresh-install
-- skips purely because these tables were absent:
--   0004_workflow_performance_indexes.sql  — needs document_audit_logs
--   0007_tenant_isolation_fixes.sql        — needs module_documents
-- Both apply for real once this file has run, so both are removed from the
-- installer's CLASSIFIED_OVERLAY_SKIPS map rather than tolerated forever.
--
-- SHAPE. Taken verbatim from the Drizzle definitions (integer keys, cascade FKs
-- to unified_documents, the module_doc_idx unique index) so there is ONE
-- canonical shape for each table, not a second parallel one. Nothing here
-- redefines users, tenants or organizations.
--
-- ORDERING. Named 20260729b so it sorts immediately after the file that creates
-- unified_documents, which every table here references. The install-fresh
-- overlay is multi-pass and would resolve it regardless; deterministic ordering
-- means it does not have to.
--
-- IDEMPOTENCE. Every statement is IF NOT EXISTS or duplicate-guarded, so this is
-- a no-op on any database where these tables already exist.

-- ── module_type enum (module_documents.module_type) ───────────────────────────
-- Guarded the same way 20260729 guards document_status: the enum is normally
-- already present from the workflow-template migrations, but a database that
-- provisions this file first must not fail on its absence.
DO $$ BEGIN
  CREATE TYPE module_type AS ENUM ('cmc', 'cer', 'study', 'ectd', '510k', 'vault');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── module_documents ──────────────────────────────────────────────────────────
-- organization_id is integer here, matching organizations.id. 0007 then ALTERs
-- it to integer (a no-op cast on this shape) and adds fk_module_docs_org — that
-- file stays the single owner of the FK, exactly as 20260730/20260731 stay the
-- owners of workflow_document_versions.organization_id.
CREATE TABLE IF NOT EXISTS module_documents (
  id                   serial PRIMARY KEY,
  unified_document_id  integer NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
  module_type          module_type NOT NULL,
  original_id          text NOT NULL,
  organization_id      integer NOT NULL,
  metadata             json DEFAULT '{}'::json
);
CREATE UNIQUE INDEX IF NOT EXISTS module_doc_idx
  ON module_documents (module_type, original_id, organization_id);

-- ── document_audit_logs ───────────────────────────────────────────────────────
-- No organization_id of its own: it is scoped through document_id, which is why
-- the tenant sweep does not expect a tenant column on it. idx_audit_logs_doc_time
-- is created here to match the Drizzle definition; 0004 re-creates it with
-- IF NOT EXISTS and DESC ordering, which is a no-op once this index exists.
CREATE TABLE IF NOT EXISTS document_audit_logs (
  id            serial PRIMARY KEY,
  document_id   integer NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
  action        text NOT NULL,
  performed_by  text NOT NULL,
  performed_at  timestamptz NOT NULL DEFAULT now(),
  details       json DEFAULT '{}'::json
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_doc_time
  ON document_audit_logs (document_id, performed_at DESC);

-- ── document_attachments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_attachments (
  id           serial PRIMARY KEY,
  document_id  integer NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
  file_name    text NOT NULL,
  file_type    text NOT NULL,
  file_size    integer NOT NULL,
  file_path    text NOT NULL,
  uploaded_by  text NOT NULL,
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  description  text,
  metadata     json DEFAULT '{}'::json
);
CREATE INDEX IF NOT EXISTS idx_document_attachments_doc
  ON document_attachments (document_id);
