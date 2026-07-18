-- Non-US MAA Module-1 assembled-components store — backs the v2 MaaCockpit readiness view.
--
-- Route: server/routes/maa-module1.routes.ts (GET/POST /api/maa-module1/:market).
-- Seed:  scripts/seed/ga-demo.d/117-maa-module1.mjs.
--
-- The route + demo seed were already shipped, but the table they read/write was
-- never created by any migration, so the surface fell back to the empty-provided
-- assessment. This creates it, matching exactly the columns the route projects
-- and the seed inserts.
--
-- Tenant model: integer organization_id (RLS rollout, 0021). There is no
-- surrogate id — a row is identified by its natural key, so the composite
-- PRIMARY KEY (organization_id, market, component_code) is exactly the seed's and
-- route's ON CONFLICT target. `market` is a regulator code ('EMA'|'PMDA'|...);
-- `component_code` is an eCTD Module-1 component code ('eu_cover_letter', ...).
-- `status` is always 'assembled' (route filters WHERE status = 'assembled' and
-- upserts/deletes to toggle). Route writes updated_at explicitly on insert/update.

CREATE TABLE IF NOT EXISTS c2c_maa_module1_components (
  organization_id integer NOT NULL,
  market          text    NOT NULL,
  component_code  text    NOT NULL,
  status          text    NOT NULL DEFAULT 'assembled',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, market, component_code)
);

CREATE INDEX IF NOT EXISTS idx_c2c_maa_module1_components_org
  ON c2c_maa_module1_components (organization_id);
