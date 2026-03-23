-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Regulatory Precedent Intelligence Engine
-- Date: 2026-03-22
-- Description: CRL/RTF trigger patterns, EMA question taxonomy, AC risk factors,
--              cross-jurisdictional intelligence, reliance pathways, confidence calibration
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Schema ──────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS regulatory_intel;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. CRL TRIGGER PATTERNS & TRAJECTORY ANALYSIS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS regulatory_intel.crl_trigger_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Pattern identity
  pattern_code TEXT NOT NULL,
  pattern_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'clinical_efficacy', 'clinical_safety', 'clinical_design',
    'cmc_quality', 'cmc_manufacturing', 'cmc_stability',
    'nonclinical', 'biostatistics', 'labeling',
    'pharmacology', 'rems', 'pediatric', 'postmarket'
  )),

  -- Pattern details
  trigger_description TEXT NOT NULL,
  deficiency_signals JSONB NOT NULL DEFAULT '[]',  -- [{signal_type, severity, description}]
  typical_fda_language TEXT[],  -- Exact phrases FDA uses in CRLs

  -- Risk metrics
  frequency_rate NUMERIC(5,4),  -- How often this pattern appears in CRLs (0-1)
  resolution_difficulty TEXT CHECK (resolution_difficulty IN ('low', 'moderate', 'high', 'very_high')),
  avg_cycles_to_resolve NUMERIC(3,1),  -- Average CRL cycles needed to resolve
  resolution_success_rate NUMERIC(5,4),  -- Probability of eventual resolution

  -- Context
  therapeutic_areas TEXT[],
  submission_types TEXT[],
  applicable_divisions TEXT[],  -- FDA divisions where pattern is most common

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regulatory_intel.crl_trajectory_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Submission identity
  application_number TEXT,
  applicant TEXT,
  product_name TEXT,
  submission_type TEXT NOT NULL,
  therapeutic_area TEXT,
  indication TEXT,

  -- CRL cycle tracking
  crl_cycle_number INTEGER NOT NULL DEFAULT 1,
  crl_issue_date DATE,
  resubmission_date DATE,

  -- Deficiencies
  deficiency_categories TEXT[] NOT NULL DEFAULT '{}',
  deficiency_details JSONB NOT NULL DEFAULT '[]',  -- [{category, description, severity, resolved}]
  trigger_pattern_ids UUID[],  -- Links to crl_trigger_patterns

  -- Resolution
  resolution_status TEXT CHECK (resolution_status IN (
    'pending', 'partially_resolved', 'fully_resolved', 'escalated', 'withdrawn'
  )),
  resolution_strategy TEXT,

  -- Outcome
  final_outcome TEXT CHECK (final_outcome IN (
    'approved', 'approved_with_conditions', 'withdrawn', 'refused', 'pending'
  )),
  total_cycles INTEGER,
  total_duration_days INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. RTF TRIGGER PATTERNS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS regulatory_intel.rtf_trigger_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  pattern_code TEXT NOT NULL,
  pattern_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'administrative', 'content_completeness', 'format_compliance',
    'scientific_adequacy', 'gmp_compliance', 'clinical_data',
    'nonclinical_data', 'cmc_data', 'bioequivalence',
    'environmental_assessment', 'patent_certification', 'user_fee'
  )),

  trigger_description TEXT NOT NULL,
  typical_fda_language TEXT[],

  -- Risk metrics
  frequency_rate NUMERIC(5,4),
  preventability TEXT CHECK (preventability IN ('highly_preventable', 'preventable', 'partially_preventable', 'difficult')),
  recovery_timeline_days INTEGER,  -- Typical time to fix and resubmit

  -- Recovery playbook
  recovery_steps JSONB NOT NULL DEFAULT '[]',  -- [{step_number, action, details, timeline}]
  common_mistakes TEXT[],  -- What applicants typically get wrong in recovery

  -- Submission context
  submission_types TEXT[],
  applicable_centers TEXT[],  -- CDER, CBER, CDRH

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. EMA QUESTION PATTERN TAXONOMY
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS regulatory_intel.ema_question_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  pattern_code TEXT NOT NULL,
  pattern_name TEXT NOT NULL,

  -- Procedure phase
  procedure_phase TEXT NOT NULL CHECK (procedure_phase IN (
    'day_80', 'day_120', 'day_150', 'day_180',
    'clock_stop_1', 'clock_stop_2',
    'oral_explanation', 'post_opinion'
  )),
  procedure_type TEXT CHECK (procedure_type IN (
    'centralised', 'decentralised', 'mutual_recognition', 'national', 'type_ii_variation'
  )),

  -- Question classification
  question_category TEXT NOT NULL CHECK (question_category IN (
    'clinical_efficacy', 'clinical_safety', 'clinical_pharmacology',
    'quality_cmc', 'nonclinical', 'biostatistics',
    'risk_management', 'pharmacovigilance', 'labeling_spc',
    'environmental_risk', 'gmp_compliance', 'pediatric',
    'conditional_approval', 'biosimilarity'
  )),
  question_type TEXT CHECK (question_type IN (
    'major_objection', 'other_concern', 'recommendation', 'point_to_consider'
  )),

  -- Pattern content
  typical_chmp_language TEXT[],
  question_template TEXT,
  expected_response_format TEXT,

  -- Metrics
  frequency_rate NUMERIC(5,4),
  escalation_risk NUMERIC(5,4),  -- Risk this becomes a major objection
  clock_stop_probability NUMERIC(5,4),  -- Probability of triggering clock stop

  -- Context
  therapeutic_areas TEXT[],
  rapporteur_countries TEXT[],  -- Countries whose rapporteurs frequently raise this

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. ADVISORY COMMITTEE RISK FACTORS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS regulatory_intel.advisory_committee_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  pattern_code TEXT NOT NULL,
  pattern_name TEXT NOT NULL,
  committee_type TEXT NOT NULL,  -- ODAC, CRDAC, EMDAC, PCNS-AC, etc.

  -- Risk factor classification
  risk_category TEXT NOT NULL CHECK (risk_category IN (
    'safety_signal', 'efficacy_uncertainty', 'benefit_risk_balance',
    'surrogate_endpoint', 'single_trial', 'subgroup_effects',
    'comparator_choice', 'missing_data', 'unmet_need',
    'pediatric_extrapolation', 'real_world_evidence', 'accelerated_conversion',
    'biosimilar_interchangeability', 'labeling_scope'
  )),

  -- Question patterns
  typical_questions TEXT[],
  voting_question_templates TEXT[],

  -- Historical metrics
  historical_frequency NUMERIC(5,4),
  negative_vote_correlation NUMERIC(5,4),  -- Correlation with unfavorable vote
  fda_override_rate NUMERIC(5,4),  -- How often FDA overrides AC on this issue

  -- Panelist modeling
  panelist_sensitivity JSONB DEFAULT '{}',  -- {specialty: sensitivity_score}
  consumer_rep_impact NUMERIC(5,4),  -- Patient representative influence
  statistician_focus_areas TEXT[],

  -- Preparation guidance
  mitigation_strategies TEXT[],
  recommended_presentations TEXT[],
  counterargument_frameworks JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. PRECEDENT APPLICATION RULES WITH CONFIDENCE CALIBRATION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS regulatory_intel.precedent_application_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  rule_code TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'direct_precedent', 'analogous_precedent', 'negative_precedent',
    'procedural_precedent', 'scientific_precedent', 'policy_precedent'
  )),

  -- Rule definition
  description TEXT NOT NULL,
  applicability_criteria JSONB NOT NULL DEFAULT '{}',  -- Conditions under which rule applies
  weight_factors JSONB NOT NULL DEFAULT '{}',  -- Factors that increase/decrease rule weight

  -- Confidence calibration
  base_confidence NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  confidence_modifiers JSONB NOT NULL DEFAULT '[]',  -- [{condition, modifier, direction}]
  minimum_precedent_count INTEGER DEFAULT 3,  -- Min precedents needed for rule to fire
  recency_decay_halflife_days INTEGER DEFAULT 730,  -- 2-year half-life for recency weighting

  -- Jurisdiction applicability
  applicable_agencies TEXT[],
  cross_jurisdictional BOOLEAN DEFAULT FALSE,

  -- Validation
  backtested_accuracy NUMERIC(5,4),  -- Historical accuracy when applied retroactively
  last_validated DATE,
  validation_sample_size INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regulatory_intel.confidence_calibration_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  rule_id UUID REFERENCES regulatory_intel.precedent_application_rules(id),
  prediction_id UUID,

  -- Prediction
  predicted_outcome TEXT NOT NULL,
  predicted_confidence NUMERIC(5,4) NOT NULL,

  -- Actual
  actual_outcome TEXT,
  outcome_date DATE,

  -- Calibration metrics
  brier_score NUMERIC(7,6),  -- Quadratic scoring rule
  calibration_bucket TEXT,  -- e.g., '0.7-0.8'

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. CROSS-JURISDICTIONAL INTELLIGENCE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS regulatory_intel.cross_jurisdictional_frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  framework_code TEXT NOT NULL,
  framework_name TEXT NOT NULL,
  framework_type TEXT NOT NULL CHECK (framework_type IN (
    'ich', 'access_consortium', 'project_orbis', 'mutual_recognition',
    'work_sharing', 'reliance', 'recognition', 'bilateral', 'regional_harmonization'
  )),

  -- Participating agencies
  member_agencies TEXT[] NOT NULL,
  lead_agency TEXT,

  -- Framework details
  description TEXT NOT NULL,
  scope TEXT[],  -- Product types covered
  eligibility_criteria JSONB DEFAULT '{}',

  -- Timeline intelligence
  parallel_review_savings_days INTEGER,
  typical_timeline_days INTEGER,
  submission_sequence JSONB DEFAULT '[]',  -- [{agency, submit_day, decision_day}]

  -- Operational details
  data_sharing_mechanism TEXT,
  common_dossier_requirements JSONB DEFAULT '{}',
  agency_specific_addenda JSONB DEFAULT '{}',  -- {agency_code: [additional_requirements]}

  active BOOLEAN DEFAULT TRUE,
  effective_date DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regulatory_intel.jurisdictional_divergence_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Comparison axis
  domain TEXT NOT NULL CHECK (domain IN (
    'clinical_endpoints', 'clinical_design', 'clinical_populations',
    'safety_requirements', 'cmc_specifications', 'cmc_stability',
    'nonclinical_requirements', 'bioequivalence', 'biosimilarity',
    'labeling', 'pharmacovigilance', 'pediatric', 'orphan',
    'real_world_evidence', 'decentralized_trials', 'digital_endpoints'
  )),

  -- Agencies being compared
  agency_a TEXT NOT NULL,
  agency_b TEXT NOT NULL,

  -- Divergence details
  requirement_a TEXT NOT NULL,
  requirement_b TEXT NOT NULL,
  divergence_severity TEXT CHECK (divergence_severity IN ('minor', 'moderate', 'major', 'critical')),
  divergence_description TEXT NOT NULL,

  -- Impact assessment
  impact_on_development TEXT,
  bridging_study_required BOOLEAN DEFAULT FALSE,
  bridging_study_details TEXT,
  additional_data_required JSONB DEFAULT '[]',

  -- Resolution strategies
  harmonization_approach TEXT,
  recommended_strategy TEXT,

  -- Applicable context
  therapeutic_areas TEXT[],
  product_types TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regulatory_intel.reliance_pathways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  pathway_code TEXT NOT NULL,
  pathway_name TEXT NOT NULL,

  -- Reference & relying agencies
  reference_agency TEXT NOT NULL,  -- Agency whose decision is relied upon
  relying_agency TEXT NOT NULL,  -- Agency that relies on the reference
  reliance_type TEXT NOT NULL CHECK (reliance_type IN (
    'full_recognition', 'abridged_review', 'verification', 'collaborative_review', 'work_sharing'
  )),

  -- Operational details
  eligible_product_types TEXT[],
  prerequisite_approval BOOLEAN DEFAULT TRUE,  -- Must reference agency approve first?
  additional_local_requirements JSONB DEFAULT '[]',
  local_data_requirements JSONB DEFAULT '[]',

  -- Timeline
  typical_timeline_days INTEGER,
  timeline_vs_standalone_savings INTEGER,  -- Days saved vs. standalone submission

  -- Success metrics
  historical_approval_rate NUMERIC(5,4),
  rejection_reasons TEXT[],

  active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regulatory_intel.filing_sequence_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  strategy_code TEXT NOT NULL,
  strategy_name TEXT NOT NULL,
  product_type TEXT NOT NULL,
  therapeutic_area TEXT,

  -- Sequence definition
  filing_sequence JSONB NOT NULL,  -- [{step, agency, submission_type, day, dependencies}]
  total_agencies INTEGER NOT NULL,

  -- Timeline
  estimated_total_days INTEGER,
  critical_path_agencies TEXT[],
  parallel_windows JSONB DEFAULT '[]',  -- [{agencies: [], start_day, end_day}]

  -- Optimization factors
  revenue_optimization_score NUMERIC(5,4),  -- How well this optimizes for early revenue
  risk_mitigation_score NUMERIC(5,4),  -- How well this mitigates regulatory risk
  resource_efficiency_score NUMERIC(5,4),  -- How efficient resource use is

  -- Requirements
  bridging_studies_needed JSONB DEFAULT '[]',
  translation_requirements JSONB DEFAULT '{}',
  local_agent_requirements TEXT[],

  -- Confidence
  confidence_score NUMERIC(5,4),
  based_on_precedent_count INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_crl_trigger_org ON regulatory_intel.crl_trigger_patterns(organization_id);
CREATE INDEX IF NOT EXISTS idx_crl_trigger_category ON regulatory_intel.crl_trigger_patterns(category);
CREATE INDEX IF NOT EXISTS idx_crl_trajectory_org ON regulatory_intel.crl_trajectory_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_crl_trajectory_app ON regulatory_intel.crl_trajectory_records(application_number);
CREATE INDEX IF NOT EXISTS idx_rtf_trigger_org ON regulatory_intel.rtf_trigger_patterns(organization_id);
CREATE INDEX IF NOT EXISTS idx_rtf_trigger_category ON regulatory_intel.rtf_trigger_patterns(category);
CREATE INDEX IF NOT EXISTS idx_ema_question_org ON regulatory_intel.ema_question_patterns(organization_id);
CREATE INDEX IF NOT EXISTS idx_ema_question_phase ON regulatory_intel.ema_question_patterns(procedure_phase);
CREATE INDEX IF NOT EXISTS idx_ac_patterns_org ON regulatory_intel.advisory_committee_patterns(organization_id);
CREATE INDEX IF NOT EXISTS idx_ac_patterns_committee ON regulatory_intel.advisory_committee_patterns(committee_type);
CREATE INDEX IF NOT EXISTS idx_precedent_rules_org ON regulatory_intel.precedent_application_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_confidence_log_org ON regulatory_intel.confidence_calibration_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_confidence_log_rule ON regulatory_intel.confidence_calibration_log(rule_id);
CREATE INDEX IF NOT EXISTS idx_xjuris_frameworks_org ON regulatory_intel.cross_jurisdictional_frameworks(organization_id);
CREATE INDEX IF NOT EXISTS idx_divergence_map_org ON regulatory_intel.jurisdictional_divergence_map(organization_id);
CREATE INDEX IF NOT EXISTS idx_divergence_map_agencies ON regulatory_intel.jurisdictional_divergence_map(agency_a, agency_b);
CREATE INDEX IF NOT EXISTS idx_reliance_pathways_org ON regulatory_intel.reliance_pathways(organization_id);
CREATE INDEX IF NOT EXISTS idx_reliance_pathways_agencies ON regulatory_intel.reliance_pathways(reference_agency, relying_agency);
CREATE INDEX IF NOT EXISTS idx_filing_sequence_org ON regulatory_intel.filing_sequence_strategies(organization_id);
