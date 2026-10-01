-- 20260731c_canonical_documents.sql
--
-- The persisted projection behind the ONE governed document pipeline
-- (server/services/regulatory/documentLifecycleOrchestrator). One stable UUID
-- identity carries a document from authoring → in_review → approved → placed →
-- packaged → submitted, holding the lifecycle stage, the typed source refs that
-- reach each existing facet table, and the append-only hash-chained per-document
-- audit trail. Org-scoped by convention (FK-free) and brought under the uniform
-- organization_id RLS policy (migrations/0021_enable_rls_everywhere.sql).
--
-- AMENDED 2026-09-29 (VR-12, row D5): adds `created_by INTEGER`, the user who
-- created the record. The lifecycle route records it, and the separation-of-
-- duties check (server/services/governance/separation-of-duties.ts) reads it,
-- so nobody reviews or approves a document they created. ADD COLUMN IF NOT
-- EXISTS, amended in place per CLAUDE.md Rule 1 (this file replays on every
-- deploy; the journal will show it as drift). No backfill: a record created
-- before this has no author, and the check refuses to sign it rather than
-- guess one. 20260925_canonical_documents_append_only.sql makes it write-once.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS canonical_documents (
  canonical_id        TEXT PRIMARY KEY,
  organization_id     INTEGER NOT NULL,
  project_id          TEXT,
  title               TEXT NOT NULL,
  document_type       TEXT NOT NULL,
  version             INTEGER NOT NULL DEFAULT 1,
  stage               TEXT NOT NULL DEFAULT 'authoring',
  has_content         BOOLEAN NOT NULL DEFAULT false,
  content_hash        TEXT NOT NULL DEFAULT '',
  review_signature    JSONB,
  approval_signature  JSONB,
  placement           JSONB,
  packaging_validated BOOLEAN NOT NULL DEFAULT false,
  export_facet        JSONB,
  source_refs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  outline             JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit               JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VR-12 (2026-09-29): who created the record. See the header note.
ALTER TABLE canonical_documents ADD COLUMN IF NOT EXISTS created_by INTEGER;

CREATE INDEX IF NOT EXISTS idx_canonical_documents_org
  ON canonical_documents (organization_id);
CREATE INDEX IF NOT EXISTS idx_canonical_documents_stage
  ON canonical_documents (organization_id, stage);
