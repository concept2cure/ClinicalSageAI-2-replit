-- 20260729_unified_documents_provision.sql
--
-- Resolve ledger C-29 for the unified_documents / workflow_document_versions
-- pair on the from-scratch install path (issue #1239).
--
-- Both tables are defined in Drizzle (shared/schema/unified_workflow.ts) but that
-- module is NOT re-exported by shared/schema.ts, so drizzle-kit push never creates
-- them; and the only raw creator
-- (db/migrations/_consolidated/20250108_unified_documents_complete_schema.sql)
-- also redefines users/tenants with TEXT keys, colliding with push's integer keys
-- (that file lives under db/migrations/, which the install-fresh overlay never
-- walks). The net effect was that neither table existed on a fresh install, so the
-- two follow-on ALTER migrations
--   20260730_workflow_doc_versions_org_id.sql   (add organization_id nullable + backfill)
--   20260731_workflow_doc_versions_org_not_null.sql (tighten to NOT NULL)
-- failed with "relation ... does not exist", leaving the install INCOMPLETE.
--
-- This provisions BOTH tables cleanly in the overlay, with the canonical
-- integer-keyed shape from the Drizzle definition and NO users/tenants
-- redefinition (so there is no C-29 collision). It sorts before the two ALTERs
-- (20260729 < 20260730), which then apply for real. organization_id is
-- intentionally OMITTED from workflow_document_versions here — 20260730 adds it
-- and 20260731 tightens it, keeping those two the single source of the tenant
-- column and preserving their backfill semantics.
--
-- Every statement is idempotent (IF NOT EXISTS / duplicate-safe), so this is a
-- no-op on any environment where push or the legacy raw creator already
-- materialised the objects.

-- ── document_status enum (unified_documents.status) ────────────────────────────
DO $$ BEGIN
  CREATE TYPE document_status AS ENUM (
    'draft', 'in_review', 'approved', 'published', 'archived', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── unified_documents (canonical Drizzle shape, integer keys) ──────────────────
CREATE TABLE IF NOT EXISTS unified_documents (
  id              serial PRIMARY KEY,
  title           text NOT NULL,
  document_type   text NOT NULL,
  status          document_status NOT NULL DEFAULT 'draft',
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text,
  updated_at      timestamptz DEFAULT now(),
  organization_id integer NOT NULL,
  latest_version  integer NOT NULL DEFAULT 1,
  metadata        json DEFAULT '{}'::json
);
CREATE INDEX IF NOT EXISTS idx_unified_docs_org_status
  ON unified_documents (organization_id, status);

-- ── workflow_document_versions (org scope added by 20260730/20260731) ──────────
CREATE TABLE IF NOT EXISTS workflow_document_versions (
  id          serial PRIMARY KEY,
  document_id integer NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
  version     integer NOT NULL,
  content     json,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  comments    text
);
CREATE UNIQUE INDEX IF NOT EXISTS wf_doc_version_idx
  ON workflow_document_versions (document_id, version);
