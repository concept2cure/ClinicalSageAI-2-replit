-- EU SmPC (QRD) section-authoring store — backs the v2 SmpcLabeling surface.
--
-- Route: server/routes/labeling-smpc.routes.ts (GET/POST /api/labeling-smpc).
-- Seed:  scripts/seed/ga-demo.d/118-smpc-sections.mjs.
--
-- The route + demo seed were already shipped, but the table they read/write was
-- never created by any migration, so the surface fell back to the empty
-- all-missing skeleton. This creates it, matching exactly the columns the route
-- projects and the seed inserts.
--
-- Tenant model: integer organization_id (RLS rollout, 0021). There is no
-- surrogate id — a row is identified by its natural key, so the composite
-- PRIMARY KEY (organization_id, section_number) is exactly the seed's and route's
-- ON CONFLICT target. `section_number` is a QRD section label ('1', '4.1',
-- '5.3', ... — text, not numeric). `status` is the authoring state
-- ('missing'|'draft'|'review'|'final'), defaulting to the baseline 'missing'.
-- Route writes updated_at explicitly on insert/update.

CREATE TABLE IF NOT EXISTS c2c_smpc_sections (
  organization_id integer NOT NULL,
  section_number  text    NOT NULL,
  status          text    NOT NULL DEFAULT 'missing',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, section_number)
);

CREATE INDEX IF NOT EXISTS idx_c2c_smpc_sections_org
  ON c2c_smpc_sections (organization_id);
