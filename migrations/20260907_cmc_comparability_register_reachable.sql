-- 20260907_cmc_comparability_register_reachable.sql
--
-- The comparability register is §3.2.P.8's ONLY producer of
-- `comparabilityStatus`, and it could not be written to.
--
-- Two faults, both found by running the staff simulation end to end:
--
--  1. NO CREATOR ON ANY APPLIER. The table's only DDL is
--     migrations/0006_regulatory_atoms.sql, which is in no applier's file list;
--     db/migrations/20260401_cmc_convergence_os.sql only ALTERs it behind a
--     to_regclass guard. On a database provisioned by the migration set the
--     table does not exist at all, so POST /api/cmc/comparability-studies
--     answers 500 and §3.2.P.8 can never reach 100%.
--
--  2. A FOREIGN KEY TO A TABLE NOTHING ELSE USES. 0006 declares
--     project_id UUID NOT NULL REFERENCES cmc_projects(id). Every other CMC
--     register — drug substance, drug product, stability, specification,
--     impurity, formulation, characterisation, manufacturing process — stores
--     the PROGRAM uuid in project_id with no FK, and cmc_projects is empty
--     (its own creator is a reconstruction of a table with no DDL anywhere).
--     So the one register that constrained project_id constrained it to a
--     spine the product does not populate: every write from a real program
--     failed with
--       violates foreign key constraint
--       "cmc_comparability_assessments_project_id_fkey".
--
-- This file is the creator on the applier, in the shape the rest of the CMC
-- surface uses: public schema, organization_id INTEGER NOT NULL, project_id a
-- plain uuid. It also drops the misdirected constraint where 0006 already
-- created it, so an existing database converges to the same shape. The drop is
-- replay-safe: no file on any applier re-creates that constraint (0006 is on
-- none), so there is no create-then-drop ordering hazard.

CREATE TABLE IF NOT EXISTS cmc_comparability_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  -- The program the assessment belongs to. Deliberately unconstrained, exactly
  -- as every sibling CMC register stores it: the program spine is
  -- regulatory_programs, and tenancy is enforced by organization_id + RLS.
  project_id UUID NOT NULL,
  assessment_name TEXT NOT NULL,
  change_type TEXT,
  pre_change_state JSONB,
  post_change_state JSONB,
  changed_element TEXT,
  affected_cqas JSONB,
  affected_process_parameters JSONB,
  analytical_comparability_evidence JSONB,
  clinical_bridging_relevance TEXT,
  regulatory_risk_level TEXT,
  regulatory_classification TEXT,
  justification TEXT,
  impacted_sections JSONB,
  status TEXT DEFAULT 'draft',
  reviewed_by TEXT,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Present on databases where 0006 ran; the route writes it as the org id.
ALTER TABLE cmc_comparability_assessments ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- 2026-09-07: the FK described above, removed wherever 0006 installed it.
ALTER TABLE cmc_comparability_assessments
  DROP CONSTRAINT IF EXISTS cmc_comparability_assessments_project_id_fkey;

CREATE INDEX IF NOT EXISTS idx_cmc_comparability_org ON cmc_comparability_assessments(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_comparability_project ON cmc_comparability_assessments(project_id);
CREATE INDEX IF NOT EXISTS idx_cmc_comparability_status ON cmc_comparability_assessments(status);
CREATE INDEX IF NOT EXISTS idx_cmc_comparability_change_type ON cmc_comparability_assessments(change_type);
