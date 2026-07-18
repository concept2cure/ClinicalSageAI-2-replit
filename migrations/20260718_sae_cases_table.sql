-- Safety-narrative SAE case worklist store — backs the v2 SafetyNarrative surface.
--
-- The route (server/routes/safety-narrative.ts, GET /api/safety-narratives/cases)
-- and the demo seed (scripts/seed/ga-demo.d/96-safety-narrative.mjs) were already
-- shipped, but the table they read/insert was never created by any migration, so
-- the surface fell back to its codebase fixture (with a "Sample" pill). This
-- creates it, matching exactly the columns the route projects and the seed
-- inserts.
--
-- Tenant model: integer organization_id (picked up by the RLS rollout, 0021).
-- Composite PK (organization_id, id) matches the seed's ON CONFLICT target; id is
-- a client-supplied text key ('ICSR-8841'). Date-ish fields (first_dose_date,
-- awareness_date) are text on purpose — the surface renders them verbatim
-- ('12 Mar 2026', '2026-07-06'). medical_history / concomitant_meds (string
-- arrays) and event (nested object) are JSONB (inserted via ::jsonb). The live
-- expedited-reporting clock is computed by the route from awareness_date +
-- event.* + expectedness, so those columns are load-bearing.

CREATE TABLE IF NOT EXISTS c2c_sae_cases (
  id               text    NOT NULL,
  organization_id  integer NOT NULL,
  due              text    NOT NULL,
  clock            text    NOT NULL,
  due_days         integer NOT NULL,
  subject_id       text    NOT NULL,
  age              integer,
  sex              text,
  study_id         text,
  treatment_arm    text,
  study_drug       text,
  dose             text,
  first_dose_date  text,
  medical_history  jsonb,
  concomitant_meds jsonb,
  event            jsonb,
  awareness_date   text,
  expectedness     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_sae_cases_org
  ON c2c_sae_cases (organization_id);
