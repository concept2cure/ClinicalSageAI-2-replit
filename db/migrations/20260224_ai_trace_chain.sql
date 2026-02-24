-- ═══════════════════════════════════════════════════════════════════════════════
-- AI Trace Chain — Provenance Tables
--
-- Creates the full provenance chain:
--   prompt → retrieval → chunks → generation → claims → citations
--
-- All tables enforce organization isolation via organization_id.
-- No org defaults. No "projectId='default'".
--
-- Migration: 20260224_ai_trace_chain.sql
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. AI THREADS (org-scoped provenance overlay on chat_threads)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_threads (
  id                  TEXT PRIMARY KEY,     -- matches chat_threads.id
  organization_id     BIGINT NOT NULL,
  project_id          TEXT NULL,
  created_by          TEXT NOT NULL DEFAULT 'system',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_threads_org
  ON ai_threads(organization_id);

CREATE INDEX IF NOT EXISTS idx_ai_threads_org_project
  ON ai_threads(organization_id, project_id)
  WHERE project_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. AI MESSAGES (provenance-enriched, with generation linkage)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id           TEXT NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
  role                TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content             TEXT NOT NULL,
  generation_run_id   UUID NULL,          -- links assistant messages to their generation
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_thread
  ON ai_messages(thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_generation
  ON ai_messages(generation_run_id)
  WHERE generation_run_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. AI RETRIEVAL RUNS (one per search query)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_retrieval_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       BIGINT NOT NULL,
  project_id            TEXT NULL,
  user_id               TEXT NOT NULL,
  scope                 TEXT NOT NULL DEFAULT 'org'
    CHECK (scope IN ('org', 'project', 'global')),
  embedding_model       TEXT NOT NULL,
  query_text            TEXT NOT NULL,
  query_hash_sha256     TEXT NOT NULL,
  snapshot_hash_sha256  TEXT NOT NULL,
  top_k                 INTEGER NOT NULL,
  threshold             NUMERIC(4,3) NULL,
  result_count          INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_retrieval_runs_org
  ON ai_retrieval_runs(organization_id);

CREATE INDEX IF NOT EXISTS idx_ai_retrieval_runs_query_hash
  ON ai_retrieval_runs(query_hash_sha256);

CREATE INDEX IF NOT EXISTS idx_ai_retrieval_runs_org_project
  ON ai_retrieval_runs(organization_id, project_id)
  WHERE project_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. AI RETRIEVAL CHUNKS (ranked results per retrieval run)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_retrieval_chunks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retrieval_run_id    UUID NOT NULL REFERENCES ai_retrieval_runs(id) ON DELETE CASCADE,
  rank                INTEGER NOT NULL,
  source_type         TEXT NOT NULL DEFAULT 'atom'
    CHECK (source_type IN ('atom', 'vault_file', 'external')),
  atom_id             TEXT NULL,
  vault_file_id       TEXT NULL,
  vault_version_id    TEXT NULL,
  title               TEXT NULL,
  excerpt_start       INTEGER NULL,
  excerpt_end         INTEGER NULL,
  excerpt_hash_sha256 TEXT NULL,
  excerpt_preview     TEXT NULL,          -- max 500 chars
  score               NUMERIC(6,4) NOT NULL,
  provenance          JSONB NULL,         -- extra metadata
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_retrieval_chunks_run
  ON ai_retrieval_chunks(retrieval_run_id, rank);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. AI GENERATION RUNS (one per LLM call)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_generation_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retrieval_run_id      UUID NULL REFERENCES ai_retrieval_runs(id) ON DELETE SET NULL,
  thread_id             TEXT NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
  model                 TEXT NOT NULL,
  provider              TEXT NULL,
  prompt_context_json   JSONB NULL,       -- system prompt metadata (not full prompt)
  answer_hash_sha256    TEXT NOT NULL,
  prompt_tokens         INTEGER NOT NULL DEFAULT 0,
  completion_tokens     INTEGER NOT NULL DEFAULT 0,
  total_tokens          INTEGER NOT NULL DEFAULT 0,
  latency_ms            INTEGER NULL,
  is_demo               BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_generation_runs_thread
  ON ai_generation_runs(thread_id);

CREATE INDEX IF NOT EXISTS idx_ai_generation_runs_retrieval
  ON ai_generation_runs(retrieval_run_id)
  WHERE retrieval_run_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. AI CLAIMS (paragraph-level claim extraction from generation)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_claims (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_run_id   UUID NOT NULL REFERENCES ai_generation_runs(id) ON DELETE CASCADE,
  claim_index         INTEGER NOT NULL,
  claim_text          TEXT NOT NULL,
  claim_hash_sha256   TEXT NOT NULL,
  confidence          NUMERIC(4,3) NULL,
  status              TEXT NOT NULL DEFAULT 'UNSUPPORTED'
    CHECK (status IN ('SUPPORTED', 'WEAK', 'UNSUPPORTED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (generation_run_id, claim_index)
);

CREATE INDEX IF NOT EXISTS idx_ai_claims_generation
  ON ai_claims(generation_run_id);

CREATE INDEX IF NOT EXISTS idx_ai_claims_status
  ON ai_claims(status);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. AI CLAIM CITATIONS (links claims → retrieval chunks)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_claim_citations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id              UUID NOT NULL REFERENCES ai_claims(id) ON DELETE CASCADE,
  retrieval_chunk_id    UUID NOT NULL REFERENCES ai_retrieval_chunks(id) ON DELETE CASCADE,
  relevance_score       NUMERIC(6,4) NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (claim_id, retrieval_chunk_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_claim_citations_claim
  ON ai_claim_citations(claim_id);

CREATE INDEX IF NOT EXISTS idx_ai_claim_citations_chunk
  ON ai_claim_citations(retrieval_chunk_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- Done. 7 provenance tables — full AI trace chain.
-- ═══════════════════════════════════════════════════════════════════════════════
