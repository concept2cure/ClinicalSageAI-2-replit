-- Chat thread store: give chat_threads and chat_messages an actual apply path,
-- with the columns the code has always queried.
--
-- ── The defect ───────────────────────────────────────────────────────────────
-- No .sql file in this repository creates chat_threads or chat_messages. Their
-- only creator is runtime DDL inside the application itself —
-- server/services/chat-thread-helpers.ts::ensureChatTables() — which runs
-- `CREATE TABLE IF NOT EXISTS` on first use.
--
-- That would merely be unusual. What makes it broken is that the DDL and the
-- queries in the SAME FILE disagree about the schema:
--
--   ensureChatTables() creates chat_messages as
--       (id, thread_id, role, content, created_at)
--
--   ...and then, forty lines later:
--       :111  SELECT role, content, metadata     FROM chat_messages ...
--       :139  SELECT role, content, tokens_used  FROM chat_messages ...
--       :186  INSERT INTO chat_messages (thread_id, role, content, model,
--                                        tokens_used, metadata, created_at)
--
-- None of model, tokens_used or metadata is ever created. Reproduced against a
-- real Postgres by running that exact DDL and then that exact INSERT:
--
--     ERROR:  column "model" of relation "chat_messages" does not exist
--     ERROR:  column "metadata" does not exist
--
-- So on any database where these tables were created by the application (which
-- is every database, since nothing else creates them), persisting a chat
-- message fails. The chat surface is what README.md calls "the product".
--
-- chat_threads has the same shape of gap: the runtime DDL omits title, model,
-- system_prompt and metadata, all of which are selected and inserted elsewhere
-- (server/routes/chat/threads.ts, conversation-thread-routes.ts,
-- cortex-unified.ts).
--
-- ── Why migrations/20260601_chat_message_metadata.sql did not save this ──────
-- That file is `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata`.
-- It cannot run on a fresh database, because the table it alters does not
-- exist yet — it is one of the files scripts/db/install-fresh.mjs reports as
-- unapplied with `relation "chat_messages" does not exist`. It was an additive
-- patch to a table that had no creator.
--
-- ── What this file does ──────────────────────────────────────────────────────
-- Both CREATE and REPAIR, because two populations exist:
--   * fresh databases, which have neither table; and
--   * long-lived databases, which already carry the narrow runtime-created
--     shape and cannot simply be recreated.
-- Every statement is idempotent, so it composes with 20260601 in either order
-- (the raw-migration overlay in install-fresh.mjs is multi-pass and retries
-- deferred files, so ordering between the two resolves itself).
--
-- Idempotent: safe to re-run.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: these tables hold conversation history. Dropping them destroys user
-- data, so there is no automatic down migration. To reverse only the column
-- additions (which will re-break the chat surface):
--   ALTER TABLE chat_messages DROP COLUMN IF EXISTS model, DROP COLUMN IF EXISTS tokens_used;
--   ALTER TABLE chat_threads  DROP COLUMN IF EXISTS title, DROP COLUMN IF EXISTS model,
--                             DROP COLUMN IF EXISTS system_prompt;
-- `metadata` is deliberately excluded — it is owned by 20260601.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. chat_threads — full shape.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_threads (
  id               TEXT PRIMARY KEY,
  user_id          INTEGER,
  project_id       INTEGER,
  organization_id  INTEGER,
  title            TEXT,
  model            TEXT,
  system_prompt    TEXT,
  metadata         JSONB,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

-- Repair the runtime-created narrow shape. No-ops on a table this file just
-- created; adds the four missing columns on a long-lived database.
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS project_id      INTEGER;
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS organization_id INTEGER;
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS title           TEXT;
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS model           TEXT;
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS system_prompt   TEXT;
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS metadata        JSONB;
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMP DEFAULT NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. chat_messages — full shape.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id           SERIAL PRIMARY KEY,
  thread_id    TEXT REFERENCES chat_threads(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  content      TEXT NOT NULL,
  model        TEXT,
  tokens_used  INTEGER DEFAULT 0,
  metadata     JSONB,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- The three columns whose absence breaks every write. `tokens_used` defaults to
-- 0 rather than NULL because chat-thread-helpers.ts:155 does
-- `msg.tokens_used > 0 ? ... : estimateTokens(...)`, and NULL > 0 is NULL,
-- which is falsy — the heuristic fallback is the intended path for unknown
-- token counts, so 0 preserves the author's behaviour on backfilled rows.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS model       TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata    JSONB;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes for the lookups the routes actually issue.
--
-- Threads are fetched tenant-scoped — `WHERE id = $1 AND organization_id = $2`
-- and `WHERE id = $1 AND user_id = $2` — and messages are always read by thread
-- in creation order.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_threads_org      ON chat_threads (organization_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_user     ON chat_threads (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_project  ON chat_threads (project_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread  ON chat_messages (thread_id, created_at);

COMMIT;
