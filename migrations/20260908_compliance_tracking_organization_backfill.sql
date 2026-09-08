-- ════════════════════════════════════════════════════════════════════════════
-- compliance_tracking.organization_id — attribute the rows the product wrote
-- without one.
--
-- THE GAP. Two faults that only make sense together, which is why neither was
-- fixed on its own:
--
--   WRITE. server/api/cmc/projectRoutes.ts binds the drizzle model in
--   shared/cmc-schema.ts, and that definition of `complianceTracking` mapped no
--   organizationId at all. The physical column has always existed — this file's
--   predecessor, db/migrations/20260402_cmc_runtime_ddl_to_migration.sql:23,
--   declares it, nullable — but the model did not map it, so every row POST
--   /projects/:projectId/compliance ever wrote carries organization_id NULL.
--   (shared/schema.ts defines the SAME table WITH organizationId. The routes
--   bind the other one.)
--
--   READ. server/api/cmc/routes.ts (POST /compliance/check-rules) then read
--   `WHERE organization_id = $1 OR organization_id IS NULL`. That OR-NULL was
--   not arbitrary: without it the endpoint returned nothing at all, because
--   every row the product writes is NULL-org. It made the feature work by
--   making every sponsor's compliance findings — guideline, requirement,
--   violation status, risk level — readable by every other sponsor, and
--   presented to them as their own.
--
-- WHY A BACKFILL, AND NOT THIS REPO'S USUAL "LEAVE THEM AND STOP SERVING THEM".
-- migrations/20260907_quality_specifications_tenant_required.sql leaves its
-- legacy NULL rows in place precisely because NOTHING records who they belong
-- to. That reasoning does not apply here. compliance_tracking.project_id is NOT
-- NULL with an FK to cmc_projects, and cmc_projects.organization_id is NOT
-- NULL — so every one of these rows names its owner, one join away. Attributing
-- them is therefore complete and lossless: no tenant loses a row, and no row is
-- guessed at. Only a row whose project has vanished is left alone (see below).
--
-- WHAT THIS DOES NOT DO. It does not add NOT NULL. The write path is fixed in
-- the same change, but a CHECK here would turn any straggler — a row written by
-- an older running instance mid-deploy — into a failed deploy for every tenant
-- rather than a row this file attributes on the next run.
--
-- Idempotent: the UPDATE is guarded on `organization_id IS NULL`, so a replay
-- (deploy-migrate re-executes the whole set on every deploy — see CLAUDE.md
-- RULE 1) matches nothing and is a no-op. It never rewrites an attributed row.
-- ════════════════════════════════════════════════════════════════════════════

-- TWO TABLES SHARE THIS NAME. `compliance_tracking` is declared incompatibly in
-- two lineages, and which one an estate has is decided by migration order, not
-- by code (the ledger's C-6 class of defect):
--
--   migrations/0000_sweet_joseph.sql:1729   serial id, organization_id NOT NULL,
--                                           product_id, agency_id,
--                                           compliance_status — and NO project_id.
--   db/migrations/20260402_cmc_runtime_ddl_to_migration.sql:20
--                                           uuid id, project_id, nullable
--                                           organization_id, guideline,
--                                           requirement, status.
--
-- Only the second shape has anything to attribute or attribute it BY, so every
-- statement below is guarded on the columns rather than on the table. On the
-- first shape organization_id is already NOT NULL and there is nothing to do;
-- this file says so with a NOTICE instead of failing the deploy for every
-- tenant. (deploy-migrate replays the whole set on every deploy, so an
-- unguarded reference to a column half the estate lacks is a permanent halt,
-- not a one-time error.)
DO $$
BEGIN
  IF to_regclass('public.compliance_tracking') IS NULL THEN
    RAISE NOTICE 'compliance_tracking absent; skipping organization backfill';
    RETURN;
  END IF;
  IF to_regclass('public.cmc_projects') IS NULL THEN
    RAISE NOTICE 'cmc_projects absent; cannot attribute compliance_tracking rows';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'compliance_tracking'
       AND column_name = 'project_id'
  ) THEN
    RAISE NOTICE 'compliance_tracking has no project_id (the 0000 shape); nothing to attribute';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'compliance_tracking'
       AND column_name = 'organization_id'
  ) THEN
    RAISE NOTICE 'compliance_tracking has no organization_id; nothing to backfill into';
    RETURN;
  END IF;

  -- Attribute each unattributed row to the organization that owns its project.
  -- A row whose project no longer exists is left NULL: there is nothing left to
  -- attribute it to, and the strict read simply never serves it — which is the
  -- honest outcome for a record whose owner cannot be established.
  UPDATE compliance_tracking ct
     SET organization_id = p.organization_id
    FROM cmc_projects p
   WHERE ct.organization_id IS NULL
     AND ct.project_id = p.id;
END $$;

-- Same guard: the index names project_id, which the other shape does not have.
DO $$
BEGIN
  IF to_regclass('public.compliance_tracking') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'compliance_tracking'
          AND column_name = 'project_id'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'compliance_tracking'
          AND column_name = 'organization_id'
     )
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_compliance_tracking_org_project
               ON compliance_tracking (organization_id, project_id)';
  END IF;
END $$;
