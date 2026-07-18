-- Evidence-object library store — backs the v2 PDEV Evidence Picker.
--
-- The route (server/routes/evidence-objects.routes.ts, GET /api/evidence-objects)
-- and the demo seed (scripts/seed/ga-demo.d/90-evidence-objects.mjs) were already
-- shipped, but the table they read/seed was never created by any migration the
-- drizzle runner processes (an equivalent CREATE lived only under db/migrations/,
-- a separate legacy tree). So the picker degraded to its empty state / fixture.
-- This creates it, matching exactly the columns the route projects and the seed
-- inserts.
--
-- Tenant model: integer organization_id (picked up by the RLS rollout, 0021).
-- Composite PK (organization_id, id) matches the seed's ON CONFLICT target.
-- `id` is UUID on purpose: the seed supplies deterministic UUIDs and the route
-- projects `id::text AS id`, because the picker feeds the selected row's id into
-- the attach POST (server/services/pdev/pdev-evidence-attach.ts) which resolves
-- it against the canonical `evidence_objects` graph (uuid PK). Sharing the uuid
-- keeps search -> select -> attach honest.
--
-- Route read (authoritative for columns/aliases):
--   SELECT id::text AS id, title, evidence_type AS "type",
--          evidence_category AS "category", source
--     FROM c2c_evidence_objects
--    WHERE organization_id = $1
--      [AND (title/source/evidence_type/evidence_category/program_code ILIKE $2)]
--    ORDER BY title ASC
-- Seed insert columns: id, organization_id, title, evidence_type,
--   evidence_category, source, program_code, code, description.

CREATE TABLE IF NOT EXISTS c2c_evidence_objects (
  id                 uuid    NOT NULL DEFAULT gen_random_uuid(),
  organization_id    integer NOT NULL,
  title              text    NOT NULL,
  evidence_type      text,
  evidence_category  text,
  source             text,
  program_code       text,
  code               text,
  description        text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_evidence_objects_org
  ON c2c_evidence_objects (organization_id);
