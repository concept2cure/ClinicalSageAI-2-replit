-- Market-access store — backs the v2 MarketAccess surface.
--
-- The route (server/routes/market-access.routes.ts) and the demo seed
-- (scripts/seed/ga-demo.d/108-market-access.mjs) were already shipped, but the
-- table they read never existed, so the surface fell back to its fixture
-- ("Sample data"). This creates it, matching exactly the columns the route
-- projects (program, coverage, dossier, coding) and the seed inserts.
--
-- Tenant model: integer organization_id (RLS). Composite PK (organization_id,
-- program) matches the seed's ON CONFLICT target; `program` is the program code
-- ('BX-204'). coverage / dossier / coding are JSONB (the three rendered nested
-- arrays: payer-coverage table, value-dossier section list, coding-strategy
-- table).

CREATE TABLE IF NOT EXISTS c2c_market_access (
  organization_id integer NOT NULL,
  program         text    NOT NULL,
  coverage        jsonb,
  dossier         jsonb,
  coding          jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, program)
);

CREATE INDEX IF NOT EXISTS idx_c2c_market_access_org
  ON c2c_market_access (organization_id);
