/**
 * Real-World Evidence (RWE) Methodology — Deterministic Knowledge Base
 *
 * Pure, in-code knowledge base covering the full spectrum of RWE/RWD
 * methodological considerations for regulatory-grade observational studies.
 * No LLM, no network calls, no database — every function is a deterministic
 * mapping from structured input to structured output, reproducible across
 * invocations and auditable in a regulatory submission.
 *
 * Coverage:
 *   1. Target trial emulation (Hernán/Robins framework)
 *   2. Data source adequacy scoring (FDA RWE Framework dimensions)
 *   3. Propensity score methodology (estimation, application, diagnostics)
 *   4. Study design pattern selection
 *   5. Bias framework and sensitivity analyses
 *   6. Regulatory acceptability assessment
 *
 * Key references:
 *   - Hernán MA, Robins JM. "Causal Inference: What If." Boca Raton: Chapman & Hall/CRC, 2020.
 *   - FDA. "Framework for FDA's Real-World Evidence Program." December 2018.
 *   - FDA. "Real-World Data: Assessing Electronic Health Records and Medical Claims Data
 *     To Support Regulatory Decision-Making for Drug and Biological Products." September 2021.
 *   - FDA. "Considerations for the Design and Conduct of Externally Controlled Trials
 *     for Drug and Biological Products." February 2023.
 *   - ICH E8(R1). "General Considerations for Clinical Studies." October 2021.
 *   - ISPE/ISPOR. "Good Practices for Real-World Data Studies of Treatment and/or
 *     Comparative Effectiveness." Pharmacoepidemiology and Drug Safety, 2017.
 *   - EMA. "DARWIN EU: Data Analysis and Real World Interrogation Network." 2022.
 *   - Japan PMDA. "Basic Principles on Utilization of Registry Data for Drug Applications." March 2021.
 *
 * @module server/services/rwe/rwe-methodology-knowledge
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Citation {
  id: string;
  text: string;
  year: number;
}

const CITATIONS: Record<string, Citation> = {
  HERNAN_ROBINS_2020: {
    id: 'HERNAN_ROBINS_2020',
    text: 'Hernán MA, Robins JM. Causal Inference: What If. Boca Raton: Chapman & Hall/CRC, 2020.',
    year: 2020,
  },
  FDA_RWE_FRAMEWORK_2018: {
    id: 'FDA_RWE_FRAMEWORK_2018',
    text: 'FDA. Framework for FDA\'s Real-World Evidence Program. December 2018.',
    year: 2018,
  },
  FDA_EHR_CLAIMS_2021: {
    id: 'FDA_EHR_CLAIMS_2021',
    text: 'FDA. Real-World Data: Assessing Electronic Health Records and Medical Claims Data To Support Regulatory Decision-Making for Drug and Biological Products. Draft Guidance, September 2021.',
    year: 2021,
  },
  FDA_EXTERNAL_CONTROL_2023: {
    id: 'FDA_EXTERNAL_CONTROL_2023',
    text: 'FDA. Considerations for the Design and Conduct of Externally Controlled Trials for Drug and Biological Products. Draft Guidance, February 2023.',
    year: 2023,
  },
  ICH_E8R1_2021: {
    id: 'ICH_E8R1_2021',
    text: 'ICH E8(R1). General Considerations for Clinical Studies. October 2021.',
    year: 2021,
  },
  ISPE_ISPOR_2017: {
    id: 'ISPE_ISPOR_2017',
    text: 'Wang SV, et al. Reporting to Improve Reproducibility and Facilitate Validity Assessment for Healthcare Database Studies V1.0. Pharmacoepidemiology and Drug Safety, 2017; 26: 1018-1032.',
    year: 2017,
  },
  EMA_DARWIN_2022: {
    id: 'EMA_DARWIN_2022',
    text: 'EMA. DARWIN EU: Data Analysis and Real World Interrogation Network. Launched 2022.',
    year: 2022,
  },
  PMDA_REGISTRY_2021: {
    id: 'PMDA_REGISTRY_2021',
    text: 'Japan PMDA. Basic Principles on Utilization of Registry Data for Drug Applications. March 2021.',
    year: 2021,
  },
  AUSTIN_2011: {
    id: 'AUSTIN_2011',
    text: 'Austin PC. An Introduction to Propensity Score Methods for Reducing the Effects of Confounding in Observational Studies. Multivariate Behavioral Research, 2011; 46(3): 399-424.',
    year: 2011,
  },
  VANDERWEELE_DING_2017: {
    id: 'VANDERWEELE_DING_2017',
    text: 'VanderWeele TJ, Ding P. Sensitivity Analysis in Observational Research: Introducing the E-Value. Annals of Internal Medicine, 2017; 167(4): 268-274.',
    year: 2017,
  },
  LASH_FOX_FINK_2009: {
    id: 'LASH_FOX_FINK_2009',
    text: 'Lash TL, Fox MP, Fink AK. Applying Quantitative Bias Analysis to Epidemiologic Data. Springer, 2009.',
    year: 2009,
  },
  SUISSA_2008: {
    id: 'SUISSA_2008',
    text: 'Suissa S. Immortal time bias in pharmaco-epidemiology. American Journal of Epidemiology, 2008; 167(4): 492-499.',
    year: 2008,
  },
  RAY_2003: {
    id: 'RAY_2003',
    text: 'Ray WA. Evaluating medication effects outside of clinical trials: new-user designs. American Journal of Epidemiology, 2003; 158(9): 915-920.',
    year: 2003,
  },
  SCHNEEWEISS_2006: {
    id: 'SCHNEEWEISS_2006',
    text: 'Schneeweiss S. Sensitivity analysis and external adjustment for unmeasured confounders in epidemiologic database studies of therapeutics. Pharmacoepidemiology and Drug Safety, 2006; 15(5): 291-303.',
    year: 2006,
  },
  LI_THOMAS_LI_2019: {
    id: 'LI_THOMAS_LI_2019',
    text: 'Li F, Thomas LE, Li F. Addressing Extreme Propensity Scores via the Overlap Weights. American Journal of Epidemiology, 2019; 188(1): 250-257.',
    year: 2019,
  },
  PETERSEN_2012: {
    id: 'PETERSEN_2012',
    text: 'Petersen ML, Porter KE, Gruber S, Wang Y, van der Laan MJ. Diagnosing and responding to violations in the positivity assumption. Statistical Methods in Medical Research, 2012; 21(1): 31-54.',
    year: 2012,
  },
  FDA_LABEL_EXPANSION_2023: {
    id: 'FDA_LABEL_EXPANSION_2023',
    text: 'FDA. Submitting Documents Utilizing Real-World Data and Real-World Evidence to FDA for Drug and Biological Products. Draft Guidance, September 2023.',
    year: 2023,
  },
  SCHUEMIE_2020: {
    id: 'SCHUEMIE_2020',
    text: 'Schuemie MJ, et al. How confident are we about observational findings in health care: a benchmark study. Harvard Data Science Review, 2020.',
    year: 2020,
  },
};

function cite(...ids: string[]): Citation[] {
  return ids.map(id => CITATIONS[id]).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Target Trial Emulation Framework
// ─────────────────────────────────────────────────────────────────────────────

export type TreatmentStrategy = 'point_intervention' | 'sustained_use' | 'treatment_strategy_comparison' | 'dynamic_regime';
export type CausalContrast = 'intention_to_treat' | 'per_protocol' | 'as_treated';
export type TherapeuticArea = string;

export interface TargetTrialParams {
  indication: string;
  treatmentStrategy: TreatmentStrategy;
  comparator: string;
  primaryOutcome: string;
  causalContrast: CausalContrast;
  maxFollowUpMonths: number;
  therapeuticArea?: TherapeuticArea;
}

interface TargetTrialComponent {
  component: string;
  trialSpecification: string;
  observationalMapping: string;
  pitfalls: string[];
  mitigations: string[];
}

interface BiasMitigation {
  bias: string;
  description: string;
  severity: 'critical' | 'high' | 'moderate';
  mitigation: string;
  citation: Citation;
}

export interface TargetTrialResult {
  protocolComponents: TargetTrialComponent[];
  biasMitigations: BiasMitigation[];
  emulationChecklist: string[];
  protocolTemplate: Record<string, string>;
  citations: Citation[];
  notes: string[];
}

export function designTargetTrial(params: TargetTrialParams): TargetTrialResult {
  const {
    indication,
    treatmentStrategy,
    comparator,
    primaryOutcome,
    causalContrast,
    maxFollowUpMonths,
  } = params;

  if (!indication) throw new Error('indication is required');
  if (!comparator) throw new Error('comparator is required');
  if (!primaryOutcome) throw new Error('primaryOutcome is required');
  if (maxFollowUpMonths <= 0) throw new Error('maxFollowUpMonths must be > 0');

  // Build protocol components with observational mapping
  const eligibilityMapping = treatmentStrategy === 'sustained_use'
    ? 'Identify new users at first dispensing/administration date (index date). Apply all inclusion/exclusion criteria using data available on or before the index date. Require a pre-index washout period (typically 180-365 days) free of the study drug to ensure new-user status.'
    : 'Identify patients at the moment of treatment initiation (index date). Apply eligibility criteria at the index date using lookback windows matched to trial washout and history requirements.';

  const treatmentMapping: Record<TreatmentStrategy, string> = {
    point_intervention: 'Single treatment event identifiable in claims/EHR. Map to procedure codes, drug administration records, or order entries on the index date.',
    sustained_use: 'Continuous drug exposure measured via prescription fills with permissible gaps (typically ≤ 30-60 days). Grace period and stockpiling algorithms define sustained use windows.',
    treatment_strategy_comparison: 'Compare initiation of treatment A vs treatment B using an active-comparator new-user design. Both arms enter at their respective first dispensing/administration date.',
    dynamic_regime: 'Time-varying treatment defined by decision rules (e.g., switch therapy if biomarker exceeds threshold). Requires sequential data on treatment changes and time-varying covariates. Use g-methods (marginal structural models or g-estimation) for causal analysis.',
  };

  const followUpMapping: Record<CausalContrast, string> = {
    intention_to_treat: `Follow all patients from index date regardless of subsequent treatment changes for up to ${maxFollowUpMonths} months. Censoring only at death, disenrollment, or administrative end of study.`,
    per_protocol: `Follow patients while they remain adherent to the assigned strategy. Censor at first deviation (discontinuation, switching, dose change outside protocol). Use inverse-probability-of-censoring weights (IPCW) to adjust for informative censoring due to protocol deviation.`,
    as_treated: `Follow patients while they continue the initiated treatment. Censor at treatment change. Susceptible to depletion of susceptibles bias — per-protocol with IPCW is generally preferred.`,
  };

  const protocolComponents: TargetTrialComponent[] = [
    {
      component: 'Eligibility Criteria',
      trialSpecification: `Adults with ${indication} who are candidates for ${params.treatmentStrategy === 'treatment_strategy_comparison' ? `either treatment strategy` : `the study treatment`}. Exclude patients with contraindications, prior use during washout, or insufficient baseline data.`,
      observationalMapping: eligibilityMapping,
      pitfalls: [
        'Prevalent user bias: including patients already on treatment conflates treatment initiation with treatment persistence effects',
        'Depletion of susceptibles: prevalent users are survivors who tolerated the drug, biasing toward apparent safety',
        'Insufficient lookback: short washout windows misclassify prevalent users as new users',
      ],
      mitigations: [
        'Enforce new-user (incident user) design with ≥ 180-day washout',
        'Require minimum continuous enrollment before index date (≥ 6 months) for covariate ascertainment',
        'Validate washout adequacy by checking sensitivity to washout length',
      ],
    },
    {
      component: 'Treatment Strategies',
      trialSpecification: `Strategy A: Initiate ${indication} treatment. Strategy B: Initiate ${comparator}. ${treatmentStrategy === 'dynamic_regime' ? 'Strategies may include dose titration or switching rules.' : ''}`,
      observationalMapping: treatmentMapping[treatmentStrategy],
      pitfalls: [
        'Misclassification of exposure due to coding errors or fill-vs-administration discrepancies',
        'Time-varying confounding when analyzing sustained/dynamic strategies without appropriate methods',
        'Confounding by indication: the reason for choosing treatment A vs B is correlated with prognosis',
      ],
      mitigations: [
        'Use active-comparator new-user design to mitigate confounding by indication (Ray, 2003)',
        'Validate exposure algorithms against chart review or other gold standard',
        'For dynamic regimes, employ g-methods (MSMs, g-estimation, TMLE) rather than standard regression',
      ],
    },
    {
      component: 'Treatment Assignment',
      trialSpecification: 'Random assignment to treatment strategies at baseline.',
      observationalMapping: 'No randomization — assignment is by clinician/patient choice. Use propensity score methods, instrumental variables, or regression discontinuity to address confounding. The target trial framework makes explicit that the goal is to emulate the randomized assignment, not to adjust for "all confounders."',
      pitfalls: [
        'Unmeasured confounding: RWD cannot capture all factors influencing treatment choice (e.g., frailty, patient preference, contraindications not coded)',
        'Channeling bias: sicker patients systematically channeled to one treatment',
      ],
      mitigations: [
        'Use propensity score methods with thorough covariate specification',
        'Assess residual confounding via E-value analysis',
        'Consider negative control outcomes and negative control exposures as empirical calibration',
        'Pre-specify an instrumental variable analysis as sensitivity analysis when a valid instrument exists',
      ],
    },
    {
      component: 'Follow-up Period',
      trialSpecification: `Follow from randomization (time zero) for up to ${maxFollowUpMonths} months or until outcome, death, or loss to follow-up.`,
      observationalMapping: followUpMapping[causalContrast],
      pitfalls: [
        'Immortal time bias: misaligning time zero with treatment initiation creates a period during which the outcome cannot occur in the treated group',
        'Time-zero misalignment: if eligibility, treatment assignment, and follow-up start do not coincide, immortal time bias results',
        'Informative censoring: treatment discontinuation is prognostic of the outcome',
      ],
      mitigations: [
        'Ensure time zero = date of treatment initiation = start of follow-up = date eligibility is assessed (alignment principle)',
        'For per-protocol analysis, use IPCW to handle informative censoring from treatment deviations',
        'Conduct sensitivity analyses varying the grace period and censoring definitions',
      ],
    },
    {
      component: 'Outcome',
      trialSpecification: `Primary: ${primaryOutcome}. Ascertained by blinded adjudication committee (trial). Standardized case definition with sensitivity and specificity requirements.`,
      observationalMapping: 'Outcome ascertained via diagnosis codes (ICD-10-CM), procedure codes (CPT/ICD-10-PCS), lab results, death records, or a validated claims-based algorithm. Require positive predictive value (PPV) ≥ 70% for the primary outcome algorithm; conduct sensitivity analysis with stricter/broader definitions.',
      pitfalls: [
        'Outcome misclassification: ICD codes have variable PPV by condition',
        'Differential outcome ascertainment: detection bias if one treatment arm has more healthcare encounters',
        'Missing outcomes if patients disenroll or switch data systems',
      ],
      mitigations: [
        'Use validated outcome algorithms with known PPV/sensitivity/specificity',
        'Assess differential surveillance bias by comparing healthcare utilization between arms',
        'Link to death registries (NDI/state death records) for mortality outcomes',
        'Conduct quantitative bias analysis for outcome misclassification',
      ],
    },
    {
      component: 'Causal Contrast',
      trialSpecification: `${causalContrast === 'intention_to_treat' ? 'Intention-to-treat: compare all randomized to A vs all randomized to B.' : causalContrast === 'per_protocol' ? 'Per-protocol: compare adherent patients in each arm.' : 'As-treated: compare patients by actual treatment received.'}`,
      observationalMapping: `${causalContrast === 'intention_to_treat' ? 'Emulate ITT by following from index date regardless of treatment changes. Note: the ITT effect in an observational study differs from a trial ITT because assignment is not randomized — this is sometimes called an "observational analog of the ITT."' : causalContrast === 'per_protocol' ? 'Clone-censor-weight approach: clone each eligible patient into both strategy arms, censor clones when they deviate from their assigned strategy, apply IPCW to adjust for selection bias from censoring.' : 'Follow patients on actual treatment received. Susceptible to time-varying confounding if treatment changes are prognostic.'}`,
      pitfalls: [
        causalContrast === 'per_protocol' ? 'Artificial censoring from per-protocol analysis creates selection bias unless weights are applied' : 'Standard regression adjustment is insufficient for time-varying confounding induced by treatment changes',
        'The estimand must be clearly defined before the analysis — it drives all design decisions',
      ],
      mitigations: [
        'Pre-specify the causal estimand in the study protocol',
        causalContrast === 'per_protocol' ? 'Use IPCW or g-estimation for per-protocol effects; validate weight models with covariate balance diagnostics' : 'Consider whether the per-protocol effect is more clinically relevant',
        'Report both ITT-analog and per-protocol estimates when feasible',
      ],
    },
    {
      component: 'Analysis Plan',
      trialSpecification: 'Pre-specified statistical analysis plan with primary and sensitivity analyses, multiplicity adjustment, and subgroup analyses.',
      observationalMapping: 'Pre-register the study protocol and analysis plan (e.g., on ClinicalTrials.gov, EU PAS Register, or ENCEPP). Use structured frameworks: HARPER, RECORD-PE, or REPEAT for protocol and reporting. Analysis should include primary analysis, pre-specified sensitivity analyses (multiple PS methods, outcome definitions, subgroups), and quantitative bias analysis for unmeasured confounding.',
      pitfalls: [
        'Investigator degrees of freedom: post hoc analysis choices can p-hack observational studies',
        'Selective reporting of favorable analyses',
        'Failure to account for multiple comparisons across subgroups/outcomes',
      ],
      mitigations: [
        'Pre-register the protocol before data extraction',
        'Lock the analytic dataset before unblinded analysis',
        'Report all pre-specified analyses including null results',
        'Use ISPE/ISPOR structured templates for reproducibility',
      ],
    },
  ];

  // Bias mitigations specific to the design
  const biasMitigations: BiasMitigation[] = [
    {
      bias: 'Immortal time bias',
      description: 'A span of follow-up during which, by design, the outcome cannot occur. Arises when the index date (time zero) does not coincide with treatment initiation — e.g., requiring a future event to define exposure creates person-time that is "immortal" in the exposed group.',
      severity: 'critical',
      mitigation: 'Align time zero with the moment all three conditions are met simultaneously: (1) eligibility criteria satisfied, (2) treatment strategy assigned/initiated, (3) follow-up begins. Never condition on future events to define exposure.',
      citation: CITATIONS.SUISSA_2008,
    },
    {
      bias: 'Prevalent user bias',
      description: 'Including patients already on treatment at cohort entry mixes treatment initiation effects with treatment persistence effects and introduces depletion of susceptibles (only patients who tolerate the drug remain on it).',
      severity: 'critical',
      mitigation: 'Use a new-user (incident user) design. Require a washout period (≥ 180 days, often 365 days) free of the study drug before the index date.',
      citation: CITATIONS.RAY_2003,
    },
    {
      bias: 'Time-zero misalignment',
      description: 'When eligibility assessment, treatment assignment, and start of follow-up do not coincide, multiple biases arise simultaneously — immortal time bias, selection bias, and misclassification of exposure duration.',
      severity: 'critical',
      mitigation: 'Use the target trial emulation framework to explicitly define and align time zero. Each patient\'s index date must simultaneously satisfy eligibility, define treatment assignment, and begin follow-up.',
      citation: CITATIONS.HERNAN_ROBINS_2020,
    },
    {
      bias: 'Confounding by indication',
      description: 'The clinical reason for prescribing one treatment over another is often correlated with prognosis. In the absence of randomization, treated and untreated patients differ systematically.',
      severity: 'high',
      mitigation: 'Use an active-comparator new-user design. Compare two treatments for the same indication rather than treatment vs no treatment. Apply propensity score methods to adjust for measured confounders.',
      citation: CITATIONS.RAY_2003,
    },
    {
      bias: 'Unmeasured confounding',
      description: 'Variables that influence both treatment selection and the outcome but are not captured in the available data (e.g., disease severity, frailty, socioeconomic status, over-the-counter medication use).',
      severity: 'high',
      mitigation: 'Compute the E-value to quantify the minimum strength of association an unmeasured confounder would need to explain away the observed effect. Conduct probabilistic bias analysis. Use negative control outcomes and negative control exposures for empirical calibration.',
      citation: CITATIONS.VANDERWEELE_DING_2017,
    },
    {
      bias: 'Outcome misclassification',
      description: 'Claims/EHR-based outcome definitions have imperfect sensitivity and specificity. Non-differential misclassification biases toward the null; differential misclassification can bias in either direction.',
      severity: 'moderate',
      mitigation: 'Use validated outcome algorithms with known operating characteristics (PPV, sensitivity, specificity). Conduct quantitative bias analysis adjusting for known misclassification rates. Use multiple outcome definitions as sensitivity analyses.',
      citation: CITATIONS.LASH_FOX_FINK_2009,
    },
  ];

  const emulationChecklist: string[] = [
    'Time zero is explicitly defined and aligns eligibility, treatment assignment, and follow-up start',
    'New-user design is implemented with adequate washout period',
    'Active comparator is clinically appropriate and treated for the same indication',
    'Covariate measurement uses data before time zero only (no future information)',
    'Outcome ascertainment algorithm is validated with known PPV',
    'Causal estimand (ITT vs per-protocol vs as-treated) is explicitly stated',
    'Per-protocol analysis uses IPCW or g-methods if applicable',
    'Protocol is pre-registered before data access/analysis',
    'Sensitivity analyses for unmeasured confounding are pre-specified (E-value, QBA)',
    'Negative control outcomes/exposures are included for empirical calibration',
    'DAG (directed acyclic graph) for the causal structure is documented',
    'All target trial components are mapped to their observational data analogs',
  ];

  const protocolTemplate: Record<string, string> = {
    title: `Target Trial Emulation: ${indication} — ${treatmentStrategy}`,
    objective: `To emulate a target trial estimating the ${causalContrast} effect of [treatment] vs ${comparator} on ${primaryOutcome} in patients with ${indication}.`,
    eligibilityCriteria: `Inclusion: Adults with diagnosed ${indication}, new users of either treatment strategy, ≥ 6 months continuous enrollment before index date. Exclusion: Prior use within washout, contraindications, insufficient baseline data.`,
    treatmentStrategies: `Strategy A: [Treatment]. Strategy B: ${comparator}. Assignment at index date (first dispensing/administration).`,
    timeZero: 'Index date = date of first qualifying dispensing/administration of the study drug, at which all eligibility criteria are met.',
    followUp: `From time zero for up to ${maxFollowUpMonths} months. ${causalContrast === 'per_protocol' ? 'Per-protocol: censor at first deviation from assigned strategy; apply IPCW.' : 'ITT-analog: follow regardless of subsequent treatment changes.'}`,
    primaryOutcome: primaryOutcome,
    statisticalAnalysis: 'Propensity score [matching/weighting] adjusted Cox proportional hazards model (or Fine-Gray for competing risks). Pre-specified sensitivity analyses.',
    sensitivityAnalyses: 'E-value for unmeasured confounding, negative control outcomes, alternative outcome definitions, quantitative bias analysis, multiple PS methods (matching + IPTW).',
  };

  return {
    protocolComponents,
    biasMitigations,
    emulationChecklist,
    protocolTemplate,
    citations: cite(
      'HERNAN_ROBINS_2020',
      'FDA_RWE_FRAMEWORK_2018',
      'SUISSA_2008',
      'RAY_2003',
      'ISPE_ISPOR_2017',
    ),
    notes: [
      'Target trial emulation is the methodological standard for causal inference from observational data (Hernán & Robins, 2020).',
      'Every component of the target trial must be explicitly mapped to an observational data analog before analysis begins.',
      'Pre-registration of the study protocol is essential for regulatory credibility.',
      'Deterministic: identical inputs always produce identical output. No LLM, no network.',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Data Source Adequacy Scoring
// ─────────────────────────────────────────────────────────────────────────────

export type DataSourceType = 'claims' | 'ehr' | 'registry' | 'biobank' | 'linked_claims_ehr' | 'integrated_delivery_network';
export type StudyQuestionType = 'effectiveness' | 'safety' | 'natural_history' | 'treatment_patterns' | 'burden_of_illness' | 'label_expansion';

export interface DataSourceParams {
  sourceType: DataSourceType;
  studyQuestion: StudyQuestionType;
  /** Estimated sample size available for the study population. */
  estimatedSampleSize: number;
  /** Years of longitudinal data available. */
  longitudinalYears: number;
  /** Whether death data is linked (e.g., NDI, state death records). */
  deathLinkage: boolean;
  /** Whether the source captures lab results. */
  hasLabResults: boolean;
  /** Whether the source captures clinical notes / unstructured data. */
  hasClinicalNotes: boolean;
  /** Whether the source captures medications dispensed (pharmacy fills). */
  hasPharmacyDispensing: boolean;
  /** Whether the source captures procedures. */
  hasProcedures: boolean;
  /** Validation study available for key variables (outcome, exposure). */
  hasValidationStudy: boolean;
  /** Percentage of patients with continuous enrollment ≥ 12 months (0-100). */
  continuousEnrollmentPct: number;
  /** Geographic coverage (e.g., national, regional, single-site). */
  geographicCoverage: 'national' | 'regional' | 'single_site';
}

interface DimensionScore {
  dimension: string;
  score: number; // 0-100
  weight: number;
  rationale: string;
  gaps: string[];
  recommendations: string[];
}

export interface DataSourceResult {
  overallScore: number; // 0-100
  fitnessForPurpose: 'high' | 'moderate' | 'low' | 'inadequate';
  dimensions: DimensionScore[];
  regulatoryAcceptability: {
    fdaRelevance: string;
    fdaReliability: string;
    dataGovernanceReqs: string[];
  };
  strengthsAndLimitations: {
    strengths: string[];
    limitations: string[];
  };
  citations: Citation[];
  notes: string[];
}

export function scoreDataSource(params: DataSourceParams): DataSourceResult {
  const {
    sourceType,
    studyQuestion,
    estimatedSampleSize,
    longitudinalYears,
    deathLinkage,
    hasLabResults,
    hasClinicalNotes,
    hasPharmacyDispensing,
    hasProcedures,
    hasValidationStudy,
    continuousEnrollmentPct,
    geographicCoverage,
  } = params;

  if (estimatedSampleSize < 0) throw new Error('estimatedSampleSize must be ≥ 0');
  if (longitudinalYears < 0) throw new Error('longitudinalYears must be ≥ 0');
  if (continuousEnrollmentPct < 0 || continuousEnrollmentPct > 100) {
    throw new Error('continuousEnrollmentPct must be in [0, 100]');
  }

  // Data quality dimension weights vary by study question
  const questionWeights: Record<StudyQuestionType, Record<string, number>> = {
    effectiveness: { completeness: 0.20, accuracy: 0.25, linkage: 0.10, longitudinality: 0.15, sampleSize: 0.15, dataCapture: 0.15 },
    safety: { completeness: 0.15, accuracy: 0.25, linkage: 0.15, longitudinality: 0.20, sampleSize: 0.10, dataCapture: 0.15 },
    natural_history: { completeness: 0.20, accuracy: 0.15, linkage: 0.10, longitudinality: 0.25, sampleSize: 0.15, dataCapture: 0.15 },
    treatment_patterns: { completeness: 0.25, accuracy: 0.15, linkage: 0.05, longitudinality: 0.15, sampleSize: 0.15, dataCapture: 0.25 },
    burden_of_illness: { completeness: 0.20, accuracy: 0.15, linkage: 0.10, longitudinality: 0.15, sampleSize: 0.20, dataCapture: 0.20 },
    label_expansion: { completeness: 0.20, accuracy: 0.25, linkage: 0.10, longitudinality: 0.15, sampleSize: 0.15, dataCapture: 0.15 },
  };

  const weights = questionWeights[studyQuestion];

  // Completeness dimension
  const completenessFactors = [
    hasPharmacyDispensing ? 1.0 : 0.3,
    hasProcedures ? 1.0 : 0.4,
    continuousEnrollmentPct / 100,
  ];
  const completenessRaw = completenessFactors.reduce((a, b) => a + b, 0) / completenessFactors.length * 100;
  const completenessGaps: string[] = [];
  const completenessRecs: string[] = [];
  if (!hasPharmacyDispensing) {
    completenessGaps.push('Pharmacy dispensing data not available — medication exposure cannot be reliably determined from EHR orders alone');
    completenessRecs.push('Link to pharmacy benefit manager (PBM) or dispensing data');
  }
  if (continuousEnrollmentPct < 70) {
    completenessGaps.push(`Low continuous enrollment (${continuousEnrollmentPct}%) — high attrition may bias follow-up`);
    completenessRecs.push('Impose minimum enrollment requirements and assess attrition patterns');
  }

  // Accuracy dimension
  let accuracyScore = 50; // baseline
  if (hasValidationStudy) accuracyScore += 30;
  if (sourceType === 'registry') accuracyScore += 15;
  if (sourceType === 'linked_claims_ehr' || sourceType === 'integrated_delivery_network') accuracyScore += 10;
  if (hasClinicalNotes) accuracyScore += 5;
  accuracyScore = Math.min(accuracyScore, 100);
  const accuracyGaps: string[] = [];
  const accuracyRecs: string[] = [];
  if (!hasValidationStudy) {
    accuracyGaps.push('No validation study for key variable definitions (exposure, outcome)');
    accuracyRecs.push('Conduct or cite a validation study for the primary exposure and outcome algorithms; FDA Draft Guidance on RWD (2021) emphasizes the need for validated variable definitions');
  }

  // Linkage dimension
  let linkageScore = 40;
  if (deathLinkage) linkageScore += 30;
  if (sourceType === 'linked_claims_ehr') linkageScore += 25;
  if (sourceType === 'integrated_delivery_network') linkageScore += 20;
  if (geographicCoverage === 'national') linkageScore += 5;
  linkageScore = Math.min(linkageScore, 100);
  const linkageGaps: string[] = [];
  const linkageRecs: string[] = [];
  if (!deathLinkage) {
    linkageGaps.push('No death linkage — mortality outcomes may be incomplete, and informative censoring from death cannot be identified');
    linkageRecs.push('Link to National Death Index (NDI) or state death records');
  }

  // Longitudinality dimension
  const longScore = Math.min(longitudinalYears / 10, 1) * 100;
  const longGaps: string[] = [];
  const longRecs: string[] = [];
  if (longitudinalYears < 3) {
    longGaps.push(`Only ${longitudinalYears} years of data — may be insufficient for long-latency outcomes or sustained treatment effects`);
    longRecs.push('Extend study period or use data from a source with longer longitudinal capture');
  }

  // Sample size dimension
  let sampleScore: number;
  if (estimatedSampleSize >= 10000) sampleScore = 100;
  else if (estimatedSampleSize >= 5000) sampleScore = 85;
  else if (estimatedSampleSize >= 1000) sampleScore = 65;
  else if (estimatedSampleSize >= 500) sampleScore = 45;
  else if (estimatedSampleSize >= 100) sampleScore = 25;
  else sampleScore = 10;
  const sampleGaps: string[] = [];
  const sampleRecs: string[] = [];
  if (estimatedSampleSize < 1000) {
    sampleGaps.push(`Small sample (n=${estimatedSampleSize}) — may have insufficient power for primary analysis and limits PS methods`);
    sampleRecs.push('Consider data pooling across multiple sources or a distributed research network (e.g., Sentinel, OHDSI)');
  }

  // Data capture breadth dimension
  const captureFactors = [
    hasLabResults ? 1.0 : 0.0,
    hasClinicalNotes ? 1.0 : 0.0,
    hasPharmacyDispensing ? 1.0 : 0.0,
    hasProcedures ? 1.0 : 0.0,
    deathLinkage ? 1.0 : 0.0,
  ];
  const captureScore = (captureFactors.reduce((a, b) => a + b, 0) / captureFactors.length) * 100;
  const captureGaps: string[] = [];
  const captureRecs: string[] = [];
  if (!hasLabResults && (studyQuestion === 'effectiveness' || studyQuestion === 'safety')) {
    captureGaps.push('Lab results not captured — cannot ascertain lab-based outcomes or biomarker-based eligibility criteria');
    captureRecs.push('Link to laboratory data or use an EHR-based source with lab integration');
  }

  const dimensions: DimensionScore[] = [
    { dimension: 'Completeness', score: Math.round(completenessRaw), weight: weights.completeness, rationale: 'Measures capture of pharmacy dispensing, procedures, and patient retention.', gaps: completenessGaps, recommendations: completenessRecs },
    { dimension: 'Accuracy', score: accuracyScore, weight: weights.accuracy, rationale: 'Based on validation studies, source type characteristics, and availability of unstructured data for adjudication.', gaps: accuracyGaps, recommendations: accuracyRecs },
    { dimension: 'Linkage', score: linkageScore, weight: weights.linkage, rationale: 'Ability to link across data domains (claims+EHR, death records, registries) for complete patient journey.', gaps: linkageGaps, recommendations: linkageRecs },
    { dimension: 'Longitudinality', score: Math.round(longScore), weight: weights.longitudinality, rationale: `${longitudinalYears} years of data available; scored relative to a 10-year benchmark.`, gaps: longGaps, recommendations: longRecs },
    { dimension: 'Sample Size', score: sampleScore, weight: weights.sampleSize, rationale: `Estimated n=${estimatedSampleSize}; scored against typical regulatory-grade study benchmarks.`, gaps: sampleGaps, recommendations: sampleRecs },
    { dimension: 'Data Capture Breadth', score: Math.round(captureScore), weight: weights.dataCapture, rationale: 'Breadth of data domains: labs, notes, pharmacy, procedures, death.', gaps: captureGaps, recommendations: captureRecs },
  ];

  // Weighted overall score
  const overallScore = Math.round(
    dimensions.reduce((acc, d) => acc + d.score * d.weight, 0),
  );

  const fitnessForPurpose: 'high' | 'moderate' | 'low' | 'inadequate' =
    overallScore >= 75 ? 'high' :
    overallScore >= 55 ? 'moderate' :
    overallScore >= 35 ? 'low' : 'inadequate';

  // Source-type-specific strengths/limitations
  const sourceTraits: Record<DataSourceType, { strengths: string[]; limitations: string[] }> = {
    claims: {
      strengths: ['Large, representative populations', 'Longitudinal enrollment tracking', 'Complete pharmacy dispensing capture', 'Standardized coding (ICD/CPT/NDC)'],
      limitations: ['No lab results or clinical notes', 'Diagnosis codes reflect billing, not clinical assessment', 'No disease severity measures', 'Off-label use not distinguished'],
    },
    ehr: {
      strengths: ['Rich clinical detail (labs, vitals, notes)', 'Disease severity markers available', 'Treatment response data (biomarkers)'],
      limitations: ['Fragmented — patients may receive care outside the system', 'Pharmacy fills may be incomplete without PBM linkage', 'Unstructured data requires NLP extraction', 'Diagnosis codes entered for encounter billing, not research'],
    },
    registry: {
      strengths: ['Disease-specific depth and clinical detail', 'Prospective data collection with defined variables', 'Often includes patient-reported outcomes', 'Curated by clinical experts'],
      limitations: ['Usually single-disease or narrow population', 'Limited sample size relative to claims', 'Selection bias in enrollment', 'Variable data quality across sites'],
    },
    biobank: {
      strengths: ['Genomic/biomarker data linked to clinical records', 'Enables pharmacogenomic analyses', 'Long follow-up through linked EHR'],
      limitations: ['Selection/volunteer bias in enrollment', 'Limited to participants who consent to research', 'Geographic and demographic skew', 'Small effective sample for rare exposures/outcomes'],
    },
    linked_claims_ehr: {
      strengths: ['Combines claims completeness with EHR clinical depth', 'Pharmacy dispensing from claims + lab values from EHR', 'Reduced data fragmentation', 'Can validate coding algorithms against clinical data'],
      limitations: ['Linkage error rate must be characterized', 'More complex data governance (two data custodians)', 'Temporality challenges across data refresh cycles', 'Higher cost and operational complexity'],
    },
    integrated_delivery_network: {
      strengths: ['Closed system captures near-complete care episode', 'Linked pharmacy, lab, imaging, and clinical data', 'Low data fragmentation', 'Continuous enrollment tracking within the network'],
      limitations: ['May not be generalizable to non-network populations', 'Geographic concentration', 'Patients may still receive outside care (leakage)', 'Network-specific formularies may limit comparator availability'],
    },
  };

  const traits = sourceTraits[sourceType];

  // FDA regulatory acceptability assessment
  const fdaRelevance = studyQuestion === 'label_expansion'
    ? 'For label expansion, FDA requires that the RWD source captures the relevant patient population, treatment exposure, and clinical outcomes with sufficient fidelity to answer the specific regulatory question. The data must be relevant to the US population and clinical practice (FDA RWE Framework, 2018).'
    : `For ${studyQuestion} studies, the data source must demonstrate relevance to the specific study question — the population captured must be representative of the patients who would use the product, and key variables (exposure, outcome, covariates) must be available.`;

  const fdaReliability = hasValidationStudy
    ? 'The availability of a validation study strengthens the reliability assessment. FDA Draft Guidance on RWD (2021) emphasizes that data reliability requires: (1) data accrual processes ensure completeness and accuracy, (2) data management processes maintain data integrity, (3) validation of key variable definitions against a gold standard.'
    : 'No validation study is available for key variables. FDA Draft Guidance on RWD (2021) requires evidence that the data are reliable — validation of key variable definitions is strongly recommended. Without it, the regulatory acceptability is reduced.';

  const dataGovernanceReqs: string[] = [
    'Data provenance documentation — chain of custody from source system to analytic dataset',
    'Data quality assessment report (completeness, accuracy, consistency, timeliness)',
    'Data dictionary with variable definitions and coding conventions',
    'Transformation and derivation logic documented and version-controlled',
    'IRB/ethics committee approval or exemption documentation',
    'Data use agreement covering the study purpose',
  ];

  return {
    overallScore,
    fitnessForPurpose,
    dimensions,
    regulatoryAcceptability: {
      fdaRelevance,
      fdaReliability,
      dataGovernanceReqs,
    },
    strengthsAndLimitations: traits,
    citations: cite('FDA_RWE_FRAMEWORK_2018', 'FDA_EHR_CLAIMS_2021', 'ISPE_ISPOR_2017'),
    notes: [
      `Data source type: ${sourceType}. Study question: ${studyQuestion}.`,
      `Overall fitness-for-purpose: ${fitnessForPurpose} (score ${overallScore}/100).`,
      'Scores are weighted by study question type. Adequacy thresholds: high ≥ 75, moderate ≥ 55, low ≥ 35, inadequate < 35.',
      'FDA RWE Framework (2018) requires both data relevance and data reliability to be demonstrated.',
      'Deterministic: identical inputs always produce identical output. No LLM, no network.',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Propensity Score Methodology
// ─────────────────────────────────────────────────────────────────────────────

export type PSEstimationMethod = 'logistic_regression' | 'gbm' | 'random_forest' | 'neural_network' | 'lasso_logistic';
export type PSApplicationMethod = 'matching_1to1' | 'matching_1tok' | 'stratification' | 'iptw' | 'smrw' | 'overlap_weights' | 'doubly_robust';

export interface PropensityAnalysisParams {
  sampleSize: number;
  /** Number of measured confounders available. */
  nConfounders: number;
  /** Approximate prevalence of the treatment (0-1). */
  treatmentPrevalence: number;
  /** Whether the outcome is rare (< 5% event rate). */
  rareOutcome: boolean;
  /** Whether there is strong clinical equipoise (true) or clear channeling (false). */
  clinicalEquipoise: boolean;
  /** The target estimand. */
  targetEstimand: 'att' | 'ate' | 'ato';
  /** Whether time-varying confounding is a concern. */
  timeVaryingConfounding: boolean;
}

interface PSMethodRecommendation {
  estimationMethod: PSEstimationMethod;
  applicationMethod: PSApplicationMethod;
  rationale: string;
  caveats: string[];
}

interface PSDiagnostic {
  diagnostic: string;
  threshold: string;
  description: string;
  action_if_failed: string;
}

export interface PropensityAnalysisResult {
  primaryRecommendation: PSMethodRecommendation;
  alternatives: PSMethodRecommendation[];
  diagnosticsPlan: PSDiagnostic[];
  sensitivityAnalyses: string[];
  trimmingStrategy: string;
  effectiveSampleSizeNote: string;
  citations: Citation[];
  notes: string[];
}

export function designPropensityAnalysis(params: PropensityAnalysisParams): PropensityAnalysisResult {
  const {
    sampleSize,
    nConfounders,
    treatmentPrevalence,
    rareOutcome,
    clinicalEquipoise,
    targetEstimand,
    timeVaryingConfounding,
  } = params;

  if (sampleSize <= 0) throw new Error('sampleSize must be > 0');
  if (nConfounders <= 0) throw new Error('nConfounders must be > 0');
  if (treatmentPrevalence <= 0 || treatmentPrevalence >= 1) throw new Error('treatmentPrevalence must be in (0, 1)');

  // Choose estimation method
  let estimationMethod: PSEstimationMethod;
  let estimationRationale: string;
  if (nConfounders > 100) {
    estimationMethod = 'lasso_logistic';
    estimationRationale = 'High-dimensional covariate space (>100 confounders) — LASSO logistic regression provides variable selection and regularization to prevent overfitting while maintaining interpretability. hdPS (high-dimensional propensity score) algorithm may also be appropriate.';
  } else if (nConfounders > 30 && sampleSize > 5000) {
    estimationMethod = 'gbm';
    estimationRationale = 'Moderate-to-high number of confounders with sufficient sample size — gradient boosted machines (GBM) can capture nonlinear relationships and interactions without manual specification. Tune via cross-validation; optimize for covariate balance rather than prediction accuracy.';
  } else {
    estimationMethod = 'logistic_regression';
    estimationRationale = 'Standard logistic regression is appropriate when the confounder set is manageable (≤ 30) or the sample size is limited. Include clinically meaningful interactions and nonlinear terms based on subject-matter knowledge.';
  }

  // Choose application method
  let applicationMethod: PSApplicationMethod;
  let applicationRationale: string;
  const applicationCaveats: string[] = [];

  if (timeVaryingConfounding) {
    applicationMethod = 'iptw';
    applicationRationale = 'Time-varying confounding requires marginal structural models (MSMs) with stabilized inverse probability of treatment weights (sIPTW). Standard PS matching/stratification cannot handle time-varying exposures.';
    applicationCaveats.push(
      'Stabilized weights are strongly recommended to reduce variance',
      'Truncate extreme weights at the 1st/99th percentile and assess sensitivity to truncation threshold',
      'Model the treatment at each time point as a function of time-varying covariates and prior treatment history',
    );
  } else if (targetEstimand === 'ato') {
    applicationMethod = 'overlap_weights';
    applicationRationale = 'Overlap weights (Li et al., 2019) target the average treatment effect in the overlap population (ATO) — patients with clinical equipoise. Overlap weights naturally downweight patients with extreme PS values, avoiding the need for trimming. They minimize the asymptotic variance of the estimated treatment effect among the class of balancing weights.';
    applicationCaveats.push('The ATO estimand focuses on the population with equipoise — may not represent the entire treated population');
  } else if (targetEstimand === 'att' && sampleSize > 1000 && clinicalEquipoise) {
    applicationMethod = 'matching_1to1';
    applicationRationale = 'PS matching 1:1 (nearest-neighbor with caliper ≤ 0.2 SD of the logit PS) targets the ATT by finding a matched comparator for each treated patient. Intuitive, transparent, and accepted by regulators. Requires sufficient overlap and sample size to achieve close matches.';
    applicationCaveats.push(
      'Use caliper ≤ 0.2 × SD(logit PS) per Austin (2011)',
      'Match without replacement for simplicity; with replacement for better matches but more complex variance estimation',
      'Report the number and percentage of unmatched treated patients',
      'Effective sample size reduction from matching must leave adequate power',
    );
  } else if (targetEstimand === 'ate') {
    applicationMethod = 'iptw';
    applicationRationale = 'IPTW targets the ATE by weighting both groups to represent the overall study population. Appropriate when the estimand is the average effect across the entire eligible population. Stabilized weights recommended.';
    applicationCaveats.push(
      'Check for extreme weights (max weight, 99th percentile); truncation may be needed',
      'Report the effective sample size (ESS) after weighting',
      'Stabilized weights (dividing by the marginal treatment probability) reduce variance without introducing bias',
    );
  } else {
    // Default: matching for ATT, IPTW for ATE
    applicationMethod = rareOutcome ? 'matching_1tok' : 'matching_1to1';
    applicationRationale = rareOutcome
      ? 'Rare outcome with ATT estimand — 1:k matching (k=3-5) increases comparator events while targeting the ATT. Each treated patient is matched to k nearest comparators within the caliper.'
      : 'PS matching 1:1 for ATT estimation. Default choice when sample size and overlap are adequate.';
  }

  // Primary recommendation
  const primaryRecommendation: PSMethodRecommendation = {
    estimationMethod,
    applicationMethod,
    rationale: `${estimationRationale} ${applicationRationale}`,
    caveats: applicationCaveats,
  };

  // Alternative recommendations
  const alternatives: PSMethodRecommendation[] = [];

  if ((applicationMethod as string) !== 'doubly_robust') {
    alternatives.push({
      estimationMethod,
      applicationMethod: 'doubly_robust',
      rationale: 'Doubly robust estimation (augmented IPTW or TMLE) provides a consistent estimate if either the PS model or the outcome model is correctly specified. Recommended as a sensitivity analysis for any PS-based primary analysis.',
      caveats: ['Requires specification of both treatment and outcome models', 'Convergence issues possible with very small samples or near-violations of positivity'],
    });
  }

  if (applicationMethod !== 'overlap_weights' && !timeVaryingConfounding) {
    alternatives.push({
      estimationMethod,
      applicationMethod: 'overlap_weights',
      rationale: 'Overlap weights provide a natural alternative that avoids trimming and extreme weight issues. The estimand (ATO) focuses on the population with clinical equipoise.',
      caveats: ['The ATO estimand may differ from ATT or ATE — interpret accordingly'],
    });
  }

  if ((applicationMethod as string) !== 'stratification') {
    alternatives.push({
      estimationMethod,
      applicationMethod: 'stratification',
      rationale: 'PS stratification (5-10 strata) is a simple, transparent alternative. Each stratum approximates a small randomized trial. Often used as a robustness check.',
      caveats: ['5 strata remove approximately 90% of confounding from measured covariates (Cochran, 1968)', 'Consider finer stratification (10-20) when the treatment effect may vary across the PS distribution'],
    });
  }

  // Diagnostics plan
  const diagnosticsPlan: PSDiagnostic[] = [
    {
      diagnostic: 'Standardized Mean Difference (SMD)',
      threshold: 'SMD < 0.1 for all covariates after matching/weighting',
      description: 'The absolute standardized mean difference (Austin, 2009) measures balance for each covariate between treated and comparator groups after PS adjustment. It is scale-free, allowing comparison across variables.',
      action_if_failed: 'Re-specify the PS model: add interaction terms, polynomial terms, or switch estimation method (e.g., from logistic to GBM). If specific covariates remain imbalanced, include them directly in the outcome model.',
    },
    {
      diagnostic: 'Variance Ratio',
      threshold: 'Variance ratio between 0.5 and 2.0 for continuous covariates',
      description: 'The ratio of the variance of each continuous covariate in the treated group to the comparator group. Values far from 1.0 indicate distributional imbalance beyond the mean.',
      action_if_failed: 'Add quadratic or spline terms for the offending covariate in the PS model. If persistent, assess whether the covariate should be included in the outcome model directly.',
    },
    {
      diagnostic: 'Positivity / Overlap Assessment',
      threshold: 'No PS strata with zero treated or zero comparator patients; PS distributions overlap substantially',
      description: 'Positivity requires that every combination of covariates has a nonzero probability of receiving each treatment. Practical positivity is assessed by examining the PS distribution overlap between groups.',
      action_if_failed: 'Trim patients with extreme PS values (PS < 0.05 or PS > 0.95). Consider overlap weights instead of IPTW. If structural positivity violations exist, redefine the study population to the region of overlap. Report the percentage of patients trimmed.',
    },
    {
      diagnostic: 'Effective Sample Size (ESS)',
      threshold: 'ESS ≥ 50% of original sample for IPTW; report absolute ESS',
      description: 'For weighting methods, the ESS accounts for the loss of precision due to variable weights. ESS = (Σwi)² / Σ(wi²). Low ESS indicates highly variable weights and imprecise estimates.',
      action_if_failed: 'Truncate extreme weights, use stabilized weights, or switch to overlap weights (which inherently limit ESS loss). Report both the nominal and effective sample sizes.',
    },
    {
      diagnostic: 'C-statistic / AUC of PS Model',
      threshold: 'Informational only — higher is not necessarily better for balance',
      description: 'The C-statistic of the PS model measures discrimination between treated and comparator groups. A very high C-statistic (>0.9) may indicate structural non-overlap. A very low C-statistic (<0.55) may indicate the model is not capturing meaningful treatment selection factors.',
      action_if_failed: 'A high C-statistic with poor overlap may require restricting the study population. A low C-statistic with good balance may be acceptable. Do not optimize the PS model for prediction accuracy — optimize for covariate balance after application.',
    },
    {
      diagnostic: 'Negative Control Outcomes',
      threshold: 'Effect estimate for negative control outcomes should include the null (HR ≈ 1.0)',
      description: 'Outcomes known a priori to not be causally affected by the treatment. If the analysis detects a spurious effect on a negative control outcome, this suggests residual confounding or systematic bias.',
      action_if_failed: 'Use empirical calibration (Schuemie et al., 2020) to adjust effect estimates based on the observed bias distribution from negative controls. Report the calibration results.',
    },
  ];

  // Sensitivity analyses
  const sensitivityAnalyses: string[] = [
    'E-value: compute the minimum association strength an unmeasured confounder would need with both treatment and outcome to explain away the observed effect (VanderWeele & Ding, 2017)',
    'Alternative PS estimation method (e.g., GBM if primary is logistic, or vice versa)',
    'Alternative PS application method (e.g., IPTW if primary is matching, or overlap weights)',
    'Vary caliper width (0.1, 0.2, 0.25 × SD of logit PS) for matching analyses',
    'Vary weight truncation thresholds (1st/99th, 2.5th/97.5th, 5th/95th percentiles) for IPTW',
    'High-dimensional propensity score (hdPS) as an empirical confounder selection supplement',
    'Quantitative bias analysis for unmeasured confounding using Bayesian methods (Lash et al., 2009)',
    'Negative control outcome and negative control exposure analysis with empirical calibration',
  ];

  // Trimming strategy
  const trimmingStrategy = treatmentPrevalence < 0.1 || treatmentPrevalence > 0.9
    ? `Treatment prevalence is ${(treatmentPrevalence * 100).toFixed(1)}% — there is likely poor overlap in the PS distribution tails. Recommended: (1) symmetric trimming at the 2.5th and 97.5th percentiles of the PS, (2) asymmetric trimming based on the counterfactual density, or (3) preferably switch to overlap weights which inherently handle poor overlap without arbitrary trimming thresholds (Li et al., 2019).`
    : `Treatment prevalence is ${(treatmentPrevalence * 100).toFixed(1)}% — moderate overlap is expected. Assess positivity diagnostics before trimming. If needed, trim at the 1st/99th percentiles and report sensitivity to the trimming threshold.`;

  const treatedN = Math.round(sampleSize * treatmentPrevalence);
  const comparatorN = sampleSize - treatedN;
  const effectiveSampleSizeNote = applicationMethod === 'matching_1to1'
    ? `After 1:1 matching, the maximum analyzable sample is 2 × ${Math.min(treatedN, comparatorN)} = ${2 * Math.min(treatedN, comparatorN)} (limited by the smaller group). Actual matched pairs will be fewer due to caliper exclusions — report the matching rate.`
    : applicationMethod === 'iptw'
    ? `After IPTW, the effective sample size (ESS) depends on weight variability. With ${sampleSize} patients (${treatedN} treated, ${comparatorN} comparator), stabilized weights and good overlap should yield ESS ≥ ${Math.round(sampleSize * 0.6)} (60%+). Report the actual ESS.`
    : `After ${applicationMethod}, report the effective sample size and any exclusions.`;

  return {
    primaryRecommendation,
    alternatives,
    diagnosticsPlan,
    sensitivityAnalyses,
    trimmingStrategy,
    effectiveSampleSizeNote,
    citations: cite('AUSTIN_2011', 'LI_THOMAS_LI_2019', 'PETERSEN_2012', 'VANDERWEELE_DING_2017', 'SCHUEMIE_2020'),
    notes: [
      `Sample size: ${sampleSize}, confounders: ${nConfounders}, treatment prevalence: ${(treatmentPrevalence * 100).toFixed(1)}%.`,
      `Target estimand: ${targetEstimand === 'att' ? 'ATT (Average Treatment effect on the Treated)' : targetEstimand === 'ate' ? 'ATE (Average Treatment Effect)' : 'ATO (Average Treatment effect in the Overlap population)'}.`,
      'The PS is a tool for confounding adjustment — not a measure of treatment benefit. Do not interpret the PS itself clinically.',
      'Balance is the gold standard for PS performance — not prediction accuracy (C-statistic).',
      'Deterministic: identical inputs always produce identical output. No LLM, no network.',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Study Design Pattern Selection
// ─────────────────────────────────────────────────────────────────────────────

export type RWEDesignType =
  | 'new_user_active_comparator'
  | 'prevalent_user_cohort'
  | 'nested_case_control'
  | 'self_controlled_case_series'
  | 'self_controlled_risk_interval'
  | 'interrupted_time_series'
  | 'difference_in_differences'
  | 'regression_discontinuity'
  | 'instrumental_variable';

export interface RWEDesignParams {
  /** Type of causal question. */
  questionType: 'treatment_effect' | 'safety_signal' | 'policy_impact' | 'dose_response';
  /** Whether the exposure is time-varying (e.g., ongoing medication use). */
  timeVaryingExposure: boolean;
  /** Whether the outcome is rare (< 1 per 1000 person-years). */
  rareOutcome: boolean;
  /** Whether the outcome is acute/transient (e.g., occurs within days-weeks of exposure). */
  acuteOutcome: boolean;
  /** Whether a natural experiment or policy discontinuity exists. */
  naturalExperiment: boolean;
  /** Whether within-person comparison is feasible (recurrent outcome). */
  withinPersonComparison: boolean;
  /** Whether unmeasured confounding is a major concern. */
  strongConfoundingConcern: boolean;
}

interface DesignRecommendation {
  design: RWEDesignType;
  designName: string;
  rank: 'primary' | 'alternative';
  description: string;
  strengths: string[];
  limitations: string[];
  biasConsiderations: string[];
  keyReferences: Citation[];
}

export interface RWEDesignResult {
  primaryDesign: DesignRecommendation;
  alternatives: DesignRecommendation[];
  selectionRationale: string;
  designSpecificChecklist: string[];
  citations: Citation[];
  notes: string[];
}

const DESIGN_CATALOG: Record<RWEDesignType, Omit<DesignRecommendation, 'rank'>> = {
  new_user_active_comparator: {
    design: 'new_user_active_comparator',
    designName: 'New-User Active-Comparator Cohort',
    description: 'Compare new initiators of the study treatment to new initiators of an active comparator for the same indication. Index date is the first qualifying dispensing/administration. All covariates measured before the index date. Follow from index date prospectively.',
    strengths: [
      'Avoids prevalent user bias and depletion of susceptibles',
      'Active comparator mitigates confounding by indication',
      'Aligns with target trial emulation framework',
      'Well-accepted by regulatory authorities (FDA, EMA)',
      'Clean time-zero alignment',
    ],
    limitations: [
      'Requires a clinically appropriate active comparator',
      'Residual confounding from unmeasured confounders remains',
      'May have limited power if one treatment is uncommon',
      'Cannot study first-in-class drugs without an active comparator',
    ],
    biasConsiderations: [
      'Selection bias if eligibility criteria differ between treatment arms',
      'Channeling bias if one treatment is used for more severe patients',
      'Protopathic bias if exposure is initiated because of early outcome symptoms',
    ],
    keyReferences: [CITATIONS.RAY_2003, CITATIONS.HERNAN_ROBINS_2020],
  },
  prevalent_user_cohort: {
    design: 'prevalent_user_cohort',
    designName: 'Prevalent User Cohort',
    description: 'Include patients already on treatment at cohort entry. Simpler to implement but methodologically inferior to new-user design for causal inference.',
    strengths: [
      'Larger sample size (includes ongoing users)',
      'Useful for studying long-term effects in patients established on therapy',
    ],
    limitations: [
      'Depletion of susceptibles: survivors of early treatment are included, biasing toward apparent safety',
      'Confounds treatment initiation with treatment persistence effects',
      'Time-zero is ill-defined for causal inference',
      'Generally not recommended for regulatory submissions',
    ],
    biasConsiderations: [
      'Prevalent user bias is the primary concern — see Ray (2003)',
      'Survivor bias: only patients who tolerated and continued the drug are included',
      'Adjustment for duration of use is needed but insufficient to fully address the bias',
    ],
    keyReferences: [CITATIONS.RAY_2003],
  },
  nested_case_control: {
    design: 'nested_case_control',
    designName: 'Nested Case-Control',
    description: 'Within a defined cohort, select cases (patients with the outcome) and time-matched controls (patients at risk at the case event time). Exposure and covariates are assessed before the index date. Efficient for rare outcomes.',
    strengths: [
      'Computationally efficient for rare outcomes',
      'Produces odds ratios that approximate incidence rate ratios when using incidence density sampling',
      'Well-suited for pharmacovigilance studies',
      'Reduces the covariate collection burden to cases and matched controls',
    ],
    limitations: [
      'Cannot directly estimate incidence rates or absolute risks without additional information',
      'Control selection can introduce bias if matching is poorly done',
      'Nested within a defined cohort — results depend on the base cohort definition',
    ],
    biasConsiderations: [
      'Selection bias from control sampling if risk sets are defined incorrectly',
      'Recall bias is minimal (uses recorded data, not patient recall)',
      'Exposure window definitions critical — must precede the outcome',
    ],
    keyReferences: [CITATIONS.HERNAN_ROBINS_2020],
  },
  self_controlled_case_series: {
    design: 'self_controlled_case_series',
    designName: 'Self-Controlled Case Series (SCCS)',
    description: 'Within-person design that compares the incidence of outcomes during exposed (risk) periods to unexposed (baseline) periods for the same individual. Each person serves as their own control, inherently adjusting for all time-invariant confounders.',
    strengths: [
      'Eliminates all time-invariant confounding (genetic, chronic conditions, stable lifestyle factors)',
      'Only requires cases (patients with the outcome) — no need for controls',
      'Powerful for acute outcomes following vaccinations or medications',
      'Established methodology for vaccine safety surveillance (e.g., VAERS, BEST)',
    ],
    limitations: [
      'Requires the event to be recurrent or the observation period to not be censored by the event (use extensions for event-dependent censoring)',
      'Time-varying confounders not controlled (e.g., seasonal effects, age within the observation window)',
      'Assumes exposure does not affect the probability of future exposure',
      'Not suitable for chronic/absorbing outcomes (e.g., death) without modification',
    ],
    biasConsiderations: [
      'Event-dependent exposure: if the outcome changes future exposure probability, the standard SCCS is biased',
      'Censoring by the event: death or other absorbing events require the event-dependent extension (Farrington et al., 2011)',
      'Age effects should be modeled if the observation window spans a wide age range',
    ],
    keyReferences: [CITATIONS.HERNAN_ROBINS_2020],
  },
  self_controlled_risk_interval: {
    design: 'self_controlled_risk_interval',
    designName: 'Self-Controlled Risk Interval (SCRI)',
    description: 'A within-person design that compares the incidence of outcomes during a risk window (shortly after exposure) to a control window (before exposure or later after exposure). Simpler than SCCS with a fixed risk/control window rather than full observation-period modeling.',
    strengths: [
      'Simpler to implement than full SCCS',
      'Eliminates time-invariant confounding',
      'Well-suited for acute post-vaccination or post-procedural outcomes',
      'Requires only exposed individuals with the outcome',
    ],
    limitations: [
      'Choice of risk and control window lengths is subjective and influential',
      'Cannot handle time-varying confounders within the observation window',
      'Less efficient than SCCS for multiple risk windows or complex exposure patterns',
    ],
    biasConsiderations: [
      'Window selection bias: results sensitive to risk window definition',
      'Healthy vaccinee bias: if control window is pre-exposure, patients may be healthier before exposure',
    ],
    keyReferences: [CITATIONS.HERNAN_ROBINS_2020],
  },
  interrupted_time_series: {
    design: 'interrupted_time_series',
    designName: 'Interrupted Time Series (ITS)',
    description: 'Assess the impact of a population-level intervention (policy change, formulary switch) by modeling the trend in an outcome before and after the intervention time point. Requires a clear intervention date and sufficient pre/post observations.',
    strengths: [
      'Controls for secular trends (pre-existing time trend)',
      'Natural design for policy interventions',
      'Does not require individual-level treatment assignment',
      'Transparent and intuitive visual interpretation',
    ],
    limitations: [
      'Requires sufficient pre- and post-intervention time points (≥ 8 each recommended)',
      'Cannot control for concurrent events (co-interventions) at the same time',
      'Assumes the pre-intervention trend would have continued absent the intervention',
      'Aggregated data loses individual-level confounding adjustment',
    ],
    biasConsiderations: [
      'History threat: concurrent events may coincide with the intervention',
      'Autocorrelation in time-series data must be addressed (Newey-West or autoregressive models)',
      'Seasonality must be modeled if outcome has seasonal patterns',
    ],
    keyReferences: [CITATIONS.HERNAN_ROBINS_2020],
  },
  difference_in_differences: {
    design: 'difference_in_differences',
    designName: 'Difference-in-Differences (DiD)',
    description: 'Compare the change in outcomes over time between a group exposed to an intervention and a group not exposed. The "difference of the differences" removes time-invariant confounding and shared temporal trends.',
    strengths: [
      'Controls for time-invariant confounders and shared secular trends simultaneously',
      'Intuitive — the control group provides the counterfactual trend',
      'Applicable when randomization is not feasible but a comparable unexposed group exists',
      'Widely used for policy evaluation and formulary change studies',
    ],
    limitations: [
      'Requires the parallel trends assumption: absent the intervention, both groups would have followed the same trend',
      'Cannot directly test the parallel trends assumption (can assess pre-intervention parallelism)',
      'Staggered treatment adoption requires modern DiD estimators (Callaway-Sant\'Anna, Sun-Abraham)',
      'Compositional changes in groups over time can violate assumptions',
    ],
    biasConsiderations: [
      'Parallel trends violation is the main threat to validity',
      'Contamination: if the control group is indirectly affected by the intervention',
      'Ashenfelter dip: if treatment adoption is triggered by an outcome change, pre-trends will be non-parallel',
    ],
    keyReferences: [CITATIONS.HERNAN_ROBINS_2020],
  },
  regression_discontinuity: {
    design: 'regression_discontinuity',
    designName: 'Regression Discontinuity (RD)',
    description: 'Exploit a threshold rule in treatment assignment (e.g., HbA1c > 7% triggers treatment intensification, age ≥ 65 triggers Medicare eligibility). Patients just above and below the threshold are quasi-randomly assigned, creating a local experiment.',
    strengths: [
      'Near-random assignment at the threshold — strong internal validity',
      'Transparent and visually compelling',
      'Controls for both measured and unmeasured confounders near the threshold',
      'Increasing acceptance in health policy and pharmacoepidemiology',
    ],
    limitations: [
      'Requires a clear, known threshold determining treatment assignment',
      'Local estimate: effect applies only to patients near the threshold (LATE)',
      'Manipulation of the running variable (gaming the threshold) threatens validity',
      'Requires large samples for adequate power near the cutoff',
    ],
    biasConsiderations: [
      'Manipulation/sorting: check for bunching of observations just above/below the threshold (McCrary density test)',
      'Bandwidth selection is influential — use data-driven methods (MSE-optimal) with sensitivity to bandwidth choice',
      'Covariate smoothness at the threshold should be verified',
    ],
    keyReferences: [CITATIONS.HERNAN_ROBINS_2020],
  },
  instrumental_variable: {
    design: 'instrumental_variable',
    designName: 'Instrumental Variable (IV)',
    description: 'Use a variable (instrument) that affects treatment assignment but has no direct effect on the outcome except through treatment. Common instruments: physician prescribing preference, geographic distance to specialty center, formulary restrictions, calendar time of presentation.',
    strengths: [
      'Can address unmeasured confounding when a valid instrument exists',
      'Estimates a causal effect under the monotonicity assumption',
      'Useful when PS methods are insufficient due to strong unmeasured confounding',
    ],
    limitations: [
      'Requires a valid instrument (relevance, independence, exclusion restriction) — difficult to verify',
      'Estimates a local average treatment effect (LATE) for compliers — not the ATE',
      'Weak instruments produce biased estimates and wide confidence intervals',
      'The exclusion restriction is untestable and must be argued on clinical/substantive grounds',
    ],
    biasConsiderations: [
      'Weak instrument bias: F-statistic < 10 indicates a weak instrument; results unreliable',
      'Exclusion restriction violation: if the instrument affects the outcome through a path other than treatment, the IV estimate is biased',
      'Monotonicity violation: if some patients respond to the instrument in the opposite direction (defiers), the LATE interpretation breaks down',
    ],
    keyReferences: [CITATIONS.HERNAN_ROBINS_2020],
  },
};

export function selectRWEDesign(params: RWEDesignParams): RWEDesignResult {
  const {
    questionType,
    timeVaryingExposure,
    rareOutcome,
    acuteOutcome,
    naturalExperiment,
    withinPersonComparison,
    strongConfoundingConcern,
  } = params;

  let primaryDesignType: RWEDesignType;
  const alternativeDesignTypes: RWEDesignType[] = [];
  let selectionRationale: string;

  // Decision logic
  if (naturalExperiment && questionType === 'policy_impact') {
    primaryDesignType = 'difference_in_differences';
    alternativeDesignTypes.push('interrupted_time_series', 'regression_discontinuity');
    selectionRationale = 'A natural experiment or policy change is present — quasi-experimental designs that exploit this variation are appropriate. DiD is primary when a comparable unexposed group is available; ITS when there is no unexposed group; RD when a threshold rule governs treatment.';
  } else if (withinPersonComparison && acuteOutcome) {
    primaryDesignType = 'self_controlled_case_series';
    alternativeDesignTypes.push('self_controlled_risk_interval', 'new_user_active_comparator');
    selectionRationale = 'The outcome is acute and within-person comparison is feasible — self-controlled designs inherently adjust for all time-invariant confounders. SCCS is primary; SCRI is simpler. A new-user cohort study is included as an alternative for external comparison.';
  } else if (strongConfoundingConcern && !timeVaryingExposure) {
    primaryDesignType = 'instrumental_variable';
    alternativeDesignTypes.push('new_user_active_comparator', 'regression_discontinuity');
    selectionRationale = 'Strong unmeasured confounding is the primary concern and PS methods alone may be insufficient. An IV analysis is recommended if a valid instrument can be identified. The new-user active-comparator design with E-value analysis is the standard alternative.';
  } else if (rareOutcome && questionType === 'safety_signal') {
    primaryDesignType = 'nested_case_control';
    alternativeDesignTypes.push('self_controlled_case_series', 'new_user_active_comparator');
    selectionRationale = 'Rare outcome with a safety question — the nested case-control design is efficient because it only requires covariate ascertainment for cases and sampled controls. Self-controlled designs are useful when the outcome is acute and recurrent.';
  } else {
    primaryDesignType = 'new_user_active_comparator';
    alternativeDesignTypes.push('nested_case_control');
    if (acuteOutcome) alternativeDesignTypes.push('self_controlled_case_series');
    if (strongConfoundingConcern) alternativeDesignTypes.push('instrumental_variable');
    selectionRationale = 'The new-user active-comparator cohort design is the default for treatment effect and comparative effectiveness questions. It aligns with the target trial emulation framework, avoids prevalent user bias, and is the design most accepted by regulatory authorities for RWE submissions.';
  }

  const primaryCatalog = DESIGN_CATALOG[primaryDesignType];
  const primaryDesign: DesignRecommendation = { ...primaryCatalog, rank: 'primary' };

  const alternatives: DesignRecommendation[] = alternativeDesignTypes.map(dt => ({
    ...DESIGN_CATALOG[dt],
    rank: 'alternative' as const,
  }));

  // Design-specific implementation checklist
  const designChecklists: Record<RWEDesignType, string[]> = {
    new_user_active_comparator: [
      'Define new-user washout period (≥ 180 days without the study drug)',
      'Identify a clinically appropriate active comparator used for the same indication',
      'Align time zero: eligibility, treatment assignment, and follow-up start on the index date',
      'Specify covariate lookback windows for baseline assessment',
      'Pre-specify propensity score model and balance diagnostics',
      'Define the outcome algorithm with known validation metrics (PPV, sensitivity)',
      'Pre-specify sensitivity analyses (PS method variants, E-value, negative controls)',
    ],
    prevalent_user_cohort: [
      'Document the rationale for prevalent user design (why new-user is not feasible)',
      'Adjust for duration of prior use at cohort entry',
      'Acknowledge survivor/depletion-of-susceptibles bias in limitations',
      'Consider restricting to patients with stable treatment duration',
    ],
    nested_case_control: [
      'Define the base cohort from which cases and controls are sampled',
      'Use incidence density sampling for controls (risk set matching)',
      'Specify the number of controls per case (typically 4-10)',
      'Define the exposure window (etiologically relevant period before the event)',
      'Match controls on time-at-risk (index date = case event date)',
    ],
    self_controlled_case_series: [
      'Define the risk window(s) after exposure onset',
      'Define the baseline (unexposed) observation period',
      'Specify how to handle the pre-exposure period (exclude or include as baseline)',
      'Address event-dependent censoring if the outcome is death or absorbing',
      'Model age effects if the observation window spans > 1 year',
      'Verify that exposure does not affect future exposure probability',
    ],
    self_controlled_risk_interval: [
      'Define the risk window and control window lengths with clinical justification',
      'Document sensitivity to window length choices',
      'Verify within-person independence assumption',
    ],
    interrupted_time_series: [
      'Identify the precise intervention date',
      'Obtain ≥ 8 time points pre- and post-intervention',
      'Test for and address autocorrelation (Durbin-Watson test)',
      'Model seasonality if present',
      'Identify and document any co-interventions',
      'Assess for level change AND slope change effects',
    ],
    difference_in_differences: [
      'Identify a comparable unexposed (control) group',
      'Assess pre-intervention parallel trends (visual + statistical)',
      'Document ≥ 3 pre-intervention time points for trend assessment',
      'Address staggered treatment adoption if applicable',
      'Test for compositional changes in groups over time',
    ],
    regression_discontinuity: [
      'Identify the treatment assignment threshold and running variable',
      'Conduct McCrary density test for manipulation of the running variable',
      'Verify covariate smoothness at the threshold',
      'Select bandwidth using MSE-optimal methods (Imbens-Kalyanaraman, Calonico-Cattaneo-Titiunik)',
      'Report sensitivity to bandwidth choice and polynomial order',
    ],
    instrumental_variable: [
      'Identify and justify the instrument with clinical/epidemiological reasoning',
      'Test instrument relevance (first-stage F-statistic > 10)',
      'Argue the exclusion restriction on substantive grounds (untestable)',
      'Report the LATE interpretation (effect among compliers)',
      'Conduct sensitivity to instrument definition',
      'Report the first-stage relationship strength',
    ],
  };

  return {
    primaryDesign,
    alternatives,
    selectionRationale,
    designSpecificChecklist: designChecklists[primaryDesignType],
    citations: cite('HERNAN_ROBINS_2020', 'RAY_2003', 'FDA_RWE_FRAMEWORK_2018'),
    notes: [
      `Question type: ${questionType}. Rare outcome: ${rareOutcome}. Acute outcome: ${acuteOutcome}.`,
      `Primary design: ${primaryDesign.designName}.`,
      'Design selection is a function of the study question, outcome characteristics, and available data features.',
      'Multiple designs should be considered as sensitivity analyses when feasible.',
      'Deterministic: identical inputs always produce identical output. No LLM, no network.',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Bias Framework
// ─────────────────────────────────────────────────────────────────────────────

export type ExposureType = 'drug' | 'vaccine' | 'procedure' | 'device' | 'policy';

export interface BiasAssessmentParams {
  studyDesign: RWEDesignType;
  exposureType: ExposureType;
  dataSource: DataSourceType;
  /** Whether the outcome is self-reported or objectively measured. */
  selfReportedOutcome: boolean;
  /** Whether there is likely differential surveillance between groups. */
  differentialSurveillance: boolean;
  /** Estimated number of unmeasured confounders of moderate or strong influence. */
  nUnmeasuredConfounders: number;
  /** Whether an active comparator is used. */
  hasActiveComparator: boolean;
  /** Observed hazard ratio or risk ratio (point estimate). */
  observedEffectEstimate?: number;
  /** Lower bound of 95% CI for the effect estimate. */
  observedCILower?: number;
}

interface BiasEntry {
  category: 'selection_bias' | 'information_bias' | 'confounding';
  specificBias: string;
  riskLevel: 'high' | 'moderate' | 'low';
  direction: 'toward_null' | 'away_from_null' | 'unpredictable';
  explanation: string;
  mitigationStrategy: string;
}

interface SensitivityAnalysis {
  analysis: string;
  description: string;
  interpretation: string;
  required: boolean;
}

export interface BiasAssessmentResult {
  biases: BiasEntry[];
  overallBiasRisk: 'high' | 'moderate' | 'low';
  sensitivityAnalyses: SensitivityAnalysis[];
  eValueNote: string | null;
  citations: Citation[];
  notes: string[];
}

export function assessBiasRisk(params: BiasAssessmentParams): BiasAssessmentResult {
  const {
    studyDesign,
    exposureType,
    dataSource,
    selfReportedOutcome,
    differentialSurveillance,
    nUnmeasuredConfounders,
    hasActiveComparator,
    observedEffectEstimate,
    observedCILower,
  } = params;

  const biases: BiasEntry[] = [];

  // Selection bias assessment
  if (studyDesign === 'prevalent_user_cohort') {
    biases.push({
      category: 'selection_bias',
      specificBias: 'Prevalent user bias / depletion of susceptibles',
      riskLevel: 'high',
      direction: 'toward_null',
      explanation: 'Prevalent user design includes patients who have already survived early treatment — these survivors are likely more tolerant and at lower risk, biasing safety estimates toward the null.',
      mitigationStrategy: 'Switch to a new-user design if feasible. If not, adjust for duration of prior treatment and acknowledge this limitation.',
    });
  }

  if (!hasActiveComparator) {
    biases.push({
      category: 'selection_bias',
      specificBias: 'Confounding by indication (no active comparator)',
      riskLevel: 'high',
      direction: 'unpredictable',
      explanation: 'Without an active comparator, treated patients are compared to untreated patients, who differ systematically in their reasons for not receiving treatment (healthier, contraindicated, or different diagnosis severity).',
      mitigationStrategy: 'Use an active comparator new-user design. If not possible, use propensity score methods with careful covariate specification and extensive sensitivity analyses.',
    });
  }

  if (differentialSurveillance) {
    biases.push({
      category: 'selection_bias',
      specificBias: 'Surveillance / detection bias',
      riskLevel: 'moderate',
      direction: 'away_from_null',
      explanation: 'If one treatment group has more healthcare encounters (e.g., new drug users are monitored more closely), outcomes are more likely to be detected in that group, inflating the apparent risk.',
      mitigationStrategy: 'Measure and compare healthcare utilization between groups. Adjust for visit frequency. Conduct analyses restricted to outcomes detected in routine care settings.',
    });
  }

  // Information bias assessment
  if (dataSource === 'claims') {
    biases.push({
      category: 'information_bias',
      specificBias: 'Outcome misclassification from claims codes',
      riskLevel: 'moderate',
      direction: 'toward_null',
      explanation: 'Claims-based diagnosis codes have variable positive predictive value. Non-differential misclassification generally biases toward the null. Differential misclassification (if outcome recording differs by treatment) can bias in either direction.',
      mitigationStrategy: 'Use validated claims-based algorithms. Conduct quantitative bias analysis adjusting for known sensitivity/specificity. Use multiple outcome definitions as sensitivity analyses.',
    });
  }

  if (selfReportedOutcome) {
    biases.push({
      category: 'information_bias',
      specificBias: 'Reporting / recall bias',
      riskLevel: 'moderate',
      direction: 'unpredictable',
      explanation: 'Self-reported outcomes are subject to recall bias (differential recall between exposed and unexposed) and social desirability bias.',
      mitigationStrategy: 'Use objective outcome measures when available. For patient-reported outcomes, use validated instruments and collect prospectively when possible.',
    });
  }

  if (exposureType === 'drug' && dataSource === 'ehr') {
    biases.push({
      category: 'information_bias',
      specificBias: 'Exposure misclassification (medication adherence)',
      riskLevel: 'moderate',
      direction: 'toward_null',
      explanation: 'EHR records medication orders/prescriptions, not actual dispensing or adherence. Patients may not fill or take medications as prescribed, leading to exposure misclassification.',
      mitigationStrategy: 'Link to pharmacy dispensing data. Use proportion of days covered (PDC) or medication possession ratio (MPR) as adherence proxies. Conduct intention-to-treat and per-protocol analyses.',
    });
  }

  // Confounding assessment
  if (nUnmeasuredConfounders > 0) {
    const confoundingRisk: 'high' | 'moderate' | 'low' = nUnmeasuredConfounders >= 3 ? 'high' : nUnmeasuredConfounders >= 1 ? 'moderate' : 'low';
    biases.push({
      category: 'confounding',
      specificBias: 'Unmeasured confounding',
      riskLevel: confoundingRisk,
      direction: 'unpredictable',
      explanation: `Approximately ${nUnmeasuredConfounders} potentially influential confounder(s) are not measured in the available data. These may include disease severity, frailty, socioeconomic factors, over-the-counter medication use, lifestyle factors, or patient preferences.`,
      mitigationStrategy: 'Compute the E-value. Conduct probabilistic bias analysis. Use negative control outcomes/exposures for empirical calibration. Consider instrumental variable analysis if a valid instrument exists.',
    });
  }

  biases.push({
    category: 'confounding',
    specificBias: 'Time-related biases',
    riskLevel: studyDesign === 'new_user_active_comparator' ? 'low' : 'moderate',
    direction: 'away_from_null',
    explanation: 'Immortal time bias, time-zero misalignment, and time-window bias can introduce spurious apparent treatment effects. These are design-level biases that cannot be corrected by statistical adjustment alone.',
    mitigationStrategy: 'Use target trial emulation with strict time-zero alignment. Ensure eligibility, treatment assignment, and follow-up start coincide. Use the new-user design.',
  });

  // Overall risk
  const highCount = biases.filter(b => b.riskLevel === 'high').length;
  const moderateCount = biases.filter(b => b.riskLevel === 'moderate').length;
  const overallBiasRisk: 'high' | 'moderate' | 'low' =
    highCount >= 2 ? 'high' :
    highCount >= 1 || moderateCount >= 3 ? 'moderate' : 'low';

  // Sensitivity analyses
  const sensitivityAnalyses: SensitivityAnalysis[] = [
    {
      analysis: 'E-value for unmeasured confounding',
      description: 'The E-value is the minimum strength of association, on the risk ratio scale, that an unmeasured confounder would need to have with both the treatment and the outcome to fully explain away the observed treatment-outcome association (VanderWeele & Ding, 2017).',
      interpretation: 'A large E-value (e.g., > 3) means that a very strong unmeasured confounder would be needed to negate the finding. A small E-value (e.g., < 1.5) means even a modest confounder could explain the result.',
      required: true,
    },
    {
      analysis: 'Negative control outcomes',
      description: 'Outcomes known a priori to not be caused by the treatment of interest. If the analysis finds a significant association with negative control outcomes, this indicates residual systematic bias (confounding or other).',
      interpretation: 'Ideally, effect estimates for negative control outcomes should include the null (e.g., HR ≈ 1.0). Systematic deviation from the null across multiple negative controls indicates the magnitude of residual bias.',
      required: true,
    },
    {
      analysis: 'Negative control exposures',
      description: 'Exposures known a priori to not cause the outcome of interest. Testing these exposures against the study outcome reveals systematic biases in the study design.',
      interpretation: 'If negative control exposures show associations with the study outcome, the bias is in the outcome ascertainment or confounding structure, not exposure-specific.',
      required: nUnmeasuredConfounders > 0,
    },
    {
      analysis: 'Probabilistic / quantitative bias analysis',
      description: 'Formal statistical method that models the bias parameters (e.g., confounder prevalence, confounder-outcome association) as probability distributions and propagates them through the analysis to produce bias-adjusted effect estimates with uncertainty intervals that incorporate both random error and systematic error (Lash et al., 2009).',
      interpretation: 'The bias-adjusted estimate and 95% simulation interval represent the plausible range of the true effect after accounting for the specified bias.',
      required: overallBiasRisk === 'high',
    },
    {
      analysis: 'Multiple PS methods sensitivity',
      description: 'Repeat the primary analysis using alternative propensity score methods (matching, IPTW, overlap weights, stratification, doubly robust) to assess robustness of results across analytic approaches.',
      interpretation: 'Consistent results across multiple PS methods strengthen the causal inference. Divergent results warrant investigation of the source of discrepancy (e.g., positivity violations, model misspecification).',
      required: studyDesign === 'new_user_active_comparator',
    },
  ];

  // E-value computation note
  let eValueNote: string | null = null;
  if (observedEffectEstimate !== undefined && observedCILower !== undefined) {
    // E-value formula for risk ratios
    const rr = observedEffectEstimate;
    const rrLower = observedCILower;
    if (rr > 0 && rrLower > 0) {
      const eValuePoint = rr >= 1
        ? rr + Math.sqrt(rr * (rr - 1))
        : 1 / rr + Math.sqrt((1 / rr) * (1 / rr - 1));
      const rrForCI = rrLower >= 1 ? rrLower : 1 / rrLower;
      const eValueCI = rrForCI >= 1
        ? rrForCI + Math.sqrt(rrForCI * (rrForCI - 1))
        : 1;
      eValueNote = `E-value for the point estimate (RR=${rr.toFixed(2)}): ${eValuePoint.toFixed(2)}. E-value for the confidence limit closest to the null (RR=${rrLower.toFixed(2)}): ${eValueCI.toFixed(2)}. An unmeasured confounder would need associations of at least RR=${eValuePoint.toFixed(2)} with both treatment and outcome to explain the observed effect. If this strength of confounding is implausible given the subject matter, the finding is more robust to unmeasured confounding.`;
    }
  }

  return {
    biases,
    overallBiasRisk,
    sensitivityAnalyses,
    eValueNote,
    citations: cite('VANDERWEELE_DING_2017', 'LASH_FOX_FINK_2009', 'SCHUEMIE_2020', 'SCHNEEWEISS_2006', 'SUISSA_2008'),
    notes: [
      `Study design: ${studyDesign}. Exposure type: ${exposureType}. Data source: ${dataSource}.`,
      `Overall bias risk: ${overallBiasRisk} (${highCount} high-risk, ${moderateCount} moderate-risk biases identified).`,
      'This assessment covers selection bias, information bias, and confounding. Additional study-specific biases should be considered based on the clinical context.',
      'Deterministic: identical inputs always produce identical output. No LLM, no network.',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Regulatory Acceptability
// ─────────────────────────────────────────────────────────────────────────────

export type RegulatoryPurpose =
  | 'label_expansion'
  | 'new_indication'
  | 'post_marketing_safety'
  | 'post_marketing_effectiveness'
  | 'comparative_effectiveness'
  | 'formulary_coverage'
  | 'pediatric_extrapolation'
  | 'accelerated_approval_confirmation';

export type RegulatoryAuthority = 'fda' | 'ema' | 'pmda' | 'health_canada' | 'multiple';

export interface RegulatoryAcceptabilityParams {
  purpose: RegulatoryPurpose;
  authority: RegulatoryAuthority;
  studyDesign: RWEDesignType;
  dataSource: DataSourceType;
  /** Whether the study is pre-registered (e.g., on ClinicalTrials.gov or EU PAS Register). */
  preRegistered: boolean;
  /** Whether validated outcome definitions are used. */
  validatedOutcomes: boolean;
  /** Whether there is a concurrent randomized trial or existing trial data for the same question. */
  existingTrialData: boolean;
  /** Sample size. */
  sampleSize: number;
}

interface RegulatoryPrecedent {
  case: string;
  year: number;
  authority: string;
  decision: string;
  relevance: string;
}

interface EvidenceRequirement {
  requirement: string;
  status: 'met' | 'partially_met' | 'not_met';
  recommendation: string;
}

export interface RegulatoryAcceptabilityResult {
  overallAcceptability: 'high' | 'moderate' | 'low' | 'insufficient';
  regulatoryPathway: string;
  evidenceRequirements: EvidenceRequirement[];
  precedents: RegulatoryPrecedent[];
  keyGuidances: { title: string; year: number; relevance: string }[];
  recommendations: string[];
  citations: Citation[];
  notes: string[];
}

export function assessRegulatoryAcceptability(params: RegulatoryAcceptabilityParams): RegulatoryAcceptabilityResult {
  const {
    purpose,
    authority,
    studyDesign,
    dataSource,
    preRegistered,
    validatedOutcomes,
    existingTrialData,
    sampleSize,
  } = params;

  // Evidence requirements assessment
  const evidenceRequirements: EvidenceRequirement[] = [
    {
      requirement: 'Study pre-registration with complete protocol before data access',
      status: preRegistered ? 'met' : 'not_met',
      recommendation: preRegistered
        ? 'Protocol pre-registration documented. Ensure the registry entry includes the full statistical analysis plan.'
        : 'Pre-register the study protocol on ClinicalTrials.gov, EU PAS Register, or ENCEPP. FDA strongly recommends protocol registration before data access to reduce investigator degrees of freedom.',
    },
    {
      requirement: 'Validated outcome and exposure definitions',
      status: validatedOutcomes ? 'met' : 'not_met',
      recommendation: validatedOutcomes
        ? 'Validated outcome algorithms in use. Document the validation study reference, PPV, sensitivity, and specificity.'
        : 'Validate the primary outcome and exposure algorithms against chart review or a gold standard. FDA Draft Guidance (2021) emphasizes the need for variable validation.',
    },
    {
      requirement: 'Data relevance to the regulatory question',
      status: sampleSize >= 500 ? 'met' : sampleSize >= 100 ? 'partially_met' : 'not_met',
      recommendation: sampleSize >= 500
        ? `Sample size (n=${sampleSize}) is adequate for most regulatory purposes.`
        : `Sample size (n=${sampleSize}) may be insufficient. Consider multi-database studies or distributed research networks to increase power.`,
    },
    {
      requirement: 'Data reliability and quality documentation',
      status: dataSource === 'linked_claims_ehr' || dataSource === 'integrated_delivery_network' || dataSource === 'registry' ? 'met' : 'partially_met',
      recommendation: 'Document data accrual processes, data quality metrics (completeness rates, coding accuracy), data management and curation procedures, and the data governance framework.',
    },
    {
      requirement: 'Appropriate study design for causal inference',
      status: studyDesign === 'new_user_active_comparator' || studyDesign === 'self_controlled_case_series' ? 'met' : studyDesign === 'nested_case_control' || studyDesign === 'difference_in_differences' ? 'partially_met' : 'not_met',
      recommendation: studyDesign === 'new_user_active_comparator'
        ? 'New-user active-comparator design is the gold standard for regulatory-grade RWE studies.'
        : `The ${studyDesign.replace(/_/g, ' ')} design should be justified relative to the new-user active-comparator alternative. Document why this design is more appropriate for the specific research question.`,
    },
    {
      requirement: 'Sensitivity analyses for unmeasured confounding',
      status: 'partially_met',
      recommendation: 'Include E-value analysis, negative control outcomes/exposures, and quantitative bias analysis. Multiple analytic approaches (PS matching, IPTW, doubly robust) should produce consistent results.',
    },
    {
      requirement: 'Transparency and reproducibility',
      status: preRegistered ? 'met' : 'partially_met',
      recommendation: 'Provide full study protocol, statistical analysis plan, programming code (SAS/R/Python), data dictionary, and an analytic dataset specification. Follow RECORD-PE reporting guidelines.',
    },
  ];

  // Regulatory pathway guidance by purpose and authority
  const pathwayGuidance: Record<RegulatoryPurpose, string> = {
    label_expansion: 'RWE can support supplemental applications (sNDA/sBLA) for new indications, new populations, or removal of limitations-of-use statements. FDA has accepted RWE for label expansion (e.g., Ibrance [palbociclib] male breast cancer, December 2019). The evidence must be fit-for-purpose and meet the same evidentiary standards as a traditional clinical study for the specific regulatory question.',
    new_indication: 'RWE for entirely new indications faces a higher evidentiary bar. FDA has stated that RWE is more likely to be accepted for conditions where randomized trials are impractical, unethical, or where the treatment effect is large and unmistakable. A pre-submission meeting with the review division is strongly recommended.',
    post_marketing_safety: 'RWE is well-established for post-marketing safety surveillance. FDA Sentinel system routinely uses distributed RWD networks for active surveillance. Post-marketing required (PMR) and post-marketing committed (PMC) studies commonly use RWD. REMS evaluations frequently incorporate RWE.',
    post_marketing_effectiveness: 'Post-marketing effectiveness studies using RWE can support confirmatory evidence for accelerated approvals or post-approval evidence generation. The study must be designed to address the specific effectiveness question with adequate rigor.',
    comparative_effectiveness: 'Comparative effectiveness research is a core RWE application. PCORI, AHRQ, and international HTA bodies routinely commission RWE comparative effectiveness studies. Regulatory acceptance depends on the decision context (coverage vs. labeling vs. guidelines).',
    formulary_coverage: 'Payers and HTA bodies (NICE, AMCP, ICER) increasingly accept RWE for formulary and coverage decisions. AMCP Format for Formulary Submissions explicitly includes an RWE section. The evidentiary standard is generally lower than for regulatory labeling changes.',
    pediatric_extrapolation: 'ICH E11A supports using adult RWE data to inform pediatric development when disease similarity is established. RWE can support pediatric extrapolation by characterizing the natural history in children, treatment patterns, and outcomes.',
    accelerated_approval_confirmation: 'RWE may serve as confirmatory evidence for products granted accelerated approval. FDA has signaled openness to this pathway (21st Century Cures Act, Section 3021). The study must demonstrate the same clinical benefit shown in the accelerated approval clinical endpoint.',
  };

  // Regulatory precedents
  const precedents: RegulatoryPrecedent[] = [
    {
      case: 'Ibrance (palbociclib) — Male Breast Cancer Label Expansion',
      year: 2019,
      authority: 'FDA',
      decision: 'Approved sNDA based on RWE from electronic health records and IQVIA insurance claims. No randomized trial was required for this label expansion.',
      relevance: purpose === 'label_expansion' ? 'Directly relevant — first FDA approval using RWE as primary evidence for a new patient population.' : 'Demonstrates FDA precedent for RWE-based label changes.',
    },
    {
      case: 'Prograf (tacrolimus) — Pediatric Liver Transplant',
      year: 2021,
      authority: 'FDA',
      decision: 'Used RWD from transplant registries to support pediatric indication, supplementing limited trial data.',
      relevance: purpose === 'pediatric_extrapolation' ? 'Directly relevant — registry-based RWE supporting pediatric extrapolation.' : 'Demonstrates use of registry-based RWE for regulatory decisions.',
    },
    {
      case: 'Sentinel System Active Surveillance',
      year: 2016,
      authority: 'FDA',
      decision: 'Ongoing active safety surveillance using distributed claims/EHR data from 100M+ lives. Multiple safety signals evaluated and regulatory actions taken based on Sentinel analyses.',
      relevance: purpose === 'post_marketing_safety' ? 'Directly relevant — the established model for RWE-based safety surveillance.' : 'Demonstrates scalable RWE infrastructure for regulatory safety monitoring.',
    },
    {
      case: 'Kisqali (ribociclib) — Overall Survival in HR+/HER2- mBC',
      year: 2023,
      authority: 'FDA/EMA',
      decision: 'RWE studies provided supportive evidence for overall survival benefit in routine clinical practice, complementing pivotal trial data.',
      relevance: 'Demonstrates RWE as supportive/complementary evidence alongside randomized trial data.',
    },
    {
      case: 'COVID-19 Vaccine Safety Monitoring (BEST Initiative)',
      year: 2021,
      authority: 'FDA',
      decision: 'FDA CBER used the Biologics Effectiveness and Safety (BEST) system with claims and EHR data to monitor vaccine safety signals using self-controlled designs (SCRI, SCCS).',
      relevance: purpose === 'post_marketing_safety' ? 'Directly relevant — large-scale self-controlled design application for vaccine safety.' : 'Demonstrates rapid RWE deployment for safety surveillance.',
    },
  ];

  // Key guidances
  const allGuidances = [
    { title: 'FDA Framework for Real-World Evidence Program', year: 2018, relevance: 'Foundational document establishing FDA\'s approach to evaluating RWE for regulatory decisions. Defines data relevance and reliability requirements.' },
    { title: 'FDA Draft Guidance: Real-World Data — Assessing EHR and Claims Data', year: 2021, relevance: 'Specific guidance on data quality, completeness, and validity requirements for EHR and claims data used in regulatory submissions.' },
    { title: 'FDA Draft Guidance: Considerations for the Design and Conduct of Externally Controlled Trials', year: 2023, relevance: 'Guidance for single-arm trials with external RWD controls — design, data source, and analysis requirements.' },
    { title: 'FDA Draft Guidance: Submitting Documents Utilizing Real-World Data and Real-World Evidence to FDA', year: 2023, relevance: 'Practical guidance on how to submit RWE packages to FDA, including documentation and format requirements.' },
    { title: 'ICH E8(R1): General Considerations for Clinical Studies', year: 2021, relevance: 'Integrates RWE into the ICH clinical development framework. Acknowledges that clinical studies span the full spectrum from interventional trials to non-interventional studies using RWD.' },
    { title: 'EMA DARWIN EU Initiative', year: 2022, relevance: 'EMA\'s coordinated real-world data analysis network. Provides access to curated RWD sources across Europe for regulatory studies.' },
    { title: 'Japan PMDA: Utilization of Registry Data for Drug Applications', year: 2021, relevance: 'PMDA guidance on using registry data for regulatory submissions in Japan. Emphasizes data quality, governance, and fitness-for-purpose.' },
    { title: 'ISPE/ISPOR Good Practices for RWD Studies', year: 2017, relevance: 'Multi-stakeholder consensus on study design, data quality, and reporting standards for RWD studies intended to support regulatory and coverage decisions.' },
  ];

  // Filter guidances by authority
  const authorityGuidances: Record<RegulatoryAuthority, string[]> = {
    fda: ['FDA Framework', 'FDA Draft Guidance', 'ICH E8', 'ISPE/ISPOR'],
    ema: ['EMA DARWIN', 'ICH E8', 'ISPE/ISPOR'],
    pmda: ['Japan PMDA', 'ICH E8', 'ISPE/ISPOR'],
    health_canada: ['ICH E8', 'ISPE/ISPOR'],
    multiple: ['FDA Framework', 'FDA Draft Guidance', 'EMA DARWIN', 'Japan PMDA', 'ICH E8', 'ISPE/ISPOR'],
  };

  const relevantGuidances = authority === 'multiple'
    ? allGuidances
    : allGuidances.filter(g =>
        authorityGuidances[authority].some(keyword => g.title.includes(keyword)),
      );

  // Overall acceptability scoring
  const metCount = evidenceRequirements.filter(r => r.status === 'met').length;
  const partialCount = evidenceRequirements.filter(r => r.status === 'partially_met').length;
  const totalRequirements = evidenceRequirements.length;

  const acceptabilityScore = (metCount * 1.0 + partialCount * 0.5) / totalRequirements;
  const overallAcceptability: 'high' | 'moderate' | 'low' | 'insufficient' =
    acceptabilityScore >= 0.8 ? 'high' :
    acceptabilityScore >= 0.6 ? 'moderate' :
    acceptabilityScore >= 0.4 ? 'low' : 'insufficient';

  // Recommendations
  const recommendations: string[] = [];
  if (!preRegistered) {
    recommendations.push('Pre-register the study protocol before any data access or analysis. This is increasingly expected by regulators and essential for credibility.');
  }
  if (!validatedOutcomes) {
    recommendations.push('Validate the primary outcome and exposure algorithms. Cite published validation studies or conduct a de novo validation against chart review.');
  }
  if (purpose === 'label_expansion' || purpose === 'new_indication') {
    recommendations.push('Request a pre-submission meeting (Type B) with the relevant FDA review division to discuss the RWE strategy before conducting the study.');
  }
  if (!existingTrialData && purpose !== 'post_marketing_safety') {
    recommendations.push('When no prior randomized trial data exists, the evidentiary bar for RWE is higher. Consider whether a hybrid design (single-arm trial + external RWD control) may be more acceptable.');
  }
  if (studyDesign !== 'new_user_active_comparator' && purpose === 'label_expansion') {
    recommendations.push('For label expansion, the new-user active-comparator cohort design is strongly preferred by FDA. Document the rationale if an alternative design is used.');
  }
  recommendations.push('Follow RECORD-PE reporting guidelines for transparent study reporting.');
  recommendations.push('Include the full study protocol, statistical analysis plan, and analysis code in the regulatory submission package.');

  return {
    overallAcceptability,
    regulatoryPathway: pathwayGuidance[purpose],
    evidenceRequirements,
    precedents,
    keyGuidances: relevantGuidances,
    recommendations,
    citations: cite(
      'FDA_RWE_FRAMEWORK_2018',
      'FDA_EHR_CLAIMS_2021',
      'FDA_EXTERNAL_CONTROL_2023',
      'ICH_E8R1_2021',
      'EMA_DARWIN_2022',
      'PMDA_REGISTRY_2021',
      'FDA_LABEL_EXPANSION_2023',
      'ISPE_ISPOR_2017',
    ),
    notes: [
      `Regulatory purpose: ${purpose}. Authority: ${authority}. Study design: ${studyDesign}.`,
      `Overall acceptability: ${overallAcceptability} (${metCount}/${totalRequirements} requirements met, ${partialCount} partially met).`,
      'Regulatory acceptability is context-dependent — a pre-submission meeting with the relevant agency is recommended for any novel RWE application.',
      'The FDA RWE Framework (2018) is the foundational document; subsequent draft guidances provide specific operational requirements.',
      'Deterministic: identical inputs always produce identical output. No LLM, no network.',
    ],
  };
}
