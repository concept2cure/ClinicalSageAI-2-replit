-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Create the impurity and dissolution registers that Module 3 composition has required as canonical sources since it was modelled.
--
-- eCTD/CTD Context:
--   - Module(s): Module 3 — 3.2.S.3 / 3.2.S.4 (impurity profile), 3.2.P.2 / 3.2.P.5 (dissolution profile)
--   - Integrity Risk Addressed: unrecordable CMC evidence — the ICH Q3A/Q3B threshold question and the f2 similarity question could not be answered from stored data, only from an unstructured json blob nothing writes
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - The section a record files into is STORED (scope / purpose), never guessed,
--     on the rule the container closure and reference standard registers set.
--   - Tenant-scoped with the canonical policy; idempotent (IF NOT EXISTS).
-- =============================================================================

-- CMC registers for the impurity profile and the dissolution profile.
--
-- ── What was missing ─────────────────────────────────────────────────────────
-- server/services/module3Composer.ts has demanded an `impurity_profile` and a
-- `dissolution_profile` canonical source since Module 3 was modelled:
--
--   3.2.S.3 / 3.2.S.4   requiredSourceTypes include impurity_profile
--   3.2.P.2 / 3.2.P.5   requiredSourceTypes include dissolution_profile
--
-- Neither had a table. The only impurity storage anywhere was an unstructured
-- drug_substances.impurities_profile json blob that the product's own drug
-- substance form never writes, and dissolution had nothing at all -- so the two
-- questions a reviewer works through first for an oral solid product (is this
-- impurity above the ICH Q3A/Q3B identification or qualification threshold, and
-- are these two dissolution profiles similar) could not be recorded, let alone
-- answered from recorded data.
--
-- Both registers carry the scoping column the section rules read, on the rule
-- established by the container closure and reference standard registers: the
-- section a record files into is stored, never guessed. For impurities that is
-- `scope` (drug_substance | drug_product | both); for dissolution it is
-- `purpose` (development | release-specification | comparability | biowaiver),
-- because a development profile belongs to 3.2.P.2 and a release-specification
-- profile to 3.2.P.5 and one must not complete the other's section.
--
-- Both carry project_id as a column so the canonical write-through does not
-- depend on a client having sent one, and both are tenant-purge children (see
-- server/services/tenant/tenant-offboarding.ts).
--
-- Additive and idempotent. Nothing is dropped or renamed.

CREATE TABLE IF NOT EXISTS cmc_impurity_profiles (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  project_id text,
  scope text NOT NULL DEFAULT 'drug_substance',
  material_name text NOT NULL,
  impurity_name text NOT NULL,
  impurity_type text NOT NULL DEFAULT 'process-related',
  origin text,
  cas_number text,
  molecular_formula text,
  structure text,
  relative_retention_time text,
  analytical_method text,
  observed_level text,
  level_unit text,
  specification_limit text,
  reporting_threshold text,
  identification_threshold text,
  qualification_threshold text,
  maximum_daily_dose text,
  qualification_basis text,
  control_strategy text,
  batches_observed text[],
  status text NOT NULL DEFAULT 'draft',
  qualified_by integer REFERENCES users(id),
  qualification_date timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- A level with no unit cannot be compared to an ICH threshold, and the
-- assessment engine refuses it. A column DEFAULT of '%' filled in a unit the
-- analyst never recorded, made that refusal unreachable, and turned a ppm figure
-- into a percentage. Dropped here and on an estate that already ran this file.
ALTER TABLE cmc_impurity_profiles ALTER COLUMN level_unit DROP DEFAULT;

-- Qualification is a Part 11 signature over the recorded qualification basis;
-- these carry who signed and when. Stated as ALTERs as well so a database that
-- already has the table from an earlier run of this file gains them.
ALTER TABLE cmc_impurity_profiles ADD COLUMN IF NOT EXISTS qualified_by integer REFERENCES users(id);
ALTER TABLE cmc_impurity_profiles ADD COLUMN IF NOT EXISTS qualification_date timestamp;

CREATE INDEX IF NOT EXISTS idx_cmc_impurity_profiles_org
  ON cmc_impurity_profiles (organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_impurity_profiles_project
  ON cmc_impurity_profiles (project_id);

CREATE TABLE IF NOT EXISTS cmc_dissolution_profiles (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  project_id text,
  purpose text NOT NULL DEFAULT 'development',
  product_name text NOT NULL,
  batch_number text,
  strength text,
  apparatus text NOT NULL,
  rotation_speed text,
  medium text NOT NULL,
  medium_volume text,
  temperature text,
  sinker text,
  specification text,
  units_tested integer,
  results jsonb,
  comparison_batch text,
  comparison_results jsonb,
  test_date timestamp,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- pass_fail was a release-conformance verdict a caller could type, that nothing
-- read: whether a profile meets its criterion is a comparison against the
-- recorded specification, which the composed section performs from the profile
-- itself. A typed verdict is a conclusion with no working shown. Stated AFTER
-- the CREATE above: DROP COLUMN IF EXISTS does not guard the table's existence,
-- so on a fresh database an ALTER placed before it fails outright.
ALTER TABLE cmc_dissolution_profiles DROP COLUMN IF EXISTS pass_fail;

CREATE INDEX IF NOT EXISTS idx_cmc_dissolution_profiles_org
  ON cmc_dissolution_profiles (organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_dissolution_profiles_project
  ON cmc_dissolution_profiles (project_id);
