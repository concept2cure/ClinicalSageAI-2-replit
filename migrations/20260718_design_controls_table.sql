-- Design-controls store — backs the v2 DesignControls (DHF traceability) surface.
--
-- The route (server/routes/design-controls.routes.ts, GET + POST /api/design-controls)
-- and the demo seed (scripts/seed/ga-demo.d/101-design-controls.mjs) were already
-- shipped, but the table they read/write was never created by any migration, so the
-- surface fell back to its fixture ("Sample data"). This creates it, matching exactly
-- the columns the route projects and the seed inserts.
--
-- Tenant model: integer organization_id (picked up by the RLS rollout, 0021).
-- Composite PK (organization_id, id) matches the seed's ON CONFLICT target; id is a
-- client/route-supplied text key ('DI-01' from the seed, 'dc-<ts>' from the POST).
-- risk_ref / ver / ver_ref / val / val_ref are nullable text on purpose — the seed's
-- untraced functional requirement (DI-07) and the POST both leave them null, and the
-- surface renders the verification/validation state verbatim. outputs is JSONB (the
-- nested design-output list, seeded and inserted with ::jsonb).

CREATE TABLE IF NOT EXISTS c2c_design_controls (
  id              text    NOT NULL,
  organization_id integer NOT NULL,
  cat             text    NOT NULL DEFAULT 'functional',
  req             text    NOT NULL,
  risk_ref        text,
  outputs         jsonb,
  ver             text,
  ver_ref         text,
  val             text,
  val_ref         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_design_controls_org
  ON c2c_design_controls (organization_id);
