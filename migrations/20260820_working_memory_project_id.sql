-- Project attribution for thread-keyed working memory.
--
-- The nightly consolidation job (memory-consolidation-job.ts) promotes stale
-- working-memory rows into durable project_memory_entries — but it could only
-- resolve a project through concept2cure_conversations, and the live AnA chat
-- path (ana-ri/stream → post-processing) writes thread-keyed rows with
-- conversation_id NULL. Those rows were structurally invisible to promotion:
-- every conversation AnA had through the real UI aged past the staleness
-- threshold and was never consolidated.
--
-- This column lets the writer record the project at write time — the moment it
-- is actually known — so consolidation can resolve a project for thread-keyed
-- rows via COALESCE(cc.project_id, cwm.project_id).
--
-- Nullable and additive — no backfill. Rows written before this column exists
-- (or from surfaces with no project in scope) keep NULL and remain excluded
-- from promotion, exactly as before: we do not guess a project after the fact.
--
-- The CREATE TABLE exists because conversation_working_memory is a push-surface
-- table (shared/schema.ts), not a journal table: a database maintained only by
-- the migration set has never had it, and both this file's ALTER and 20260602's
-- embedding ALTER would fail against nothing. Shape mirrors the Drizzle model
-- exactly, minus the embedding column, which stays 20260602's (pgvector-
-- dependent, applied right after this file in C2C_MIGRATION_FILES).

CREATE TABLE IF NOT EXISTS conversation_working_memory (
  id                            serial PRIMARY KEY,
  conversation_id               integer REFERENCES concept2cure_conversations(id) ON DELETE CASCADE,
  thread_id                     text,
  project_id                    integer REFERENCES projects(id),
  organization_id               integer NOT NULL REFERENCES organizations(id),
  summary                       text NOT NULL,
  structured_data               json,
  message_count_at_generation   integer NOT NULL,
  generated_at                  timestamp DEFAULT now() NOT NULL
);

-- Pre-existing (push-provisioned) tables get the new column added in place.
ALTER TABLE conversation_working_memory
  ADD COLUMN IF NOT EXISTS project_id integer REFERENCES projects(id);

CREATE INDEX IF NOT EXISTS cwm_conv_idx ON conversation_working_memory(conversation_id);
CREATE INDEX IF NOT EXISTS cwm_thread_idx ON conversation_working_memory(thread_id);
CREATE INDEX IF NOT EXISTS cwm_project_idx ON conversation_working_memory(project_id);
CREATE INDEX IF NOT EXISTS cwm_org_idx ON conversation_working_memory(organization_id);
CREATE INDEX IF NOT EXISTS cwm_generated_at_idx ON conversation_working_memory(generated_at);
