-- 20260731c_canonical_documents.sql
--
-- The persisted projection behind the ONE governed document pipeline
-- (server/services/regulatory/documentLifecycleOrchestrator). One stable UUID
-- identity carries a document from authoring → in_review → approved → placed →
-- packaged → submitted, holding the lifecycle stage, the typed source refs that
-- reach each existing facet table, and the append-only hash-chained per-document
-- audit trail. Org-scoped by convention (FK-free) and brought under the uniform
-- organization_id RLS policy (migrations/0021_enable_rls_everywhere.sql).
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

CREATE INDEX IF NOT EXISTS idx_canonical_documents_org
  ON canonical_documents (organization_id);
CREATE INDEX IF NOT EXISTS idx_canonical_documents_stage
  ON canonical_documents (organization_id, stage);
