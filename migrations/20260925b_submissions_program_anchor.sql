-- ============================================================================
-- 20260925b_submissions_program_anchor.sql
--
-- A submission carries its project (lineage plan LX-22; the founder's
-- principle that every chain of governed records starts at one project).
--
-- WHY. `submissions` had no project key. The project → submission link existed
-- only as `submission_id` inside the sealed `c2c.project.create` audit row, and
-- every production reader re-derived it by product name or title
-- (routes/c2c/project-intake.ts ensureSubmissionSpine, the IND checklist
-- assembler, Dispatch Readiness). So two projects for the same product shared
-- one filing spine, a submission created in Submission Center had no project at
-- all (its form makes the user pick one, then drops the id), and a sequence or
-- transmittal could reach its project only by inference.
--
-- WHAT
--   * submissions.program_id UUID — nullable here. New rows are anchored by the
--     writers (intake first); NOT NULL follows once every writer sets it.
--   * submissions_program_same_org_fk — (program_id, organization_id) →
--     regulatory_programs (id, organization_id): a submission can be anchored
--     only to a project of its OWN organization, enforced by the database, not
--     only by the writer. Added NOT VALID so existing rows are not scanned; every
--     row written or updated from here on is checked. The unique index it needs
--     on regulatory_programs (id, organization_id) is implied by the primary key
--     and costs one index.
--     ON DELETE SET NULL (program_id) — the column list, PostgreSQL 15+ (every
--     environment runs 15: terraform rds_engine_version 15.4, CI pg15). A
--     tenant purge deletes regulatory_programs and deliberately not submissions
--     (server/services/tenant/tenant-offboarding.ts PURGE_CHILD_TABLES), so a
--     plain NO ACTION key would make the first anchored submission abort that
--     tenant's whole purge. Deleting a program un-anchors its submissions and
--     leaves organization_id, which is NOT NULL, untouched; a bare SET NULL
--     would null both columns of the composite key and fail.
--   * a one-to-one backfill from the creation audit rows: a submission is
--     anchored only when exactly one same-tenant `c2c.project.create` row names
--     it, that row's program exists in the same organization, and that program
--     names exactly one submission. An ambiguous history (two projects claiming
--     one submission) stays NULL: it is not resolved by guessing.
--
-- RULE 1: replayed on every deploy. ADD COLUMN / CREATE INDEX IF NOT EXISTS; the
-- constraint is added only when absent from pg_constraint; the backfill touches
-- only rows still NULL, so a replay decides nothing twice and never overwrites a
-- writer's anchor. No DROP. Guarded on to_regclass so a lineage without either
-- table skips it.
--
-- Pinned by tests/schema-contract/submissions-program-anchor.pglite.test.ts.
-- ============================================================================

DO $mig$
BEGIN
  IF to_regclass('public.submissions') IS NULL OR to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE NOTICE 'submissions or regulatory_programs absent — program anchor skipped';
    RETURN;
  END IF;

  ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS program_id UUID;

  CREATE INDEX IF NOT EXISTS submissions_program_idx
    ON public.submissions (organization_id, program_id)
    WHERE program_id IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS regulatory_programs_id_org_uq
    ON public.regulatory_programs (id, organization_id);

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'submissions_program_same_org_fk'
       AND conrelid = 'public.submissions'::regclass
  ) THEN
    ALTER TABLE public.submissions
      ADD CONSTRAINT submissions_program_same_org_fk
      FOREIGN KEY (program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE SET NULL (program_id)
      NOT VALID;
  END IF;

  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE NOTICE 'audit_logs absent — no creation rows to backfill submissions.program_id from';
    RETURN;
  END IF;

  WITH links AS (
    SELECT a.tenant_id                                 AS org,
           a.record_id                                 AS program_text,
           (a.new_values::jsonb ->> 'submission_id')   AS submission_text
      FROM public.audit_logs a
     WHERE a.action = 'c2c.project.create'
       AND a.table_name = 'regulatory_programs'
       AND a.new_values IS NOT NULL
       AND (a.new_values::jsonb ->> 'submission_id') ~ '^[0-9]+$'
       AND a.record_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  one_to_one AS (
    SELECT l.org, l.program_text::uuid AS program_id, l.submission_text::integer AS submission_id
      FROM links l
     WHERE (SELECT count(*) FROM links s WHERE s.submission_text = l.submission_text) = 1
       AND (SELECT count(*) FROM links p WHERE p.program_text = l.program_text) = 1
  )
  UPDATE public.submissions s
     SET program_id = o.program_id
    FROM one_to_one o
   WHERE s.id = o.submission_id
     AND s.organization_id = o.org
     AND s.program_id IS NULL
     AND EXISTS (
       SELECT 1 FROM public.regulatory_programs rp
        WHERE rp.id = o.program_id AND rp.organization_id = o.org
     );
END
$mig$;
