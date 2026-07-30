-- ============================================================================
-- 20260730_graphrag_knowledge_tables.sql
--
-- eCTD / REGULATORY AUDIT CONTEXT — schema-contract remediation.
-- The repo-wide schema-contract audit (scripts/db/audit-referenced-tables.mjs)
-- found tables the server SQL queries but no migration ever created — the same
-- latent missing-relation class as the 22 authoring tables. This migration
-- backs the GraphRAG / knowledge subsystem's queries.
--
-- Evidence (exact referencing SQL):
--   knowledge_graph_nodes / knowledge_graph_edges / citation_chains
--     — server/routes/graphrag.ts (INSERT ... ON CONFLICT (id), multi-hop
--       traversal SELECTs, project/count SELECTs). The three form a self-
--       consistent trio (edges.source_id/target_id -> nodes.id; citation_chains
--       keyed on document ids). Currently wrapped in try/catch, so they silently
--       no-op instead of returning graph data.
--   knowledge_documents — server/sage-plus-service.ts (SELECT ... ORDER BY
--       updated_at); its error path rethrows, so a missing relation surfaces.
--
-- Column contracts are extracted from the real SQL (INSERT column lists +
-- ON CONFLICT targets where present; SELECT/WHERE columns otherwise). Text ids
-- match the crypto.randomUUID() values the code writes. No tenant column is
-- referenced by these queries (projectId lives inside metadata JSON), so none is
-- invented — adding one the code neither sets nor filters would break the query
-- under RLS enforcement. Tenant isolation for this subsystem is a separate
-- follow-up for its owner (tracked in docs/audit-2026-07).
--
-- Non-destructive + idempotent: CREATE TABLE IF NOT EXISTS only. The pgvector
-- embedding column (read by the similarity SELECT) is added only where the
-- extension is available (Neon prod: yes), guarded so bare/CI engines without
-- pgvector still apply the migration.
-- ============================================================================

-- ── knowledge_graph_nodes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_graph_nodes (
  id                 TEXT PRIMARY KEY,
  entity_type        TEXT,
  name               TEXT,
  description        TEXT,
  metadata           JSONB,
  confidence         REAL,
  source_document_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_graph_nodes_name_idx ON knowledge_graph_nodes (name);

-- embedding column: only where pgvector is available (mirrors the guarded
-- pattern in db/migrations that gate on pg_available_extensions).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
    ALTER TABLE knowledge_graph_nodes ADD COLUMN IF NOT EXISTS embedding vector(1536);
  ELSE
    RAISE NOTICE 'pgvector unavailable; knowledge_graph_nodes.embedding skipped (similarity search degrades to no-op).';
  END IF;
END $$;

-- ── knowledge_graph_edges ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
  id                TEXT PRIMARY KEY,
  source_id         TEXT,
  target_id         TEXT,
  relationship_type TEXT,
  weight            REAL,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_graph_edges_source_idx ON knowledge_graph_edges (source_id);
CREATE INDEX IF NOT EXISTS knowledge_graph_edges_target_idx ON knowledge_graph_edges (target_id);

-- ── citation_chains ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS citation_chains (
  id                  TEXT PRIMARY KEY,
  source_document_id  TEXT,
  target_document_id  TEXT,
  citation_type       TEXT,
  context             TEXT,
  page_number         INTEGER,
  section_id          TEXT,
  confidence          REAL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS citation_chains_source_idx ON citation_chains (source_document_id);
CREATE INDEX IF NOT EXISTS citation_chains_target_idx ON citation_chains (target_document_id);

-- ── knowledge_documents ──────────────────────────────────────────────────────
-- Contract from the SELECT (title/content/category/updated_at filtered/ordered)
-- plus the service's fallback row shape (id/status/created_at).
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title      TEXT,
  content    TEXT,
  category   TEXT,
  status     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_documents_category_idx ON knowledge_documents (category);
CREATE INDEX IF NOT EXISTS knowledge_documents_updated_idx ON knowledge_documents (updated_at DESC);
