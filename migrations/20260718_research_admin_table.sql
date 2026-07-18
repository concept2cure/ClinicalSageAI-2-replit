-- Research-administration CITI training matrix — backs the v2 ResearchAdmin surface.
--
-- The route (server/routes/research-admin.routes.ts) and the demo seed
-- (scripts/seed/ga-demo.d/114-research-admin.mjs) were already shipped, but the
-- table they read/seed was never created by any migration, so the surface fell
-- back to its fixture. This creates it, matching exactly the columns the route
-- projects and the seed inserts.
--
-- Tenant model: integer organization_id (picked up by the RLS rollout, 0021).
-- Composite PK (organization_id, id) matches the seed's ON CONFLICT target; id
-- is the client-supplied personnel key ('tp1'...'tp6'). cells is the per-module
-- CITI status vector (JSONB array, aligned to the surface's training-column
-- order).

CREATE TABLE IF NOT EXISTS c2c_research_admin (
  id              text    NOT NULL,
  organization_id integer NOT NULL,
  seq             integer,
  name            text,
  role            text,
  cells           jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_research_admin_org
  ON c2c_research_admin (organization_id);
