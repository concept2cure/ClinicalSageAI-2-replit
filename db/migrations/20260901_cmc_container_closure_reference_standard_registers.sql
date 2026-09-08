-- CMC registers for the container closure system and the reference standard.
--
-- ── What was missing ─────────────────────────────────────────────────────────
-- server/services/module3Composer.ts has demanded a `container_closure` and a
-- `reference_standard` canonical source since Module 3 was modelled:
--
--   3.2.S.5 / 3.2.P.6  requiredSourceTypes ['... , reference_standard']
--   3.2.S.6 / 3.2.P.7  requiredSourceTypes ['container_closure']
--
-- No table anywhere held either one. Those four sections could therefore never
-- reach a non-zero completeness no matter what a CMC staffer recorded, and the
-- two artefacts a reviewer asks about first — the extractables/leachables
-- package behind a container closure system, and the qualification of the
-- standard every potency number is reported against — had nowhere to be
-- captured at all.
--
-- Both registers store `scope` (drug_substance | drug_product | both). The
-- section a record files into is a stored fact, not a render-time guess: a drum
-- holding the drug substance is 3.2.S.6 evidence and a blister holding the
-- tablet is 3.2.P.7 evidence, and greening both from one record is the defect
-- class that once filed a finished-product QC result under 3.2.S.4.4.
--
-- Both also carry `project_id` as a COLUMN. The older CMC registers do not, so
-- their canonical write-through fires only when a client remembers to put
-- projectId in the request body; here the record itself knows its program.
--
-- Additive and idempotent. Nothing is dropped or renamed.

CREATE TABLE IF NOT EXISTS cmc_container_closures (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  project_id text,
  scope text NOT NULL DEFAULT 'drug_product',
  system_name text NOT NULL,
  component_type text NOT NULL DEFAULT 'primary',
  container_description text NOT NULL,
  closure_description text NOT NULL,
  materials_of_construction jsonb,
  compendial_standards text[],
  suitability_justification text,
  extractables_leachables jsonb,
  integrity_testing jsonb,
  supplier text,
  status text NOT NULL DEFAULT 'draft',
  qualified_by integer REFERENCES users(id),
  qualification_date timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmc_container_closures_org
  ON cmc_container_closures (organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_container_closures_project
  ON cmc_container_closures (project_id);

CREATE TABLE IF NOT EXISTS cmc_reference_standards (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  project_id text,
  scope text NOT NULL DEFAULT 'drug_substance',
  standard_code text NOT NULL,
  standard_name text NOT NULL,
  standard_type text NOT NULL DEFAULT 'primary',
  material_source text,
  lot_number text,
  assigned_value text,
  characterization jsonb,
  certificate_of_analysis text,
  qualification_protocol text,
  storage_conditions text,
  expiry_date timestamp,
  retest_date timestamp,
  status text NOT NULL DEFAULT 'draft',
  qualified_by integer REFERENCES users(id),
  qualification_date timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmc_reference_standards_org
  ON cmc_reference_standards (organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_reference_standards_project
  ON cmc_reference_standards (project_id);
