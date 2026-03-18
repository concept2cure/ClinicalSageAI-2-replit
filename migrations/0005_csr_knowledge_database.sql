-- ============================================================================
-- Migration: CSR & CTD Knowledge Database
-- Description: Comprehensive normalized schema for storing all structured data
--              extracted from Clinical Study Reports and Common Technical Documents.
--              Replaces unstructured JSON blobs with queryable, indexed columns.
-- ============================================================================

-- Ensure pgvector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE csr_study_phase AS ENUM (
    'preclinical', 'phase_1', 'phase_1a', 'phase_1b', 'phase_1_2',
    'phase_2', 'phase_2a', 'phase_2b', 'phase_2_3',
    'phase_3', 'phase_3a', 'phase_3b', 'phase_4', 'not_applicable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE csr_study_design AS ENUM (
    'parallel', 'crossover', 'factorial', 'single_arm', 'adaptive',
    'basket', 'umbrella', 'platform', 'enrichment', 'sequential',
    'dose_escalation', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE csr_blinding_type AS ENUM (
    'open_label', 'single_blind', 'double_blind', 'triple_blind', 'observer_blind'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE csr_arm_type AS ENUM (
    'experimental', 'active_comparator', 'placebo_comparator', 'sham_comparator',
    'no_intervention', 'dose_group', 'combination', 'crossover_sequence'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE csr_endpoint_category AS ENUM (
    'primary', 'secondary', 'exploratory', 'safety', 'pharmacokinetic',
    'biomarker', 'patient_reported', 'composite'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE csr_ae_seriousness AS ENUM (
    'non_serious', 'serious', 'life_threatening', 'fatal'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE csr_ae_causality AS ENUM (
    'unrelated', 'unlikely', 'possible', 'probable', 'definite', 'not_assessed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE csr_ae_outcome AS ENUM (
    'recovered', 'recovering', 'not_recovered', 'recovered_with_sequelae', 'fatal', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ctd_module AS ENUM (
    'm1_administrative', 'm2_summaries', 'm3_quality', 'm4_nonclinical', 'm5_clinical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE csr_regulatory_agency AS ENUM (
    'fda', 'ema', 'pmda', 'nmpa', 'health_canada', 'tga', 'mhra', 'anvisa', 'swissmedic', 'who', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE csr_signal_status AS ENUM (
    'detected', 'under_evaluation', 'confirmed', 'refuted', 'monitoring', 'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE csr_molecule_type AS ENUM (
    'small_molecule', 'monoclonal_antibody', 'bispecific_antibody', 'adc', 'peptide',
    'oligonucleotide', 'gene_therapy', 'cell_therapy', 'vaccine', 'biosimilar',
    'radiopharmaceutical', 'combination', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE csr_therapeutic_area AS ENUM (
    'oncology', 'cardiology', 'neurology', 'immunology', 'infectious_disease',
    'endocrinology', 'respiratory', 'gastroenterology', 'nephrology', 'hematology',
    'dermatology', 'ophthalmology', 'musculoskeletal', 'psychiatry', 'rare_disease',
    'pediatrics', 'womens_health', 'pain', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- LAYER 1: CSR DATA HARVEST
-- ============================================================================

-- 1.1 Study Master Record
CREATE TABLE IF NOT EXISTS csr_studies (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  client_workspace_id INTEGER REFERENCES client_workspaces(id),
  csr_id VARCHAR(100) NOT NULL,
  nct_id VARCHAR(30),
  eudract_number VARCHAR(30),
  protocol_number VARCHAR(100),
  study_title TEXT NOT NULL,
  study_acronym VARCHAR(50),
  sponsor TEXT,
  molecule TEXT,
  molecule_type csr_molecule_type,
  brand_name VARCHAR(200),
  inn VARCHAR(200),
  mechanism_of_action TEXT,
  therapeutic_area csr_therapeutic_area,
  indication TEXT,
  indication_meddra VARCHAR(50),
  phase csr_study_phase,
  study_design csr_study_design,
  blinding csr_blinding_type,
  randomization TEXT,
  control_type VARCHAR(50),
  number_of_arms INTEGER,
  adaptive_design_details TEXT,
  study_start_date DATE,
  study_end_date DATE,
  primary_completion_date DATE,
  duration_weeks INTEGER,
  report_date DATE,
  regulatory_agency csr_regulatory_agency,
  submission_type VARCHAR(50),
  application_number VARCHAR(50),
  design_rationale TEXT,
  regulatory_classification TEXT,
  study_type_description TEXT,
  source_document_id INTEGER,
  source_report_id INTEGER,
  extraction_version VARCHAR(20),
  extraction_confidence REAL,
  extracted_at TIMESTAMP,
  verified_by INTEGER REFERENCES users(id),
  verified_at TIMESTAMP,
  embedding vector(1536),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_studies_org_idx ON csr_studies(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS csr_studies_csr_id_idx ON csr_studies(organization_id, csr_id);
CREATE INDEX IF NOT EXISTS csr_studies_nct_idx ON csr_studies(nct_id);
CREATE INDEX IF NOT EXISTS csr_studies_indication_idx ON csr_studies(indication);
CREATE INDEX IF NOT EXISTS csr_studies_phase_idx ON csr_studies(phase);
CREATE INDEX IF NOT EXISTS csr_studies_molecule_idx ON csr_studies(molecule);
CREATE INDEX IF NOT EXISTS csr_studies_sponsor_idx ON csr_studies(sponsor);
CREATE INDEX IF NOT EXISTS csr_studies_ta_idx ON csr_studies(therapeutic_area);

-- 1.2 Treatment Arms
CREATE TABLE IF NOT EXISTS csr_treatment_arms (
  id SERIAL PRIMARY KEY,
  study_id INTEGER NOT NULL REFERENCES csr_studies(id) ON DELETE CASCADE,
  arm_name TEXT NOT NULL,
  arm_type csr_arm_type NOT NULL,
  arm_description TEXT,
  drug_name TEXT,
  dose VARCHAR(100),
  dose_unit VARCHAR(30),
  frequency VARCHAR(50),
  route_of_administration VARCHAR(50),
  duration_weeks INTEGER,
  dosing_schedule TEXT,
  formulation TEXT,
  planned_subjects INTEGER,
  enrolled_subjects INTEGER,
  completed_subjects INTEGER,
  discontinued_subjects INTEGER,
  sort_order INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_arms_study_idx ON csr_treatment_arms(study_id);
CREATE INDEX IF NOT EXISTS csr_arms_type_idx ON csr_treatment_arms(arm_type);

-- 1.3 Study Populations
CREATE TABLE IF NOT EXISTS csr_populations (
  id SERIAL PRIMARY KEY,
  study_id INTEGER NOT NULL REFERENCES csr_studies(id) ON DELETE CASCADE,
  population_name VARCHAR(100) NOT NULL,
  population_description TEXT,
  total_screened INTEGER,
  screen_failures INTEGER,
  total_randomized INTEGER,
  total_enrolled INTEGER,
  total_completed INTEGER,
  total_discontinued INTEGER,
  discontinuation_reasons JSONB,
  mean_age REAL,
  median_age REAL,
  age_range VARCHAR(30),
  percent_female REAL,
  percent_male REAL,
  race_distribution JSONB,
  ethnicity_distribution JSONB,
  region_distribution JSONB,
  baseline_characteristics JSONB,
  medical_history JSONB,
  prior_therapies JSONB,
  concomitant_medications JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_pop_study_idx ON csr_populations(study_id);

-- 1.4 Eligibility Criteria
CREATE TABLE IF NOT EXISTS csr_eligibility_criteria (
  id SERIAL PRIMARY KEY,
  study_id INTEGER NOT NULL REFERENCES csr_studies(id) ON DELETE CASCADE,
  criteria_type VARCHAR(20) NOT NULL,
  criterion_number INTEGER,
  criterion_text TEXT NOT NULL,
  category VARCHAR(50),
  meddra_term VARCHAR(200),
  snomed_code VARCHAR(50),
  embedding vector(1536),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_elig_study_idx ON csr_eligibility_criteria(study_id);
CREATE INDEX IF NOT EXISTS csr_elig_type_idx ON csr_eligibility_criteria(criteria_type);

-- 1.5 Endpoints
CREATE TABLE IF NOT EXISTS csr_endpoints (
  id SERIAL PRIMARY KEY,
  study_id INTEGER NOT NULL REFERENCES csr_studies(id) ON DELETE CASCADE,
  endpoint_category csr_endpoint_category NOT NULL,
  endpoint_name TEXT NOT NULL,
  endpoint_description TEXT,
  measurement_method TEXT,
  assessment_timepoint VARCHAR(100),
  assessment_tool VARCHAR(200),
  statistical_method TEXT,
  statistical_model TEXT,
  primary_analysis_population VARCHAR(50),
  multiplicity_adjustment TEXT,
  missing_data_method TEXT,
  sensitivity_analyses JSONB,
  prespecified_subgroups JSONB,
  embedding vector(1536),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_ep_study_idx ON csr_endpoints(study_id);
CREATE INDEX IF NOT EXISTS csr_ep_category_idx ON csr_endpoints(endpoint_category);

-- 1.6 Endpoint Results
CREATE TABLE IF NOT EXISTS csr_endpoint_results (
  id SERIAL PRIMARY KEY,
  endpoint_id INTEGER NOT NULL REFERENCES csr_endpoints(id) ON DELETE CASCADE,
  arm_id INTEGER REFERENCES csr_treatment_arms(id) ON DELETE SET NULL,
  n_subjects INTEGER,
  result_value REAL,
  result_unit VARCHAR(50),
  standard_deviation REAL,
  standard_error REAL,
  median_value REAL,
  ci_lower REAL,
  ci_upper REAL,
  ci_level REAL,
  comparison_arm_id INTEGER REFERENCES csr_treatment_arms(id),
  treatment_difference REAL,
  p_value REAL,
  p_value_adjusted REAL,
  odds_ratio REAL,
  hazard_ratio REAL,
  relative_risk REAL,
  nnt REAL,
  response_rate REAL,
  responder_definition TEXT,
  is_statistically_significant BOOLEAN,
  is_clinically_meaningful BOOLEAN,
  clinical_meaningful_threshold REAL,
  subgroup_name VARCHAR(200),
  is_subgroup_analysis BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_epres_endpoint_idx ON csr_endpoint_results(endpoint_id);
CREATE INDEX IF NOT EXISTS csr_epres_arm_idx ON csr_endpoint_results(arm_id);
CREATE INDEX IF NOT EXISTS csr_epres_pval_idx ON csr_endpoint_results(p_value);

-- 1.7 Adverse Events
CREATE TABLE IF NOT EXISTS csr_adverse_events (
  id SERIAL PRIMARY KEY,
  study_id INTEGER NOT NULL REFERENCES csr_studies(id) ON DELETE CASCADE,
  arm_id INTEGER REFERENCES csr_treatment_arms(id),
  preferred_term TEXT NOT NULL,
  system_organ_class TEXT,
  meddra_code VARCHAR(20),
  high_level_group_term TEXT,
  seriousness csr_ae_seriousness NOT NULL,
  severity_grade INTEGER,
  severity_scale VARCHAR(50),
  causality csr_ae_causality,
  outcome csr_ae_outcome,
  subjects_affected INTEGER,
  subjects_at_risk INTEGER,
  incidence_rate REAL,
  events_total INTEGER,
  median_onset_days REAL,
  median_duration_days REAL,
  dose_modification BOOLEAN DEFAULT FALSE,
  drug_discontinued BOOLEAN DEFAULT FALSE,
  treatment_required BOOLEAN DEFAULT FALSE,
  hospitalization_required BOOLEAN DEFAULT FALSE,
  is_aesi BOOLEAN DEFAULT FALSE,
  is_dose_related BOOLEAN,
  is_expected BOOLEAN,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_ae_study_idx ON csr_adverse_events(study_id);
CREATE INDEX IF NOT EXISTS csr_ae_arm_idx ON csr_adverse_events(arm_id);
CREATE INDEX IF NOT EXISTS csr_ae_pt_idx ON csr_adverse_events(preferred_term);
CREATE INDEX IF NOT EXISTS csr_ae_soc_idx ON csr_adverse_events(system_organ_class);
CREATE INDEX IF NOT EXISTS csr_ae_seriousness_idx ON csr_adverse_events(seriousness);
CREATE INDEX IF NOT EXISTS csr_ae_meddra_idx ON csr_adverse_events(meddra_code);

-- 1.8 Safety Summaries
CREATE TABLE IF NOT EXISTS csr_safety_summaries (
  id SERIAL PRIMARY KEY,
  study_id INTEGER NOT NULL REFERENCES csr_studies(id) ON DELETE CASCADE,
  arm_id INTEGER REFERENCES csr_treatment_arms(id),
  any_teae INTEGER,
  any_treatment_related_teae INTEGER,
  any_serious_ae INTEGER,
  any_treatment_related_sae INTEGER,
  deaths_during_study INTEGER,
  treatment_related_deaths INTEGER,
  discontinuation_due_to_ae INTEGER,
  dose_reduction_due_to_ae INTEGER,
  dose_interruption_due_to_ae INTEGER,
  safety_population_n INTEGER,
  lab_abnormalities JSONB,
  vital_sign_abnormalities JSONB,
  ecg_findings JSONB,
  teae_summary_text TEXT,
  sae_summary_text TEXT,
  death_narratives TEXT,
  safety_conclusion TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_safety_study_idx ON csr_safety_summaries(study_id);

-- 1.9 Pharmacokinetic Data
CREATE TABLE IF NOT EXISTS csr_pharmacokinetics (
  id SERIAL PRIMARY KEY,
  study_id INTEGER NOT NULL REFERENCES csr_studies(id) ON DELETE CASCADE,
  arm_id INTEGER REFERENCES csr_treatment_arms(id),
  parameter_name VARCHAR(50) NOT NULL,
  parameter_unit VARCHAR(30),
  analyte_or_matrix VARCHAR(100),
  mean_value REAL,
  geometric_mean REAL,
  median_value REAL,
  cv_percent REAL,
  ci_lower REAL,
  ci_upper REAL,
  n_subjects INTEGER,
  dosing_condition VARCHAR(100),
  sampling_timepoint VARCHAR(100),
  is_steady_state BOOLEAN DEFAULT FALSE,
  food_effect VARCHAR(30),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_pk_study_idx ON csr_pharmacokinetics(study_id);
CREATE INDEX IF NOT EXISTS csr_pk_param_idx ON csr_pharmacokinetics(parameter_name);

-- 1.10 Dose Response
CREATE TABLE IF NOT EXISTS csr_dose_response (
  id SERIAL PRIMARY KEY,
  study_id INTEGER NOT NULL REFERENCES csr_studies(id) ON DELETE CASCADE,
  endpoint_id INTEGER REFERENCES csr_endpoints(id),
  dose REAL NOT NULL,
  dose_unit VARCHAR(30) NOT NULL,
  response_type VARCHAR(50) NOT NULL,
  response_value REAL,
  response_unit VARCHAR(50),
  n_subjects INTEGER,
  standard_error REAL,
  p_value_vs_placebo REAL,
  model_type VARCHAR(50),
  ed50 REAL,
  emax REAL,
  hill_coefficient REAL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_dr_study_idx ON csr_dose_response(study_id);

-- 1.11 Biomarkers
CREATE TABLE IF NOT EXISTS csr_biomarkers (
  id SERIAL PRIMARY KEY,
  study_id INTEGER NOT NULL REFERENCES csr_studies(id) ON DELETE CASCADE,
  arm_id INTEGER REFERENCES csr_treatment_arms(id),
  biomarker_name TEXT NOT NULL,
  biomarker_type VARCHAR(50),
  assay_method TEXT,
  specimen VARCHAR(50),
  baseline_value REAL,
  endpoint_value REAL,
  change_from_baseline REAL,
  percent_change REAL,
  unit VARCHAR(50),
  n_subjects INTEGER,
  correlated_endpoint_id INTEGER REFERENCES csr_endpoints(id),
  correlation_coefficient REAL,
  correlation_p_value REAL,
  is_predictive BOOLEAN,
  is_prognostic BOOLEAN,
  is_pharmacodynamic BOOLEAN,
  qualification_status VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_bio_study_idx ON csr_biomarkers(study_id);
CREATE INDEX IF NOT EXISTS csr_bio_name_idx ON csr_biomarkers(biomarker_name);
CREATE INDEX IF NOT EXISTS csr_bio_type_idx ON csr_biomarkers(biomarker_type);

-- 1.12 Statistical Analyses
CREATE TABLE IF NOT EXISTS csr_statistical_analyses (
  id SERIAL PRIMARY KEY,
  study_id INTEGER NOT NULL REFERENCES csr_studies(id) ON DELETE CASCADE,
  endpoint_id INTEGER REFERENCES csr_endpoints(id),
  analysis_name TEXT NOT NULL,
  analysis_type VARCHAR(50) NOT NULL,
  analysis_population VARCHAR(50),
  primary_model TEXT,
  covariates JSONB,
  stratification_factors JSONB,
  multiplicity_adjustment_method TEXT,
  missing_data_handling TEXT,
  sensitivity_analysis_description TEXT,
  sample_size_justification TEXT,
  power_calculation TEXT,
  assumed_effect_size REAL,
  planned_power REAL,
  alpha_level REAL,
  has_interim_analysis BOOLEAN DEFAULT FALSE,
  interim_analysis_details TEXT,
  stopping_rules TEXT,
  data_sources JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_stat_study_idx ON csr_statistical_analyses(study_id);
CREATE INDEX IF NOT EXISTS csr_stat_type_idx ON csr_statistical_analyses(analysis_type);

-- 1.13 CSR Sections (RAG-ready with embeddings)
CREATE TABLE IF NOT EXISTS csr_sections (
  id SERIAL PRIMARY KEY,
  study_id INTEGER NOT NULL REFERENCES csr_studies(id) ON DELETE CASCADE,
  section_number VARCHAR(20),
  section_title TEXT NOT NULL,
  ich_e3_section VARCHAR(20),
  section_text TEXT,
  word_count INTEGER,
  page_start INTEGER,
  page_end INTEGER,
  extraction_confidence REAL,
  has_tables_or_figures BOOLEAN DEFAULT FALSE,
  embedding vector(1536),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_sec_study_idx ON csr_sections(study_id);
CREATE INDEX IF NOT EXISTS csr_sec_ich_idx ON csr_sections(ich_e3_section);

-- 1.14 Tables, Figures, Listings
CREATE TABLE IF NOT EXISTS csr_tables_and_figures (
  id SERIAL PRIMARY KEY,
  study_id INTEGER NOT NULL REFERENCES csr_studies(id) ON DELETE CASCADE,
  section_id INTEGER REFERENCES csr_sections(id),
  tfl_type VARCHAR(20) NOT NULL,
  tfl_number VARCHAR(30),
  title TEXT NOT NULL,
  caption TEXT,
  structured_data JSONB,
  column_headers JSONB,
  row_count INTEGER,
  footnotes TEXT,
  page_number INTEGER,
  source_file TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_tfl_study_idx ON csr_tables_and_figures(study_id);
CREATE INDEX IF NOT EXISTS csr_tfl_type_idx ON csr_tables_and_figures(tfl_type);

-- 1.15 References
CREATE TABLE IF NOT EXISTS csr_references (
  id SERIAL PRIMARY KEY,
  study_id INTEGER NOT NULL REFERENCES csr_studies(id) ON DELETE CASCADE,
  reference_type VARCHAR(50) NOT NULL,
  title TEXT,
  authors TEXT,
  source TEXT,
  year INTEGER,
  doi VARCHAR(200),
  pmid VARCHAR(20),
  document_version VARCHAR(20),
  url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_ref_study_idx ON csr_references(study_id);
CREATE INDEX IF NOT EXISTS csr_ref_type_idx ON csr_references(reference_type);

-- ============================================================================
-- LAYER 2: CTD MODULE REPOSITORY
-- ============================================================================

-- 2.1 CTD Programs
CREATE TABLE IF NOT EXISTS ctd_programs (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  client_workspace_id INTEGER REFERENCES client_workspaces(id),
  program_name TEXT NOT NULL,
  program_code VARCHAR(50),
  molecule TEXT,
  molecule_type csr_molecule_type,
  therapeutic_area csr_therapeutic_area,
  indication TEXT,
  target_agency csr_regulatory_agency,
  status VARCHAR(30) DEFAULT 'active',
  lead_project_manager INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ctd_prog_org_idx ON ctd_programs(organization_id);
CREATE INDEX IF NOT EXISTS ctd_prog_molecule_idx ON ctd_programs(molecule);

-- 2.2 CTD Submissions
CREATE TABLE IF NOT EXISTS ctd_submissions (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES ctd_programs(id) ON DELETE CASCADE,
  submission_title TEXT NOT NULL,
  submission_type VARCHAR(50) NOT NULL,
  sequence_number INTEGER,
  application_number VARCHAR(50),
  target_agency csr_regulatory_agency NOT NULL,
  submission_date DATE,
  target_date DATE,
  acceptance_date DATE,
  approval_date DATE,
  status VARCHAR(30) DEFAULT 'draft',
  ectd_version VARCHAR(10),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ctd_sub_program_idx ON ctd_submissions(program_id);
CREATE INDEX IF NOT EXISTS ctd_sub_agency_idx ON ctd_submissions(target_agency);
CREATE INDEX IF NOT EXISTS ctd_sub_status_idx ON ctd_submissions(status);

-- 2.3 CTD Module Sections
CREATE TABLE IF NOT EXISTS ctd_module_sections (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES ctd_submissions(id) ON DELETE CASCADE,
  module ctd_module NOT NULL,
  section_code VARCHAR(30) NOT NULL,
  section_title TEXT NOT NULL,
  parent_section_id INTEGER,
  section_status VARCHAR(30) DEFAULT 'not_started',
  completion_percent INTEGER DEFAULT 0,
  assigned_to INTEGER REFERENCES users(id),
  due_date DATE,
  lifecycle_operation VARCHAR(20),
  previous_version_id INTEGER,
  region_specific_path TEXT,
  is_region_specific BOOLEAN DEFAULT FALSE,
  sort_order INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ctd_sec_submission_idx ON ctd_module_sections(submission_id);
CREATE INDEX IF NOT EXISTS ctd_sec_module_idx ON ctd_module_sections(module);
CREATE INDEX IF NOT EXISTS ctd_sec_code_idx ON ctd_module_sections(section_code);

-- 2.4 CTD Documents
CREATE TABLE IF NOT EXISTS ctd_documents (
  id SERIAL PRIMARY KEY,
  section_id INTEGER NOT NULL REFERENCES ctd_module_sections(id) ON DELETE CASCADE,
  document_title TEXT NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  file_name TEXT,
  file_size INTEGER,
  mime_type VARCHAR(100),
  checksum VARCHAR(128),
  version VARCHAR(20) DEFAULT '1.0',
  lifecycle_operation VARCHAR(20) DEFAULT 'new',
  effective_date DATE,
  extracted_text TEXT,
  page_count INTEGER,
  word_count INTEGER,
  storage_path TEXT,
  storage_provider VARCHAR(20),
  created_by INTEGER REFERENCES users(id),
  reviewed_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  status VARCHAR(30) DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ctd_doc_section_idx ON ctd_documents(section_id);
CREATE INDEX IF NOT EXISTS ctd_doc_type_idx ON ctd_documents(document_type);
CREATE INDEX IF NOT EXISTS ctd_doc_status_idx ON ctd_documents(status);

-- 2.5 CTD Cross-References
CREATE TABLE IF NOT EXISTS ctd_cross_references (
  id SERIAL PRIMARY KEY,
  source_section_id INTEGER REFERENCES ctd_module_sections(id),
  source_document_id INTEGER REFERENCES ctd_documents(id),
  target_section_id INTEGER REFERENCES ctd_module_sections(id),
  target_document_id INTEGER REFERENCES ctd_documents(id),
  target_study_id INTEGER REFERENCES csr_studies(id),
  reference_type VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ctd_xref_source_sec_idx ON ctd_cross_references(source_section_id);
CREATE INDEX IF NOT EXISTS ctd_xref_target_sec_idx ON ctd_cross_references(target_section_id);
CREATE INDEX IF NOT EXISTS ctd_xref_study_idx ON ctd_cross_references(target_study_id);

-- 2.6 CTD Quality Data (Module 3)
CREATE TABLE IF NOT EXISTS ctd_quality_data (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES ctd_programs(id) ON DELETE CASCADE,
  quality_section VARCHAR(30) NOT NULL,
  attribute TEXT NOT NULL,
  specification TEXT,
  test_method TEXT,
  acceptance_criteria TEXT,
  result_value TEXT,
  result_status VARCHAR(20),
  is_drug_substance BOOLEAN DEFAULT TRUE,
  batch_number VARCHAR(50),
  batch_scale VARCHAR(30),
  manufacturer TEXT,
  manufacturing_site TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ctd_qual_program_idx ON ctd_quality_data(program_id);
CREATE INDEX IF NOT EXISTS ctd_qual_section_idx ON ctd_quality_data(quality_section);

-- 2.7 CTD Nonclinical Studies (Module 4)
CREATE TABLE IF NOT EXISTS ctd_nonclinical_studies (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES ctd_programs(id) ON DELETE CASCADE,
  study_type VARCHAR(50) NOT NULL,
  study_title TEXT NOT NULL,
  species VARCHAR(50),
  strain VARCHAR(50),
  route_of_administration VARCHAR(50),
  duration_weeks INTEGER,
  glp_compliant BOOLEAN,
  noael TEXT,
  loael TEXT,
  mtd TEXT,
  key_findings TEXT,
  target_organ_toxicity JSONB,
  carcinogenicity_findings TEXT,
  genotoxicity_results TEXT,
  reproductive_toxicity TEXT,
  safety_margins JSONB,
  study_report_number VARCHAR(50),
  testing_facility TEXT,
  study_completion_date DATE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ctd_nonclin_program_idx ON ctd_nonclinical_studies(program_id);
CREATE INDEX IF NOT EXISTS ctd_nonclin_type_idx ON ctd_nonclinical_studies(study_type);

-- ============================================================================
-- LAYER 3: INTELLIGENCE & LEARNING
-- ============================================================================

-- 3.1 Cross-Study Comparisons
CREATE TABLE IF NOT EXISTS csr_cross_study_comparisons (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  comparison_title TEXT NOT NULL,
  comparison_type VARCHAR(50) NOT NULL,
  study_ids JSONB NOT NULL,
  study_count INTEGER NOT NULL,
  indication TEXT,
  therapeutic_area csr_therapeutic_area,
  comparison_endpoint TEXT,
  summary_findings TEXT,
  structured_results JSONB,
  forest_plot_data JSONB,
  pooled_effect_size REAL,
  heterogeneity_i2 REAL,
  methodology TEXT,
  limitations TEXT,
  generated_by VARCHAR(30),
  is_automated BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_compare_org_idx ON csr_cross_study_comparisons(organization_id);
CREATE INDEX IF NOT EXISTS csr_compare_ta_idx ON csr_cross_study_comparisons(therapeutic_area);

-- 3.2 Safety Signals
CREATE TABLE IF NOT EXISTS csr_safety_signals (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  signal_name TEXT NOT NULL,
  signal_description TEXT,
  status csr_signal_status NOT NULL,
  preferred_term TEXT,
  system_organ_class TEXT,
  meddra_code VARCHAR(20),
  molecule TEXT,
  molecule_class TEXT,
  source_study_ids JSONB,
  evidence_strength VARCHAR(20),
  disproportionality_score REAL,
  reporting_odds_ratio REAL,
  information_component REAL,
  background_incidence REAL,
  comparator_incidence REAL,
  is_class_effect BOOLEAN,
  is_dose_dependent BOOLEAN,
  action_taken TEXT,
  risk_mitigation TEXT,
  regulatory_notification BOOLEAN DEFAULT FALSE,
  detected_at TIMESTAMP,
  evaluated_at TIMESTAMP,
  closed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_signal_org_idx ON csr_safety_signals(organization_id);
CREATE INDEX IF NOT EXISTS csr_signal_status_idx ON csr_safety_signals(status);
CREATE INDEX IF NOT EXISTS csr_signal_pt_idx ON csr_safety_signals(preferred_term);
CREATE INDEX IF NOT EXISTS csr_signal_molecule_idx ON csr_safety_signals(molecule);

-- 3.3 Regulatory Intelligence
CREATE TABLE IF NOT EXISTS csr_regulatory_intelligence (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  agency csr_regulatory_agency NOT NULL,
  therapeutic_area csr_therapeutic_area,
  indication TEXT,
  molecule_type csr_molecule_type,
  phase csr_study_phase,
  intelligence_type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source_study_id INTEGER REFERENCES csr_studies(id),
  deficiency_category VARCHAR(100),
  agency_question TEXT,
  sponsor_response TEXT,
  resolution TEXT,
  impact_on_timeline VARCHAR(30),
  is_precedent_setting BOOLEAN DEFAULT FALSE,
  precedent_summary TEXT,
  applicable_guidances JSONB,
  tags JSONB,
  confidence REAL,
  embedding vector(1536),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_regintel_org_idx ON csr_regulatory_intelligence(organization_id);
CREATE INDEX IF NOT EXISTS csr_regintel_agency_idx ON csr_regulatory_intelligence(agency);
CREATE INDEX IF NOT EXISTS csr_regintel_ta_idx ON csr_regulatory_intelligence(therapeutic_area);
CREATE INDEX IF NOT EXISTS csr_regintel_type_idx ON csr_regulatory_intelligence(intelligence_type);

-- 3.4 Knowledge Graph Nodes
CREATE TABLE IF NOT EXISTS csr_knowledge_nodes (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  node_type VARCHAR(50) NOT NULL,
  node_name TEXT NOT NULL,
  normalized_name TEXT,
  description TEXT,
  external_id VARCHAR(200),
  ontology_source VARCHAR(50),
  properties JSONB,
  embedding vector(1536),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_kn_org_idx ON csr_knowledge_nodes(organization_id);
CREATE INDEX IF NOT EXISTS csr_kn_type_idx ON csr_knowledge_nodes(node_type);
CREATE INDEX IF NOT EXISTS csr_kn_name_idx ON csr_knowledge_nodes(normalized_name);

-- 3.5 Knowledge Graph Edges
CREATE TABLE IF NOT EXISTS csr_knowledge_edges (
  id SERIAL PRIMARY KEY,
  source_node_id INTEGER NOT NULL REFERENCES csr_knowledge_nodes(id) ON DELETE CASCADE,
  target_node_id INTEGER NOT NULL REFERENCES csr_knowledge_nodes(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL,
  weight REAL,
  confidence REAL,
  source_study_id INTEGER REFERENCES csr_studies(id),
  evidence_text TEXT,
  evidence_section_id INTEGER REFERENCES csr_sections(id),
  properties JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_ke_source_idx ON csr_knowledge_edges(source_node_id);
CREATE INDEX IF NOT EXISTS csr_ke_target_idx ON csr_knowledge_edges(target_node_id);
CREATE INDEX IF NOT EXISTS csr_ke_rel_idx ON csr_knowledge_edges(relationship_type);
CREATE INDEX IF NOT EXISTS csr_ke_study_idx ON csr_knowledge_edges(source_study_id);

-- 3.6 AI Training Data
CREATE TABLE IF NOT EXISTS csr_training_data (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  dataset_name VARCHAR(100) NOT NULL,
  data_type VARCHAR(50) NOT NULL,
  input_text TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  context TEXT,
  source_study_id INTEGER REFERENCES csr_studies(id),
  source_section_id INTEGER REFERENCES csr_sections(id),
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by INTEGER REFERENCES users(id),
  quality_score REAL,
  tags JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_td_org_idx ON csr_training_data(organization_id);
CREATE INDEX IF NOT EXISTS csr_td_dataset_idx ON csr_training_data(dataset_name);
CREATE INDEX IF NOT EXISTS csr_td_type_idx ON csr_training_data(data_type);

-- 3.7 AI Model Performance
CREATE TABLE IF NOT EXISTS csr_model_performance (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  model_name VARCHAR(100) NOT NULL,
  model_version VARCHAR(30) NOT NULL,
  task_type VARCHAR(50) NOT NULL,
  accuracy REAL,
  precision REAL,
  recall REAL,
  f1_score REAL,
  auc REAL,
  mse REAL,
  training_data_size INTEGER,
  validation_data_size INTEGER,
  test_data_size INTEGER,
  hyperparameters JSONB,
  evaluation_details JSONB,
  evaluated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_model_org_idx ON csr_model_performance(organization_id);
CREATE INDEX IF NOT EXISTS csr_model_name_idx ON csr_model_performance(model_name, model_version);
CREATE INDEX IF NOT EXISTS csr_model_task_idx ON csr_model_performance(task_type);

-- 3.8 Extraction Audit Log
CREATE TABLE IF NOT EXISTS csr_extraction_log (
  id SERIAL PRIMARY KEY,
  study_id INTEGER REFERENCES csr_studies(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  source_file TEXT,
  source_type VARCHAR(30) NOT NULL,
  extractor_version VARCHAR(20),
  status VARCHAR(20) NOT NULL,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  overall_confidence REAL,
  section_confidences JSONB,
  sections_extracted INTEGER,
  tables_extracted INTEGER,
  figures_extracted INTEGER,
  warning_count INTEGER,
  error_count INTEGER,
  warnings JSONB,
  errors JSONB,
  triggered_by INTEGER REFERENCES users(id),
  trigger_method VARCHAR(30),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csr_extlog_study_idx ON csr_extraction_log(study_id);
CREATE INDEX IF NOT EXISTS csr_extlog_org_idx ON csr_extraction_log(organization_id);
CREATE INDEX IF NOT EXISTS csr_extlog_status_idx ON csr_extraction_log(status);

-- ============================================================================
-- ROW-LEVEL SECURITY POLICIES (for multi-tenant isolation)
-- ============================================================================

-- Enable RLS on all new tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'csr_studies', 'csr_treatment_arms', 'csr_populations', 'csr_eligibility_criteria',
    'csr_endpoints', 'csr_endpoint_results', 'csr_adverse_events', 'csr_safety_summaries',
    'csr_pharmacokinetics', 'csr_dose_response', 'csr_biomarkers', 'csr_statistical_analyses',
    'csr_sections', 'csr_tables_and_figures', 'csr_references',
    'ctd_programs', 'ctd_submissions', 'ctd_module_sections', 'ctd_documents',
    'ctd_cross_references', 'ctd_quality_data', 'ctd_nonclinical_studies',
    'csr_cross_study_comparisons', 'csr_safety_signals', 'csr_regulatory_intelligence',
    'csr_knowledge_nodes', 'csr_knowledge_edges', 'csr_training_data',
    'csr_model_performance', 'csr_extraction_log'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Create RLS policies for tables with organization_id
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'csr_studies', 'ctd_programs', 'csr_cross_study_comparisons',
    'csr_safety_signals', 'csr_regulatory_intelligence', 'csr_knowledge_nodes',
    'csr_training_data', 'csr_model_performance', 'csr_extraction_log'
  ])
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (organization_id = current_setting(''app.current_org_id'', true)::int)',
      'rls_org_' || t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- COMMENTS (for schema documentation)
-- ============================================================================

COMMENT ON TABLE csr_studies IS 'Central fact table for every CSR study harvested. Links to all ICH E3 section data.';
COMMENT ON TABLE csr_treatment_arms IS 'Treatment arm definitions with dosing details per study.';
COMMENT ON TABLE csr_populations IS 'Study population demographics, disposition, and baseline characteristics.';
COMMENT ON TABLE csr_eligibility_criteria IS 'Individual inclusion/exclusion criteria with semantic embeddings for cross-study search.';
COMMENT ON TABLE csr_endpoints IS 'Endpoint definitions with statistical context per study.';
COMMENT ON TABLE csr_endpoint_results IS 'Arm-level quantitative results for each endpoint.';
COMMENT ON TABLE csr_adverse_events IS 'Individual adverse event records with MedDRA coding and incidence data.';
COMMENT ON TABLE csr_safety_summaries IS 'Aggregate safety data per study/arm (TEAE, SAE, deaths, labs).';
COMMENT ON TABLE csr_pharmacokinetics IS 'PK parameter values per arm (Cmax, AUC, t1/2, etc.).';
COMMENT ON TABLE csr_dose_response IS 'Dose-efficacy and dose-safety relationship data.';
COMMENT ON TABLE csr_biomarkers IS 'Biomarker measurements and clinical endpoint correlations.';
COMMENT ON TABLE csr_statistical_analyses IS 'Full SAP traceability: models, multiplicity, interim analyses.';
COMMENT ON TABLE csr_sections IS 'Raw section text from CSR documents with vector embeddings for RAG.';
COMMENT ON TABLE csr_tables_and_figures IS 'Extracted tables, figures, and listings with structured data.';
COMMENT ON TABLE csr_references IS 'Protocol, SAP, CRF, and literature references per study.';
COMMENT ON TABLE ctd_programs IS 'Drug development programs spanning multiple regulatory submissions.';
COMMENT ON TABLE ctd_submissions IS 'Individual regulatory submissions within a program.';
COMMENT ON TABLE ctd_module_sections IS 'Normalized CTD M1-M5 section tree per submission.';
COMMENT ON TABLE ctd_documents IS 'Individual documents within CTD sections.';
COMMENT ON TABLE ctd_cross_references IS 'Links between CTD sections, documents, and CSR studies.';
COMMENT ON TABLE ctd_quality_data IS 'Module 3 drug substance/product quality specifications.';
COMMENT ON TABLE ctd_nonclinical_studies IS 'Module 4 nonclinical study summaries (tox, pharm).';
COMMENT ON TABLE csr_cross_study_comparisons IS 'Cross-study analytics and meta-analysis results.';
COMMENT ON TABLE csr_safety_signals IS 'Safety signal detection and evaluation tracking.';
COMMENT ON TABLE csr_regulatory_intelligence IS 'Agency feedback, precedents, and deficiency patterns.';
COMMENT ON TABLE csr_knowledge_nodes IS 'Knowledge graph entities for relationship mapping.';
COMMENT ON TABLE csr_knowledge_edges IS 'Knowledge graph relationships with provenance.';
COMMENT ON TABLE csr_training_data IS 'Curated Q&A pairs for fine-tuning intelligence engines.';
COMMENT ON TABLE csr_model_performance IS 'AI model accuracy and performance tracking over time.';
COMMENT ON TABLE csr_extraction_log IS 'Extraction event audit log with quality metrics.';
