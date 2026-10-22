-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Every program's project record names the registry entry its filing
--          is judged against, so the Executive Readiness Digest can compute
--          submission readiness (QA walk 2026-10-08, second pass, j8).
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (the registry entry decides the required
--     sections and artifacts readiness is evaluated against)
--   - Integrity Risk Addressed: every program's digest read "Submission
--     readiness not computed: the project records no registry context", while
--     the IND screen and Projects showed percentages for the same programs.
--
-- Determinism Contract:
--   - Adds keys to projects.metadata only where the record holds no registry
--     context. Never overwrites one, never removes a key, never drops anything.
-- =============================================================================
-- 20261008c_projects_registry_context.sql
--
-- WHY. The digest (server/services/report-os/orchestrator.ts) reads the
-- registry context from projects.metadata.registryId, or .submissionType
-- resolved by the submission-type bridge, on the project record it reports on.
-- Nothing wrote either: intake put the wizard's choice on the PROGRAM
-- (regulatory_programs.metadata.submissionTypeId) and wrote the project record
-- (ensureProgramProjectAnchor) with no metadata; 20261008's anchor backfill
-- writes none either. From this change intake writes it
-- (server/services/c2c/program-registry-context.ts, registryContextForProgram).
-- This file gives the existing records the same context, by the same rule:
--
--   1. the program's recorded choice, regulatory_programs.metadata
--      ->> 'submissionTypeId' (e.g. 'us_ind'), written as submissionType;
--   2. else a filing type whose registry entry its agency fixes, written as
--      registryId and submissionType — exactly PROGRAM_TYPE_REGISTRY:
--        ind, nda, bla, anda, dmf, 510k, de_novo, pma, ide, hde with FDA;
--        maa, cta with EMA; jnda with PMDA;
--   3. otherwise nothing. 'mdr' is NOT mapped: the bridge reads it as
--      US_MDR_REPORT (a device adverse-event report). An IND filed with another
--      agency is not mapped either: the registry's 'kr_ind' is a Korean IND.
--
-- The SQL restates rule 2; tests/schema-contract/projects-registry-context-
-- backfill.pglite.test.ts runs it over every pair and compares the result with
-- registryContextForProgram, so the two cannot drift.
--
-- Scope: the program's OWN organisation's project record (organization_id
-- equal on both rows), for programs that are not soft-deleted, whose record's
-- metadata is NULL or a JSON object with no registryId and no submissionType.
--
-- RULE 1. Replayed on every deploy. Runs after 20261008 (the P-19 anchor
-- backfill), so a record that file writes gets its context in the same deploy.
-- Idempotent: once a record holds a context it is excluded by the WHERE, so a
-- replay changes nothing; a program written outside intake later (a seed) is
-- completed by the next deploy. Adds no table, no column, no constraint; drops
-- nothing.
--
-- ROLLBACK. Remove the keys by hand from the records named in the deploy log's
-- count: UPDATE projects SET metadata = (metadata::jsonb - 'registryId' -
-- 'submissionType')::json WHERE … . Readiness then reads "not computed" again.
-- =============================================================================

DO $mig$
DECLARE
  completed integer := 0;
BEGIN
  IF to_regclass('public.projects') IS NULL OR to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE NOTICE 'registry context: projects or regulatory_programs absent - skipped';
    RETURN;
  END IF;
  -- Every column the statement reads, or it fails at plan time (42703) and
  -- takes the deploy with it.
  IF (SELECT count(DISTINCT column_name) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'projects'
         AND column_name IN ('id', 'organization_id', 'regulatory_program_id', 'metadata')) < 4
     OR (SELECT count(DISTINCT column_name) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'regulatory_programs'
            AND column_name IN ('id', 'organization_id', 'program_type', 'primary_agency', 'metadata', 'deleted_at')) < 6 THEN
    RAISE NOTICE 'registry context: a column it reads is absent - skipped';
    RETURN;
  END IF;

  WITH program_context AS (
    SELECT p.id AS project_id,
           NULLIF(btrim(g.metadata::jsonb ->> 'submissionTypeId'), '') AS chosen,
           CASE lower(regexp_replace(btrim(g.program_type), '[[:space:]-]+', '_', 'g'))
                || '|' || upper(btrim(g.primary_agency))
             WHEN 'ind|FDA'     THEN 'US_IND'
             WHEN 'nda|FDA'     THEN 'US_NDA'
             WHEN 'bla|FDA'     THEN 'US_BLA'
             WHEN 'anda|FDA'    THEN 'US_ANDA'
             WHEN 'dmf|FDA'     THEN 'US_DMF'
             WHEN '510k|FDA'    THEN 'US_510K'
             WHEN 'de_novo|FDA' THEN 'US_DE_NOVO'
             WHEN 'pma|FDA'     THEN 'US_PMA'
             WHEN 'ide|FDA'     THEN 'US_IDE'
             WHEN 'hde|FDA'     THEN 'US_HDE'
             WHEN 'maa|EMA'     THEN 'EU_MAA'
             WHEN 'cta|EMA'     THEN 'EU_CTA'
             WHEN 'jnda|PMDA'   THEN 'JP_MKT_APPROVAL'
           END AS fixed
      FROM public.projects p
      JOIN public.regulatory_programs g
        ON g.id = p.regulatory_program_id
       AND g.organization_id = p.organization_id
     WHERE g.deleted_at IS NULL
       AND (p.metadata IS NULL OR json_typeof(p.metadata) = 'object')
       AND COALESCE(p.metadata::jsonb ->> 'registryId', '') = ''
       AND COALESCE(p.metadata::jsonb ->> 'submissionType', '') = ''
  )
  UPDATE public.projects p
     SET metadata = (
           COALESCE(p.metadata::jsonb, '{}'::jsonb)
           || CASE
                WHEN c.chosen IS NOT NULL THEN jsonb_build_object('submissionType', c.chosen)
                ELSE jsonb_build_object('registryId', c.fixed, 'submissionType', c.fixed)
              END
         )::json
    FROM program_context c
   WHERE p.id = c.project_id
     AND COALESCE(c.chosen, c.fixed) IS NOT NULL;
  GET DIAGNOSTICS completed = ROW_COUNT;
  -- A count only: no tenant data in the deploy log.
  RAISE NOTICE 'registry context recorded on % project record(s)', completed;
END
$mig$;
