-- =============================================================================
-- 20261019b — the earlier CMC agency-question file is read-only
-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (11.10(a) validation of systems, 11.10(e) audit
--             trail, 11.70 signature/record linking), ALCOA+ principles
-- Purpose: reg_questions, where CMC / Module 3 kept agency questions and
--          closed them by status update, refuses every INSERT, UPDATE, DELETE
--          and TRUNCATE.
--          Agency questions are recorded on the letter they came in
--          (agency_communication_questions), where a response is approved by
--          a Part 11 signature.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 (correspondence with the agency) and Module 3
--     (the CMC questions it concerns)
--   - Integrity Risk Addressed: an agency question answered by a status flag,
--     in a second store beside the signed record, that a person or the runtime
--     role could still write
--
-- Determinism Contract:
--   - No row is created, changed or inferred here. The rows stay as they were
--     written; nothing moves them onto a letter (that act is owed, below).
-- =============================================================================
-- 20261019b_reg_questions_read_only.sql
--
-- CMC / Module 3 questions onto the letter (rows D2 and D5; decisions P-38 and
-- P-39 item 1, docs/LAUNCH_DEFINITION_OF_DONE.md). Evidence:
-- docs/evidence/D2-CMC-QUESTIONS-ONTO-INBOX/2026-10-19/.
--
-- WHY. /api/cmc/agency-questions logged, triaged and CLOSED agency questions in
-- reg_questions with no signature, no reason and no ledger row, and CMC's
-- Overview counted its own "information requests overdue" from it. P-38 gives
-- agency questions one home, the letter; P-39 converges this file first. The
-- route's writes are retired in the same change (they answer 410), and so are
-- the file's two other writers (the Gmail ingest, the ga-demo seed). This file
-- makes the database refuse writes too, for every role, the owner included:
-- a route is one door, and the next one written would not know the file was
-- closed.
--
-- TWO HALVES, BECAUSE A TRIGGER ALONE IS NOT IMMUTABILITY (P0-8):
--   1. Here, a BEFORE INSERT OR UPDATE OR DELETE row trigger and a BEFORE
--      TRUNCATE statement trigger (a row trigger never meets TRUNCATE), both
--      raising. They refuse the owner and every role a trigger fires for.
--   2. The runtime role's grant ceiling: reg_questions is in APPEND_ONLY_TABLES
--      (scripts/db/provision-app-role.mjs) with `ceiling: ['SELECT']`, so the
--      role holds SELECT and nothing else. That refuses the statements a row
--      trigger never meets (`UPDATE … WHERE false`), and holds with triggers
--      out of the way (replica mode, a restore without triggers). The deploy's
--      readiness contract fails a runtime role that holds more.
--
-- DELETE AND TRUNCATE ARE REFUSED TOO (amended in place 2026-10-19, by the
-- review of the change that added this file, before it was ever deployed).
-- The file first left DELETE to the owner "for a later purge door", which made
-- URS-CMC-030's "refuses every write" untrue: an owner DELETE ran, and this
-- change's own evidence used one. A tenant purge or erasure of this file is a
-- governed door, owed, and is built by amending THIS file (below). No
-- foreign-key action reaches this table (it references organizations,
-- agency_correspondence and reg_attachments, and is referenced by reg_responses
-- and reg_messages, all with NO ACTION), so the triggers break no cascade, and
-- the tenant purge (server/services/tenant/tenant-offboarding.ts) does not list
-- it. A restore or a test fixture writes it as the owner with
-- session_replication_role = replica for one transaction.
--
-- OWED, NOT HERE. Moving a row that is not closed onto a letter is a governed
-- act a person takes; it is deferred until a deployed estate shows rows that
-- need it (the count query is in the evidence README). Until then a person
-- records the question on its letter in Communication, and the row here keeps
-- its status. When that act, or any data correction, is built, it AMENDS THIS
-- FILE IN PLACE (CLAUDE.md Rule 1: the file re-runs on every deploy, so a
-- second file that loosened the trigger would be undone by this one, or undo
-- it, depending on order).
--
-- Replay-safe (Rule 1): CREATE OR REPLACE FUNCTION and CREATE OR REPLACE
-- TRIGGER (PostgreSQL 14+) inside a to_regclass guard; a database without the
-- table is left alone. No file in the migration set issues DML on reg_questions
-- (the only other set file that touches it, db/migrations/
-- 20260830_reg_questions_response_doc.sql, adds a column). Creates no table,
-- drops nothing.

CREATE OR REPLACE FUNCTION public.reg_questions_read_only() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION
    'reg_questions is read-only since 2026-10-19 (% refused): agency questions are recorded on the letter they came in, in Communication, where each response is approved by signature.',
    TG_OP
    USING ERRCODE = 'raise_exception',
          HINT = 'Record the question on its agency letter (agency_communication_questions). A correction to this file amends migrations/20261019b_reg_questions_read_only.sql.';
END;
$fn$;

COMMENT ON FUNCTION public.reg_questions_read_only() IS
  'Refuses INSERT, UPDATE, DELETE and TRUNCATE on reg_questions, the earlier CMC agency-question file, read-only since 2026-10-19 (P-39 item 1).';

DO $$
BEGIN
  IF to_regclass('public.reg_questions') IS NULL THEN
    RAISE NOTICE '[reg-questions-read-only] public.reg_questions not present; nothing to guard.';
    RETURN;
  END IF;
  CREATE OR REPLACE TRIGGER reg_questions_read_only
    BEFORE INSERT OR UPDATE OR DELETE ON public.reg_questions
    FOR EACH ROW EXECUTE FUNCTION public.reg_questions_read_only();
  CREATE OR REPLACE TRIGGER reg_questions_read_only_truncate
    BEFORE TRUNCATE ON public.reg_questions
    FOR EACH STATEMENT EXECUTE FUNCTION public.reg_questions_read_only();
  COMMENT ON TABLE public.reg_questions IS
    'The earlier CMC agency-question file. Read-only since 2026-10-19: agency questions are recorded on their letter (agency_communication_questions).';
END;
$$;
