-- Labeling / prescribing-information worklist — backs the v2 LabelingPi surface.
--
-- The route (server/routes/labeling-pi.routes.ts) and the demo seed
-- (scripts/seed/ga-demo.d/110-labeling-pi.mjs) were already shipped, but the
-- table they read/seed was never created by any migration, so the surface fell
-- back to its fixture. This creates it, matching exactly the columns the route
-- projects and the seed inserts.
--
-- Tenant model: integer organization_id (picked up by the RLS rollout, 0021).
-- Composite PK (organization_id, n) matches the seed's ON CONFLICT target; n is
-- the client-supplied section key ('HL', 'BW', '1', '8', ...). flag is null when
-- FDA has proposed no edit. content (rendered label text) and negotiation
-- (sponsor-vs-agency redline) are JSONB and null for sections without them.

CREATE TABLE IF NOT EXISTS c2c_labeling_pi (
  n               text    NOT NULL,
  organization_id integer NOT NULL,
  seq             integer,
  label           text,
  st              text,
  flag            text,
  content         jsonb,
  negotiation     jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, n)
);

CREATE INDEX IF NOT EXISTS idx_c2c_labeling_pi_org
  ON c2c_labeling_pi (organization_id);
