-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Every live program has its project record (product decision P-19,
--          docs/LAUNCH_DEFINITION_OF_DONE.md; QA walk 2026-10-08).
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (the integer key a program's schedule, tasks,
--     governed artifacts and AnA project context hang from)
--   - Integrity Risk Addressed: a program a client can open answers "no record"
--     on every surface keyed by its project, so nothing can be scheduled,
--     tasked or registry-placed against it.
--
-- Determinism Contract:
--   - Inserts only. No existing row is read-modified-written; no key is dropped.
-- =============================================================================
-- 20261008_program_project_anchor_backfill.sql
--
-- WHY. projects.regulatory_program_id (20260814) is the anchor from a program
-- (uuid) to its projects row (integer). resolveProgramProjectAnchor
-- (server/services/c2c/program-project-anchor.ts) is the one reader; with no
-- row, the schedule and unified-work routes answer 404 PROGRAM_UNANCHORED, AnA
-- finds no project and the Vault asks an administrator to link one.
--
-- Two kinds of program reached a database without that row:
--   1. Programs written outside intake. The GA demo seed
--      (scripts/seed/ga-demo.d/80-programs-tlf-pdev.mjs, 2026-07-16) inserts
--      regulatory_programs directly; 0b38f7f1e (2026-08-14) taught intake to
--      anchor and taught the seed nothing. In QA: BX-256, Vorelinib (BX-512),
--      BX-099, BX-301, BX-420 and the seeded device programs.
--      20260814's own backfill could not help: it only LINKS an existing
--      projects row by an unambiguous code or name match, and creates none.
--   2. Programs intake created while ensureProgramProjectAnchor SKIPPED the
--      anchor (no column yet, no workspace, or several and none the
--      organisation's own). From this change intake refuses instead of
--      skipping, so no new program is created without its record.
--
-- WHAT. For every program that is not soft-deleted and is anchored by NO
-- projects row anywhere, insert the row intake inserts, with intake's values:
--
--   organization_id      the program's organization.
--   client_workspace_id  intake's rule, restated: the organisation's own
--                        workspace (metadata.defaultForOrganization = true,
--                        lowest id), else its only workspace. With none, or
--                        with several and none marked, the program is LEFT
--                        UNANCHORED and named in a NOTICE: the column decides
--                        who may see a project (project-module-bridge), so it
--                        is not guessed.
--   name, code           the program's, verbatim.
--   type                 'regulatory', as intake writes.
--   status               'active', as intake writes for every program. Nothing
--                        mirrors program status into projects.status after
--                        intake either; the anchor row's status is the same
--                        constant whichever path wrote it.
--   priority             the program's; the column default 'medium' when the
--                        program has none (intake's default too).
--   created_by_id,       intake writes the creating user. A program records its
--   owner_id             creator in created_by: intake writes String(userId).
--                        When created_by is that integer form and the user
--                        exists, it is used. Otherwise (a seed wrote an e-mail,
--                        or nothing) both are NULL: a backfill does not know
--                        who created the program, and these columns grant
--                        project ownership (project-sharing-access.ts), so
--                        they are not inferred.
--   regulatory_program_id the program.
--   path, parent_project_id NULL, as intake leaves them (a root project).
--
-- Tenant-correct three ways: the workspace is chosen only among the program's
-- own organization's workspaces; organization_id is the program's; and
-- projects_regulatory_program_same_org_fk (20260926b) refuses a mismatch.
--
-- A program anchored only by ANOTHER organization's projects row (written
-- unchecked 2026-08-14..09-24, see 20260926b) is NOT given a second row: that
-- would put two anchor rows on one program and stop
-- projects_one_anchor_per_program (20261001b) from ever being created. It is
-- named in a NOTICE; 20261001b's header gives the remedy (clear the foreign
-- row), after which the next deploy anchors the program here.
--
-- RULE 1. Replayed on every deploy. After 20260814 (column; its code/name link
-- runs first, so an existing legacy project is linked rather than duplicated),
-- 20260923 (every organisation has a workspace), 20260926b (same-org key) and
-- 20261001b (one anchor per program). Idempotent: NOT EXISTS over every
-- projects row naming the program, plus ON CONFLICT DO NOTHING; once a program
-- is anchored a replay inserts nothing for it. No DROP. A program created
-- outside the application later (a seed, a hand-written INSERT) is anchored by
-- the next deploy, which is why this stays in the set.
--
-- ROLLBACK. None is safe to write here: records may already hang from these
-- rows. To undo for one program, re-point or remove what references its
-- projects row, then delete the row, by hand.
--
-- Pinned by tests/schema-contract/program-project-anchor-backfill.pglite.test.ts.
-- =============================================================================

DO $mig$
DECLARE
  anchored integer := 0;
  r record;
BEGIN
  IF to_regclass('public.projects') IS NULL
     OR to_regclass('public.regulatory_programs') IS NULL
     OR to_regclass('public.client_workspaces') IS NULL THEN
    RAISE NOTICE 'P-19: projects, regulatory_programs or client_workspaces absent - program anchor backfill skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.projects'::regclass
                    AND attname = 'regulatory_program_id' AND NOT attisdropped) THEN
    RAISE NOTICE 'P-19: projects.regulatory_program_id absent - program anchor backfill skipped';
    RETURN;
  END IF;
  -- Every column the statement reads, or it fails at plan time (42703) and
  -- takes the deploy with it (stopOnFirstFailure).
  IF (SELECT count(DISTINCT column_name) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'regulatory_programs'
         AND column_name IN ('id', 'organization_id', 'name', 'code', 'priority', 'created_by', 'deleted_at')) < 7
     OR (SELECT count(DISTINCT column_name) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'client_workspaces'
            AND column_name IN ('id', 'organization_id', 'metadata')) < 3 THEN
    RAISE NOTICE 'P-19: a column the anchor backfill reads is absent - backfill skipped';
    RETURN;
  END IF;

  WITH workspace AS (
    -- intake's rule (ensureProgramProjectAnchor's preflight), per organization:
    -- the organisation's own workspace, else its only one, else none.
    SELECT w.organization_id,
           COALESCE(
             min(w.id) FILTER (WHERE (w.metadata::jsonb ->> 'defaultForOrganization') = 'true'),
             CASE WHEN count(*) = 1 THEN min(w.id) END
           ) AS workspace_id
      FROM public.client_workspaces w
     GROUP BY w.organization_id
  )
  INSERT INTO public.projects
    (organization_id, client_workspace_id, name, code, type, status, priority,
     created_by_id, owner_id, regulatory_program_id)
  SELECT g.organization_id,
         ws.workspace_id,
         g.name,
         g.code,
         'regulatory',
         'active',
         COALESCE(NULLIF(btrim(g.priority), ''), 'medium'),
         creator.id,
         creator.id,
         g.id
    FROM public.regulatory_programs g
    JOIN workspace ws
      ON ws.organization_id = g.organization_id
     AND ws.workspace_id IS NOT NULL
    -- The cast sits inside the CASE on purpose: a join condition's terms run in
    -- whatever order the planner likes, so `created_by ~ … AND created_by::integer`
    -- casts the e-mail a seed wrote and fails the deploy (22P02).
    LEFT JOIN public.users creator
      ON creator.id = CASE WHEN g.created_by ~ '^[0-9]{1,9}$' THEN g.created_by::integer END
   WHERE g.deleted_at IS NULL
     AND NOT EXISTS (
           SELECT 1 FROM public.projects x WHERE x.regulatory_program_id = g.id
         )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS anchored = ROW_COUNT;
  RAISE NOTICE 'P-19: % program(s) given their project record', anchored;

  -- What is still unanchored, and why. Ids and counts only: no tenant data in
  -- the deploy log.
  FOR r IN
    SELECT g.organization_id,
           CASE
             WHEN EXISTS (SELECT 1 FROM public.projects x WHERE x.regulatory_program_id = g.id)
               THEN 'anchored only by another organization''s project row (see 20261001b for the remedy)'
             WHEN NOT EXISTS (SELECT 1 FROM public.client_workspaces w WHERE w.organization_id = g.organization_id)
               THEN 'the organization has no workspace'
             ELSE 'the organization has several workspaces and none is marked as its own'
           END AS reason,
           count(*) AS n
      FROM public.regulatory_programs g
     WHERE g.deleted_at IS NULL
       AND NOT EXISTS (
             SELECT 1 FROM public.projects p
              WHERE p.regulatory_program_id = g.id AND p.organization_id = g.organization_id
           )
     GROUP BY 1, 2
     ORDER BY 1, 2
  LOOP
    RAISE NOTICE 'P-19: organization % has % program(s) without a project record: %',
      r.organization_id, r.n, r.reason;
  END LOOP;
END
$mig$;
