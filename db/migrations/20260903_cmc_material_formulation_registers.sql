-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Create the material-specification and formulation registers that 3.2.P.1, 3.2.P.2 and 3.2.P.4 compose from.
--
-- eCTD/CTD Context:
--   - Module(s): Module 3 — 3.2.P.1 (composition), 3.2.P.2 (pharmaceutical development), 3.2.P.4 (control of excipients)
--   - Integrity Risk Addressed: first-match rendering over absent stores — 3.2.P.4 showed one raw material out of however many a project uses, and the 3.2.P.1 quantitative composition table showed whichever formulation version arrived first
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - One table serves both material source types; `material_role` STORES which
--     section a record files into rather than guessing it — the rule the
--     impurity (`scope`) and dissolution (`purpose`) registers already follow.
--   - Tenant-scoped with the canonical policy; idempotent (IF NOT EXISTS).
-- =============================================================================

-- CMC registers for material specifications and the formulation record.
--
-- ── What was missing ─────────────────────────────────────────────────────────
-- server/services/module3Composer.ts demands `excipient`, `raw_material_spec`
-- and `formulation_record` canonical sources:
--
--   3.2.P.4         requiredSourceTypes ['excipient', 'raw_material_spec']
--   3.2.P.1 / P.2   requiredSourceTypes include formulation_record
--
-- None had a table. Worse than absent: the sections that read them read through
-- FIRST-MATCH helpers, so 3.2.P.4 rendered one raw material out of however many
-- a project uses, and 3.2.P.1's quantitative composition table rendered
-- whichever formulation version happened to arrive first.
--
-- One table serves the two material source types because they are one shape:
-- `material_role` decides which, so the section a record files into is stored
-- rather than guessed -- the same rule as `scope` on the impurity register and
-- `purpose` on the dissolution register.
--
-- `origin` is the load-bearing column. Section 3.2.A.3 has to state whether any
-- excipient is of human or animal origin, and it was answering from a regex
-- over free text -- a formulation containing gelatin was caught only because
-- the word "gelatin" appeared in it. Recorded origin is the honest source.
--
-- Additive and idempotent. Nothing is dropped or renamed.

CREATE TABLE IF NOT EXISTS cmc_material_specs (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  project_id text,
  material_role text NOT NULL DEFAULT 'excipient',
  material_name text NOT NULL,
  function_in_formulation text,
  grade text,
  compendial_monograph text,
  compendial_compliance text,
  supplier text,
  manufacturer_site text,
  origin text,
  origin_detail text,
  tse_certificate text,
  test_parameters jsonb,
  analytical_procedures text,
  novel_excipient boolean NOT NULL DEFAULT false,
  novel_excipient_justification text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmc_material_specs_org
  ON cmc_material_specs (organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_material_specs_project
  ON cmc_material_specs (project_id);

CREATE TABLE IF NOT EXISTS cmc_formulation_records (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  project_id text,
  formulation_name text NOT NULL,
  version text,
  dosage_form text,
  strength text,
  batch_size text,
  components jsonb,
  theoretical_yield text,
  overage_justification text,
  supersedes text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmc_formulation_records_org
  ON cmc_formulation_records (organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_formulation_records_project
  ON cmc_formulation_records (project_id);
