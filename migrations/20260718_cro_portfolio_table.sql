-- CRO sponsor-portfolio store — backs the v2 CroPortfolio surface.
--
-- The route (server/routes/cro-portfolio.routes.ts, GET /api/cro-portfolio) and the
-- demo seed (scripts/seed/ga-demo.d/102-cro-portfolio.mjs) were already shipped, but
-- the table they read was never created by any migration, so the surface fell back to
-- its fixture ("Sample data"). This creates it, matching exactly the columns the route
-- projects and the seed inserts.
--
-- Tenant model: integer organization_id (picked up by the RLS rollout, 0021).
-- Composite PK (organization_id, id) matches the seed's ON CONFLICT target; id is a
-- client-supplied text slug ('helix', 'aurora', ...). ord is the integer sort key the
-- route's `ORDER BY ord, id` reads. studies (CroStudy[]) and subs (CroSub[]) are the
-- nested rosters, seeded with ::jsonb and rehydrated straight from JSONB.

CREATE TABLE IF NOT EXISTS c2c_cro_portfolio (
  id              text    NOT NULL,
  organization_id integer NOT NULL,
  ord             integer NOT NULL DEFAULT 0,
  name            text    NOT NULL,
  type            text    NOT NULL,
  lead            text,
  sow             text,
  sow_note        text,
  studies         jsonb,
  subs            jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_cro_portfolio_org
  ON c2c_cro_portfolio (organization_id);
