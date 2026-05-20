-- 20260508_ivd_diagnostic_surfaces.sql
--
-- IVD + diagnostic client tables. Distinct from medtech because the
-- regulatory pathways (FDA 510(k)/PMA for IVDs, EU IVDR Reg 2017/746
-- vs MDR, CLIA categorization, companion diagnostic pairing, LDT phase
-- tracker) operate on different deliverables than a medical device.
--
-- Tables in this migration:
--   ivd_analytical_performance  — per-study accuracy/precision/linearity/LoD
--   ivd_clinical_performance    — sensitivity/specificity/PPV/NPV/ROC
--   ivdr_classifications        — per-device EU IVDR Class A/B/C/D + rule
--   ivdr_per_documents          — Performance Evaluation Reports
--   ivd_clia_categorization     — CLIA complexity + waiver tracking
--   cdx_pairings                — drug ↔ companion-diagnostic device link
--   cdx_concordance_studies     — concordance to trial assay
--   ldt_inventory               — LDTs per lab
--   ldt_phase_milestones        — FDA LDT rule phase tracker
--
-- All tenant-scoped via organization_id (NOT NULL); program-scoped where
-- the artifact belongs to a specific regulatory_program. Soft delete via
-- deleted_at on every table.

-- ─── IVD analytical performance studies ───────────────────────────────
CREATE TABLE IF NOT EXISTS ivd_analytical_performance (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  program_id        uuid    REFERENCES regulatory_programs(id),
  study_type        text NOT NULL,            -- 'accuracy' | 'precision' | 'linearity'
                                              -- | 'limit_of_detection' | 'limit_of_quantitation'
                                              -- | 'analytical_specificity' | 'interference'
                                              -- | 'matrix_comparison' | 'reagent_stability'
                                              -- | 'sample_stability' | 'carryover'
  study_id          text,                     -- sponsor's internal study id
  title             text NOT NULL,
  protocol_ref      text,                     -- link to the study protocol document
  acceptance_criterion text,                  -- pre-specified pass criterion
  result_summary    text,
  pass_fail         text,                     -- 'pass' | 'fail' | 'pending'
  n_samples         integer,
  n_replicates      integer,
  sites             text[],                   -- analyzing sites
  analytes          text[],                   -- analytes / measurands
  matrix_type       text,                     -- 'serum' | 'plasma' | 'whole_blood' | etc.
  report_artifact_id integer,                 -- fk into concept2cure_artifacts
  metadata          jsonb DEFAULT '{}'::jsonb,
  started_at        date,
  completed_at      date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS ivd_anal_perf_org_idx     ON ivd_analytical_performance (organization_id);
CREATE INDEX IF NOT EXISTS ivd_anal_perf_program_idx ON ivd_analytical_performance (program_id);
CREATE INDEX IF NOT EXISTS ivd_anal_perf_type_idx    ON ivd_analytical_performance (organization_id, study_type);

-- ─── IVD clinical performance studies ─────────────────────────────────
CREATE TABLE IF NOT EXISTS ivd_clinical_performance (
  id                  serial PRIMARY KEY,
  organization_id     integer NOT NULL REFERENCES organizations(id),
  program_id          uuid    REFERENCES regulatory_programs(id),
  study_id            text,
  title               text NOT NULL,
  intended_population text,
  comparator          text,                   -- gold-standard reference
  comparator_kind     text,                   -- 'predicate' | 'clinical_truth' | 'composite' | 'follow_up'
  total_subjects      integer,
  positive_n          integer,                -- true positives + false negatives in disease arm
  negative_n          integer,
  sensitivity_pct     numeric(5,2),
  sensitivity_lower   numeric(5,2),           -- 95% CI lower
  sensitivity_upper   numeric(5,2),
  specificity_pct     numeric(5,2),
  specificity_lower   numeric(5,2),
  specificity_upper   numeric(5,2),
  ppv_pct             numeric(5,2),
  npv_pct             numeric(5,2),
  prevalence_pct      numeric(5,2),           -- assumed prevalence for PPV/NPV
  auc_roc             numeric(5,3),
  pre_specified_endpoint_met boolean,
  report_artifact_id  integer,
  metadata            jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS ivd_clin_perf_org_idx     ON ivd_clinical_performance (organization_id);
CREATE INDEX IF NOT EXISTS ivd_clin_perf_program_idx ON ivd_clinical_performance (program_id);

-- ─── EU IVDR classification (Reg 2017/746 Annex VIII) ─────────────────
CREATE TABLE IF NOT EXISTS ivdr_classifications (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  program_id        uuid    REFERENCES regulatory_programs(id),
  device_name       text NOT NULL,
  ivdr_class        text NOT NULL,            -- 'A' | 'B' | 'C' | 'D'
  classification_rule text,                   -- '1'..'7' per Annex VIII
  rationale         text,
  companion_diagnostic boolean DEFAULT false, -- triggers Rule 3 considerations
  self_test         boolean DEFAULT false,    -- triggers Rule 4
  near_patient_test boolean DEFAULT false,    -- triggers Rule 4
  notified_body_required boolean,             -- derived from class (B+) but stored for visibility
  notified_body_name text,
  notified_body_id  text,                     -- 4-digit NB id (e.g. '0123')
  certificate_no    text,
  certificate_expiry date,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS ivdr_class_org_idx     ON ivdr_classifications (organization_id);
CREATE INDEX IF NOT EXISTS ivdr_class_program_idx ON ivdr_classifications (program_id);

-- ─── IVDR Performance Evaluation Reports (PER) ────────────────────────
CREATE TABLE IF NOT EXISTS ivdr_per_documents (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  program_id        uuid    REFERENCES regulatory_programs(id),
  device_name       text NOT NULL,
  per_version       text NOT NULL,            -- 'v1.0' etc.
  per_status        text DEFAULT 'draft',     -- 'draft' | 'review' | 'approved' | 'superseded'
  scientific_validity_done boolean DEFAULT false,
  analytical_performance_done boolean DEFAULT false,
  clinical_performance_done boolean DEFAULT false,
  benefit_risk_conclusion text,
  pmpf_plan_attached boolean DEFAULT false,   -- Post-Market Performance Follow-up plan
  author_name       text,
  author_qualifications text,
  per_date          date,
  artifact_id       integer,                  -- fk into concept2cure_artifacts
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS ivdr_per_org_idx     ON ivdr_per_documents (organization_id);
CREATE INDEX IF NOT EXISTS ivdr_per_program_idx ON ivdr_per_documents (program_id);

-- ─── CLIA categorization + waiver tracking ────────────────────────────
CREATE TABLE IF NOT EXISTS ivd_clia_categorization (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  program_id        uuid    REFERENCES regulatory_programs(id),
  test_name         text NOT NULL,
  analyte           text,
  clia_complexity   text NOT NULL,            -- 'waived' | 'moderate' | 'high'
  cms_letter_date   date,
  cms_letter_ref    text,
  waiver_applied    boolean DEFAULT false,
  waiver_application_date date,
  waiver_granted    boolean,
  waiver_granted_date date,
  waiver_revocation_date date,
  ppmp_status       text,                     -- 'not_applicable' | 'pending' | 'enrolled'
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS clia_cat_org_idx     ON ivd_clia_categorization (organization_id);
CREATE INDEX IF NOT EXISTS clia_cat_program_idx ON ivd_clia_categorization (program_id);

-- ─── Companion diagnostic pairings (drug ↔ device) ────────────────────
CREATE TABLE IF NOT EXISTS cdx_pairings (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  device_program_id uuid    REFERENCES regulatory_programs(id),
  drug_name         text NOT NULL,
  drug_innn         text,                     -- INN
  drug_application_type text,                 -- 'nda' | 'bla' | 'anda' | 'foreign'
  drug_application_no   text,                 -- e.g. NDA 214567
  drug_sponsor      text,
  indication        text,                     -- the indication the drug+CDx serves
  biomarker         text,                     -- e.g. EGFR, BRAF V600E, PD-L1
  approval_status   text DEFAULT 'planned',   -- 'planned' | 'submitted' | 'approved' | 'withdrawn'
  fda_approval_date date,
  ema_approval_date date,
  cdx_label_text    text,                     -- exact CDx claim on drug labeling
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS cdx_pairings_org_idx     ON cdx_pairings (organization_id);
CREATE INDEX IF NOT EXISTS cdx_pairings_program_idx ON cdx_pairings (device_program_id);
CREATE INDEX IF NOT EXISTS cdx_pairings_biomarker_idx ON cdx_pairings (organization_id, biomarker);

-- ─── CDx concordance studies (against original trial assay) ───────────
CREATE TABLE IF NOT EXISTS cdx_concordance_studies (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  cdx_pairing_id    integer NOT NULL REFERENCES cdx_pairings(id) ON DELETE CASCADE,
  study_id          text,
  reference_assay   text NOT NULL,            -- original clinical-trial assay
  candidate_assay   text NOT NULL,            -- the device under approval
  n_samples         integer,
  ppa_pct           numeric(5,2),             -- positive percent agreement
  ppa_lower         numeric(5,2),
  ppa_upper         numeric(5,2),
  npa_pct           numeric(5,2),             -- negative percent agreement
  npa_lower         numeric(5,2),
  npa_upper         numeric(5,2),
  opa_pct           numeric(5,2),             -- overall percent agreement
  discordant_resolution text,
  report_artifact_id integer,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cdx_concord_org_idx     ON cdx_concordance_studies (organization_id);
CREATE INDEX IF NOT EXISTS cdx_concord_pairing_idx ON cdx_concordance_studies (cdx_pairing_id);

-- ─── LDT inventory (laboratory-developed tests) ───────────────────────
CREATE TABLE IF NOT EXISTS ldt_inventory (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  lab_name          text NOT NULL,
  clia_certificate_no text,                   -- the lab's CLIA cert
  test_name         text NOT NULL,
  analyte           text,
  intended_use      text,
  first_offered_date date,                    -- crucial for grandfathering
  grandfathered     boolean DEFAULT false,    -- pre-1976 / pre-rule LDTs
  enforcement_discretion_eligible boolean,
  enforcement_discretion_basis text,          -- 'unmet_need' | 'hde_companion' | 'forensic' | 'cf-blood-banking' | 'public-health'
  fda_pathway       text,                     -- '510k' | 'pma' | 'de_novo' | 'none' | 'enforcement_discretion'
  current_phase     integer DEFAULT 1,        -- FDA LDT rule phase 1..5
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS ldt_inv_org_idx ON ldt_inventory (organization_id);
CREATE INDEX IF NOT EXISTS ldt_inv_phase_idx ON ldt_inventory (organization_id, current_phase);

-- ─── LDT phase milestones (FDA LDT final rule 2024) ───────────────────
CREATE TABLE IF NOT EXISTS ldt_phase_milestones (
  id                serial PRIMARY KEY,
  ldt_id            integer NOT NULL REFERENCES ldt_inventory(id) ON DELETE CASCADE,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  phase             integer NOT NULL,         -- 1..5
  requirement       text NOT NULL,            -- specific milestone (e.g. 'mdr_compliance')
  due_date          date,
  completed_at      date,
  evidence_ref      text,
  status            text DEFAULT 'pending',   -- 'pending' | 'in_progress' | 'completed' | 'not_applicable'
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ldt_ms_ldt_idx   ON ldt_phase_milestones (ldt_id);
CREATE INDEX IF NOT EXISTS ldt_ms_org_idx   ON ldt_phase_milestones (organization_id);
CREATE INDEX IF NOT EXISTS ldt_ms_phase_idx ON ldt_phase_milestones (organization_id, phase, status);
