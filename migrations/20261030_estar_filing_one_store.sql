-- =============================================================================
-- One device-filing store: estar_submissions (D2, fold F5 item 1, 2026-10-30)
-- =============================================================================
-- Decision P-61 item 1 (docs/LAUNCH_DEFINITION_OF_DONE.md): one device-filing
-- store, estar_submissions. It is on the deploy set and admits the project.
-- c2c_submission_packages, whose creator (migrations/0002_phase15_submission_ops.sql)
-- is on no deploy applier, is migrated behind to_regclass guards and retired as
-- a device-filing store. Evidence:
-- docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/README.md.
--
-- 1. estar_submission_events: a tracked filing's event history, written in the
--    same transaction as the change it records (estar-submission-service.ts).
--    The §11.10(e) audit row stays where it is, after the commit; this is the
--    filing's own history, which the screen shows. Public, with
--    organization_id INTEGER NOT NULL, held to its filing's organization by a
--    composite key, so the sweeps at the end of the set give it its policy.
--    Append-only: UPDATE and TRUNCATE are refused; a row leaves only with its
--    filing (ON DELETE CASCADE) or by the tenant purge.
-- 2. estar_submissions.source_package_id: the c2c_submission_packages.package_id
--    a tracked filing was migrated from, unique where present, so step 3 is
--    idempotent: a replay finds every migrated package and inserts nothing.
-- 3. The migration. Only where c2c_submission_packages exists (to_regclass):
--    each package whose family is an eSTAR filing type (510(k), De Novo, PMA)
--    and whose project is a project of the package's own organization becomes a
--    tracked filing, with an "imported_package" event naming what the package
--    recorded, and each of its milestones (c2c_milestones, when present) an
--    "imported_milestone" event. A filing is a signed act a package never
--    carried, so a migrated filing starts at draft, or withdrawn where the
--    package was cancelled; the package's own status is in its import event and
--    nothing claims it was filed. Other families (IND, NDA, BLA, CER, IVDR or MDR
--    technical documentation) are not device filings in the eSTAR sense and stay
--    where they are. The package rows are not changed and not deleted.
--
-- Additive and guarded throughout: CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT
-- EXISTS, constraints and the trigger only when absent, and the inserts only for
-- packages not yet migrated. No DROP, no DELETE.
-- =============================================================================

DO $estar_filing_events$
BEGIN
  IF to_regclass('public.estar_submissions') IS NULL THEN
    RAISE NOTICE 'estar_submissions absent: the filing event history and the package migration are skipped';
    RETURN;
  END IF;

  ALTER TABLE public.estar_submissions ADD COLUMN IF NOT EXISTS source_package_id TEXT;
  COMMENT ON COLUMN public.estar_submissions.source_package_id IS
    'The c2c_submission_packages.package_id this tracked filing was migrated from (20261030 fold F5); NULL for a filing tracked here.';
  CREATE UNIQUE INDEX IF NOT EXISTS estar_submissions_source_package_uq
    ON public.estar_submissions (source_package_id) WHERE source_package_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS estar_submissions_id_org_uq
    ON public.estar_submissions (id, organization_id);

  CREATE TABLE IF NOT EXISTS public.estar_submission_events (
    id              BIGSERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    submission_id   UUID NOT NULL,
    event_type      VARCHAR(32) NOT NULL,
    from_status     VARCHAR(24),
    to_status       VARCHAR(24),
    actor_user_id   INTEGER,
    detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_key      TEXT,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estar_submission_events_submission_fk'
                    AND conrelid = 'public.estar_submission_events'::regclass) THEN
    ALTER TABLE public.estar_submission_events
      ADD CONSTRAINT estar_submission_events_submission_fk
      FOREIGN KEY (submission_id, organization_id)
      REFERENCES public.estar_submissions (id, organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estar_submission_events_type_chk'
                    AND conrelid = 'public.estar_submission_events'::regclass) THEN
    ALTER TABLE public.estar_submission_events
      ADD CONSTRAINT estar_submission_events_type_chk
      CHECK (event_type IN ('created', 'status_changed', 'filed', 'imported_package', 'imported_milestone'));
  END IF;
  CREATE INDEX IF NOT EXISTS estar_submission_events_submission_idx
    ON public.estar_submission_events (organization_id, submission_id, occurred_at, id);
  CREATE UNIQUE INDEX IF NOT EXISTS estar_submission_events_source_uq
    ON public.estar_submission_events (source_key) WHERE source_key IS NOT NULL;
END
$estar_filing_events$;

CREATE OR REPLACE FUNCTION public.estar_submission_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'estar_submission_events is append-only: % is refused', TG_OP
    USING ERRCODE = '42501';
END
$fn$;

DO $estar_filing_events_trg$
BEGIN
  IF to_regclass('public.estar_submission_events') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'estar_submission_events_no_update'
                    AND tgrelid = 'public.estar_submission_events'::regclass) THEN
    CREATE TRIGGER estar_submission_events_no_update
      BEFORE UPDATE ON public.estar_submission_events
      FOR EACH ROW EXECUTE FUNCTION public.estar_submission_events_append_only();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'estar_submission_events_no_truncate'
                    AND tgrelid = 'public.estar_submission_events'::regclass) THEN
    CREATE TRIGGER estar_submission_events_no_truncate
      BEFORE TRUNCATE ON public.estar_submission_events
      FOR EACH STATEMENT EXECUTE FUNCTION public.estar_submission_events_append_only();
  END IF;
END
$estar_filing_events_trg$;

-- 3. The package migration.
DO $estar_package_migration$
DECLARE
  eligible TEXT[];
  migrated INTEGER := 0;
  missing  INTEGER := 0;
BEGIN
  IF to_regclass('public.c2c_submission_packages') IS NULL OR to_regclass('public.estar_submission_events') IS NULL THEN
    RAISE NOTICE 'c2c_submission_packages absent: no device package to migrate into estar_submissions';
    RETURN;
  END IF;

  -- The packages that are device filings: an eSTAR family, on a project of the
  -- package's own organization.
  SELECT COALESCE(array_agg(p.package_id), ARRAY[]::TEXT[]) INTO eligible
    FROM public.c2c_submission_packages p
    JOIN public.projects pr ON pr.id = p.project_id AND pr.organization_id = p.org_id
   WHERE lower(p.package_family) IN ('510k', '510(k)', 'de_novo', 'denovo', 'pma');

  INSERT INTO public.estar_submissions
    (organization_id, project_id, catalog_key, program_type, variant, title, status,
     created_by, created_at, updated_at, source_package_id)
  SELECT p.org_id, p.project_id,
         CASE lower(p.package_family) WHEN 'pma' THEN 'pma_original'
              WHEN 'de_novo' THEN 'de_novo' WHEN 'denovo' THEN 'de_novo' ELSE '510k' END,
         CASE lower(p.package_family) WHEN 'pma' THEN 'pma'
              WHEN 'de_novo' THEN 'de_novo' WHEN 'denovo' THEN 'de_novo' ELSE '510k' END,
         CASE WHEN lower(COALESCE(rp.product_type, '')) IN ('ivd', 'cdx') THEN 'ivd' ELSE 'device' END,
         p.title,
         CASE WHEN p.status = 'cancelled' THEN 'withdrawn' ELSE 'draft' END,
         p.created_by_id, p.created_at, p.updated_at, p.package_id
    FROM public.c2c_submission_packages p
    JOIN public.projects pr ON pr.id = p.project_id AND pr.organization_id = p.org_id
    LEFT JOIN public.regulatory_programs rp
      ON rp.id = pr.regulatory_program_id AND rp.organization_id = pr.organization_id
   WHERE p.package_id = ANY (eligible)
     AND NOT EXISTS (SELECT 1 FROM public.estar_submissions s WHERE s.source_package_id = p.package_id);
  GET DIAGNOSTICS migrated = ROW_COUNT;

  INSERT INTO public.estar_submission_events
    (organization_id, submission_id, event_type, to_status, actor_user_id, detail, source_key, occurred_at)
  SELECT s.organization_id, s.id, 'imported_package', s.status, NULL,
         jsonb_build_object(
           'from', 'c2c_submission_packages',
           'packageId', p.package_id,
           'packageFamily', p.package_family,
           'packageStatus', p.status,
           'packageTargetDate', p.target_date,
           'packageDescription', p.description,
           'packageCreatedBy', p.created_by_id,
           'note', 'Migrated from a submission package. Filing is a signed act the package never carried, so the tracked filing starts at ' || s.status || '.'
         ),
         'c2c_submission_packages:' || p.package_id,
         p.created_at
    FROM public.c2c_submission_packages p
    JOIN public.estar_submissions s ON s.source_package_id = p.package_id AND s.organization_id = p.org_id
   WHERE p.package_id = ANY (eligible)
     AND NOT EXISTS (SELECT 1 FROM public.estar_submission_events e WHERE e.source_key = 'c2c_submission_packages:' || p.package_id);

  IF to_regclass('public.c2c_milestones') IS NOT NULL THEN
    INSERT INTO public.estar_submission_events
      (organization_id, submission_id, event_type, actor_user_id, detail, source_key, occurred_at)
    SELECT s.organization_id, s.id, 'imported_milestone', m.created_by_id,
           jsonb_build_object(
             'from', 'c2c_milestones',
             'milestoneId', m.milestone_id,
             'title', m.title,
             'description', m.description,
             'targetDate', m.target_date,
             'gateStatus', m.gate_status
           ),
           'c2c_milestones:' || m.milestone_id,
           m.created_at
      FROM public.c2c_milestones m
      JOIN public.c2c_submission_packages p ON p.id = m.package_db_id AND p.org_id = m.org_id
      JOIN public.estar_submissions s ON s.source_package_id = p.package_id AND s.organization_id = p.org_id
     WHERE p.package_id = ANY (eligible)
       AND NOT EXISTS (SELECT 1 FROM public.estar_submission_events e WHERE e.source_key = 'c2c_milestones:' || m.milestone_id);
  END IF;

  -- Every eligible package has its filing and its import event: a partial
  -- migration fails the deploy instead of reporting less than there is.
  SELECT count(*) INTO missing
    FROM unnest(eligible) AS x(package_id)
   WHERE NOT EXISTS (SELECT 1 FROM public.estar_submissions s WHERE s.source_package_id = x.package_id)
      OR NOT EXISTS (SELECT 1 FROM public.estar_submission_events e WHERE e.source_key = 'c2c_submission_packages:' || x.package_id);
  IF missing > 0 THEN
    RAISE EXCEPTION 'fold F5: % device package(s) were not migrated into estar_submissions with their import event', missing;
  END IF;
  RAISE NOTICE 'fold F5: % device package(s) migrated into estar_submissions on this run (% eligible)', migrated, cardinality(eligible);
END
$estar_package_migration$;
