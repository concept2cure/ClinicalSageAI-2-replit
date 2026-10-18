-- 20261018b_agency_response_questions.sql
--
-- Correspondence & commitments (row D2, Communication Center; row D5, Part 11).
-- docs/evidence/D2-CORRESPONDENCE-SIGNED-RESPONSES/2026-10-18/.
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
-- parent files and above the final pair. Mirrored in
-- shared/schema/agency-responses.ts and shared/schema/ha-interactions.ts.

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
  'Who wrote the current response text. That person cannot sign its approval.';
