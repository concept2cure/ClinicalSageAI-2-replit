-- 2026-10-15 — c2c_documents.filing_scope (docs/design/FILING_SPINE.md F22, Add a market).
--
-- A project's governed document is its home filing: the outline the editor
-- opens and the document an authored section binds to. Adding a market (POST
-- /api/c2c/projects/:id/markets) scaffolds a second document, holding only that
-- market's Module 1 and 3.2.R from the market's own rule pack. Readers that
-- took "the project's document" as "the newest one" would then open the
-- market's partial outline instead of the filing, so which document is which
-- is recorded, not inferred from timestamps:
--   'home'   — the project's filing (every existing row; the default);
--   'market' — an added market's regional modules.
-- One market document per (project, doc_type, agency): a repeat add is refused.
--
-- Additive and replay-safe (CLAUDE.md Rule 1): IF NOT EXISTS throughout, the
-- CHECK added only when absent, and nothing is dropped.

ALTER TABLE c2c_documents ADD COLUMN IF NOT EXISTS filing_scope text NOT NULL DEFAULT 'home';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_documents_filing_scope_check') THEN
    ALTER TABLE c2c_documents
      ADD CONSTRAINT c2c_documents_filing_scope_check CHECK (filing_scope IN ('home', 'market'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS c2c_documents_one_market_document
  ON c2c_documents (project_id, doc_type, agency)
  WHERE filing_scope = 'market';
