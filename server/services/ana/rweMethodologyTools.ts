/**
 * Real-World Evidence (RWE) methodology tools — exposes the deterministic
 * RWE/RWD knowledge engines in `server/services/rwe/rwe-methodology-knowledge.ts`
 * to AnA as first-class, selectable tools.
 *
 * These engines encode the full spectrum of regulatory-grade RWE methodological
 * guidance: target trial emulation (Hernan/Robins), data source adequacy scoring
 * (FDA RWE Framework dimensions), propensity score methodology selection,
 * study design pattern selection, bias framework assessment with E-value and
 * quantitative bias analysis, and regulatory acceptability assessment across
 * FDA, EMA, PMDA, and Health Canada pathways. Each tool is a thin, validated
 * wrapper over a pure deterministic engine — no LLM, no network calls. The output
 * is reproducible and submission-defensible. Handlers live in AnaToolExecutor.ts
 * (registerToolHandler) and dynamic-import `../rwe/rwe-methodology-knowledge`
 * through the runStatsTool deterministic envelope.
 *
 * Tools:
 *   design_target_trial                — Target trial emulation protocol (Hernan/Robins)
 *   score_rwe_data_source              — RWD data source adequacy scoring (FDA relevance/reliability)
 *   design_propensity_analysis         — PS method selection + diagnostics plan
 *   select_rwe_design                  — RWE study design selection (cohort, NCC, SCCS, DiD, IV, etc.)
 *   assess_rwe_bias_risk               — Bias framework assessment with sensitivity analyses
 *   assess_rwe_regulatory_acceptability — Regulatory pathway & acceptability for RWE submissions
 *
 * Key references:
 *   - FDA. Framework for FDA's Real-World Evidence Program. December 2018.
 *   - ICH E8(R1). General Considerations for Clinical Studies. October 2021.
 *   - ISPE/ISPOR. Good Practices for RWD Studies. 2017.
 *   - EMA. DARWIN EU: Data Analysis and Real World Interrogation Network. 2022.
 *   - Hernan MA, Robins JM. Causal Inference: What If. Chapman & Hall/CRC, 2020.
 *
 * @module server/services/ana/rweMethodologyTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Target Trial Emulation
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_TARGET_TRIAL: AnaTool = {
  name: 'design_target_trial',
  description:
    'Generate a complete target trial emulation protocol following the Hernan/Robins causal inference framework (Causal Inference: What If, 2020). ' +
    'Maps each of the seven protocol components (eligibility, treatment strategies, treatment assignment, follow-up, outcome, causal contrast, analysis plan) from the hypothetical randomized trial to their observational data analogs, identifies design-level biases (immortal time bias per Suissa 2008, prevalent user bias per Ray 2003, time-zero misalignment, confounding by indication), and produces a pre-registration-ready protocol template with bias mitigations and an emulation checklist. ' +
    'Use when designing any comparative effectiveness or safety study from RWD that requires causal inference — the target trial framework is the methodological standard endorsed by FDA (RWE Framework 2018), ICH E8(R1), and ISPE/ISPOR good practices. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      indication: {
        type: 'string',
        description: 'Clinical indication or disease under study (e.g., "type 2 diabetes mellitus", "HR+/HER2- metastatic breast cancer").',
      },
      treatmentStrategy: {
        type: 'string',
        enum: ['point_intervention', 'sustained_use', 'treatment_strategy_comparison', 'dynamic_regime'],
        description: 'Type of treatment strategy: "point_intervention" (single procedure/administration), "sustained_use" (ongoing medication with dispensing-based exposure measurement), "treatment_strategy_comparison" (active-comparator new-user head-to-head), or "dynamic_regime" (time-varying treatment rule based on biomarker thresholds, requiring g-methods for analysis).',
      },
      comparator: {
        type: 'string',
        description: 'Comparator strategy (e.g., "placebo", "standard of care", an active comparator drug name). For active-comparator designs, name the specific alternative treatment.',
      },
      primaryOutcome: {
        type: 'string',
        description: 'Primary outcome of interest (e.g., "major adverse cardiovascular events (MACE)", "progression-free survival", "HbA1c reduction at 12 months").',
      },
      causalContrast: {
        type: 'string',
        enum: ['intention_to_treat', 'per_protocol', 'as_treated'],
        description: 'Causal estimand: "intention_to_treat" (follow regardless of treatment changes), "per_protocol" (censor at protocol deviation, apply IPCW to adjust for informative censoring), or "as_treated" (follow actual treatment received, susceptible to time-varying confounding).',
      },
      maxFollowUpMonths: {
        type: 'number',
        description: 'Maximum follow-up duration in months (must be > 0). Determines the observation window for outcome ascertainment.',
      },
      therapeuticArea: {
        type: 'string',
        description: 'Optional therapeutic area for context-specific guidance (e.g., "oncology", "cardiology", "endocrinology").',
      },
    },
    required: ['indication', 'treatmentStrategy', 'comparator', 'primaryOutcome', 'causalContrast', 'maxFollowUpMonths'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Data Source Adequacy Scoring
// ─────────────────────────────────────────────────────────────────────────────

export const SCORE_RWE_DATA_SOURCE: AnaTool = {
  name: 'score_rwe_data_source',
  description:
    'Score a real-world data source across six FDA-aligned quality dimensions (completeness, accuracy, linkage, longitudinality, sample size, data capture breadth) with dimension-specific weights that adapt to the study question type per the FDA RWE Framework (2018) data relevance and data reliability requirements. ' +
    'Returns a weighted overall fitness-for-purpose score (0-100), per-dimension scores with identified gaps and actionable recommendations, source-type-specific strengths and limitations, and a regulatory acceptability assessment covering FDA data relevance, data reliability, and data governance requirements per the FDA Draft Guidance on RWD (2021). ' +
    'Use when evaluating whether a specific RWD source (claims, EHR, registry, biobank, linked claims-EHR, or integrated delivery network) is adequate for a planned regulatory-grade study — this is a prerequisite step under the FDA RWE Framework 2018 and EMA DARWIN EU methodology. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      sourceType: {
        type: 'string',
        enum: ['claims', 'ehr', 'registry', 'biobank', 'linked_claims_ehr', 'integrated_delivery_network'],
        description: 'Type of real-world data source being evaluated.',
      },
      studyQuestion: {
        type: 'string',
        enum: ['effectiveness', 'safety', 'natural_history', 'treatment_patterns', 'burden_of_illness', 'label_expansion'],
        description: 'Type of study question — determines the weighting of quality dimensions (e.g., safety studies weight longitudinality and linkage higher; treatment_patterns studies weight completeness and data capture higher).',
      },
      estimatedSampleSize: {
        type: 'number',
        description: 'Estimated number of patients available in the source for the study population (must be >= 0). Scored against benchmarks: >= 10,000 is excellent; < 1,000 may limit PS methods and subgroup analyses.',
      },
      longitudinalYears: {
        type: 'number',
        description: 'Years of longitudinal data available in the source (must be >= 0). Scored against a 10-year benchmark; < 3 years may be insufficient for long-latency outcomes.',
      },
      deathLinkage: {
        type: 'boolean',
        description: 'Whether the source is linked to death records (e.g., National Death Index, state death registries). Critical for mortality outcomes and identifying informative censoring from death.',
      },
      hasLabResults: {
        type: 'boolean',
        description: 'Whether the source captures structured laboratory results (e.g., HbA1c, creatinine, biomarkers). Essential for lab-based outcomes and biomarker-based eligibility criteria.',
      },
      hasClinicalNotes: {
        type: 'boolean',
        description: 'Whether the source captures unstructured clinical notes that can be used for NLP-based variable extraction or chart review validation.',
      },
      hasPharmacyDispensing: {
        type: 'boolean',
        description: 'Whether the source captures pharmacy dispensing/fill records (not just prescribing orders). Essential for reliable medication exposure measurement via PDC/MPR.',
      },
      hasProcedures: {
        type: 'boolean',
        description: 'Whether the source captures procedure codes (CPT, ICD-10-PCS, HCPCS).',
      },
      hasValidationStudy: {
        type: 'boolean',
        description: 'Whether a published or internal validation study exists for the key variable definitions (outcome and exposure algorithms) in this data source. FDA strongly recommends validated variable definitions.',
      },
      continuousEnrollmentPct: {
        type: 'number',
        description: 'Percentage of patients with continuous enrollment >= 12 months (0-100). Measures patient retention and data completeness; < 70% indicates high attrition risk.',
      },
      geographicCoverage: {
        type: 'string',
        enum: ['national', 'regional', 'single_site'],
        description: 'Geographic coverage of the data source. National sources offer better generalizability; single-site sources may have richer clinical detail but limited representativeness.',
      },
    },
    required: [
      'sourceType', 'studyQuestion', 'estimatedSampleSize', 'longitudinalYears',
      'deathLinkage', 'hasLabResults', 'hasClinicalNotes', 'hasPharmacyDispensing',
      'hasProcedures', 'hasValidationStudy', 'continuousEnrollmentPct', 'geographicCoverage',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Propensity Score Methodology
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_PROPENSITY_ANALYSIS: AnaTool = {
  name: 'design_propensity_analysis',
  description:
    'Select the optimal propensity score estimation method (logistic regression, GBM, LASSO) and application method (1:1 matching, 1:k matching, IPTW, overlap weights, stratification, doubly robust) based on sample size, confounder dimensionality, treatment prevalence, outcome rarity, clinical equipoise, and the target estimand (ATT, ATE, or ATO per Li et al. 2019). ' +
    'Returns a primary recommendation with rationale, ranked alternatives, a complete diagnostics plan (SMD < 0.1 threshold per Austin 2011, variance ratios, positivity assessment per Petersen et al. 2012, effective sample size, C-statistic interpretation, negative control outcomes per Schuemie et al. 2020), pre-specified sensitivity analyses (E-value per VanderWeele & Ding 2017, alternative PS methods, trimming thresholds, hdPS, quantitative bias analysis per Lash et al. 2009), and trimming strategy guidance. ' +
    'Use when planning the confounding adjustment strategy for any observational comparative study — this is a required component of the statistical analysis plan for regulatory-grade RWE. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      sampleSize: {
        type: 'number',
        description: 'Total study sample size (treated + comparator combined). Must be > 0.',
      },
      nConfounders: {
        type: 'number',
        description: 'Number of measured confounders available for PS model specification. Must be > 0. Drives estimation method selection: <= 30 favors logistic regression, 31-100 favors GBM, > 100 favors LASSO/hdPS.',
      },
      treatmentPrevalence: {
        type: 'number',
        description: 'Approximate proportion of the study population receiving the treatment of interest (strictly between 0 and 1, exclusive). Extreme values (< 0.1 or > 0.9) trigger overlap concerns and alternative trimming/weighting strategies.',
      },
      rareOutcome: {
        type: 'boolean',
        description: 'Whether the primary outcome is rare (< 5% event rate). Rare outcomes may favor 1:k matching (k=3-5) to increase comparator events and statistical power.',
      },
      clinicalEquipoise: {
        type: 'boolean',
        description: 'Whether there is genuine clinical equipoise (true) vs. strong channeling where sicker patients are systematically directed to one treatment (false). Affects PS application method selection and overlap weight suitability.',
      },
      targetEstimand: {
        type: 'string',
        enum: ['att', 'ate', 'ato'],
        description: 'Target causal estimand: "att" (Average Treatment effect on the Treated — effect in those who actually received treatment, targeted by PS matching), "ate" (Average Treatment Effect — effect across the entire eligible population, targeted by IPTW), or "ato" (Average Treatment effect in the Overlap population — effect in patients with clinical equipoise, targeted by overlap weights).',
      },
      timeVaryingConfounding: {
        type: 'boolean',
        description: 'Whether time-varying confounding is a concern (e.g., time-varying treatment with time-varying covariates that are both confounders and mediators). If true, marginal structural models with stabilized IPTW are recommended; standard PS matching is insufficient.',
      },
    },
    required: ['sampleSize', 'nConfounders', 'treatmentPrevalence', 'rareOutcome', 'clinicalEquipoise', 'targetEstimand', 'timeVaryingConfounding'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Study Design Selection
// ─────────────────────────────────────────────────────────────────────────────

export const SELECT_RWE_DESIGN: AnaTool = {
  name: 'select_rwe_design',
  description:
    'Select the optimal RWE study design from a catalog of nine epidemiologic designs (new-user active-comparator cohort, prevalent-user cohort, nested case-control, self-controlled case series, self-controlled risk interval, interrupted time series, difference-in-differences, regression discontinuity, instrumental variable) based on the causal question type, outcome characteristics, and data features. ' +
    'Returns the primary design recommendation with strengths, limitations, and bias considerations; ranked alternative designs; a selection rationale grounded in the Hernan/Robins causal inference framework; and a design-specific implementation checklist. The new-user active-comparator design is the default for treatment effect questions per FDA RWE Framework 2018 guidance; quasi-experimental designs (DiD, ITS, RD) are recommended when natural experiments exist; self-controlled designs (SCCS, SCRI) are recommended for acute outcomes per ISPE guidelines. ' +
    'Use when choosing between observational study architectures for treatment effect estimation, safety signal detection, or policy impact evaluation. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      questionType: {
        type: 'string',
        enum: ['treatment_effect', 'safety_signal', 'policy_impact', 'dose_response'],
        description: 'Type of causal question being addressed. "treatment_effect" and "dose_response" default toward cohort designs; "safety_signal" favors case-control or self-controlled designs for rare outcomes; "policy_impact" favors quasi-experimental designs (DiD, ITS, RD).',
      },
      timeVaryingExposure: {
        type: 'boolean',
        description: 'Whether the exposure of interest varies over time (e.g., ongoing medication use with dose changes, treatment switching). Time-varying exposures require special analytic methods (g-methods, marginal structural models).',
      },
      rareOutcome: {
        type: 'boolean',
        description: 'Whether the outcome is rare (< 1 per 1,000 person-years). Rare outcomes favor nested case-control sampling for computational efficiency and self-controlled designs that only require cases.',
      },
      acuteOutcome: {
        type: 'boolean',
        description: 'Whether the outcome is acute/transient (occurs within days to weeks of exposure onset, e.g., anaphylaxis, acute MI, Guillain-Barre syndrome). Acute outcomes are well-suited to self-controlled designs (SCCS per Farrington, SCRI) that compare risk within exposed time windows.',
      },
      naturalExperiment: {
        type: 'boolean',
        description: 'Whether a natural experiment, policy change, or quasi-random assignment mechanism exists (e.g., formulary change, geographic variation in practice patterns, age-based eligibility threshold). Enables quasi-experimental designs with stronger causal identification than standard PS adjustment.',
      },
      withinPersonComparison: {
        type: 'boolean',
        description: 'Whether within-person comparison is feasible (the outcome is recurrent or transient, and the same individual can serve as their own control across exposed and unexposed time periods). Eliminates all time-invariant confounding.',
      },
      strongConfoundingConcern: {
        type: 'boolean',
        description: 'Whether unmeasured confounding is a major concern that standard propensity score methods may be insufficient to address. If true, designs that inherently control for unmeasured confounders (self-controlled, IV, RD) are prioritized.',
      },
    },
    required: ['questionType', 'timeVaryingExposure', 'rareOutcome', 'acuteOutcome', 'naturalExperiment', 'withinPersonComparison', 'strongConfoundingConcern'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Bias Framework Assessment
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_RWE_BIAS_RISK: AnaTool = {
  name: 'assess_rwe_bias_risk',
  description:
    'Assess the bias risk profile of an RWE study across three epidemiologic domains (selection bias, information bias, confounding) with specific bias identification, direction-of-bias assessment (toward null, away from null, unpredictable), severity grading (high/moderate/low), and actionable mitigation strategies referencing the primary literature. ' +
    'Returns an itemized bias inventory, an overall bias risk grade, a tailored sensitivity analysis plan (E-value per VanderWeele & Ding 2017, negative control outcomes/exposures per Schuemie et al. 2020, probabilistic bias analysis per Lash et al. 2009, multiple PS methods), and — when an observed effect estimate with confidence interval is provided — computes the E-value to quantify the minimum strength of unmeasured confounding needed to explain away the observed association. ' +
    'Use when conducting or reviewing a bias assessment for any RWE study — this is a required component of the FDA RWE Framework 2018, ISPE/ISPOR reporting guidelines (RECORD-PE, REPEAT, HARPER), and EMA DARWIN EU study protocols. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      studyDesign: {
        type: 'string',
        enum: [
          'new_user_active_comparator', 'prevalent_user_cohort', 'nested_case_control',
          'self_controlled_case_series', 'self_controlled_risk_interval',
          'interrupted_time_series', 'difference_in_differences',
          'regression_discontinuity', 'instrumental_variable',
        ],
        description: 'Study design used. Design choice determines which biases are structurally addressed and which remain threats (e.g., new-user designs mitigate prevalent user bias; self-controlled designs eliminate time-invariant confounding).',
      },
      exposureType: {
        type: 'string',
        enum: ['drug', 'vaccine', 'procedure', 'device', 'policy'],
        description: 'Type of exposure under study. Affects which information biases are relevant (e.g., drug exposure from claims vs. EHR has different misclassification profiles; vaccine exposure from immunization registries is typically well-captured).',
      },
      dataSource: {
        type: 'string',
        enum: ['claims', 'ehr', 'registry', 'biobank', 'linked_claims_ehr', 'integrated_delivery_network'],
        description: 'Data source type. Claims data introduces outcome misclassification concerns from billing codes; EHR data introduces medication adherence measurement concerns; registries have selection bias from voluntary enrollment.',
      },
      selfReportedOutcome: {
        type: 'boolean',
        description: 'Whether the primary outcome is self-reported (e.g., patient-reported symptoms, PRO instruments). Self-reported outcomes introduce recall and social desirability biases not present with objectively measured outcomes.',
      },
      differentialSurveillance: {
        type: 'boolean',
        description: 'Whether there is likely differential healthcare utilization or surveillance intensity between treatment groups (e.g., newly treated patients have more frequent visits, leading to greater outcome detection in that group).',
      },
      nUnmeasuredConfounders: {
        type: 'number',
        description: 'Estimated number of potentially influential confounders not captured in the data source (e.g., disease severity, frailty, OTC medication use, lifestyle factors, patient preferences). >= 3 triggers high unmeasured confounding risk.',
      },
      hasActiveComparator: {
        type: 'boolean',
        description: 'Whether an active comparator (another treatment for the same indication) is used. Absence of an active comparator creates high risk of confounding by indication (treated vs. untreated patients differ systematically).',
      },
      observedEffectEstimate: {
        type: 'number',
        description: 'Optional observed hazard ratio, risk ratio, or odds ratio point estimate. When provided with observedCILower, enables E-value computation per VanderWeele & Ding (2017) to quantify robustness to unmeasured confounding.',
      },
      observedCILower: {
        type: 'number',
        description: 'Optional lower bound of the 95% confidence interval for the effect estimate (the bound closest to the null). Used together with observedEffectEstimate for E-value computation.',
      },
    },
    required: ['studyDesign', 'exposureType', 'dataSource', 'selfReportedOutcome', 'differentialSurveillance', 'nUnmeasuredConfounders', 'hasActiveComparator'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Regulatory Acceptability Assessment
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_RWE_REGULATORY_ACCEPTABILITY: AnaTool = {
  name: 'assess_rwe_regulatory_acceptability',
  description:
    'Assess the regulatory acceptability of a planned RWE submission across seven evidence requirements (pre-registration, validated outcomes, data relevance, data reliability, study design appropriateness, sensitivity analyses, transparency/reproducibility), returning an overall acceptability grade (high/moderate/low/insufficient), authority-specific regulatory pathway guidance, relevant regulatory precedents (Ibrance palbociclib label expansion 2019, Prograf tacrolimus pediatric 2021, Sentinel active surveillance, BEST vaccine safety monitoring), key guidance documents filtered by authority, and prioritized recommendations. ' +
    'Covers FDA (RWE Framework 2018, Draft Guidance on EHR/Claims 2021, Externally Controlled Trials 2023, RWD Submission Guidance 2023), EMA (DARWIN EU 2022), PMDA (Registry Data Guidance 2021), ICH E8(R1), and Health Canada pathways, with authority-specific guidance filtering for global or regional submissions. ' +
    'Use when planning an RWE regulatory strategy, preparing a pre-submission meeting (Type B) package, or evaluating whether a study design meets the evidentiary bar for a specific regulatory purpose — label expansion, new indication, post-marketing safety/effectiveness, comparative effectiveness, formulary/coverage, pediatric extrapolation, or accelerated approval confirmation. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      purpose: {
        type: 'string',
        enum: [
          'label_expansion', 'new_indication', 'post_marketing_safety',
          'post_marketing_effectiveness', 'comparative_effectiveness',
          'formulary_coverage', 'pediatric_extrapolation', 'accelerated_approval_confirmation',
        ],
        description: 'Regulatory purpose for the RWE submission. Determines the evidentiary bar: label expansion and new indications face the highest bar (must meet the same evidentiary standard as a traditional clinical study); post-marketing safety is well-established via Sentinel; formulary/coverage decisions have a lower threshold (AMCP Format).',
      },
      authority: {
        type: 'string',
        enum: ['fda', 'ema', 'pmda', 'health_canada', 'multiple'],
        description: 'Target regulatory authority. Determines which guidances, precedents, and pathway descriptions are highlighted. Use "multiple" for global submissions targeting more than one authority.',
      },
      studyDesign: {
        type: 'string',
        enum: [
          'new_user_active_comparator', 'prevalent_user_cohort', 'nested_case_control',
          'self_controlled_case_series', 'self_controlled_risk_interval',
          'interrupted_time_series', 'difference_in_differences',
          'regression_discontinuity', 'instrumental_variable',
        ],
        description: 'Study design chosen. The new-user active-comparator design and SCCS receive the highest regulatory acceptability ratings; alternative designs require explicit justification vs. the new-user active-comparator default.',
      },
      dataSource: {
        type: 'string',
        enum: ['claims', 'ehr', 'registry', 'biobank', 'linked_claims_ehr', 'integrated_delivery_network'],
        description: 'Data source type. Linked claims-EHR, integrated delivery networks, and registries receive higher data reliability ratings due to richer clinical detail and reduced data fragmentation.',
      },
      preRegistered: {
        type: 'boolean',
        description: 'Whether the study protocol is pre-registered (e.g., on ClinicalTrials.gov, EU PAS Register, ENCEPP) before data access. FDA and EMA strongly recommend pre-registration to reduce investigator degrees of freedom and increase credibility.',
      },
      validatedOutcomes: {
        type: 'boolean',
        description: 'Whether validated algorithms with known operating characteristics (PPV, sensitivity, specificity) are used for the primary outcome and exposure definitions. FDA Draft Guidance on RWD (2021) emphasizes the need for validated variable definitions.',
      },
      existingTrialData: {
        type: 'boolean',
        description: 'Whether concurrent or historical randomized trial data exists for the same or closely related question. Existing trial data lowers the evidentiary bar for supportive/complementary RWE and enables triangulation.',
      },
      sampleSize: {
        type: 'number',
        description: 'Study sample size. Scored against regulatory benchmarks: >= 500 is adequate for most regulatory purposes; >= 100 is marginal; < 100 is generally insufficient for regulatory-grade RWE.',
      },
    },
    required: ['purpose', 'authority', 'studyDesign', 'dataSource', 'preRegistered', 'validatedOutcomes', 'existingTrialData', 'sampleSize'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collective export
// ─────────────────────────────────────────────────────────────────────────────

/** RWE methodology tools, spread into ALL_ANA_TOOLS. */
export const RWE_METHODOLOGY_TOOLS: AnaTool[] = [
  DESIGN_TARGET_TRIAL,
  SCORE_RWE_DATA_SOURCE,
  DESIGN_PROPENSITY_ANALYSIS,
  SELECT_RWE_DESIGN,
  ASSESS_RWE_BIAS_RISK,
  ASSESS_RWE_REGULATORY_ACCEPTABILITY,
];
