-- IND lifecycle checklist store — backs the v2 IndLifecycle surface.
--
-- The route (server/routes/ind-checklist.routes.ts) and the demo seed
-- (scripts/seed/ga-demo.d/106-ind-checklist.mjs) were already shipped, but the
-- table they read never existed, so the surface fell back to its fixture
-- ("Sample data"). This creates it, matching exactly the columns the route
-- projects and the seed inserts. The route rehydrates `id` back into `code` and
-- snake_case columns into the camelCase keys the surface consumes.
--
-- Tenant model: integer organization_id (RLS). Composite PK (organization_id,
-- id) matches the seed's ON CONFLICT target; `id` is the program code ('BX-301').
-- seq is the integer ordering key (route ORDER BY seq, id);
-- target_receipt_offset_days is an integer day offset. forms / sections are
-- JSONB (the two nested checklist arrays: Module 1 forms and the eCTD section
-- blueprint).

CREATE TABLE IF NOT EXISTS c2c_ind_checklist (
  id                          text    NOT NULL,
  organization_id             integer NOT NULL,
  seq                         integer NOT NULL,
  drug_name                   text    NOT NULL,
  product_name                text    NOT NULL,
  indication                  text    NOT NULL,
  sponsor_name                text    NOT NULL,
  submission_type             text    NOT NULL,
  target_receipt_offset_days  integer NOT NULL,
  forms                       jsonb,
  sections                    jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_ind_checklist_org
  ON c2c_ind_checklist (organization_id);
