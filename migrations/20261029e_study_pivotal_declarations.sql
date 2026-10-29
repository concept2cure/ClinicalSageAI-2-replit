-- =============================================================================
-- 20261029e_study_pivotal_declarations.sql
--
-- WHY. Whether a study is pivotal (one the application relies on for
-- efficacy) is the sponsor's claim, not a fact of its phase. Module 2 decided
-- it from the phase number alone (m2-summary-builders.ts), so a Phase 2/3
-- study such as LMN-201's was written up as not pivotal whatever the sponsor
-- intended. The founder's decision of 2026-10-29: the client declares it, per
-- study (docs/design/STUDY_PIVOTAL_DECLARATION_2026-10-29.md).
--
-- WHAT.
--   public.study_pivotal_declarations: one row per declaration, in public with
--   organization_id INTEGER NOT NULL, so the tenant sweep at the tail of the
--   set gives it its policy (Rule 1). A study is keyed as the CSR loader keys
--   it: the project (csr_build_jobs.project_id) and the study
--   (csr_build_jobs.study_id). The current declaration is the latest row; a
--   change is a new row, so the history of who declared what, when and why is
--   kept. UPDATE and TRUNCATE are refused from every role. DELETE is left to
--   the tenant purge (tenant-offboarding.ts PURGE_CHILD_TABLES); no
--   application path deletes a declaration. No foreign key, so no purge order
--   is constrained by it.
--
-- RULE 1: replayed on every deploy. Every statement runs only when its object
-- is absent, or is a CREATE OR REPLACE of a function this file alone defines.
-- No DROP, no backfill, no rewrite of a row.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.study_pivotal_declarations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  INTEGER NOT NULL CONSTRAINT study_pivotal_declarations_org_positive CHECK (organization_id > 0),
  project_id       INTEGER NOT NULL CONSTRAINT study_pivotal_declarations_project_positive CHECK (project_id > 0),
  study_id         text NOT NULL CONSTRAINT study_pivotal_declarations_study_present CHECK (length(btrim(study_id)) BETWEEN 1 AND 200),
  pivotal          boolean NOT NULL,
  reason           text NOT NULL CONSTRAINT study_pivotal_declarations_reason_stated CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  declared_by      INTEGER NOT NULL CONSTRAINT study_pivotal_declarations_declarer_positive CHECK (declared_by > 0),
  declared_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_pivotal_declarations_current_idx
  ON public.study_pivotal_declarations (organization_id, project_id, study_id, declared_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.study_pivotal_declarations_guard()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'STUDY_PIVOTAL_DECLARATION_IMMUTABLE: a pivotal declaration is never changed; declare again instead (%).', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$fn$;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'study_pivotal_declarations_guard_row'
                    AND tgrelid = 'public.study_pivotal_declarations'::regclass) THEN
    CREATE TRIGGER study_pivotal_declarations_guard_row
      BEFORE UPDATE ON public.study_pivotal_declarations
      FOR EACH ROW EXECUTE FUNCTION public.study_pivotal_declarations_guard();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'study_pivotal_declarations_guard_truncate'
                    AND tgrelid = 'public.study_pivotal_declarations'::regclass) THEN
    CREATE TRIGGER study_pivotal_declarations_guard_truncate
      BEFORE TRUNCATE ON public.study_pivotal_declarations
      FOR EACH STATEMENT EXECUTE FUNCTION public.study_pivotal_declarations_guard();
  END IF;
END
$mig$;

COMMENT ON TABLE public.study_pivotal_declarations IS
  'The sponsor''s declaration, per study, of whether it is pivotal. Append-only: the latest row is current; UPDATE and TRUNCATE are refused; DELETE is the tenant purge''s.';
