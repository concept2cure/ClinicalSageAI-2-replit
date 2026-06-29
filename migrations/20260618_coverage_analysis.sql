-- ============================================================================
-- Medicare Coverage Analysis (MCA) & Clinical-Research Billing Compliance
-- (Capability C2C-15)
-- ============================================================================
--
-- For a clinical trial, classify each protocol procedure / service / visit item
-- as a Medicare-billable "routine cost", a sponsor-paid (research) cost, or
-- standard-of-care — the coverage/billing grid every trial-running academic
-- medical center must produce to bill Medicare correctly and avoid False Claims
-- Act liability. An analysis links to a clinical study (and optionally the IRB
-- submission it sits under).
--
-- Grounded in Medicare NCD 310.1 ("Routine Costs in Clinical Trials"), the
-- Medicare Clinical Trial Policy, and 42 CFR 405.211. The deterministic billing
-- designation is computed in coverage-logic.ts; the LLM is advisory only.
-- Tenancy/audit mirror the platform; status/type columns are CHECK-constrained.
--
-- Schema:  shared/schema/coverage-analysis.ts
-- Service: server/services/coverage/*
-- Routes:  server/routes/coverage-analysis.ts (/api/coverage-analysis)
-- ============================================================================

-- ─── Coverage analyses ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coverage_analyses (
  id                               serial PRIMARY KEY,
  organization_id                  integer NOT NULL REFERENCES organizations(id),
  study_id                         integer REFERENCES clinical_studies(id),
  irb_submission_id                integer REFERENCES irb_submissions(id),
  nct_id                           text,
  title                            text NOT NULL,
  sponsor                          text,
  qualifying_determination         text NOT NULL DEFAULT 'pending'
                                     CHECK (qualifying_determination IN ('pending','qualifying','non_qualifying')),
  has_therapeutic_intent           boolean NOT NULL DEFAULT false,
  enrolls_diagnosis_treatment      boolean NOT NULL DEFAULT false,
  has_medicare_benefit_category    boolean NOT NULL DEFAULT false,
  deemed_qualifying                boolean NOT NULL DEFAULT false,
  desirable_characteristics_count  integer NOT NULL DEFAULT 0
                                     CHECK (desirable_characteristics_count BETWEEN 0 AND 7),
  qualifying_rationale             text,
  status                           text NOT NULL DEFAULT 'draft'
                                     CHECK (status IN ('draft','in_progress','finalized','archived')),
  finalized_by                     integer REFERENCES users(id),
  finalized_at                     timestamptz,
  created_by                       integer NOT NULL REFERENCES users(id),
  created_at                       timestamptz NOT NULL DEFAULT now(),
  updated_at                       timestamptz NOT NULL DEFAULT now(),
  deleted_at                       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_coverage_analyses_org   ON coverage_analyses(organization_id);
CREATE INDEX IF NOT EXISTS idx_coverage_analyses_study ON coverage_analyses(study_id);

-- ─── Coverage analysis items (the billing grid rows) ────────────────────────
CREATE TABLE IF NOT EXISTS coverage_analysis_items (
  id                     serial PRIMARY KEY,
  organization_id        integer NOT NULL REFERENCES organizations(id),
  analysis_id            integer NOT NULL REFERENCES coverage_analyses(id),
  item_description       text NOT NULL,
  category               text CHECK (category IN
                           ('procedure','lab','imaging','drug_administration','visit','device','other')),
  cpt_hcpcs_code         text,
  icd10_code             text,
  icd10_validated        boolean NOT NULL DEFAULT false,
  is_standard_of_care    boolean NOT NULL DEFAULT false,
  sponsor_paid_in_budget boolean NOT NULL DEFAULT false,
  classification         text NOT NULL DEFAULT 'unclear'
                           CHECK (classification IN ('routine_cost','research_paid','standard_of_care','unclear')),
  billing_designation    text NOT NULL DEFAULT 'hold'
                           CHECK (billing_designation IN
                             ('bill_medicare','bill_sponsor','bill_standard_of_care','do_not_bill','hold')),
  ncd_citation           text,
  lcd_citation           text,
  coverage_doc_url       text,
  rationale              text,
  suggestion_source      text NOT NULL DEFAULT 'manual'
                           CHECK (suggestion_source IN ('deterministic','llm_suggested','manual')),
  created_by             integer NOT NULL REFERENCES users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE INDEX IF NOT EXISTS idx_coverage_items_org      ON coverage_analysis_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_coverage_items_analysis ON coverage_analysis_items(analysis_id);
