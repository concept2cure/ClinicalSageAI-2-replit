-- 20261031 — A document's study data: the clinical source frozen as a source of the
-- CSR document, in its project, without a package run (CLAUDE.md RULE 4).
--
-- Before this, a study's tables were frozen only inside a Submission Center package
-- run (submission_orchestrator_inputs), which needs a recorded submission, sequence and
-- agency application number. A clinical study report therefore could not use its own
-- study's data until a filing existed, and never from its own document
-- (docs/design/CSR_END_TO_END_2026-10-29.md, step 2 design).
--
-- A row is the same sealed snapshot shape a run's inputs hold (organizationId,
-- programId, clinicalStudyData, clinicalSourceReceipts), digested and sealed by the
-- same functions (server/services/submission-orchestrator-inputs.ts), and read by the
-- same verifying reader (server/services/csr/saved-clinical-tables.ts). It is private:
-- the snapshot holds subject-level observations and is never returned to a client.
--
-- Immutable like a run's inputs: a different source is a new row, never an edit.
-- Additive and IF NOT EXISTS-guarded; replays on every deploy (RULE 1).

CREATE TABLE IF NOT EXISTS public.csr_study_data (
  study_data_id          uuid PRIMARY KEY,
  organization_id        INTEGER NOT NULL REFERENCES organizations(id),
  program_id             uuid NOT NULL REFERENCES regulatory_programs(id),
  authoring_document_id  uuid NOT NULL,
  input_snapshot         jsonb NOT NULL,
  input_digest           text NOT NULL,
  input_seal             text,
  created_by             INTEGER NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(input_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS csr_study_data_document_idx
  ON public.csr_study_data (organization_id, authoring_document_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.protect_csr_study_data() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A document''s frozen study data is immutable; freeze the study''s data again instead (%).', TG_OP
    USING ERRCODE = '23514';
END $$;

DROP TRIGGER IF EXISTS csr_study_data_immutable ON public.csr_study_data;
CREATE TRIGGER csr_study_data_immutable BEFORE UPDATE OR DELETE ON public.csr_study_data
  FOR EACH ROW EXECUTE FUNCTION public.protect_csr_study_data();
