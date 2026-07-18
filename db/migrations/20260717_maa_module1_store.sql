-- Non-US MAA Module-1 assembled-components store — records which regional
-- eCTD Module-1 administrative components a sponsor has assembled per market,
-- backing the v2 MaaCockpit readiness view. Presence of a row = the sponsor has
-- that component; readiness is computed on read by feeding the assembled
-- component codes into assessRegionalModule1 (the deterministic requirements
-- engine). Read+write: GET /api/maa-module1/:market returns requirements +
-- provided + assessment; POST /api/maa-module1/:market toggles a component.
-- Org-scoped, FK-free, schema-only, idempotent.

CREATE TABLE IF NOT EXISTS c2c_maa_module1_components (
  organization_id  INTEGER     NOT NULL,
  market           TEXT        NOT NULL,   -- EMA | PMDA | MHRA | TGA | HEALTH_CANADA | NMPA
  component_code   TEXT        NOT NULL,   -- e.g. eu_eaf (from REGIONAL_MODULE1_REQUIREMENTS)
  status           TEXT        NOT NULL DEFAULT 'assembled',  -- assembled | in_progress
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, market, component_code)
);
