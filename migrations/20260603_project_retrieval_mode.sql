-- Projects spec A2 — two-mode capacity model.
--
-- Persist the retrieval regime and a knowledge-corpus token estimate on the
-- project row so the mode is observable and surfaced (never silent), and can
-- be recomputed when the corpus changes. Additive + idempotent: nullable
-- mode (null = not yet computed), estimate defaults to 0. No backfill.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS retrieval_mode text;
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS knowledge_token_estimate integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN projects.retrieval_mode IS
  'Projects spec A2: in_context | retrieval. Null until first computed.';
COMMENT ON COLUMN projects.knowledge_token_estimate IS
  'Projects spec A2: estimated token size of the project knowledge corpus.';
