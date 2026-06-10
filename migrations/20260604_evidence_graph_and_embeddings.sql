-- Migration: 20260604_evidence_graph_and_embeddings
-- Purpose:  Truth Engine foundation (Phase 1, WO-1.2). Bidirectional provenance
--           links between a submission section/claim and its source document,
--           plus a pgvector embedding column on the canonical eCTD document
--           table for downstream RAG grounding.
--
-- Reconcile (RECONCILE.md, WO-1.0):
--   * pgvector is already in use elsewhere (vault.document_chunks, csr-knowledge-db),
--     so CREATE EXTENSION is a safe idempotent no-op.
--   * There is NO public.documents table. The embedding column lands on the
--     canonical eCTD authoring table coauthor_documents (RECONCILE.md §2), and
--     the provenance table references its source document POLYMORPHICALLY
--     (source_document_table + source_document_id).
--   * RENAME: the table `evidence_links` ALREADY EXISTS (programs.ts /
--     migrations/20260524_program_workbench_schema.sql) as a UUID-keyed
--     evidence_objects -> target graph. To avoid clobbering it (CREATE TABLE
--     IF NOT EXISTS would silently no-op against the existing different shape),
--     Phase-1 document provenance lives in `submission_evidence_links`. See
--     RECONCILE.md §2.
--   * consistency_findings is DEFERRED to Phase 3 — not created here.

-- Up:

CREATE EXTENSION IF NOT EXISTS vector;

-- ── embeddings on the canonical eCTD document table ──────────────────────────
ALTER TABLE public.coauthor_documents
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_coauthor_documents_embedding
  ON public.coauthor_documents USING hnsw (embedding vector_cosine_ops);

-- ── submission_evidence_links ────────────────────────────────────────────────
-- Bidirectional provenance: a claim/section <-> its source document.
-- source_document_table + source_document_id are a POLYMORPHIC reference
-- (no single public.documents table) — see RECONCILE.md §2.
-- Named submission_evidence_links to avoid clobbering the pre-existing
-- evidence_links table (programs.ts).
CREATE TABLE IF NOT EXISTS public.submission_evidence_links (
  id                     SERIAL PRIMARY KEY,
  submission_id          INTEGER NOT NULL REFERENCES public.submissions(id),
  target_section_code    TEXT NOT NULL,                     -- where the claim lives (e.g. "2.7.3")
  source_document_table  TEXT NOT NULL,                     -- coauthor_documents|ctd_onboarding_documents|unified_documents|vault_documents
  source_document_id     INTEGER NOT NULL,                  -- polymorphic id within source_document_table
  source_locator         TEXT,                              -- page/section/anchor in the source
  direction              TEXT NOT NULL DEFAULT 'derives_from', -- derives_from|cited_by|supports|contradicts
  confidence             REAL,                              -- 0..1 from extraction
  organization_id        INTEGER NOT NULL REFERENCES public.organizations(id),
  created_by             INTEGER NOT NULL REFERENCES public.users(id),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sub_evlinks_submission_id   ON public.submission_evidence_links(submission_id);
CREATE INDEX IF NOT EXISTS idx_sub_evlinks_source_document ON public.submission_evidence_links(source_document_table, source_document_id);
CREATE INDEX IF NOT EXISTS idx_sub_evlinks_organization_id ON public.submission_evidence_links(organization_id);

-- Down:
-- DROP TABLE IF EXISTS public.submission_evidence_links;
-- DROP INDEX IF EXISTS idx_coauthor_documents_embedding;
-- ALTER TABLE public.coauthor_documents DROP COLUMN IF EXISTS embedding;
