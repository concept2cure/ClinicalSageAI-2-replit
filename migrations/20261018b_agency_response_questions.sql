-- =============================================================================
-- 20261018b — the questions on an agency letter, and the record their signed answers are made on
-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (11.10(e) audit trail, 11.50/11.70 signature
--             manifestation and linking), ALCOA+ principles
-- Purpose: One row per question an agency asked in a project inbox letter,
--          every text of its response kept append-only, and commitments that
--          name the letter and question they were made in.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 (correspondence with the agency, responses to
--     information requests)
--   - Integrity Risk Addressed: an answer to an agency approved by a status
--     flag, or edited after approval with the approved words lost
--
-- Determinism Contract:
--   - Approval is never stored; it is derived from electronic_signatures and
--     the digest of the response as it stands (response-logic.ts).
--   - Any change to the digest recipe requires a new recipe version.
-- =============================================================================
-- 20261018b_agency_response_questions.sql
--
-- Correspondence & commitments (row D2, Communication Center; row D5, Part 11).
-- docs/evidence/D2-CORRESPONDENCE-SIGNED-RESPONSES/2026-10-18/.
--
-- AMENDED IN PLACE 2026-10-18 (same day, after the multi-lens review of
-- 0308ee25; evidence .../2026-10-18-review/). Rule 1: every statement below
-- re-runs on every deploy, so additions are made here, idempotently, rather
-- than in a second file. Added:
--   * agency_question_response_revisions: every text a response has had, with
--     its digest, writer, time and reason. Saving overwrote response_text in
--     place, so the exact words a signature approved could not be read back
--     once edited; only their digest survived on the signature. Append-only by
--     grant ceiling (APPEND_ONLY_TABLES in scripts/db/provision-app-role.mjs):
--     the runtime role may INSERT and SELECT. ON DELETE CASCADE from its
--     question, because a foreign-key action runs as the table owner, so a
--     tenant purge that deletes the question erases its history through the
--     ceiling, and nothing else can.
--   * withdrawn_at / withdrawn_by / withdrawal_reason on the question: a
--     question recorded in error is withdrawn with a reason, never deleted, and
--     no longer has to be answered.
-- Dropped nothing; no constraint another file defines is touched.
--
-- AMENDED IN PLACE 2026-10-19 (CMC / Module 3 questions onto the letter; rows
-- D2 and D5; decision P-39 item 1; evidence
-- docs/evidence/D2-CMC-QUESTIONS-ONTO-INBOX/2026-10-19/). Added, idempotently:
--   * ctd_section on the question: the CTD section it concerns ("3.2.S.4.1"),
--     so CMC / Module 3 can show the questions about its sections without a
--     store of its own. Classification, like discipline and severity: the
--     approval signature does not bind it (agencyResponseDigest is unchanged),
--     so correcting it, with a reason, leaves an approval standing. Its CHECK
--     admits exactly what the repository's one CTD rule stores
--     (shared/regulatory/section-code.ts normalizeCtdCode: `[1-5]` then
--     `.SEGMENT`s of digits and capitals), up to 40 characters; the TypeScript
--     rule and this CHECK share one case table
--     (server/services/agency-responses/__tests__/ctd-section-cases.ts).
--     Added only when pg_constraint does not hold it, so a replay re-checks no
--     row. A question's section refines its letter's linked_section_codes; it
--     does not replace them.
-- Dropped nothing; no constraint another file defines is touched.
--
-- An agency letter in the project's inbox (concept2cure_agency_communications,
-- db/migrations/20260331_communication_center_scaffold.sql) recorded its
-- questions as a JSON array of strings, so a question had no response, no
-- owner and no approval of its own, and the inbox's Advance closed a letter
-- that nobody had answered. P-32 (docs/LAUNCH_DEFINITION_OF_DONE.md) kept the
-- agency-questions screen locked because its approval was a status flag, not a
-- signature. This file adds the record that approval is made on:
--
--   agency_communication_questions  one row per question the agency asked in
--                                   one inbox letter: the question as the
--                                   agency numbered and worded it, and our
--                                   response to it. The response is approved
--                                   by a Part 11 signature on the target
--                                   `agency-question:<id>`, which binds a
--                                   sha256 over the letter id, the question
--                                   and the exact response text
--                                   (BINDING_BASIS.AGENCY_RESPONSE_CONTENT).
--
-- NO APPROVAL COLUMNS, on purpose. Whether a response is approved is read from
-- electronic_signatures: a live signature (superseded_by IS NULL) on the
-- question whose bound digest equals the digest of the response as it stands.
-- A stored "approved" flag could disagree with the signature table; this
-- cannot. Editing the response after it was signed changes its digest, so the
-- earlier signature stops approving it without anything being written.
--
-- response_updated_by is who last wrote the response text. The service refuses
-- a signature from that person (separation of duties: the author does not
-- approve their own answer to an agency), and response_revision guards a save
-- or a signature against text the person did not see.
--
-- And three nullable columns on regulatory_commitments
-- (migrations/20260610_ha_interactions_commitments.sql), so a commitment made
-- in an answer to an agency names the project, the letter and the question it
-- came from. Existing rows keep NULL: they were recorded before any letter
-- could be named, and nothing is inferred for them.
--
-- Replay-safe (RULE 1): CREATE TABLE / INDEX IF NOT EXISTS, ADD COLUMN IF NOT
-- EXISTS, and the commitment foreign keys added only when pg_constraint does
-- not hold them. The CHECKs are defined here and nowhere else. Drops nothing.
-- public + organization_id INTEGER NOT NULL, so the tenant sweeps at the end
-- of C2C_MIGRATION_FILES give the new table its policy; listed after both
-- parent files and above the final pair.
--
-- NOT mirrored in Drizzle, on purpose (header corrected 2026-10-18, review of
-- the next slice: it named shared/schema/agency-responses.ts, which never
-- existed). install-fresh runs `drizzle-kit push` before this set, so a Drizzle
-- definition would create the two tables first, without the CHECKs below, and
-- CREATE TABLE IF NOT EXISTS would then skip them. The three columns added to
-- regulatory_commitments are SQL-only too; the services read them with SQL.

CREATE TABLE IF NOT EXISTS public.agency_communication_questions (
  id                     SERIAL PRIMARY KEY,
  organization_id        INTEGER NOT NULL REFERENCES public.organizations(id),
  project_id             INTEGER NOT NULL REFERENCES public.projects(id),
  communication_event_id TEXT NOT NULL
                           REFERENCES public.concept2cure_agency_communications(event_id),
  -- As the agency numbered it ("Q3", "IR 2", "Clinical 4"); unique per letter.
  question_ref           TEXT NOT NULL CHECK (length(btrim(question_ref)) > 0),
  question_text          TEXT NOT NULL CHECK (length(btrim(question_text)) > 0),
  discipline             TEXT,
  severity               TEXT NOT NULL DEFAULT 'major'
                           CHECK (severity IN ('minor', 'major', 'critical')),
  owner_user_id          INTEGER REFERENCES public.users(id),
  response_text          TEXT NOT NULL DEFAULT '',
  response_revision      INTEGER NOT NULL DEFAULT 0 CHECK (response_revision >= 0),
  response_updated_by    INTEGER REFERENCES public.users(id),
  response_updated_at    TIMESTAMPTZ,
  created_by             INTEGER NOT NULL REFERENCES public.users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A response revision is always attributed: revision 0 is "nothing written".
  CONSTRAINT agency_communication_questions_response_attributed
    CHECK ((response_revision = 0) = (response_updated_by IS NULL)),
  CONSTRAINT agency_communication_questions_ref_unique
    UNIQUE (communication_event_id, question_ref)
);

-- Withdrawal (amended 2026-10-18): all three set together, or none.
ALTER TABLE public.agency_communication_questions
  ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ;
ALTER TABLE public.agency_communication_questions
  ADD COLUMN IF NOT EXISTS withdrawn_by INTEGER REFERENCES public.users(id);
ALTER TABLE public.agency_communication_questions
  ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'agency_communication_questions_withdrawal_coherent'
       AND conrelid = 'public.agency_communication_questions'::regclass
  ) THEN
    ALTER TABLE public.agency_communication_questions
      ADD CONSTRAINT agency_communication_questions_withdrawal_coherent
      CHECK ((withdrawn_at IS NULL) = (withdrawn_by IS NULL)
         AND (withdrawn_at IS NULL) = (withdrawal_reason IS NULL));
  END IF;
END $$;

-- Every text a response has had (amended 2026-10-18). Written by INSERT only.
CREATE TABLE IF NOT EXISTS public.agency_question_response_revisions (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id),
  question_id     INTEGER NOT NULL
                    REFERENCES public.agency_communication_questions(id) ON DELETE CASCADE,
  revision        INTEGER NOT NULL CHECK (revision > 0),
  response_text   TEXT NOT NULL,
  -- agencyResponseDigest over this text (server/services/agency-responses/response-logic.ts).
  response_digest TEXT NOT NULL CHECK (response_digest ~ '^[0-9a-f]{64}$'),
  written_by      INTEGER NOT NULL REFERENCES public.users(id),
  written_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason          TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  CONSTRAINT agency_question_response_revisions_unique UNIQUE (question_id, revision)
);
CREATE INDEX IF NOT EXISTS idx_agency_q_revisions_scope
  ON public.agency_question_response_revisions (organization_id, question_id);
CREATE INDEX IF NOT EXISTS idx_agency_q_revisions_digest
  ON public.agency_question_response_revisions (question_id, response_digest);

-- The CTD section a question concerns (amended 2026-10-19). Classification only.
ALTER TABLE public.agency_communication_questions
  ADD COLUMN IF NOT EXISTS ctd_section TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'agency_communication_questions_ctd_section_format'
       AND conrelid = 'public.agency_communication_questions'::regclass
  ) THEN
    ALTER TABLE public.agency_communication_questions
      ADD CONSTRAINT agency_communication_questions_ctd_section_format
      CHECK (ctd_section IS NULL
             OR (length(ctd_section) <= 40 AND ctd_section ~ '^[1-5](\.[0-9A-Z]+)*$'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agency_comm_questions_scope
  ON public.agency_communication_questions (organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_agency_comm_questions_event
  ON public.agency_communication_questions (communication_event_id);
CREATE INDEX IF NOT EXISTS idx_agency_comm_questions_owner
  ON public.agency_communication_questions (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

-- ── Commitments name the answer they were made in ─────────────────────────
ALTER TABLE public.regulatory_commitments
  ADD COLUMN IF NOT EXISTS project_id INTEGER;
ALTER TABLE public.regulatory_commitments
  ADD COLUMN IF NOT EXISTS source_communication_event_id TEXT;
ALTER TABLE public.regulatory_commitments
  ADD COLUMN IF NOT EXISTS source_question_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'regulatory_commitments_project_id_fkey'
       AND conrelid = 'public.regulatory_commitments'::regclass
  ) THEN
    ALTER TABLE public.regulatory_commitments
      ADD CONSTRAINT regulatory_commitments_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'regulatory_commitments_source_communication_fkey'
       AND conrelid = 'public.regulatory_commitments'::regclass
  ) THEN
    ALTER TABLE public.regulatory_commitments
      ADD CONSTRAINT regulatory_commitments_source_communication_fkey
      FOREIGN KEY (source_communication_event_id)
      REFERENCES public.concept2cure_agency_communications(event_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'regulatory_commitments_source_question_fkey'
       AND conrelid = 'public.regulatory_commitments'::regclass
  ) THEN
    ALTER TABLE public.regulatory_commitments
      ADD CONSTRAINT regulatory_commitments_source_question_fkey
      FOREIGN KEY (source_question_id)
      REFERENCES public.agency_communication_questions(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reg_commitments_project
  ON public.regulatory_commitments (project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reg_commitments_source_question
  ON public.regulatory_commitments (source_question_id)
  WHERE source_question_id IS NOT NULL;

COMMENT ON TABLE public.agency_communication_questions IS
  'Questions an agency asked in one inbox letter, and our response to each. '
  'Approval is a Part 11 signature on agency-question:<id> whose bound digest '
  'equals the digest of the current response; there is no approval column.';
COMMENT ON COLUMN public.agency_communication_questions.response_updated_by IS
  'Who wrote the current response text. Anyone who wrote a revision since the last approved one cannot sign its approval.';
COMMENT ON COLUMN public.agency_communication_questions.ctd_section IS
  'The CTD section the question concerns (3.2.S.4.1), as normalizeCtdCode stores it. Classification only: the approval signature does not bind it.';
COMMENT ON TABLE public.agency_question_response_revisions IS
  'Every text an agency response has had. A signature binds one of these by digest; the text it approved is read back here.';
