-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: An AnA conversation names the project it was held in, by key, and
--          only a project of its own organization (project-first plan PF-10,
--          slice S1; D2, D3).
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (the conversation every AnA draft, citation and
--     governed action of a turn starts from)
--   - Integrity Risk Addressed: a conversation's project held only in free
--     JSON, written unchecked, so a thread of organization A could name
--     organization B's program and be listed under it.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing value is overwritten; no key is dropped.
-- =============================================================================
-- 20261001c_chat_threads_program_key.sql
--
-- WHY. A chat thread's project lives in chat_threads.metadata->>'programId',
-- written by chat-thread-helpers.ts getOrCreateThread from the request's
-- project with no organization check, and read back by the thread list
-- (routes/chat/threads.ts) to list a project's conversations. There is no key,
-- so nothing holds the program to the thread's organization, and nothing stops
-- a later write from re-homing the conversation. PF-10 (founder decision
-- 2026-09-26) fixes a conversation to one project and forks it when the
-- project changes; that rule needs the project as a column.
--
-- WHAT. No application behaviour changes here; PF-10 S2 moves the writer and
-- readers onto the column.
--   1. chat_threads.program_id UUID, nullable: a thread held with no project
--      open has none, which is a valid state.
--   2. regulatory_programs_id_org_uq when absent, as 20260926b creates it
--      (the same statement, so either file may run first).
--   3. chat_threads_program_same_org_fk: (program_id, organization_id) →
--      regulatory_programs (id, organization_id), NOT VALID, ON DELETE SET
--      NULL (program_id). The column list matters: a tenant purge deletes
--      regulatory_programs, and a bare SET NULL would also null the thread's
--      organization_id. NOT VALID is belt and braces; the column is new.
--   4. chat_threads_program_needs_org: CHECK (program_id IS NULL OR
--      organization_id IS NOT NULL), NOT VALID. A composite key with a NULL
--      column is not checked (MATCH SIMPLE), so without it a thread with no
--      organization could name any program. cortex-unified writes threads with
--      no organization and no program; the CHECK admits them.
--   5. idx_chat_threads_org_program on (organization_id, program_id) WHERE
--      program_id IS NOT NULL: the thread list's lookup.
--   6. Backfill from metadata->>'programId', ONLY where that value is a UUID
--      naming a program of the thread's own organization. A foreign, missing,
--      malformed or organization-less value leaves program_id NULL: an
--      unbound conversation costs a missing list entry; a wrongly bound one
--      shows one tenant's conversation in another tenant's project. A
--      soft-deleted program still binds: the key records where the
--      conversation was held (PF-13 keeps a deleted project's chain readable).
--
-- RULE 1: replayed on every deploy. Every DDL statement runs only when its
-- object is absent (pg_attribute / to_regclass / pg_constraint). The backfill
-- is guarded by row, not by "first apply": it touches only program_id IS NULL
-- rows that match, so it never overwrites a value a writer set, and a program
-- that is gone binds nothing. Once PF-10 S2 writes the column instead of the
-- metadata, a replay finds nothing to do. No DROP; no COMMENT.
--
-- Pinned by tests/schema-contract/chat-threads-program-key.pglite.test.ts.
-- =============================================================================

-- 1. The column. Needs only chat_threads, so a database without the program
--    spine still gets it.
DO $mig$
BEGIN
  IF to_regclass('public.chat_threads') IS NULL THEN
    RAISE NOTICE 'chat_threads absent - PF-10 program column skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.chat_threads'::regclass
                    AND attname = 'program_id' AND NOT attisdropped) THEN
    ALTER TABLE public.chat_threads ADD COLUMN program_id UUID;
  END IF;
END
$mig$;

-- 2. The referenced key, as 20260926b creates it.
DO $mig$
BEGIN
  IF to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE NOTICE 'regulatory_programs absent - PF-10 program key skipped';
    RETURN;
  END IF;
  IF to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS regulatory_programs_id_org_uq
      ON public.regulatory_programs (id, organization_id);
  END IF;
END
$mig$;

-- 3-6. The key, the CHECK, the index, the backfill.
DO $mig$
DECLARE
  bound integer := 0;
BEGIN
  IF to_regclass('public.chat_threads') IS NULL OR to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    RAISE NOTICE 'chat_threads or regulatory_programs_id_org_uq absent - PF-10 program key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_program_same_org_fk'
                    AND conrelid = 'public.chat_threads'::regclass) THEN
    ALTER TABLE public.chat_threads
      ADD CONSTRAINT chat_threads_program_same_org_fk
      FOREIGN KEY (program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE SET NULL (program_id)
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_program_needs_org'
                    AND conrelid = 'public.chat_threads'::regclass) THEN
    ALTER TABLE public.chat_threads
      ADD CONSTRAINT chat_threads_program_needs_org
      CHECK (program_id IS NULL OR organization_id IS NOT NULL)
      NOT VALID;
  END IF;
  IF to_regclass('public.idx_chat_threads_org_program') IS NULL THEN
    CREATE INDEX IF NOT EXISTS idx_chat_threads_org_program
      ON public.chat_threads (organization_id, program_id) WHERE program_id IS NOT NULL;
  END IF;

  -- metadata is JSONB on every applier (20260728); the cast keeps a hand-made
  -- JSON column from failing the plan. The uuid cast sits inside CASE: AND
  -- does not order its operands, so a filter beside it would not stop a
  -- malformed value from reaching the cast and failing the deploy.
  UPDATE public.chat_threads t
     SET program_id = rp.id
    FROM public.regulatory_programs rp
   WHERE t.program_id IS NULL
     AND t.organization_id IS NOT NULL
     AND rp.organization_id = t.organization_id
     AND rp.id = CASE
                   WHEN (t.metadata::jsonb ->> 'programId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   THEN (t.metadata::jsonb ->> 'programId')::uuid
                 END;
  GET DIAGNOSTICS bound = ROW_COUNT;
  IF bound > 0 THEN
    RAISE NOTICE 'PF-10: % conversation(s) bound to a program of their own organization from metadata', bound;
  END IF;
END
$mig$;
