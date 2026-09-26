-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 §11.10(b), (c), (e); EU Annex 11 §9; ALCOA+
-- Purpose: One immutable record per AnA turn — what the person asked, what the
--          model was given, what AnA did, what she answered — kept so that it
--          can be produced for an inspector later and shown to be unchanged.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (every AnA drafting, research and review turn)
--   - Integrity Risk Addressed: an AI-assisted regulatory record that could be
--     edited, deleted with its thread, or was never written in full
--
-- Determinism Contract:
--   - The record is stored as the exact canonical JSON text that was hashed
--     (record_text), not as JSONB: JSONB re-serialises, and a hash is only
--     verifiable over the bytes it was computed from.
--   - Additive and idempotent. No DROP (RULE 1).
--
-- Notes:
--   - Row D5, 2026-09-26. Evidence: docs/evidence/D5-ANA-RECORD/2026-09-26/.
--   - Writer: server/services/ana/turn-record.ts (writeTurnRecord), one
--     transaction with the chained audit_logs row whose details carry
--     record_sha256 — the chain proves the record existed, when, and that
--     it has not changed since.
--   - Written by every door into AnA's agentic loop: the stream
--     (POST /api/ana-ri/stream, also mounted at /api/chat/stream),
--     POST /api/chat/send-message, POST /api/claude/agent and the /ana
--     socket (services/ana/turn-record-loop.ts). A background deep
--     investigation is started by a recorded turn's tool call; its own model
--     calls are not turn records.
--   - Read, verified and exported by server/routes/ana-ri/turn-records.ts.
-- =============================================================================
--
-- What existed before this file, measured 2026-09-26 at 33e16e7a9:
--
--   chat_messages / chat_threads   the working transcript. The user's text and
--       the final answer only; no model, no files, no tool inputs, no author on
--       the message row. The runtime role may UPDATE and DELETE them, no
--       trigger stops it, and DELETE /api/chat/thread/:id and
--       DELETE /api/cortex/threads/:id remove a thread and its messages with no
--       audit row.
--   ai_threads / ai_messages / ai_generation_runs (20260224_ai_trace_chain)
--       a per-model-call retrieval → claim → citation provenance overlay,
--       written by /api/chat/send-message, evidence-ask and the submission
--       chat — not by the AnA stream, which is what the product uses. It keeps
--       an answer HASH, not the answer, and cascades away with its thread. It
--       answers "which chunk supports which claim"; this table answers "what
--       happened in this turn". They are not two stores of one thing.
--   audit_logs                     the tenant hash chain. Before this file it
--       held nothing about a turn beyond a prompt-injection detection, Live
--       Drive screen actions and governed-action signatures.
--
-- The working transcript stays as it is — the conversation UI reads it and a
-- person may still remove a conversation from their list. This table is the
-- record of what happened, and it does not go with the thread: thread_id is a
-- reference, not a foreign key.
--
-- Append-only, enforced by the engine for every role: UPDATE, DELETE and
-- TRUNCATE are refused. A correction is a new record, never an edit. The
-- tenant purge (server/services/tenant/tenant-offboarding.ts) does not list
-- this table; a governed purge or erasure path, when one exists (VR-07,
-- security plan P2-9), amends THIS file in place to admit it (RULE 1).
--
-- A superuser or the table owner can still DISABLE TRIGGER. The two triggers
-- are on EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS
-- (server/services/audit/audit-immutability-triggers.ts): a production boot
-- refuses without them, and the daily sweep alarms.
--
-- Tenant isolation: both tables are public with organization_id INTEGER NOT
-- NULL, so the tenant sweep at the end of C2C_MIGRATION_FILES gives each its
-- policy (CLAUDE.md RULE 1, third corollary).
--
-- Pinned by server/services/ana/__tests__/turn-record.pglite.test.ts (the
-- triggers refuse UPDATE, DELETE and TRUNCATE; a record and its chained audit
-- row commit together or not at all).
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.ana_turn_records') IS NULL THEN
    CREATE TABLE public.ana_turn_records (
      id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id       INTEGER     NOT NULL,
      -- chat_threads.id; a reference, not a foreign key — see the header.
      thread_id             TEXT,
      -- ana_runs.id of the run that served the turn.
      run_id                TEXT,
      -- chat_messages.id of the question and the answer, when they were saved.
      user_message_id       INTEGER,
      assistant_message_id  INTEGER,
      -- users.id of the person who asked.
      actor_user_id         INTEGER,
      outcome               TEXT        NOT NULL
        CHECK (outcome IN ('answered', 'stopped', 'failed')),
      started_at            TIMESTAMPTZ NOT NULL,
      ended_at              TIMESTAMPTZ NOT NULL,
      schema_version        TEXT        NOT NULL,
      -- The canonical JSON text, byte for byte as hashed.
      record_text           TEXT        NOT NULL,
      -- The engine checks the hash: a record stored under a hash that is not
      -- its own is refused, whoever writes it.
      record_sha256         TEXT        NOT NULL
        CHECK (record_sha256 = encode(sha256(convert_to(record_text, 'UTF8')), 'hex')),
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
  -- The texts a record references, each stored once per tenant under its own
  -- SHA-256. A record lists hashes; this table holds what they hash. Turn 40
  -- of a thread references the history by hash instead of copying it again.
  IF to_regclass('public.ana_record_blobs') IS NULL THEN
    CREATE TABLE public.ana_record_blobs (
      organization_id INTEGER     NOT NULL,
      sha256          TEXT        NOT NULL
        CHECK (sha256 = encode(sha256(convert_to(text, 'UTF8')), 'hex')),
      text            TEXT        NOT NULL,
      chars           INTEGER     NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (organization_id, sha256)
    );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_ana_turn_records_thread
  ON public.ana_turn_records (organization_id, thread_id, started_at);
CREATE INDEX IF NOT EXISTS idx_ana_turn_records_actor
  ON public.ana_turn_records (organization_id, actor_user_id, started_at);

CREATE OR REPLACE FUNCTION public.ana_turn_records_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_LEVEL = 'ROW' THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: % row cannot be % — it is part of a retained AnA turn record (21 CFR Part 11 §11.10(e)).',
      TG_TABLE_NAME, lower(TG_OP)
      USING ERRCODE = 'raise_exception',
            HINT = 'A turn record is corrected by appending a new record, never by editing or removing one.';
  END IF;
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: % cannot be truncated — it holds retained AnA turn records (21 CFR Part 11 §11.10(e)).',
    TG_TABLE_NAME
    USING ERRCODE = 'raise_exception';
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_ana_turn_records_append_only'
       AND tgrelid = 'public.ana_turn_records'::regclass
  ) THEN
    CREATE TRIGGER trg_ana_turn_records_append_only
      BEFORE UPDATE OR DELETE ON public.ana_turn_records
      FOR EACH ROW EXECUTE FUNCTION public.ana_turn_records_append_only();
  END IF;
  -- A row trigger does not fire on TRUNCATE; without this one a single
  -- statement would erase every turn of every tenant past the row guard.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_ana_turn_records_no_truncate'
       AND tgrelid = 'public.ana_turn_records'::regclass
  ) THEN
    CREATE TRIGGER trg_ana_turn_records_no_truncate
      BEFORE TRUNCATE ON public.ana_turn_records
      FOR EACH STATEMENT EXECUTE FUNCTION public.ana_turn_records_append_only();
  END IF;
  -- The texts are as fixed as the records that reference them. Writing the
  -- same text twice is an INSERT … ON CONFLICT DO NOTHING, which fires no
  -- UPDATE, so identical content never needs an edit.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_ana_record_blobs_append_only'
       AND tgrelid = 'public.ana_record_blobs'::regclass
  ) THEN
    CREATE TRIGGER trg_ana_record_blobs_append_only
      BEFORE UPDATE OR DELETE ON public.ana_record_blobs
      FOR EACH ROW EXECUTE FUNCTION public.ana_turn_records_append_only();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_ana_record_blobs_no_truncate'
       AND tgrelid = 'public.ana_record_blobs'::regclass
  ) THEN
    CREATE TRIGGER trg_ana_record_blobs_no_truncate
      BEFORE TRUNCATE ON public.ana_record_blobs
      FOR EACH STATEMENT EXECUTE FUNCTION public.ana_turn_records_append_only();
  END IF;
END
$$;
