-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Reconcile lumen_data_atoms embeddings onto 1536 dimensions
-- Date: 2026-07-30
-- Audit: docs/architecture/CLINICAL_REGULATORY_EVIDENCE_INTEGRATION_AUDIT.md (P0c)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY. The entire product embeds atoms with text-embedding-3-small (1536-d): the
-- retrieval write path (server/services/clinical-regulatory-evidence/
-- retrieval-atoms.service.ts), enhancedEmbeddingService's query embedder, and
-- every other vector column in the schema (precedent engine, FDA clearance,
-- federated learning) are 1536. The lone exception was
-- db/migrations/20260125_add_atom_embeddings.sql, which declared BOTH the
-- lumen_data_atoms.embedding column AND the search_atoms_* functions at
-- vector(3072) / text-embedding-3-large. Two silent consequences:
--   1. The 1536-d write `SET embedding = $1::vector` is rejected by the 3072
--      column typmod, so every atom landed with embedding = NULL and semantic
--      search returned nothing.
--   2. pgvector caps HNSW indexes at 2000 dimensions, so a vector(3072) column
--      can never carry the intended HNSW index at all.
-- And 20260125 is NOT in scripts/db/migration-set.mjs, so the durable deploy path
-- never applied it — on a real database the column and functions are ABSENT, and
-- enhancedEmbeddingService's search_atoms_hybrid() call has been erroring (masked
-- by the vault fallback) rather than searching atoms.
--
-- WHAT. Self-contained and idempotent. (Re)creates the embedding columns at 1536,
-- rebuilds the HNSW index, and (re)creates the two search functions on the 1536
-- signature. The functions return `id` as INTEGER to match the REAL id column,
-- which is serial int (migrations/0000_sweet_joseph.sql — the Drizzle-journaled
-- runtime baseline), NOT the uuid the 20260125 functions wrongly assumed. The type
-- must equal the column's: enhancedEmbeddingService's org-scoped wrapper joins the
-- function result to lumen_data_atoms.id (`ON h.id = oa.id`), so a uuid/text return
-- would be a plan-time `operator does not exist` error against the int column.
--
-- NON-DESTRUCTIVE. The embedding column is NULL for every row (the 1536 write has
-- always failed against the 3072 typmod), so reconciling the type loses nothing;
-- the USING cast is NULL-safe and would ABORT the migration — never lose data —
-- should any real non-1536 vector unexpectedly exist. Registered in
-- scripts/db/migration-set.mjs so the durable applier actually runs it.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS vector;

-- ── 1. Embedding columns — create at 1536, or reconcile an existing 3072 down ──
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO col_type
  FROM pg_attribute a
  WHERE a.attrelid = 'lumen_data_atoms'::regclass
    AND a.attname  = 'embedding'
    AND NOT a.attisdropped;

  IF col_type IS NULL THEN
    ALTER TABLE lumen_data_atoms ADD COLUMN embedding vector(1536);
  ELSIF col_type <> 'vector(1536)' THEN
    -- The index (if any) must go before the column type can be rewritten; it was
    -- invalid at 3072 anyway. Rebuilt at 1536 in step 2.
    DROP INDEX IF EXISTS idx_lumen_atoms_embedding_hnsw;
    EXECUTE 'ALTER TABLE lumen_data_atoms
               ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector(1536)';
  END IF;
END $$;

ALTER TABLE lumen_data_atoms ADD COLUMN IF NOT EXISTS embedding_model text DEFAULT 'text-embedding-3-small';
ALTER TABLE lumen_data_atoms ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;
-- Correct the default on databases where 20260125 created it as the 3072 model.
ALTER TABLE lumen_data_atoms ALTER COLUMN embedding_model SET DEFAULT 'text-embedding-3-small';

-- ── 2. Indexes — HNSW is now valid (1536 <= 2000) ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lumen_atoms_embedding_hnsw
  ON lumen_data_atoms USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_lumen_atoms_embedding_null
  ON lumen_data_atoms (created_at) WHERE embedding IS NULL;

-- ── 3. Search functions — 1536 signature, id returned as text ─────────────────
-- DROP is required: the return column `id` changes type (uuid -> text), which
-- CREATE OR REPLACE cannot do. Both are IF EXISTS and immediately recreated in the
-- same migration, so no callable surface is ever missing. Signatures below list
-- argument types WITHOUT typmod (Postgres identifies functions that way), so these
-- match the old vector(3072) definitions.
DROP FUNCTION IF EXISTS search_atoms_semantic(vector, float, integer, text, text[]);
CREATE FUNCTION search_atoms_semantic(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INTEGER DEFAULT 10,
    filter_atom_type TEXT DEFAULT NULL,
    filter_tags TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    atom_type TEXT,
    title TEXT,
    content TEXT,
    structured_data JSONB,
    tags TEXT[],
    similarity FLOAT
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.atom_type,
        a.title,
        a.content,
        a.structured_data,
        a.tags,
        1 - (a.embedding <=> query_embedding) AS similarity
    FROM lumen_data_atoms a
    WHERE
        a.embedding IS NOT NULL
        AND a.status = 'active'
        AND (filter_atom_type IS NULL OR a.atom_type = filter_atom_type)
        AND (filter_tags IS NULL OR a.tags @> filter_tags)
        AND (1 - (a.embedding <=> query_embedding)) >= match_threshold
    ORDER BY a.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

DROP FUNCTION IF EXISTS search_atoms_hybrid(text, vector, float, float, integer, text);
CREATE FUNCTION search_atoms_hybrid(
    query_text TEXT,
    query_embedding vector(1536),
    semantic_weight FLOAT DEFAULT 0.7,
    keyword_weight FLOAT DEFAULT 0.3,
    match_count INTEGER DEFAULT 10,
    filter_atom_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    atom_type TEXT,
    title TEXT,
    content TEXT,
    structured_data JSONB,
    tags TEXT[],
    semantic_score FLOAT,
    keyword_score FLOAT,
    combined_score FLOAT
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    WITH semantic_results AS (
        SELECT a.id, 1 - (a.embedding <=> query_embedding) AS score
        FROM lumen_data_atoms a
        WHERE a.embedding IS NOT NULL
          AND a.status = 'active'
          AND (filter_atom_type IS NULL OR a.atom_type = filter_atom_type)
        ORDER BY a.embedding <=> query_embedding
        LIMIT match_count * 3
    ),
    keyword_results AS (
        SELECT a.id,
               ts_rank_cd(
                 to_tsvector('english', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '')),
                 plainto_tsquery('english', query_text)
               ) AS score
        FROM lumen_data_atoms a
        WHERE a.status = 'active'
          AND (filter_atom_type IS NULL OR a.atom_type = filter_atom_type)
          AND to_tsvector('english', COALESCE(a.title, '') || ' ' || COALESCE(a.content, ''))
              @@ plainto_tsquery('english', query_text)
        LIMIT match_count * 3
    ),
    combined AS (
        SELECT COALESCE(s.id, k.id) AS id,
               COALESCE(s.score, 0) AS sem_score,
               COALESCE(k.score, 0) AS kw_score,
               (COALESCE(s.score, 0) * semantic_weight) +
               (COALESCE(k.score, 0) * keyword_weight) AS combined
        FROM semantic_results s
        FULL OUTER JOIN keyword_results k ON s.id = k.id
    )
    SELECT
        a.id,
        a.atom_type,
        a.title,
        a.content,
        a.structured_data,
        a.tags,
        c.sem_score AS semantic_score,
        c.kw_score AS keyword_score,
        c.combined AS combined_score
    FROM combined c
    JOIN lumen_data_atoms a ON a.id = c.id
    ORDER BY c.combined DESC
    LIMIT match_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE — atoms embed at 1536, HNSW is valid, search returns rows.
-- Backfill of already-written NULL atoms: scripts/embed-atoms.ts (best-effort;
-- the write path also logs any future embedding failure instead of swallowing it).
-- ═══════════════════════════════════════════════════════════════════════════
