-- Vault passage retrieval — the chunk store the RAG reader has been reading
-- into a void, created durably, policied, and given its chunking ledger.
--
-- ── The gap ─────────────────────────────────────────────────────────────────
-- advancedRAGPipeline's 'vault' corpus (the ragRouter default) runs hybrid
-- dense + full-text retrieval over vault.document_chunks — RLS-scoped, with
-- context-window expansion. On a deploy-shaped database that table DOES NOT
-- EXIST: it lives only in the drizzle baseline (migrations/0000, replayed on
-- install-fresh alone), and its writer was server/workers/vectorization-worker
-- — unreferenced dead code reading a column (content_text) the canonical shape
-- never had, draining a queue (vault.processing_queue) nothing enqueues. Both
-- table and worker sit in the unbacked/unreferenced CI baselines. So the
-- platform's primary retrieval corpus was a reader with no store and a store
-- with no writer, and every vault retrieval errored or returned nothing.
--
-- ── What this adds ──────────────────────────────────────────────────────────
-- 1. vault.document_chunks, durably: the exact shape the drizzle baseline
--    declares and the reader queries (chunk_text + char spans + section
--    metadata + 1536-d embedding + UNIQUE(document_id, chunk_index)), created
--    IF NOT EXISTS so a fresh-install database that already carries it is a
--    no-op. The embedding column and its cosine index attach only where
--    pgvector exists; the GIN full-text index matches the reader's
--    to_tsvector('english', chunk_text) expression.
-- 2. Its RLS policies, self-contained: the four policies 070_gcc defines
--    (select via core.can_access_program on the parent document; write via
--    core.can_write_program) — replicated here because 070 only runs on fresh
--    installs and a table created by THIS file on an existing database would
--    otherwise ship unpoliced. Guarded on the core functions existing.
-- 3. The chunking ledger on vault.document_catalog: chunk_status
--    ('chunked' | 'chunk_failed' — absence means never attempted),
--    chunk_count, chunk_error. A document whose passages could not be indexed
--    says so; it never silently sits outside retrieval.
--
-- Additive and idempotent throughout; a database with no vault schema is
-- legitimate and this file stays silent there.

DO $vault_chunks$
BEGIN
  IF to_regclass('vault.documents') IS NULL THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS vault.document_chunks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id       UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    chunk_index       INTEGER NOT NULL,
    chunk_type        TEXT NOT NULL DEFAULT 'TEXT',
    chunk_text        TEXT NOT NULL,
    char_start        INTEGER,
    char_end          INTEGER,
    page_number       INTEGER,
    section_title     TEXT,
    section_hierarchy TEXT[],
    embedding_model   TEXT DEFAULT 'text-embedding-ada-002',
    token_count       INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    vectorized_at     TIMESTAMPTZ,
    CONSTRAINT vault_document_chunks_document_index UNIQUE (document_id, chunk_index)
  );

  CREATE INDEX IF NOT EXISTS document_chunks_document_idx
    ON vault.document_chunks (document_id);

  -- The reader's lexical arm: matches its exact tsvector expression.
  CREATE INDEX IF NOT EXISTS idx_vault_document_chunks_fts
    ON vault.document_chunks USING gin (to_tsvector('english', chunk_text));

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'ALTER TABLE vault.document_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536)';
    -- ivfflat over cosine distance — the operator the reader orders by.
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_vault_document_chunks_embedding
               ON vault.document_chunks USING ivfflat (embedding vector_cosine_ops)';
  END IF;

  -- RLS, self-contained (see header): enable + the 070_gcc policy set.
  EXECUTE 'ALTER TABLE vault.document_chunks ENABLE ROW LEVEL SECURITY';
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'core' AND p.proname = 'can_access_program') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_chunks_select ON vault.document_chunks';
    EXECUTE $p$CREATE POLICY rls_vault_chunks_select ON vault.document_chunks FOR SELECT
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_access_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_chunks_insert ON vault.document_chunks';
    EXECUTE $p$CREATE POLICY rls_vault_chunks_insert ON vault.document_chunks FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                         AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_chunks_update ON vault.document_chunks';
    EXECUTE $p$CREATE POLICY rls_vault_chunks_update ON vault.document_chunks FOR UPDATE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_chunks_delete ON vault.document_chunks';
    EXECUTE $p$CREATE POLICY rls_vault_chunks_delete ON vault.document_chunks FOR DELETE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = document_id
                    AND core.can_write_program(d.program_id)))$p$;
  END IF;

  -- The chunking ledger rides on the catalog (created earlier in this set).
  IF to_regclass('vault.document_catalog') IS NOT NULL THEN
    ALTER TABLE vault.document_catalog ADD COLUMN IF NOT EXISTS chunk_status TEXT;
    ALTER TABLE vault.document_catalog ADD COLUMN IF NOT EXISTS chunk_count  INTEGER;
    ALTER TABLE vault.document_catalog ADD COLUMN IF NOT EXISTS chunk_error  TEXT;
  END IF;
END
$vault_chunks$;
