-- Semantic recall for working memory.
--
-- Adds an optional 1536-dim embedding to each conversation_working_memory row,
-- mirroring client_memory_entries / project_memory_entries so the working-memory
-- layer can be retrieved by query similarity instead of recency alone.
--
-- Nullable and additive — no backfill, no rewrite of existing rows. The column
-- is populated only when ENABLE_SEMANTIC_WORKING_MEMORY is on; the recency-only
-- read path ignores it, and the semantic read path filters `embedding IS NOT
-- NULL`, so pre-existing rows (embedding NULL) are simply skipped by similarity
-- search rather than mis-ranked.
--
-- No vector index: this codebase scans with the `<=>` operator (see
-- client_memory_entries / project_memory_entries), and working-memory rows are
-- already narrowed by thread_id + organization_id before the distance sort.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE conversation_working_memory
  ADD COLUMN IF NOT EXISTS embedding vector(1536);
