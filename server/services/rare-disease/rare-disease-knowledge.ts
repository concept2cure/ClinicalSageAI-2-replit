/**
 * Rare Disease Development & External Control Arms — Deterministic Knowledge Base
 *
 * Pure, in-code reference data and decision engines for rare-disease clinical
 * development: natural history study design, externally controlled trial design,
 * small-population trial methodology, Bayesian information borrowing, endpoint
 * selection under phenotypic heterogeneity, and integrated program planning.
 *
 * NO LLM, NO network, NO database, NO imports from other services. Every
 * function is closed-form and reproducible: identical input always yields
 * identical output.
 *
 * This module deliberately does NOT cover orphan-drug designation eligibility
 * (the 200,000-patient prevalence test, designation request mechanics, or
 * market/tax incentives) — that logic lives elsewhere on the platform. The
 * focus here is study DESIGN and METHODOLOGY for small populations.
 *
 * Regulatory citations (grounding):
 *   - FDA Guidance: Rare Diseases — Natural History Studies for Drug Development
 *     (Draft, March 2019).
 *   - FDA Guidance: Rare Diseases — Common Issues in Drug Development (Draft,
 *     February 2019; revised guidance series).
 *   - FDA Guidance: Considerations for the Design and Conduct of Externally
 *     Controlled Trials for Drug and Biological Products (Draft, February 2023).
 *   - ICH E10: Choice of Control Group and Related Issues in Clinical Trials
 *     (2000).
 *   - FDA Guidance: Interacting with the FDA on Complex Innovative Trial Designs
 *     for Drugs and Biological Products (December 2020).
 *   - FDA Guidance: Rare Diseases — Considerations for the Development of Drugs
 *     and Biological Products (Draft, December 2023).
 *   - 21st Century Cures Act / RMAT and Breakthrough Therapy frameworks.
 *   - Small-population trial methodology: EMA CHMP/EWP/83561/2005 (Guideline on
 *     clinical trials in small populations, 2006); IRDiRC / FDA-Asterand
 *     small-N design literature.
 *   - Bayesian borrowing literature: Pocock (1976, historical controls);
 *     Ibrahim & Chen (2000, power priors); Hobbs et al. (2011/2012,
 *     commensurate priors); Schmidli et al. (2014, robust MAP priors);
 *     Neuenschwander et al. (2010, MAP / effective sample size).
 *
 * @module server/services/rare-disease/rare-disease-knowledge
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared citation constants (single source of truth)
// ─────────────────────────────────────────────────────────────────────────────

const CITE_NHS_2019 =
  'FDA Guidance: Rare Diseases — Natural History Studies for Drug Development (Draft, March 2019)';
const CITE_COMMON_2019 =
  'FDA Guidance: Rare Diseases — Common Issues in Drug Development (Draft, February 2019)';
const CITE_ECT_2023 =
  'FDA Guidance: Considerations for the Design and Conduct of Externally Controlled Trials for Drug and Biological Products (Draft, February 2023)';
const CITE_ICH_E10 =
  'ICH E10: Choice of Control Group and Related Issues in Clinical Trials (2000)';
const CITE_CID_2020 =
  'FDA Guidance: Interacting with the FDA on Complex Innovative Trial Designs for Drugs and Biological Products (December 2020)';
const CITE_RARE_2023 =
  'FDA Guidance: Rare Diseases — Considerations for the Development of Drugs and Biological Products (Draft, December 2023)';
const CITE_EMA_SMALLPOP =
  'EMA CHMP/EWP/83561/2005: Guideline on Clinical Trials in Small Populations (2006)';
const CITE_POWERPRIOR =
  'Ibrahim & Chen (2000), Power Prior Distributions in Regression Models; Duan, Smith & Ye (2006)';
const CITE_COMMENSURATE =
  'Hobbs, Carlin, Mandrekar & Sargent (2011), Commensurate Priors for Incorporating Historical Information';
const CITE_MAP =
  'Neuenschwander, Capkun-Niggli, Branson & Spiegelhalter (2010), Meta-Analytic-Predictive (MAP) priors; Schmidli et al. (2014), Robust MAP / EX-NEX';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Natural History Study Design
// ─────────────────────────────────────────────────────────────────────────────

export type NaturalHistoryDesignType =
  | 'prospective'
  | 'retrospective'
  | 'ambidirectional'
  | 'cross_sectional';

export type NaturalHistoryUse =
  | 'external_control'
  | 'endpoint_development'
  | 'patient_identification'
  | 'biomarker_qualification'
  | 'subgroup_definition'
  | 'trial_feasibility';

export interface NaturalHistoryDesignProfile {
  designType: NaturalHistoryDesignType;
  description: string;
  strengths: string[];
  limitations: string[];
  bestSuitedFor: NaturalHistoryUse[];
  dataQualityConsiderations: string[];
  citations: string[];
}

interface NaturalHistoryDesignRow {
  designType: NaturalHistoryDesignType;
  description: string;
  strengths: string[];
  limitations: string[];
  bestSuitedFor: NaturalHistoryUse[];
  dataQualityConsiderations: string[];
  citations: string[];
}

const NATURAL_HISTORY_DESIGN_REGISTRY: NaturalHistoryDesignRow[] = [
  {
    designType: 'prospective',
    description:
      'A natural history study that defines the protocol, data elements, assessment ' +
      'schedule, and endpoints in advance and then enrolls and follows patients forward ' +
      'in time. This is the design FDA prefers when the data are intended to support an ' +
      'external control arm or to develop and validate a clinical outcome assessment.',
    strengths: [
      'Standardized, protocol-driven assessments collected at uniform intervals',
      'Prospective definition of endpoints minimizes information bias',
      'Can collect biospecimens, imaging, and patient-reported outcomes on a fixed schedule',
      'Genotype, phenotype, and biomarker data captured concurrently for genotype-phenotype mapping',
      'Most defensible source for a fit-for-purpose external control arm',
    ],
    limitations: [
      'Slow to accrue mature longitudinal data — may take years to characterize disease course',
      'Resource-intensive; requires sustained funding and site engagement',
      'Survivorship and enrollment biases if late-stage or milder patients are under-represented',
    ],
    bestSuitedFor: ['external_control', 'endpoint_development', 'biomarker_qualification', 'subgroup_definition'],
    dataQualityConsiderations: [
      'Pre-specify a data dictionary and common data elements before first enrollment',
      'Use the same outcome measures, timing windows, and definitions the interventional trial will use',
      'Capture concomitant medications and standard-of-care changes over time',
      'Plan for central reading of imaging/functional assessments to reduce measurement variability',
    ],
    citations: [CITE_NHS_2019, CITE_ECT_2023],
  },
  {
    designType: 'retrospective',
    description:
      'A natural history study assembled from existing records (medical charts, registries, ' +
      'claims, or prior research datasets) describing patients before the study was conceived. ' +
      'Useful for rapid characterization but constrained by what was historically recorded.',
    strengths: [
      'Fast and comparatively inexpensive — data already exist',
      'Can describe long disease trajectories that would take years to observe prospectively',
      'Helpful for hypothesis generation, feasibility, and sample-size planning',
    ],
    limitations: [
      'Data not collected for research — missingness, inconsistent definitions, and irregular timing',
      'Measurement methods and standard of care may have changed over the look-back period',
      'High risk of confounding and selection bias if used as an external control',
      'Outcome ascertainment may differ from the interventional trial endpoint',
    ],
    bestSuitedFor: ['trial_feasibility', 'patient_identification', 'subgroup_definition'],
    dataQualityConsiderations: [
      'Document the provenance and completeness of each variable',
      'Assess whether outcome definitions can be reconstructed to match the trial endpoint',
      'Account for era effects (changes in diagnosis, supportive care, and measurement)',
      'Generally weaker than prospective data for an external control; pre-specify limitations',
    ],
    citations: [CITE_NHS_2019, CITE_ECT_2023],
  },
  {
    designType: 'ambidirectional',
    description:
      'A hybrid that combines retrospective baseline characterization with prospective ' +
      'forward follow-up under a common protocol. Captures historical trajectory quickly ' +
      'while standardizing future assessments.',
    strengths: [
      'Faster initial characterization than a purely prospective study',
      'Prospective arm can standardize the endpoints needed for an external control',
      'Allows linkage of historical disease course to standardized forward measures',
    ],
    limitations: [
      'Retrospective component carries the data-quality limitations of chart review',
      'Two data-collection eras must be reconciled analytically',
    ],
    bestSuitedFor: ['external_control', 'endpoint_development', 'trial_feasibility'],
    dataQualityConsiderations: [
      'Clearly delineate which variables come from the retrospective vs. prospective phase',
      'Validate that retrospective baseline values are comparable to prospective measures',
    ],
    citations: [CITE_NHS_2019],
  },
  {
    designType: 'cross_sectional',
    description:
      'A single-timepoint characterization of disease across patients at different stages. ' +
      'Approximates a disease trajectory by sampling severity strata rather than following ' +
      'individuals over time.',
    strengths: [
      'Quick snapshot of phenotypic range and severity distribution',
      'Useful for defining subgroups and selecting enrichment strategies',
    ],
    limitations: [
      'Cannot directly measure within-patient progression rate',
      'Cohort effects can masquerade as disease progression',
      'Not adequate alone as an external control for a longitudinal endpoint',
    ],
    bestSuitedFor: ['subgroup_definition', 'patient_identification', 'trial_feasibility'],
    dataQualityConsiderations: [
      'Be explicit that progression is inferred across patients, not observed within patients',
      'Use to generate hypotheses about rate of change, not to set control-arm trajectories',
    ],
    citations: [CITE_NHS_2019],
  },
];

/** Core data elements FDA recommends capturing in a natural history study (NHS 2019). */
const NATURAL_HISTORY_CORE_DATA_ELEMENTS: string[] = [
  'Demographics (age, sex, ancestry) and age at symptom onset and at diagnosis',
  'Genotype, including specific variant(s), zygosity, and method of confirmation',
  'Detailed phenotype with standardized severity scales and organ-system involvement',
  'Family history and inheritance pattern',
  'Longitudinal clinical course: symptom progression, milestones, and disease milestones lost/gained',
  'Validated and exploratory outcome measures collected on a fixed schedule',
  'Biomarkers and biospecimens (with consent for future use)',
  'Imaging and functional assessments with central reading where feasible',
  'Concomitant medications, supportive care, surgeries, and standard-of-care interventions',
  'Health-related quality of life and patient/caregiver-reported outcomes',
  'Survival, major morbidity events, and other hard clinical endpoints',
];

export interface DesignNaturalHistoryStudyParams {
  /** Plain-language disease name (recorded; does not change deterministic logic). */
  diseaseName?: string;
  /** Primary intended use of the natural history data. */
  primaryUse: NaturalHistoryUse;
  /** Whether the disease has well-characterized genotype-phenotype correlations. */
  knownGenotypePhenotype?: boolean;
  /** Whether a validated, fit-for-purpose endpoint already exists. */
  validatedEndpointExists?: boolean;
  /** Estimated annual incident/identifiable patients (used for feasibility flags only). */
  estimatedAnnualPatients?: number;
  /** Whether existing registry/chart data are available for a retrospective component. */
  existingDataAvailable?: boolean;
  /** Whether the disease course is heterogeneous across patients. */
  heterogeneousCourse?: boolean;
}

export interface DesignNaturalHistoryStudyResult {
  recommendedDesign: NaturalHistoryDesignType;
  designRationale: string[];
  designProfile: NaturalHistoryDesignProfile;
  recommendedDataElements: string[];
  genotypePhenotypeGuidance: string[];
  externalControlReadiness: string[];
  endpointDevelopmentGuidance: string[];
  feasibilityFlags: string[];
  citations: string[];
}

function lookupNaturalHistoryProfile(
  designType: NaturalHistoryDesignType,
): NaturalHistoryDesignProfile {
  const row = NATURAL_HISTORY_DESIGN_REGISTRY.find(
    (r: NaturalHistoryDesignRow): boolean => r.designType === designType,
  );
  // The registry is exhaustive over the union; this fallback is unreachable in practice.
  const safe = row ?? NATURAL_HISTORY_DESIGN_REGISTRY[0];
  return {
    designType: safe.designType,
    description: safe.description,
    strengths: [...safe.strengths],
    limitations: [...safe.limitations],
    bestSuitedFor: [...safe.bestSuitedFor],
    dataQualityConsiderations: [...safe.dataQualityConsiderations],
    citations: [...safe.citations],
  };
}

/**
 * Design a natural history study for a rare disease, selecting a prospective vs.
 * retrospective (or hybrid) design, identifying key data elements, and explaining
 * how the data can serve as an external control or support endpoint development.
 * Grounded in FDA Rare Diseases: Natural History Studies (2019).
 */
export function designNaturalHistoryStudy(
  params: DesignNaturalHistoryStudyParams,
): DesignNaturalHistoryStudyResult {
  const primaryUse: NaturalHistoryUse = params.primaryUse;
  const rationale: string[] = [];

  // Deterministic design selection.
  let recommended: NaturalHistoryDesignType;
  if (primaryUse === 'external_control' || primaryUse === 'endpoint_development' || primaryUse === 'biomarker_qualification') {
    if (params.existingDataAvailable === true) {
      recommended = 'ambidirectional';
      rationale.push(
        'Primary use requires standardized, prospectively defined measures, and existing ' +
          'data are available — an ambidirectional design captures historical trajectory ' +
          'while standardizing forward assessments.',
      );
    } else {
      recommended = 'prospective';
      rationale.push(
        'The intended use (external control, endpoint, or biomarker development) demands ' +
          'protocol-driven, prospectively defined data; FDA prefers a prospective natural ' +
          'history study for these purposes.',
      );
    }
  } else if (primaryUse === 'trial_feasibility' || primaryUse === 'patient_identification') {
    if (params.existingDataAvailable === true) {
      recommended = 'retrospective';
      rationale.push(
        'For feasibility and patient identification with existing data, a retrospective ' +
          'study is fast and adequate for hypothesis generation and sample-size planning.',
      );
    } else {
      recommended = 'cross_sectional';
      rationale.push(
        'Without existing data, a cross-sectional characterization quickly maps the ' +
          'phenotypic and severity range to support feasibility and enrichment planning.',
      );
    }
  } else {
    // subgroup_definition
    recommended = params.heterogeneousCourse === true ? 'prospective' : 'cross_sectional';
    rationale.push(
      params.heterogeneousCourse === true
        ? 'Heterogeneous disease course warrants prospective longitudinal follow-up to ' +
            'distinguish true within-patient progression from cohort effects when defining subgroups.'
        : 'A cross-sectional design is sufficient to stratify severity and define subgroups ' +
            'when the disease course is relatively homogeneous.',
    );
  }

  const profile = lookupNaturalHistoryProfile(recommended);

  const genotypePhenotype: string[] =
    params.knownGenotypePhenotype === true
      ? [
          'Leverage known genotype-phenotype correlations to pre-specify analysis subgroups',
          'Stratify the natural history cohort by variant class to characterize differential progression',
          'Use genotype to define an enrichment strategy and to match an external control to the trial population',
        ]
      : [
          'Collect genotype systematically even where correlations are not yet established',
          'Plan exploratory genotype-phenotype analyses to discover prognostic variant classes',
          'Recognize that uncharacterized genotype-phenotype relationships increase confounding risk for an external control',
        ];
  genotypePhenotype.push(
    'Record variant nomenclature (HGVS), zygosity, and confirmation method to enable later matching',
  );

  const externalControlReadiness: string[] = [];
  if (recommended === 'prospective' || recommended === 'ambidirectional') {
    externalControlReadiness.push(
      'Align outcome measures, assessment windows, and definitions with the planned interventional trial',
      'Pre-specify the external-control analysis population and matching/adjustment strategy',
      'Document standard of care contemporaneously so secular trends can be assessed',
    );
  } else {
    externalControlReadiness.push(
      'This design is generally NOT sufficient on its own to serve as an external control',
      'If external control is later needed, transition to a prospective protocol with harmonized endpoints',
    );
  }

  const endpointDevelopment: string[] = [];
  if (params.validatedEndpointExists === true) {
    endpointDevelopment.push(
      'A validated endpoint exists — use the natural history study to estimate its rate of change and variability',
      'Use the observed trajectory to power the interventional trial and to set the external-control reference',
    );
  } else {
    endpointDevelopment.push(
      'No validated endpoint — use the natural history study to develop and content-validate a clinical outcome assessment',
      'Characterize meaningful within-patient change and minimal clinically important difference',
      'Engage patients/caregivers to confirm concepts that matter, per FDA COA development principles',
    );
  }

  const feasibilityFlags: string[] = [];
  if (typeof params.estimatedAnnualPatients === 'number' && params.estimatedAnnualPatients < 20) {
    feasibilityFlags.push(
      'Very small identifiable population (<20/year) — prioritize multi-site/international collaboration and registry linkage',
    );
  }
  if (params.heterogeneousCourse === true) {
    feasibilityFlags.push(
      'Heterogeneous course — plan adequate follow-up duration and within-patient anchors to separate signal from variability',
    );
  }
  if (params.existingDataAvailable === false) {
    feasibilityFlags.push(
      'No existing data — accrual of mature longitudinal data will take time; begin enrollment early relative to the IND',
    );
  }

  return {
    recommendedDesign: recommended,
    designRationale: rationale,
    designProfile: profile,
    recommendedDataElements: [...NATURAL_HISTORY_CORE_DATA_ELEMENTS],
    genotypePhenotypeGuidance: genotypePhenotype,
    externalControlReadiness,
    endpointDevelopmentGuidance: endpointDevelopment,
    feasibilityFlags,
    citations: [CITE_NHS_2019, CITE_ECT_2023, CITE_RARE_2023],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Externally Controlled Trial Design (FDA 2023, ICH E10)
// ─────────────────────────────────────────────────────────────────────────────

export type ExternalControlSource =
  | 'historical_trial'
  | 'concurrent_external'
  | 'natural_history'
  | 'real_world_data'
  | 'registry'
  | 'patient_level_pooled';

export interface ExternalControlSourceProfile {
  source: ExternalControlSource;
  description: string;
  typicalStrengths: string[];
  typicalWeaknesses: string[];
  fitForUseEmphasis: string[];
  citations: string[];
}

interface ExternalControlSourceRow {
  source: ExternalControlSource;
  description: string;
  typicalStrengths: string[];
  typicalWeaknesses: string[];
  fitForUseEmphasis: string[];
  citations: string[];
}

const EXTERNAL_CONTROL_SOURCE_REGISTRY: ExternalControlSourceRow[] = [
  {
    source: 'historical_trial',
    description:
      'Control-arm data drawn from previously completed clinical trials in the same disease.',
    typicalStrengths: [
      'Protocol-driven, standardized assessments and defined endpoints',
      'Outcome ascertainment closer to trial-grade than routine-care data',
    ],
    typicalWeaknesses: [
      'Temporal differences in standard of care between the old trial and the new study',
      'Eligibility criteria and measurement methods may not match',
      'Selection effects from the original trials enrollment',
    ],
    fitForUseEmphasis: [
      'Verify endpoint definitions and assessment timing are reconcilable',
      'Assess secular changes in standard of care since the historical trial',
    ],
    citations: [CITE_ECT_2023, CITE_ICH_E10],
  },
  {
    source: 'concurrent_external',
    description:
      'Control data collected from patients treated contemporaneously but outside the trial ' +
      '(e.g., at non-participating sites during the same calendar period).',
    typicalStrengths: [
      'Same calendar era reduces secular-trend confounding relative to historical controls',
      'Standard of care more likely to match the treated arm',
    ],
    typicalWeaknesses: [
      'Site/setting differences and unmeasured confounding remain',
      'Outcome ascertainment may be less rigorous than in the treated arm',
    ],
    fitForUseEmphasis: [
      'Document why concurrent patients were not randomized (rationale for external control)',
      'Harmonize outcome measurement between settings',
    ],
    citations: [CITE_ECT_2023, CITE_ICH_E10],
  },
  {
    source: 'natural_history',
    description:
      'Control data from a prospective or ambidirectional natural history study designed with ' +
      'harmonized endpoints (the strongest external-control source for a progressive rare disease).',
    typicalStrengths: [
      'Endpoints, timing, and population can be pre-specified to match the trial',
      'Captures untreated/standard-of-care trajectory directly',
      'Genotype/phenotype data enable rigorous matching',
    ],
    typicalWeaknesses: [
      'Still non-randomized; residual confounding possible',
      'Requires the natural history study to have been designed for this purpose',
    ],
    fitForUseEmphasis: [
      'Confirm the natural history protocol used the same outcome definitions and windows',
      'Pre-specify the matching/adjustment plan before unblinding the treated arm',
    ],
    citations: [CITE_ECT_2023, CITE_NHS_2019],
  },
  {
    source: 'real_world_data',
    description:
      'Control data derived from routine-care sources such as electronic health records or claims.',
    typicalStrengths: [
      'Large, contemporaneous, and often representative of real-world practice',
    ],
    typicalWeaknesses: [
      'Outcomes not measured to trial standards; missing and irregular data',
      'Diagnosis and outcome definitions rely on coding rather than protocol assessment',
      'High risk of confounding by indication and informative missingness',
    ],
    fitForUseEmphasis: [
      'Assess data reliability (accuracy, completeness) and relevance (population, exposure, outcome)',
      'Endpoints must be ascertainable from the source with acceptable misclassification',
    ],
    citations: [CITE_ECT_2023],
  },
  {
    source: 'registry',
    description:
      'Disease registry data that may sit between trial-grade and routine-care quality.',
    typicalStrengths: [
      'Disease-specific data elements and longitudinal follow-up',
      'Often the most complete source available for an ultra-rare disease',
    ],
    typicalWeaknesses: [
      'Heterogeneous data quality across contributing sites',
      'Outcome measurement may not match the trial endpoint exactly',
    ],
    fitForUseEmphasis: [
      'Evaluate per-variable completeness and definition alignment',
      'Prefer registries with prospective, standardized data collection',
    ],
    citations: [CITE_ECT_2023, CITE_NHS_2019],
  },
  {
    source: 'patient_level_pooled',
    description:
      'Individual patient-level data pooled across multiple external sources to assemble an adequate control.',
    typicalStrengths: [
      'Enables individual-level matching and covariate adjustment',
      'May reach adequate size for an ultra-rare disease where no single source suffices',
    ],
    typicalWeaknesses: [
      'Heterogeneity across sources complicates harmonization',
      'Differential measurement and missingness across contributing datasets',
    ],
    fitForUseEmphasis: [
      'Pre-specify harmonization rules and source-level sensitivity analyses',
      'Individual-level (not aggregate) data are strongly preferred for comparability assessment',
    ],
    citations: [CITE_ECT_2023],
  },
];

/** Comparability domains FDA expects to be assessed for an externally controlled trial. */
const COMPARABILITY_DOMAINS: string[] = [
  'Prognostic baseline characteristics (severity, age, genotype, disease duration)',
  'Eligibility criteria alignment between treated and external populations',
  'Outcome definitions, ascertainment method, and assessment timing',
  'Standard of care and concomitant therapy during follow-up',
  'Calendar time / secular trends in diagnosis and management',
  'Measurement methods (assays, instruments, central vs. local reading)',
  'Missing data mechanisms and follow-up completeness',
];

/** Sources of bias that threaten externally controlled trials (FDA 2023 / ICH E10). */
const EXTERNAL_CONTROL_BIAS_SOURCES: string[] = [
  'Confounding (measured and unmeasured) — the dominant threat to a non-randomized comparison',
  'Selection bias in who enters the treated vs. external cohort',
  'Information/measurement bias from differing outcome ascertainment',
  'Immortal time bias and time-zero (index date) misalignment',
  'Secular trends in standard of care between cohorts',
  'Regression to the mean when enrolling at disease nadir',
  'Outcome-driven analytic choices made after seeing the treated-arm data',
];

export interface DesignExternalControlParams {
  /** Disease name (recorded; does not change logic). */
  diseaseName?: string;
  /** Source of the external control data. */
  controlSource: ExternalControlSource;
  /** Whether individual patient-level data are available (vs. only aggregate/summary). */
  individualPatientData?: boolean;
  /** Whether outcome definitions/timing match the treated arm. */
  endpointsHarmonized?: boolean;
  /** Whether the primary endpoint is objective (e.g., death, lab value) vs. subjective. */
  objectiveEndpoint?: boolean;
  /** Whether the disease has a predictable, well-characterized untreated course. */
  predictableNaturalCourse?: boolean;
  /** Whether key prognostic baseline covariates are measured in both cohorts. */
  prognosticCovariatesMeasured?: boolean;
  /** Whether the treated and external cohorts are contemporaneous. */
  contemporaneous?: boolean;
}

export interface DesignExternalControlResult {
  controlSource: ExternalControlSource;
  sourceProfile: ExternalControlSourceProfile;
  suitabilityLevel: 'favorable' | 'conditional' | 'unfavorable';
  suitabilityRationale: string[];
  comparabilityAssessment: string[];
  biasSourcesToAddress: string[];
  fitForUseCriteria: string[];
  recommendedAnalyticSafeguards: string[];
  ichE10Considerations: string[];
  citations: string[];
}

function lookupExternalControlProfile(
  source: ExternalControlSource,
): ExternalControlSourceProfile {
  const row = EXTERNAL_CONTROL_SOURCE_REGISTRY.find(
    (r: ExternalControlSourceRow): boolean => r.source === source,
  );
  const safe = row ?? EXTERNAL_CONTROL_SOURCE_REGISTRY[0];
  return {
    source: safe.source,
    description: safe.description,
    typicalStrengths: [...safe.typicalStrengths],
    typicalWeaknesses: [...safe.typicalWeaknesses],
    fitForUseEmphasis: [...safe.fitForUseEmphasis],
    citations: [...safe.citations],
  };
}

/**
 * Design an externally controlled trial per FDA 2023 and ICH E10: evaluate the
 * external control source, comparability, confounding/bias, and fit-for-use
 * criteria, returning a graded suitability assessment and analytic safeguards.
 */
export function designExternalControl(
  params: DesignExternalControlParams,
): DesignExternalControlResult {
  const source: ExternalControlSource = params.controlSource;
  const profile = lookupExternalControlProfile(source);

  // Deterministic suitability scoring.
  let score = 0;
  const rationale: string[] = [];

  if (params.individualPatientData === true) {
    score += 2;
    rationale.push('Individual patient-level data available — enables matching and covariate adjustment (favorable).');
  } else {
    rationale.push('Only aggregate/summary data — individual-level comparability cannot be assessed (unfavorable).');
  }

  if (params.endpointsHarmonized === true) {
    score += 2;
    rationale.push('Outcome definitions and timing are harmonized with the treated arm (favorable).');
  } else {
    rationale.push('Endpoints not harmonized — measurement/information bias risk (unfavorable).');
  }

  if (params.objectiveEndpoint === true) {
    score += 1;
    rationale.push('Objective endpoint reduces ascertainment bias in a non-blinded external comparison (favorable).');
  } else {
    rationale.push('Subjective endpoint heightens ascertainment-bias concerns without blinding (caution).');
  }

  if (params.predictableNaturalCourse === true) {
    score += 2;
    rationale.push('Well-characterized, predictable untreated course strengthens causal attribution (favorable).');
  } else {
    rationale.push('Variable or poorly characterized natural course weakens causal attribution (unfavorable).');
  }

  if (params.prognosticCovariatesMeasured === true) {
    score += 1;
    rationale.push('Key prognostic covariates measured in both cohorts — supports adjustment (favorable).');
  } else {
    rationale.push('Prognostic covariates incompletely measured — residual confounding likely (unfavorable).');
  }

  if (params.contemporaneous === true) {
    score += 1;
    rationale.push('Contemporaneous cohorts reduce secular-trend confounding (favorable).');
  }

  // Source-specific baseline adjustment.
  if (source === 'natural_history') {
    score += 1;
    rationale.push('Purpose-built natural history control is the preferred external-control source for a progressive rare disease.');
  } else if (source === 'real_world_data') {
    score -= 1;
    rationale.push('Routine-care RWD requires especially careful reliability/relevance assessment (caution).');
  }

  let suitability: 'favorable' | 'conditional' | 'unfavorable';
  if (score >= 7) {
    suitability = 'favorable';
  } else if (score >= 4) {
    suitability = 'conditional';
  } else {
    suitability = 'unfavorable';
  }

  const fitForUse: string[] = [
    'Relevance: external population, exposure window, and outcome reflect the trial question',
    'Reliability: data are accurate, complete, and traceable to source',
    'Comparability: prognostic factors are measured and balanced (or adjustable) between cohorts',
    'Endpoint ascertainability: the trial endpoint can be derived from the external source with acceptable misclassification',
    'Pre-specification: the design and analysis are fixed before comparing to the treated arm',
  ];

  const safeguards: string[] = [
    'Pre-specify the analysis (estimand, time-zero, covariates, matching/weighting) before any comparison',
    'Define an explicit time-zero / index date to avoid immortal-time bias',
    'Use propensity-score or covariate-adjustment methods with diagnostics for balance',
    'Conduct quantitative bias analysis / sensitivity analyses for unmeasured confounding (e.g., E-value)',
    'Report standardized differences and overlap (positivity) between cohorts',
    'Pre-register the protocol and statistical analysis plan; document all data-cleaning rules',
  ];
  if (params.objectiveEndpoint !== true) {
    safeguards.push('Use blinded/centralized outcome adjudication to mitigate ascertainment bias for the subjective endpoint');
  }

  const ichE10: string[] = [
    'ICH E10: external (historical) controls are most interpretable when the disease course is highly predictable and the treatment effect is large and dramatic',
    'ICH E10: the principal weakness of an external control is the inability to fully control bias from non-comparable populations and conditions',
    'ICH E10: consider whether a randomized concurrent control is feasible before defaulting to an external control',
  ];

  return {
    controlSource: source,
    sourceProfile: profile,
    suitabilityLevel: suitability,
    suitabilityRationale: rationale,
    comparabilityAssessment: [...COMPARABILITY_DOMAINS],
    biasSourcesToAddress: [...EXTERNAL_CONTROL_BIAS_SOURCES],
    fitForUseCriteria: fitForUse,
    recommendedAnalyticSafeguards: safeguards,
    ichE10Considerations: ichE10,
    citations: [CITE_ECT_2023, CITE_ICH_E10, CITE_NHS_2019],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Small-Population Trial Design
// ─────────────────────────────────────────────────────────────────────────────

export type SmallPopulationDesignName =
  | 'parallel_rct'
  | 'crossover'
  | 'randomized_withdrawal'
  | 'n_of_1'
  | 'sequential'
  | 'multi_arm_multi_stage'
  | 'within_patient_control'
  | 'adaptive_enrichment'
  | 'externally_controlled'
  | 'master_protocol_basket';

export interface SmallPopulationDesignProfile {
  design: SmallPopulationDesignName;
  description: string;
  sampleEfficiency: 'high' | 'moderate' | 'low';
  requiresConcurrentControl: boolean;
  keyAssumptions: string[];
  advantages: string[];
  tradeoffs: string[];
  bestWhen: string[];
  citations: string[];
}

interface SmallPopulationDesignRow {
  design: SmallPopulationDesignName;
  description: string;
  sampleEfficiency: 'high' | 'moderate' | 'low';
  requiresConcurrentControl: boolean;
  keyAssumptions: string[];
  advantages: string[];
  tradeoffs: string[];
  bestWhen: string[];
  citations: string[];
}

const SMALL_POPULATION_DESIGN_REGISTRY: SmallPopulationDesignRow[] = [
  {
    design: 'parallel_rct',
    description:
      'Standard parallel-group randomized controlled trial comparing treatment to control across patients.',
    sampleEfficiency: 'low',
    requiresConcurrentControl: true,
    keyAssumptions: ['Adequate enrollable population', 'Comparable groups achievable by randomization'],
    advantages: ['Gold-standard internal validity', 'Simplest interpretation and regulatory familiarity'],
    tradeoffs: ['Least sample-efficient; often infeasible in ultra-rare disease', 'Allocates patients to control'],
    bestWhen: ['Population is large enough to randomize with adequate power', 'A concurrent control is ethical and feasible'],
    citations: [CITE_COMMON_2019, CITE_EMA_SMALLPOP],
  },
  {
    design: 'crossover',
    description:
      'Each patient receives both treatment and control in sequence; the patient serves as their own control.',
    sampleEfficiency: 'high',
    requiresConcurrentControl: true,
    keyAssumptions: [
      'Chronic, stable condition that returns to baseline between periods',
      'No carryover effect (adequate washout)',
      'Treatment effect is reversible',
    ],
    advantages: ['Within-patient comparison sharply reduces required N', 'Removes between-patient variability'],
    tradeoffs: ['Invalid if disease progresses or effect is irreversible', 'Carryover and period effects must be excluded'],
    bestWhen: ['Stable chronic disease', 'Symptomatic, reversible endpoint', 'Adequate washout achievable'],
    citations: [CITE_COMMON_2019, CITE_EMA_SMALLPOP],
  },
  {
    design: 'randomized_withdrawal',
    description:
      'All patients receive active treatment in an open run-in; responders are then randomized to continue ' +
      'treatment or switch to placebo. The endpoint is time-to or proportion with relapse/worsening.',
    sampleEfficiency: 'high',
    requiresConcurrentControl: true,
    keyAssumptions: ['Treatment effect is reversible upon withdrawal', 'Responders can be identified in the run-in'],
    advantages: ['Limits placebo exposure to responders', 'Efficient for demonstrating maintained effect', 'Ethically attractive in serious disease'],
    tradeoffs: ['Only addresses maintenance, not initiation, of effect', 'Run-in enrichment limits generalizability'],
    bestWhen: ['Chronic disease with reversible benefit', 'Ethical concerns about prolonged placebo'],
    citations: [CITE_COMMON_2019, CITE_EMA_SMALLPOP],
  },
  {
    design: 'n_of_1',
    description:
      'Multiple-period, within-patient randomized crossover in a single patient, optionally aggregated across patients in a series.',
    sampleEfficiency: 'high',
    requiresConcurrentControl: true,
    keyAssumptions: ['Stable chronic condition', 'Reversible effect', 'Rapid onset/offset relative to period length'],
    advantages: ['Maximal within-patient information', 'Individualized inference; aggregable via hierarchical models'],
    tradeoffs: ['Demanding logistics; only for stable reversible conditions', 'Population-level inference requires aggregation across series'],
    bestWhen: ['Ultra-rare disease', 'Symptomatic reversible endpoint', 'Heterogeneous individual response'],
    citations: [CITE_COMMON_2019, CITE_EMA_SMALLPOP],
  },
  {
    design: 'sequential',
    description:
      'Group-sequential or fully sequential design with pre-planned interim analyses allowing early stopping for efficacy or futility.',
    sampleEfficiency: 'moderate',
    requiresConcurrentControl: true,
    keyAssumptions: ['Outcomes observed quickly enough to inform interims', 'Pre-specified alpha-spending function'],
    advantages: ['Expected sample size reduced by early stopping', 'Patients spared if futility is clear'],
    tradeoffs: ['Operational complexity; requires DMC', 'Alpha-spending reduces nominal significance threshold'],
    bestWhen: ['Endpoints accrue faster than enrollment', 'Uncertainty about effect size warrants interim looks'],
    citations: [CITE_EMA_SMALLPOP, CITE_CID_2020],
  },
  {
    design: 'multi_arm_multi_stage',
    description:
      'Multi-arm multi-stage (MAMS) design evaluating several treatments/doses against a shared control with interim arm dropping.',
    sampleEfficiency: 'moderate',
    requiresConcurrentControl: true,
    keyAssumptions: ['Shared control arm', 'Pre-specified arm-selection and multiplicity control'],
    advantages: ['Shared control improves efficiency', 'Drops inferior arms early; evaluates multiple options at once'],
    tradeoffs: ['Multiplicity adjustment required', 'Operationally complex; often a CID design'],
    bestWhen: ['Several candidate doses/agents', 'A shared control is acceptable'],
    citations: [CITE_CID_2020, CITE_EMA_SMALLPOP],
  },
  {
    design: 'within_patient_control',
    description:
      'Each patient contributes a within-patient comparison, e.g., paired body sides/lesions, or pre-treatment slope vs. on-treatment slope.',
    sampleEfficiency: 'high',
    requiresConcurrentControl: false,
    keyAssumptions: ['Within-patient pre/post or paired comparison is valid', 'Pre-treatment trajectory is measurable'],
    advantages: ['Removes between-patient variability', 'Uses each patient as their own reference; very N-efficient'],
    tradeoffs: ['Requires a stable, measurable pre-treatment slope or paired unit', 'Confounded by time if natural course is not flat'],
    bestWhen: ['Progressive disease with measurable pre-treatment slope', 'Paired anatomic units available'],
    citations: [CITE_COMMON_2019, CITE_NHS_2019],
  },
  {
    design: 'adaptive_enrichment',
    description:
      'Adaptive design that uses interim data to enrich enrollment toward a biomarker- or genotype-defined responder subpopulation.',
    sampleEfficiency: 'moderate',
    requiresConcurrentControl: true,
    keyAssumptions: ['A predictive biomarker/genotype defines a likely-responsive subgroup', 'Pre-specified adaptation rules'],
    advantages: ['Focuses sample on the most informative population', 'Improves power within the enriched subgroup'],
    tradeoffs: ['Narrows the labeled population', 'Requires validated enrichment marker and multiplicity control'],
    bestWhen: ['Genotype-defined heterogeneity in response', 'A credible predictive biomarker exists'],
    citations: [CITE_CID_2020, CITE_RARE_2023],
  },
  {
    design: 'externally_controlled',
    description:
      'Single-arm interventional trial compared to an external control (natural history, historical, or RWD).',
    sampleEfficiency: 'high',
    requiresConcurrentControl: false,
    keyAssumptions: ['Predictable natural course', 'Fit-for-use external control with harmonized endpoints'],
    advantages: ['No patients allocated to control within the trial', 'Often the only feasible option in ultra-rare disease'],
    tradeoffs: ['Non-randomized; confounding/bias must be addressed analytically', 'Strongest when effect is large and course predictable'],
    bestWhen: ['Randomization infeasible/unethical', 'A strong external control exists'],
    citations: [CITE_ECT_2023, CITE_ICH_E10],
  },
  {
    design: 'master_protocol_basket',
    description:
      'A master protocol (basket/umbrella) studying one or more therapies across multiple related rare conditions or genotypes under shared infrastructure.',
    sampleEfficiency: 'moderate',
    requiresConcurrentControl: false,
    keyAssumptions: ['Shared mechanism or biomarker across sub-populations', 'Common endpoints and operational platform'],
    advantages: ['Operational efficiency and shared controls/infrastructure', 'Enables borrowing across related strata'],
    tradeoffs: ['Statistical and governance complexity', 'Heterogeneity across baskets must be modeled'],
    bestWhen: ['Multiple related ultra-rare conditions share a target', 'A platform/master protocol is justified'],
    citations: [CITE_CID_2020, CITE_RARE_2023],
  },
];

export interface AssessSmallPopulationDesignParams {
  /** Disease name (recorded; does not change logic). */
  diseaseName?: string;
  /** Whether the condition is chronic and stable over the trial period. */
  chronicStable?: boolean;
  /** Whether the treatment effect is reversible on withdrawal/washout. */
  reversibleEffect?: boolean;
  /** Whether the disease is progressive with a measurable rate of change. */
  progressive?: boolean;
  /** Whether randomization to a concurrent control is feasible/ethical. */
  randomizationFeasible?: boolean;
  /** Whether a predictive biomarker/genotype defines responders. */
  predictiveBiomarker?: boolean;
  /** Whether multiple doses or agents need to be compared. */
  multipleArmsNeeded?: boolean;
  /** Whether a strong external control source exists. */
  externalControlAvailable?: boolean;
  /** Estimated enrollable patients (used for efficiency emphasis). */
  estimatedEnrollable?: number;
}

export interface AssessSmallPopulationDesignResult {
  recommendedDesigns: SmallPopulationDesignName[];
  primaryRecommendation: SmallPopulationDesignName;
  recommendationRationale: string[];
  designProfiles: SmallPopulationDesignProfile[];
  efficiencyTradeoffs: string[];
  generalSmallNPrinciples: string[];
  citations: string[];
}

function lookupSmallPopulationProfile(
  design: SmallPopulationDesignName,
): SmallPopulationDesignProfile {
  const row = SMALL_POPULATION_DESIGN_REGISTRY.find(
    (r: SmallPopulationDesignRow): boolean => r.design === design,
  );
  const safe = row ?? SMALL_POPULATION_DESIGN_REGISTRY[0];
  return {
    design: safe.design,
    description: safe.description,
    sampleEfficiency: safe.sampleEfficiency,
    requiresConcurrentControl: safe.requiresConcurrentControl,
    keyAssumptions: [...safe.keyAssumptions],
    advantages: [...safe.advantages],
    tradeoffs: [...safe.tradeoffs],
    bestWhen: [...safe.bestWhen],
    citations: [...safe.citations],
  };
}

/**
 * Assess and rank small-population trial designs (crossover, N-of-1, sequential,
 * randomized-withdrawal, within-patient, multi-arm, externally controlled, etc.),
 * explaining the efficiency tradeoffs and assumptions each requires.
 */
export function assessSmallPopulationDesign(
  params: AssessSmallPopulationDesignParams,
): AssessSmallPopulationDesignResult {
  const recommended: SmallPopulationDesignName[] = [];
  const rationale: string[] = [];

  const chronicStable = params.chronicStable === true;
  const reversible = params.reversibleEffect === true;
  const progressive = params.progressive === true;
  const randomizationFeasible = params.randomizationFeasible !== false; // default feasible unless explicitly false
  const predictiveBiomarker = params.predictiveBiomarker === true;
  const multipleArms = params.multipleArmsNeeded === true;
  const externalAvailable = params.externalControlAvailable === true;

  if (chronicStable && reversible) {
    recommended.push('crossover');
    recommended.push('n_of_1');
    recommended.push('randomized_withdrawal');
    rationale.push(
      'Chronic, stable disease with a reversible effect supports highly N-efficient within-patient ' +
        'designs (crossover, N-of-1) and randomized withdrawal.',
    );
  }

  if (progressive) {
    recommended.push('within_patient_control');
    rationale.push(
      'A progressive disease with a measurable rate of change supports within-patient slope (pre/post) ' +
        'comparisons, which remove between-patient variability.',
    );
    if (externalAvailable) {
      recommended.push('externally_controlled');
      rationale.push(
        'A strong external control plus a predictable progressive course supports a single-arm externally ' +
          'controlled trial.',
      );
    }
  }

  if (!randomizationFeasible) {
    if (!recommended.includes('externally_controlled')) {
      recommended.push('externally_controlled');
    }
    rationale.push(
      'Randomization is infeasible or unethical — an externally controlled single-arm design avoids ' +
        'allocating patients to an internal control.',
    );
  } else {
    if (!recommended.includes('sequential')) {
      recommended.push('sequential');
    }
    rationale.push(
      'Where randomization is feasible, a group-sequential design reduces expected sample size via ' +
        'pre-planned interim analyses.',
    );
  }

  if (predictiveBiomarker) {
    recommended.push('adaptive_enrichment');
    rationale.push(
      'A predictive biomarker/genotype supports adaptive enrichment toward the responsive subpopulation.',
    );
  }

  if (multipleArms) {
    recommended.push('multi_arm_multi_stage');
    recommended.push('master_protocol_basket');
    rationale.push(
      'Multiple doses/agents (or related conditions) favor a shared-control MAMS or master-protocol design.',
    );
  }

  // Always include the conventional benchmark for context.
  if (!recommended.includes('parallel_rct')) {
    recommended.push('parallel_rct');
  }

  // De-duplicate while preserving order.
  const seen: Record<string, boolean> = {};
  const ordered: SmallPopulationDesignName[] = [];
  for (const d of recommended) {
    if (!seen[d]) {
      seen[d] = true;
      ordered.push(d);
    }
  }

  // Primary recommendation = first item, which reflects the highest-priority match.
  const primary: SmallPopulationDesignName = ordered[0];

  const profiles = ordered.map(
    (d: SmallPopulationDesignName): SmallPopulationDesignProfile => lookupSmallPopulationProfile(d),
  );

  const efficiencyTradeoffs: string[] = [
    'Within-patient designs (crossover, N-of-1, within-patient slope) are the most sample-efficient but require a stable, reversible, or measurably progressive condition',
    'Randomized withdrawal limits placebo exposure but only demonstrates maintenance of effect',
    'Sequential designs lower expected N at the cost of alpha-spending and operational complexity',
    'Externally controlled single-arm designs eliminate internal controls but shift the burden to bias control',
    'Enrichment/MAMS/master protocols improve efficiency but narrow generalizability or add multiplicity',
    'The conventional parallel RCT maximizes internal validity but is often the least feasible in small N',
  ];

  const principles: string[] = [
    'Maximize information per patient — prefer within-patient comparisons where assumptions hold',
    'Choose endpoints sensitive to within-patient change to reduce required N',
    'Pre-specify the design and analysis; small-N trials are highly sensitive to post hoc choices',
    'Plan for heterogeneity: stratify or model genotype/severity rather than assuming homogeneity',
    'Use natural history to set realistic effect sizes and to power the study',
    'Engage FDA early via the CID pathway when using novel or complex small-population designs',
    'Consider Bayesian methods to borrow external information and improve precision',
  ];

  return {
    recommendedDesigns: ordered,
    primaryRecommendation: primary,
    recommendationRationale: rationale,
    designProfiles: profiles,
    efficiencyTradeoffs,
    generalSmallNPrinciples: principles,
    citations: [CITE_COMMON_2019, CITE_EMA_SMALLPOP, CITE_CID_2020, CITE_RARE_2023],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Bayesian Information Borrowing
// ─────────────────────────────────────────────────────────────────────────────

export type BorrowingMethod =
  | 'informative_prior'
  | 'power_prior'
  | 'commensurate_prior'
  | 'meta_analytic_predictive'
  | 'robust_map_mixture'
  | 'hierarchical_exnex';

export interface BorrowingMethodProfile {
  method: BorrowingMethod;
  description: string;
  borrowingType: 'static' | 'dynamic';
  controlsPriorDataConflict: boolean;
  keyParameters: string[];
  advantages: string[];
  cautions: string[];
  citations: string[];
}

interface BorrowingMethodRow {
  method: BorrowingMethod;
  description: string;
  borrowingType: 'static' | 'dynamic';
  controlsPriorDataConflict: boolean;
  keyParameters: string[];
  advantages: string[];
  cautions: string[];
  citations: string[];
}

const BORROWING_METHOD_REGISTRY: BorrowingMethodRow[] = [
  {
    method: 'informative_prior',
    description:
      'A fixed informative prior summarizing external/historical information, used directly in the analysis of the current trial.',
    borrowingType: 'static',
    controlsPriorDataConflict: false,
    keyParameters: ['Prior mean', 'Prior variance / precision (effective prior sample size)'],
    advantages: ['Simple and transparent', 'Directly increases precision when external data are concordant'],
    cautions: ['Borrows fully regardless of conflict — can bias if historical data disagree', 'Must justify prior to regulators'],
    citations: [CITE_MAP],
  },
  {
    method: 'power_prior',
    description:
      'Raises the historical-data likelihood to a power alpha in [0,1] to discount it; alpha controls how much information is borrowed.',
    borrowingType: 'static',
    controlsPriorDataConflict: false,
    keyParameters: ['Discount parameter alpha (0 = ignore historical, 1 = full borrowing)', 'Historical sample size'],
    advantages: ['Intuitive single discount parameter', 'Effective sample size scales with alpha × historical N'],
    cautions: ['Fixed alpha does not adapt to conflict; normalized/adaptive power priors mitigate this', 'Choice of alpha must be pre-specified and justified'],
    citations: [CITE_POWERPRIOR],
  },
  {
    method: 'commensurate_prior',
    description:
      'Links current and historical parameters through a commensurability (drift) parameter estimated from the data, so borrowing adapts to agreement.',
    borrowingType: 'dynamic',
    controlsPriorDataConflict: true,
    keyParameters: ['Commensurability precision (controls degree of linkage)', 'Hyperprior on the drift'],
    advantages: ['Dynamically down-weights conflicting historical data', 'Borrows more when current and historical agree'],
    cautions: ['Sensitive to the hyperprior on commensurability', 'More complex to communicate and validate'],
    citations: [CITE_COMMENSURATE],
  },
  {
    method: 'meta_analytic_predictive',
    description:
      'Meta-analytic-predictive (MAP) prior derived from a hierarchical model across multiple historical studies, predicting the control parameter for the new trial.',
    borrowingType: 'dynamic',
    controlsPriorDataConflict: false,
    keyParameters: ['Between-trial heterogeneity (tau)', 'Number of historical trials'],
    advantages: ['Accounts for between-study heterogeneity', 'Yields an effective sample size that reflects heterogeneity'],
    cautions: ['Few historical trials make tau hard to estimate', 'Pure MAP does not robustly handle a single discordant prior — use a robust mixture'],
    citations: [CITE_MAP],
  },
  {
    method: 'robust_map_mixture',
    description:
      'A robust MAP prior mixing the informative MAP component with a weakly-informative (vague) component, so the prior self-deflates under prior-data conflict.',
    borrowingType: 'dynamic',
    controlsPriorDataConflict: true,
    keyParameters: ['Mixture weight on the informative component', 'Vague-component variance'],
    advantages: ['Robust to prior-data conflict by design', 'Reverts toward the vague component when data conflict'],
    cautions: ['Mixture weight must be pre-specified', 'Operating characteristics should be simulated across conflict scenarios'],
    citations: [CITE_MAP],
  },
  {
    method: 'hierarchical_exnex',
    description:
      'Exchangeability-nonexchangeability (EXNEX) hierarchical model allowing each stratum/source to be exchangeable with others or stand alone — useful for basket trials and pooled controls.',
    borrowingType: 'dynamic',
    controlsPriorDataConflict: true,
    keyParameters: ['Per-stratum exchangeability probability', 'Between-stratum variance'],
    advantages: ['Borrows across strata only when they are similar', 'Protects outlying strata from inappropriate borrowing'],
    cautions: ['Requires careful prior specification per stratum', 'Computationally and conceptually demanding'],
    citations: [CITE_MAP, CITE_COMMENSURATE],
  },
];

export interface PlanBayesianBorrowingParams {
  /** Whether the goal is to borrow for the CONTROL arm (vs. treatment/other). */
  borrowForControl?: boolean;
  /** Number of external/historical sources or studies available. */
  numberOfHistoricalSources?: number;
  /** Approximate total historical sample size available to borrow from. */
  historicalSampleSize?: number;
  /** Whether substantial prior-data conflict (drift) is plausible. */
  priorDataConflictLikely?: boolean;
  /** Whether the borrowing must be dynamic (adapt to agreement). */
  requireDynamicBorrowing?: boolean;
  /** Desired discount for a power prior, alpha in [0,1] (optional). */
  powerPriorAlpha?: number;
  /** Whether strict frequentist type-I-error control is required by the regulator. */
  strictTypeOneControl?: boolean;
}

export interface PlanBayesianBorrowingResult {
  recommendedMethod: BorrowingMethod;
  candidateMethods: BorrowingMethod[];
  methodProfiles: BorrowingMethodProfile[];
  recommendationRationale: string[];
  effectiveSampleSizeGuidance: string[];
  priorDataConflictGuidance: string[];
  typeOneErrorConsiderations: string[];
  powerPriorNote: string[];
  citations: string[];
}

function lookupBorrowingProfile(method: BorrowingMethod): BorrowingMethodProfile {
  const row = BORROWING_METHOD_REGISTRY.find(
    (r: BorrowingMethodRow): boolean => r.method === method,
  );
  const safe = row ?? BORROWING_METHOD_REGISTRY[0];
  return {
    method: safe.method,
    description: safe.description,
    borrowingType: safe.borrowingType,
    controlsPriorDataConflict: safe.controlsPriorDataConflict,
    keyParameters: [...safe.keyParameters],
    advantages: [...safe.advantages],
    cautions: [...safe.cautions],
    citations: [...safe.citations],
  };
}

/**
 * Plan a Bayesian information-borrowing strategy (informative/power/commensurate/
 * MAP/robust-MAP/EXNEX priors), addressing effective sample size, prior-data
 * conflict, dynamic borrowing, and type-I-error-inflation considerations.
 */
export function planBayesianBorrowing(
  params: PlanBayesianBorrowingParams,
): PlanBayesianBorrowingResult {
  const sources = typeof params.numberOfHistoricalSources === 'number' ? params.numberOfHistoricalSources : 1;
  const conflictLikely = params.priorDataConflictLikely === true;
  const requireDynamic = params.requireDynamicBorrowing === true;

  const candidates: BorrowingMethod[] = [];
  const rationale: string[] = [];

  let recommended: BorrowingMethod;

  if (sources >= 2) {
    // Multiple historical studies → MAP family.
    if (conflictLikely || requireDynamic) {
      recommended = 'robust_map_mixture';
      rationale.push(
        'Multiple historical studies with possible prior-data conflict — a robust MAP mixture borrows ' +
          'across studies while self-deflating under conflict.',
      );
    } else {
      recommended = 'meta_analytic_predictive';
      rationale.push(
        'Multiple historical studies with no expected conflict — a MAP prior synthesizes them while ' +
          'accounting for between-study heterogeneity.',
      );
    }
    candidates.push('meta_analytic_predictive', 'robust_map_mixture', 'hierarchical_exnex');
  } else {
    // Single source.
    if (conflictLikely || requireDynamic) {
      recommended = 'commensurate_prior';
      rationale.push(
        'A single historical source with possible drift — a commensurate prior adapts borrowing to the ' +
          'observed agreement between current and historical control parameters.',
      );
      candidates.push('commensurate_prior', 'robust_map_mixture', 'power_prior');
    } else if (typeof params.powerPriorAlpha === 'number') {
      recommended = 'power_prior';
      rationale.push(
        'A single concordant source with a pre-specified discount — a power prior transparently controls ' +
          'borrowing via alpha.',
      );
      candidates.push('power_prior', 'informative_prior', 'commensurate_prior');
    } else {
      recommended = 'informative_prior';
      rationale.push(
        'A single concordant source without an explicit discount — a fixed informative prior is the ' +
          'simplest transparent choice, but consider dynamic borrowing as a safeguard.',
      );
      candidates.push('informative_prior', 'power_prior', 'commensurate_prior');
    }
  }

  if (params.borrowForControl === true) {
    rationale.push(
      'Borrowing is targeted at the control arm — this directly reduces the number of internal control ' +
        'patients required, the most common rare-disease application.',
    );
  }

  // De-duplicate candidates preserving order, recommended first.
  const orderedCandidates: BorrowingMethod[] = [recommended];
  for (const c of candidates) {
    if (!orderedCandidates.includes(c)) {
      orderedCandidates.push(c);
    }
  }

  const profiles = orderedCandidates.map(
    (m: BorrowingMethod): BorrowingMethodProfile => lookupBorrowingProfile(m),
  );

  const essGuidance: string[] = [
    'Express borrowing as an effective sample size (ESS) — the number of "extra" control patients the prior contributes',
    'For a power prior, ESS ≈ alpha × historical N (when outcome variances are comparable)',
    'For MAP priors, ESS shrinks as between-study heterogeneity (tau) grows',
    'Report ESS prospectively so reviewers understand how much information is being borrowed',
  ];
  if (typeof params.historicalSampleSize === 'number' && typeof params.powerPriorAlpha === 'number') {
    const ess = Math.round(params.powerPriorAlpha * params.historicalSampleSize);
    essGuidance.push(
      `Illustrative power-prior ESS at alpha=${params.powerPriorAlpha} and historical N=${params.historicalSampleSize} ≈ ${ess} effective control patients`,
    );
  }

  const conflictGuidance: string[] = [
    'Pre-specify how prior-data conflict will be detected (e.g., posterior predictive checks, conflict p-values)',
    'Prefer dynamic methods (commensurate, robust MAP, EXNEX) when drift is plausible',
    'Simulate operating characteristics across a grid of true drift values, including the no-borrowing baseline',
    'Static priors (informative, fixed power prior) can introduce bias when historical and current data disagree',
  ];

  const typeOneGuidance: string[] = [
    'Borrowing concordant information can inflate type-I error if the prior is too informative under the null',
    'Calibrate the borrowing strength so the frequentist type-I error stays within the regulator-agreed bound',
    'Report type-I error and power under both agreement and conflict scenarios via simulation',
    'Dynamic borrowing controls but does not eliminate inflation — quantify the residual inflation explicitly',
  ];
  if (params.strictTypeOneControl === true) {
    typeOneGuidance.push(
      'Strict frequentist type-I control required — tune borrowing (or cap ESS) so simulated type-I error does not exceed the pre-agreed level, and pre-register the calibration',
    );
  }

  const powerPriorNote: string[] = [];
  if (typeof params.powerPriorAlpha === 'number') {
    if (params.powerPriorAlpha < 0 || params.powerPriorAlpha > 1) {
      powerPriorNote.push('Power-prior alpha must lie in [0,1]; the supplied value is out of range and should be corrected.');
    } else {
      powerPriorNote.push(
        `Power-prior alpha=${params.powerPriorAlpha}: borrowing ${Math.round(params.powerPriorAlpha * 100)}% of the historical likelihood.`,
      );
    }
  } else {
    powerPriorNote.push('No power-prior alpha supplied; if a power prior is used, pre-specify and justify alpha (or use a normalized/adaptive power prior).');
  }

  return {
    recommendedMethod: recommended,
    candidateMethods: orderedCandidates,
    methodProfiles: profiles,
    recommendationRationale: rationale,
    effectiveSampleSizeGuidance: essGuidance,
    priorDataConflictGuidance: conflictGuidance,
    typeOneErrorConsiderations: typeOneGuidance,
    powerPriorNote,
    citations: [CITE_POWERPRIOR, CITE_COMMENSURATE, CITE_MAP, CITE_CID_2020],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Rare Disease Endpoint Assessment
// ─────────────────────────────────────────────────────────────────────────────

export type EndpointStrategy =
  | 'existing_validated'
  | 'within_patient_change'
  | 'novel_coa'
  | 'multidomain_responder_index'
  | 'surrogate'
  | 'time_to_event'
  | 'biomarker_primary';

export interface EndpointStrategyProfile {
  strategy: EndpointStrategy;
  description: string;
  handlesHeterogeneity: boolean;
  validationBurden: 'low' | 'moderate' | 'high';
  advantages: string[];
  cautions: string[];
  citations: string[];
}

interface EndpointStrategyRow {
  strategy: EndpointStrategy;
  description: string;
  handlesHeterogeneity: boolean;
  validationBurden: 'low' | 'moderate' | 'high';
  advantages: string[];
  cautions: string[];
  citations: string[];
}

const ENDPOINT_STRATEGY_REGISTRY: EndpointStrategyRow[] = [
  {
    strategy: 'existing_validated',
    description: 'Use an already validated, fit-for-purpose endpoint with established meaningfulness and measurement properties.',
    handlesHeterogeneity: false,
    validationBurden: 'low',
    advantages: ['Lowest regulatory and validation burden', 'Comparable to prior evidence'],
    cautions: ['May not capture the heterogeneous manifestations of the disease', 'Existing instruments may lack sensitivity in a rare population'],
    citations: [CITE_COMMON_2019, CITE_RARE_2023],
  },
  {
    strategy: 'within_patient_change',
    description: 'Measure change from each patient’s own baseline, so heterogeneous starting points do not obscure the treatment effect.',
    handlesHeterogeneity: true,
    validationBurden: 'moderate',
    advantages: ['Each patient is their own reference; robust to baseline heterogeneity', 'Aligns with within-patient and externally controlled designs'],
    cautions: ['Requires a measurable, stable-enough baseline', 'Define meaningful within-patient change a priori'],
    citations: [CITE_NHS_2019, CITE_RARE_2023],
  },
  {
    strategy: 'novel_coa',
    description: 'Develop a novel clinical outcome assessment (PRO/ObsRO/ClinRO/PerfO) tailored to the rare disease and content-validated with patients.',
    handlesHeterogeneity: true,
    validationBurden: 'high',
    advantages: ['Captures concepts that matter to patients in this specific disease', 'Can be designed to be sensitive to the relevant deficits'],
    cautions: ['High validation burden (content validity, reliability, responsiveness)', 'Requires patient engagement and a natural history basis'],
    citations: [CITE_RARE_2023, CITE_NHS_2019],
  },
  {
    strategy: 'multidomain_responder_index',
    description: 'Combine multiple disease domains into a single responder definition or composite, accommodating that different patients are affected in different domains.',
    handlesHeterogeneity: true,
    validationBurden: 'high',
    advantages: ['Accommodates multi-system, heterogeneous involvement', 'A responder definition can integrate domains of differing relevance per patient'],
    cautions: ['Component weighting and responder thresholds must be pre-specified and justified', 'Interpretation of a composite can be opaque'],
    citations: [CITE_RARE_2023, CITE_COMMON_2019],
  },
  {
    strategy: 'surrogate',
    description: 'Use a surrogate endpoint reasonably likely to predict clinical benefit (e.g., for accelerated approval) when direct clinical endpoints are impractical.',
    handlesHeterogeneity: false,
    validationBurden: 'high',
    advantages: ['Enables a feasible/shorter trial when a clinical endpoint would take years', 'Supports accelerated approval pathways'],
    cautions: ['Must justify the surrogate’s relationship to clinical benefit', 'Requires confirmatory evidence of clinical benefit post-approval'],
    citations: [CITE_COMMON_2019, CITE_RARE_2023],
  },
  {
    strategy: 'time_to_event',
    description: 'Use time-to-clinical-event (e.g., loss of a milestone, major morbidity, death) anchored to the natural history trajectory.',
    handlesHeterogeneity: false,
    validationBurden: 'moderate',
    advantages: ['Clinically interpretable hard endpoint', 'Natural history defines the expected event rate for powering'],
    cautions: ['May require long follow-up or large N for rare events', 'Event definitions must be objective and consistently ascertained'],
    citations: [CITE_NHS_2019, CITE_ECT_2023],
  },
  {
    strategy: 'biomarker_primary',
    description: 'Use a qualified or well-justified biomarker as the primary measure when it reflects the disease mechanism and is sensitive to treatment.',
    handlesHeterogeneity: false,
    validationBurden: 'high',
    advantages: ['Can be more sensitive and earlier than clinical endpoints', 'Mechanistically linked to the therapeutic target'],
    cautions: ['Requires qualification or strong justification of the biomarker', 'Biomarker change must be linked to clinical relevance'],
    citations: [CITE_RARE_2023, CITE_NHS_2019],
  },
];

export interface AssessRareDiseaseEndpointParams {
  /** Disease name (recorded; does not change logic). */
  diseaseName?: string;
  /** Whether a validated, fit-for-purpose endpoint already exists. */
  validatedEndpointExists?: boolean;
  /** Whether the disease is phenotypically heterogeneous across patients. */
  heterogeneousPhenotype?: boolean;
  /** Whether disease affects multiple organ systems/domains. */
  multiSystem?: boolean;
  /** Whether a measurable within-patient baseline trajectory exists. */
  measurableBaselineTrajectory?: boolean;
  /** Whether accelerated approval via a surrogate is being considered. */
  acceleratedApprovalConsidered?: boolean;
  /** Whether a mechanistically linked, sensitive biomarker is available. */
  biomarkerAvailable?: boolean;
  /** Whether the key clinical events are objective and ascertainable. */
  objectiveClinicalEvents?: boolean;
}

export interface AssessRareDiseaseEndpointResult {
  recommendedStrategies: EndpointStrategy[];
  primaryStrategy: EndpointStrategy;
  strategyRationale: string[];
  strategyProfiles: EndpointStrategyProfile[];
  heterogeneityHandling: string[];
  surrogateJustificationGuidance: string[];
  coaDevelopmentGuidance: string[];
  citations: string[];
}

function lookupEndpointProfile(strategy: EndpointStrategy): EndpointStrategyProfile {
  const row = ENDPOINT_STRATEGY_REGISTRY.find(
    (r: EndpointStrategyRow): boolean => r.strategy === strategy,
  );
  const safe = row ?? ENDPOINT_STRATEGY_REGISTRY[0];
  return {
    strategy: safe.strategy,
    description: safe.description,
    handlesHeterogeneity: safe.handlesHeterogeneity,
    validationBurden: safe.validationBurden,
    advantages: [...safe.advantages],
    cautions: [...safe.cautions],
    citations: [...safe.citations],
  };
}

/**
 * Assess endpoint selection for a rare disease when natural history is
 * heterogeneous: within-patient change, novel COAs, multi-domain responder
 * indices, surrogate justification, and biomarker/time-to-event options.
 */
export function assessRareDiseaseEndpoint(
  params: AssessRareDiseaseEndpointParams,
): AssessRareDiseaseEndpointResult {
  const strategies: EndpointStrategy[] = [];
  const rationale: string[] = [];

  const heterogeneous = params.heterogeneousPhenotype === true;
  const multiSystem = params.multiSystem === true;
  const measurableBaseline = params.measurableBaselineTrajectory === true;

  if (params.validatedEndpointExists === true) {
    strategies.push('existing_validated');
    rationale.push('A validated, fit-for-purpose endpoint exists — use it to minimize validation burden and maximize comparability.');
  }

  if (heterogeneous && measurableBaseline) {
    strategies.push('within_patient_change');
    rationale.push('Phenotypic heterogeneity with a measurable baseline trajectory favors within-patient change, which removes baseline heterogeneity.');
  }

  if (multiSystem) {
    strategies.push('multidomain_responder_index');
    rationale.push('Multi-system involvement favors a multi-domain responder index that accommodates differing per-patient manifestations.');
  }

  if (heterogeneous && params.validatedEndpointExists !== true) {
    strategies.push('novel_coa');
    rationale.push('Heterogeneous disease without a validated endpoint warrants developing a novel, content-validated COA grounded in natural history.');
  }

  if (params.acceleratedApprovalConsidered === true) {
    strategies.push('surrogate');
    rationale.push('Accelerated approval is under consideration — a surrogate reasonably likely to predict clinical benefit may be appropriate, with confirmatory evidence to follow.');
  }

  if (params.biomarkerAvailable === true) {
    strategies.push('biomarker_primary');
    rationale.push('A mechanistically linked, sensitive biomarker is available and may serve as a primary or supportive measure with adequate justification.');
  }

  if (params.objectiveClinicalEvents === true) {
    strategies.push('time_to_event');
    rationale.push('Objective, ascertainable clinical events support a time-to-event endpoint anchored to natural history event rates.');
  }

  // Ensure at least one strategy; default to within-patient change, then validated.
  if (strategies.length === 0) {
    if (measurableBaseline) {
      strategies.push('within_patient_change');
      rationale.push('Defaulting to within-patient change given a measurable baseline trajectory and no other distinguishing inputs.');
    } else {
      strategies.push('existing_validated');
      rationale.push('Defaulting to an existing validated endpoint in the absence of distinguishing inputs.');
    }
  }

  // De-duplicate preserving order.
  const ordered: EndpointStrategy[] = [];
  for (const s of strategies) {
    if (!ordered.includes(s)) {
      ordered.push(s);
    }
  }

  const primary: EndpointStrategy = ordered[0];
  const profiles = ordered.map(
    (s: EndpointStrategy): EndpointStrategyProfile => lookupEndpointProfile(s),
  );

  const heterogeneityHandling: string[] = [
    'Anchor endpoints to within-patient change rather than absolute cross-patient levels when baselines differ',
    'Use responder definitions or composites to accommodate domain-specific involvement',
    'Stratify or model genotype/severity subgroups rather than assuming a single trajectory',
    'Use natural history data to define the expected untreated trajectory and meaningful change',
  ];

  const surrogateGuidance: string[] = [
    'Articulate the biological rationale linking the surrogate to the clinical outcome',
    'Summarize epidemiologic/natural-history and mechanistic evidence supporting the surrogate',
    'For accelerated approval, plan confirmatory evidence of clinical benefit and post-marketing commitments',
    'Distinguish a validated surrogate from one "reasonably likely to predict" clinical benefit',
  ];

  const coaGuidance: string[] = [
    'Establish content validity through patient/caregiver input on concepts that matter',
    'Demonstrate reliability, construct validity, and ability to detect change (responsiveness)',
    'Define the meaningful within-patient change threshold a priori using anchor-based methods',
    'Ground COA development in the natural history study to ensure relevance and sensitivity',
  ];

  return {
    recommendedStrategies: ordered,
    primaryStrategy: primary,
    strategyRationale: rationale,
    strategyProfiles: profiles,
    heterogeneityHandling,
    surrogateJustificationGuidance: surrogateGuidance,
    coaDevelopmentGuidance: coaGuidance,
    citations: [CITE_RARE_2023, CITE_COMMON_2019, CITE_NHS_2019],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Integrated Rare Disease Program Planning
// ─────────────────────────────────────────────────────────────────────────────

export type FDAInteractionType =
  | 'pre_ind'
  | 'cid_paired_meeting'
  | 'type_b_eop2'
  | 'type_c'
  | 'breakthrough_therapy'
  | 'rmat'
  | 'type_a'
  | 'pre_bla';

export interface FDAInteractionProfile {
  interaction: FDAInteractionType;
  description: string;
  whenToUse: string[];
  citations: string[];
}

interface FDAInteractionRow {
  interaction: FDAInteractionType;
  description: string;
  whenToUse: string[];
  citations: string[];
}

const FDA_INTERACTION_REGISTRY: FDAInteractionRow[] = [
  {
    interaction: 'pre_ind',
    description: 'Pre-IND meeting to align on the development plan, nonclinical package, and first-in-human design.',
    whenToUse: ['Before submitting the IND', 'To align on natural history strategy and early endpoint plans'],
    citations: [CITE_COMMON_2019, CITE_RARE_2023],
  },
  {
    interaction: 'cid_paired_meeting',
    description: 'Complex Innovative Trial Design (CID) paired meetings to discuss novel/complex designs (Bayesian borrowing, master protocols, external controls, adaptive designs).',
    whenToUse: ['When proposing a complex or innovative design', 'To agree on simulation-based operating characteristics and analysis'],
    citations: [CITE_CID_2020],
  },
  {
    interaction: 'type_b_eop2',
    description: 'End-of-Phase-2 (Type B) meeting to agree on the pivotal trial design, endpoints, and control strategy.',
    whenToUse: ['Before the pivotal/registration trial', 'To lock the primary endpoint and control approach'],
    citations: [CITE_COMMON_2019],
  },
  {
    interaction: 'type_c',
    description: 'Type C meeting for any other development matter — e.g., natural history protocol, endpoint/COA strategy, or external-control plan.',
    whenToUse: ['To discuss a specific methodological question (NHS, COA, external control)', 'When a focused, topic-specific alignment is needed'],
    citations: [CITE_NHS_2019, CITE_ECT_2023],
  },
  {
    interaction: 'breakthrough_therapy',
    description: 'Breakthrough Therapy designation for a serious condition with preliminary evidence of substantial improvement on a clinically significant endpoint.',
    whenToUse: ['When early evidence suggests substantial improvement over available therapy', 'To obtain intensive FDA guidance and expedited review'],
    citations: [CITE_COMMON_2019, CITE_RARE_2023],
  },
  {
    interaction: 'rmat',
    description: 'Regenerative Medicine Advanced Therapy (RMAT) designation for eligible cell/gene/tissue-engineered therapies addressing a serious condition.',
    whenToUse: ['For a regenerative medicine therapy with preliminary clinical evidence', 'To access expedited programs and early, frequent FDA interaction'],
    citations: [CITE_RARE_2023],
  },
  {
    interaction: 'type_a',
    description: 'Type A meeting to resolve a stalled development issue (e.g., clinical hold) on an expedited timeline.',
    whenToUse: ['To resolve a clinical hold or dispute', 'When development is otherwise blocked'],
    citations: [CITE_COMMON_2019],
  },
  {
    interaction: 'pre_bla',
    description: 'Pre-BLA/Pre-NDA meeting to align on the content and format of the marketing application.',
    whenToUse: ['Before submitting the marketing application', 'To confirm the evidentiary package is adequate'],
    citations: [CITE_COMMON_2019],
  },
];

export interface PlanRareDiseaseProgramParams {
  /** Disease name (recorded; does not change logic). */
  diseaseName?: string;
  /** Whether a natural history study exists or is planned. */
  naturalHistoryAvailable?: boolean;
  /** Whether a validated endpoint exists. */
  validatedEndpointExists?: boolean;
  /** Whether randomization to a concurrent control is feasible/ethical. */
  randomizationFeasible?: boolean;
  /** Whether a strong external control source is available. */
  externalControlAvailable?: boolean;
  /** Estimated total enrollable patients across the program. */
  estimatedEnrollable?: number;
  /** Whether the condition is serious/life-threatening. */
  seriousCondition?: boolean;
  /** Whether early efficacy evidence suggests substantial improvement. */
  preliminaryStrongEvidence?: boolean;
  /** Whether the product is a regenerative medicine (cell/gene/tissue) therapy. */
  regenerativeMedicine?: boolean;
  /** Whether the proposed design is complex/innovative (Bayesian, master protocol, adaptive). */
  complexInnovativeDesign?: boolean;
  /** Whether accelerated approval via a surrogate is being considered. */
  acceleratedApprovalConsidered?: boolean;
}

export interface PlanRareDiseaseProgramResult {
  evidenceGenerationStrategy: string[];
  controlStrategy: 'concurrent_randomized' | 'externally_controlled' | 'hybrid' | 'undetermined';
  controlStrategyRationale: string[];
  recommendedFDAInteractions: FDAInteractionType[];
  fdaInteractionProfiles: FDAInteractionProfile[];
  expeditedProgramFlags: string[];
  naturalHistoryLeverage: string[];
  programRisks: string[];
  citations: string[];
}

function lookupFDAInteraction(interaction: FDAInteractionType): FDAInteractionProfile {
  const row = FDA_INTERACTION_REGISTRY.find(
    (r: FDAInteractionRow): boolean => r.interaction === interaction,
  );
  const safe = row ?? FDA_INTERACTION_REGISTRY[0];
  return {
    interaction: safe.interaction,
    description: safe.description,
    whenToUse: [...safe.whenToUse],
    citations: [...safe.citations],
  };
}

/**
 * Build an integrated rare-disease development plan: evidence-generation
 * strategy, control strategy (single-arm vs. controlled), FDA interaction points
 * (Pre-IND, CID, Type B/C, Breakthrough/RMAT), and leveraging of natural history.
 */
export function planRareDiseaseProgram(
  params: PlanRareDiseaseProgramParams,
): PlanRareDiseaseProgramResult {
  const evidence: string[] = [];
  const interactions: FDAInteractionType[] = ['pre_ind'];

  const nhAvailable = params.naturalHistoryAvailable === true;
  const randomizationFeasible = params.randomizationFeasible !== false; // default feasible
  const externalAvailable = params.externalControlAvailable === true;

  // Evidence-generation strategy.
  if (nhAvailable) {
    evidence.push('Leverage the existing/planned natural history study to define the untreated trajectory, power the trial, and anchor endpoints');
  } else {
    evidence.push('Initiate a prospective natural history study early to characterize disease course and support endpoint/control strategy');
  }

  if (params.validatedEndpointExists === true) {
    evidence.push('Use the validated endpoint for the pivotal trial; estimate its rate of change from natural history');
  } else {
    evidence.push('Develop and content-validate a fit-for-purpose endpoint (COA) grounded in the natural history data');
    interactions.push('type_c');
  }

  // Control strategy decision.
  let control: 'concurrent_randomized' | 'externally_controlled' | 'hybrid' | 'undetermined';
  const controlRationale: string[] = [];

  if (randomizationFeasible) {
    if (externalAvailable) {
      control = 'hybrid';
      controlRationale.push('Randomization is feasible and a strong external control exists — a hybrid design (small concurrent control augmented by external/Bayesian borrowing) maximizes efficiency while preserving randomization.');
      interactions.push('cid_paired_meeting');
    } else {
      control = 'concurrent_randomized';
      controlRationale.push('Randomization to a concurrent control is feasible and ethical — a concurrent randomized control is preferred for internal validity (ICH E10).');
    }
  } else {
    if (externalAvailable) {
      control = 'externally_controlled';
      controlRationale.push('Randomization is infeasible/unethical but a fit-for-use external control exists — an externally controlled single-arm trial is appropriate, with rigorous bias control (FDA 2023).');
      interactions.push('type_c');
    } else {
      control = 'undetermined';
      controlRationale.push('Randomization is infeasible and no strong external control is available yet — prioritize building a prospective natural history control before committing to a pivotal design.');
    }
  }

  // FDA interaction points.
  if (params.complexInnovativeDesign === true && !interactions.includes('cid_paired_meeting')) {
    interactions.push('cid_paired_meeting');
  }
  interactions.push('type_b_eop2');

  const expeditedFlags: string[] = [];
  if (params.seriousCondition === true && params.preliminaryStrongEvidence === true) {
    if (params.regenerativeMedicine === true) {
      interactions.push('rmat');
      expeditedFlags.push('Likely eligible for RMAT designation (regenerative medicine, serious condition, preliminary clinical evidence)');
    } else {
      interactions.push('breakthrough_therapy');
      expeditedFlags.push('Likely eligible for Breakthrough Therapy designation (serious condition, substantial-improvement evidence)');
    }
  } else if (params.seriousCondition === true) {
    expeditedFlags.push('Serious condition — fast track and other expedited programs may apply as evidence matures');
  }
  if (params.acceleratedApprovalConsidered === true) {
    expeditedFlags.push('Accelerated approval may apply if a surrogate reasonably likely to predict clinical benefit is justified; plan confirmatory evidence');
  }

  interactions.push('pre_bla');

  // De-duplicate interactions preserving order.
  const orderedInteractions: FDAInteractionType[] = [];
  for (const i of interactions) {
    if (!orderedInteractions.includes(i)) {
      orderedInteractions.push(i);
    }
  }
  const interactionProfiles = orderedInteractions.map(
    (i: FDAInteractionType): FDAInteractionProfile => lookupFDAInteraction(i),
  );

  const nhLeverage: string[] = [
    'Set realistic effect sizes and event rates for powering from the observed untreated trajectory',
    'Use natural history as the external control or as a Bayesian prior for the control arm',
    'Identify prognostic subgroups (genotype/severity) for stratification or enrichment',
    'Develop and validate endpoints/COAs and define meaningful within-patient change',
  ];

  const risks: string[] = [
    'Small sample size limits power — mitigate with N-efficient designs and information borrowing',
    'Non-randomized comparisons carry confounding risk — pre-specify analysis and bias controls',
    'Phenotypic heterogeneity complicates endpoint interpretation — anchor to within-patient change',
    'Endpoint immaturity can delay registration — start natural history and COA work early',
    'Regulatory uncertainty around novel designs — engage FDA via CID/Type C before locking the design',
  ];
  if (control === 'undetermined') {
    risks.push('Control strategy is undetermined — pivotal design cannot be finalized until a control source is established');
  }
  if (typeof params.estimatedEnrollable === 'number' && params.estimatedEnrollable < 30) {
    risks.push('Very small enrollable population (<30) — strongly favor within-patient/Bayesian approaches and international collaboration');
  }

  return {
    evidenceGenerationStrategy: evidence,
    controlStrategy: control,
    controlStrategyRationale: controlRationale,
    recommendedFDAInteractions: orderedInteractions,
    fdaInteractionProfiles: interactionProfiles,
    expeditedProgramFlags: expeditedFlags,
    naturalHistoryLeverage: nhLeverage,
    programRisks: risks,
    citations: [CITE_COMMON_2019, CITE_RARE_2023, CITE_CID_2020, CITE_NHS_2019, CITE_ECT_2023, CITE_ICH_E10],
  };
}
