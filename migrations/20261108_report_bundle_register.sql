-- 2026-11-08 (L1, founder decision P-91; coverage review C-3,
-- docs/evidence/reviews/2026-10-11-reporting-coverage/C3-BUNDLE-REGISTER.md).
--
-- The report-pack register gets its own tables. A pack was one
-- public.project_memory_entries row per covered project, titled 'bundle:<uuid>', with
-- its run ids inside a JSON string, reconciled newest-first in JavaScript: two copies
-- that disagreed looked like one, "list the packs" was count(distinct title), and
-- "which packs hold this run?" was a scan.
--
--   report_bundles          one row per pack. `record` is the manifest every reader
--                           already decodes (reportBundleRecordSchema), kept whole, and
--                           a CHECK ties its bundleId and organizationId to the row.
--   report_bundle_runs      the runs a pack holds, in order.
--   report_bundle_projects  the projects a pack covers, in place of the row-per-project
--                           copies.
--
-- No foreign key to report_runs or projects: the backfill carries packs recorded before
-- this file, and a pack naming a since-removed row must still be carried, never fail a
-- deploy. The manifest keeps what it named either way.
--
-- CLAUDE.md RULE 1: every file in the set re-runs on every deploy. This one is
-- additive, IF NOT EXISTS-guarded and drops nothing. Each table is public with
-- organization_id INTEGER NOT NULL, so the tenant sweep at the end of the set gives it
-- its policy. The legacy memory rows stay where they are: only their code path is
-- deleted (server/routes/report-os.ts), in the same change.

CREATE TABLE IF NOT EXISTS public.report_bundles (
  id uuid PRIMARY KEY NOT NULL,
  organization_id integer NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  created_by integer,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  byte_length integer NOT NULL,
  payload_hash text NOT NULL,
  CONSTRAINT report_bundles_record_identity CHECK (
    record->>'bundleId' = id::text AND record->>'organizationId' = organization_id::text
  )
);

CREATE INDEX IF NOT EXISTS report_bundles_org_created_idx
  ON public.report_bundles (organization_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.report_bundle_runs (
  bundle_id uuid NOT NULL REFERENCES public.report_bundles(id),
  organization_id integer NOT NULL,
  run_id integer NOT NULL,
  position integer NOT NULL,
  PRIMARY KEY (bundle_id, run_id)
);

CREATE INDEX IF NOT EXISTS report_bundle_runs_run_idx
  ON public.report_bundle_runs (organization_id, run_id);

CREATE TABLE IF NOT EXISTS public.report_bundle_projects (
  bundle_id uuid NOT NULL REFERENCES public.report_bundles(id),
  organization_id integer NOT NULL,
  project_id integer NOT NULL,
  PRIMARY KEY (bundle_id, project_id)
);

CREATE INDEX IF NOT EXISTS report_bundle_projects_project_idx
  ON public.report_bundle_projects (organization_id, project_id);

-- The backfill. Each legacy pack is carried once, from its newest copy (the order the
-- register already read in), with ON CONFLICT DO NOTHING, so a replay adds nothing.
-- A copy that cannot be decoded is skipped with a NOTICE: the register refused it
-- already (REPORT_BUNDLE_CORRUPT), and it must not take every deploy down with it.
-- The count at the end fails the deploy when a pack was neither carried nor reported
-- as skipped, so a partial register is never taken for a whole one.
DO $$
DECLARE
  legacy record;
  doc jsonb;
  skipped integer := 0;
  legacy_total integer;
  carried integer;
BEGIN
  IF to_regclass('public.project_memory_entries') IS NULL THEN
    RETURN;
  END IF;

  FOR legacy IN
    SELECT DISTINCT ON (organization_id, title) id, organization_id, title, content, created_at
      FROM public.project_memory_entries
     WHERE category = 'regulatory'
       AND subcategory = 'report_bundle_record'
       AND source_document_type = 'report_os_state'
       AND title LIKE 'bundle:%'
     ORDER BY organization_id, title, created_at DESC, id DESC
  LOOP
    BEGIN
      doc := (legacy.content::jsonb) -> 'bundleRecord';
      IF doc IS NULL
         OR doc->>'bundleId' IS DISTINCT FROM substr(legacy.title, 8)
         OR doc->>'organizationId' IS DISTINCT FROM legacy.organization_id::text THEN
        RAISE EXCEPTION 'manifest does not name its own pack and organisation';
      END IF;

      INSERT INTO public.report_bundles (id, organization_id, name, created_by, created_at, record, byte_length, payload_hash)
      VALUES (
        (doc->>'bundleId')::uuid,
        legacy.organization_id,
        COALESCE(doc->>'name', ''),
        NULLIF(doc->>'createdBy', '')::integer,
        COALESCE((doc->>'createdAt')::timestamptz, legacy.created_at),
        doc,
        octet_length(legacy.content),
        encode(sha256(convert_to(legacy.content, 'UTF8')), 'hex')
      )
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.report_bundle_runs (bundle_id, organization_id, run_id, position)
      SELECT (doc->>'bundleId')::uuid, legacy.organization_id, run.value::integer, run.ordinality::integer
        FROM jsonb_array_elements_text(COALESCE(doc->'runIds', '[]'::jsonb)) WITH ORDINALITY AS run(value, ordinality)
      ON CONFLICT (bundle_id, run_id) DO NOTHING;

      INSERT INTO public.report_bundle_projects (bundle_id, organization_id, project_id)
      SELECT DISTINCT (doc->>'bundleId')::uuid, legacy.organization_id, project.value::integer
        FROM jsonb_array_elements_text(COALESCE(doc->'projectIds', '[]'::jsonb)) AS project(value)
      ON CONFLICT (bundle_id, project_id) DO NOTHING;
    EXCEPTION WHEN others THEN
      skipped := skipped + 1;
      RAISE NOTICE '[report-pack register] skipped legacy row % (%): %', legacy.id, legacy.title, SQLERRM;
    END;
  END LOOP;

  SELECT count(*) INTO legacy_total FROM (
    SELECT DISTINCT organization_id, title
      FROM public.project_memory_entries
     WHERE category = 'regulatory'
       AND subcategory = 'report_bundle_record'
       AND source_document_type = 'report_os_state'
       AND title LIKE 'bundle:%'
  ) packs;

  SELECT count(*) INTO carried FROM (
    SELECT DISTINCT m.organization_id, m.title
      FROM public.project_memory_entries m
      JOIN public.report_bundles b
        ON 'bundle:' || b.id::text = m.title AND b.organization_id = m.organization_id
     WHERE m.category = 'regulatory'
       AND m.subcategory = 'report_bundle_record'
       AND m.source_document_type = 'report_os_state'
  ) packs;

  IF carried + skipped <> legacy_total THEN
    RAISE EXCEPTION '[report-pack register] % legacy packs, % carried, % skipped: % were not carried and not reported',
      legacy_total, carried, skipped, legacy_total - carried - skipped;
  END IF;
END $$;
