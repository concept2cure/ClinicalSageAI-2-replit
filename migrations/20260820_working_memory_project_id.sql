-- Project attribution for thread-keyed working memory.
--
-- AMENDED IN PLACE 2026-10-01 (PF-13 follow-up, D5; CLAUDE.md Rule 1). The
-- project key is ON DELETE SET NULL, not NO ACTION. A working-memory row is a
-- summary of a conversation, and the conversation itself cascades with its
-- project (concept2cure_conversations), so its summary must not hold the
-- project: with NO ACTION, a draft-only project that anyone had chatted in
-- could not be deleted (DELETE /api/projects/:id answered 500), though PF-13
-- allows it. The summary stays, unattributed, which is how a row with no
-- project already reads: kept, and never promoted into project memory. Both
-- the CREATE and the ADD COLUMN say so now, and the block at the end replaces
-- an existing key in place, only where it is not already SET NULL, keeping
-- its name. 20261001_integer_project_same_org_keys.sql's same-organization key
-- on this column was amended the same way, as two keys on one column must
-- agree. The journal records drift for this file once; this note is why.
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
  project_id                    integer REFERENCES projects(id) ON DELETE SET NULL,
  organization_id               integer NOT NULL REFERENCES organizations(id),
  summary                       text NOT NULL,
  structured_data               json,
  message_count_at_generation   integer NOT NULL,
  generated_at                  timestamp DEFAULT now() NOT NULL
);

-- Pre-existing (push-provisioned) tables get the new column added in place.
ALTER TABLE conversation_working_memory
  ADD COLUMN IF NOT EXISTS project_id integer REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cwm_conv_idx ON conversation_working_memory(conversation_id);
CREATE INDEX IF NOT EXISTS cwm_thread_idx ON conversation_working_memory(thread_id);
CREATE INDEX IF NOT EXISTS cwm_project_idx ON conversation_working_memory(project_id);
CREATE INDEX IF NOT EXISTS cwm_org_idx ON conversation_working_memory(organization_id);
CREATE INDEX IF NOT EXISTS cwm_generated_at_idx ON conversation_working_memory(generated_at);

-- The project key, made ON DELETE SET NULL where an earlier version of this
-- file (or a drizzle push) created it NO ACTION (amended 2026-10-01, above).
-- Replay-safe: only a key that is not already SET NULL is replaced, under its
-- own name, so a replay runs no DDL.
DO $cwm_project_key$
DECLARE
  k record;
BEGIN
  IF to_regclass('public.conversation_working_memory') IS NULL OR to_regclass('public.projects') IS NULL THEN
    RETURN;
  END IF;
  FOR k IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'project_id'
     WHERE c.contype = 'f'
       AND c.conrelid = 'public.conversation_working_memory'::regclass
       AND c.confrelid = 'public.projects'::regclass
       AND c.conkey = ARRAY[a.attnum]
       AND c.confdeltype <> 'n'
  LOOP
    EXECUTE format('ALTER TABLE public.conversation_working_memory DROP CONSTRAINT %I', k.conname);
    EXECUTE format(
      'ALTER TABLE public.conversation_working_memory ADD CONSTRAINT %I FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL',
      k.conname);
  END LOOP;
END
$cwm_project_key$;
