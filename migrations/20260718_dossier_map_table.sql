-- Dossier-map store — backs the v2 DossierMap surface.
--
-- The route (server/routes/dossier-map.routes.ts) and the demo seed
-- (scripts/seed/ga-demo.d/105-dossier-map.mjs) were already shipped, but the
-- table they read never existed, so the surface fell back to its fixture
-- ("Sample data"). This creates it, matching exactly the columns the route
-- projects (m, label, pct, tone, sections) and the seed inserts. Distinct from
-- the /api/dossier-readiness artifact roll-up.
--
-- Tenant model: integer organization_id (RLS). Composite PK (organization_id, m)
-- matches the seed's ON CONFLICT target; `m` is the CTD module key ('1'..'5').
-- pct is the integer completeness percent; tone the readiness label ('ok'/
-- 'warn'). sections is JSONB (the child CTD-section string array).

CREATE TABLE IF NOT EXISTS c2c_dossier_map (
  organization_id integer NOT NULL,
  m               text    NOT NULL,
  label           text    NOT NULL,
  pct             integer NOT NULL,
  tone            text    NOT NULL,
  sections        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, m)
);

CREATE INDEX IF NOT EXISTS idx_c2c_dossier_map_org
  ON c2c_dossier_map (organization_id);
