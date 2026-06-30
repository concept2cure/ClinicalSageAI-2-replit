/**
 * Rare Disease Development & External Control Arms tools — exposes the
 * deterministic knowledge engines in
 * `server/services/rare-disease/rare-disease-knowledge` to AnA as first-class,
 * selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 *
 * This domain covers study DESIGN and METHODOLOGY for small populations. It
 * does NOT cover orphan-drug designation eligibility (covered elsewhere).
 *
 * Tools:
 *   design_natural_history_study   — prospective/retrospective NHS design + data elements
 *   design_external_control        — externally controlled trial design (FDA 2023, ICH E10)
 *   assess_small_population_design  — small-N design selection + efficiency tradeoffs
 *   plan_bayesian_borrowing        — Bayesian information borrowing (priors, ESS, conflict)
 *   assess_rare_disease_endpoint   — endpoint selection under phenotypic heterogeneity
 *   plan_rare_disease_program      — integrated rare-disease development plan
 *
 * @module server/services/ana/rareDiseaseTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a generic drug submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. design_natural_history_study
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_NATURAL_HISTORY_STUDY: AnaTool = {
  name: 'design_natural_history_study',
  description:
    'Design a natural history study (NHS) for a rare disease per FDA Rare Diseases: ' +
    'Natural History Studies for Drug Development (2019). Selects a prospective, ' +
    'retrospective, ambidirectional, or cross-sectional design based on the intended ' +
    'use (external control, endpoint/biomarker development, feasibility, patient ' +
    'identification, or subgroup definition) and data availability. Returns the ' +
    'recommended design with rationale and a full design profile (strengths, ' +
    'limitations, data-quality considerations), the core data elements FDA recommends ' +
    'capturing (genotype, phenotype, longitudinal course, outcomes, biomarkers), ' +
    'genotype-phenotype guidance, external-control readiness, endpoint-development ' +
    'guidance, and feasibility flags. Use when the user is planning a natural history ' +
    'study, asking how to characterize disease course, or preparing data to support an ' +
    'external control arm or endpoint development. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      diseaseName: {
        type: 'string',
        description:
          'Plain-language name of the rare disease (optional). Recorded for context; ' +
          'does not change the deterministic design logic.',
      },
      primaryUse: {
        type: 'string',
        enum: [
          'external_control',
          'endpoint_development',
          'patient_identification',
          'biomarker_qualification',
          'subgroup_definition',
          'trial_feasibility',
        ],
        description:
          'The primary intended use of the natural history data. Drives the design ' +
          'recommendation: external_control / endpoint_development / biomarker_qualification ' +
          'favor prospective (or ambidirectional) designs; trial_feasibility and ' +
          'patient_identification favor retrospective or cross-sectional designs.',
      },
      knownGenotypePhenotype: {
        type: 'boolean',
        description:
          'Whether the disease has well-characterized genotype-phenotype correlations. ' +
          'If true, the engine recommends leveraging them for subgroups and matching.',
      },
      validatedEndpointExists: {
        type: 'boolean',
        description:
          'Whether a validated, fit-for-purpose endpoint already exists. If false, the ' +
          'engine emphasizes COA development and characterizing meaningful within-patient change.',
      },
      estimatedAnnualPatients: {
        type: 'number',
        description:
          'Estimated annual incident or identifiable patients. Used only to raise ' +
          'feasibility flags (e.g., very small populations under 20/year).',
      },
      existingDataAvailable: {
        type: 'boolean',
        description:
          'Whether existing registry/chart/research data are available for a ' +
          'retrospective or ambidirectional component.',
      },
      heterogeneousCourse: {
        type: 'boolean',
        description:
          'Whether the disease course is heterogeneous across patients. Influences whether ' +
          'a prospective longitudinal design is needed to separate progression from cohort effects.',
      },
    },
    required: ['primaryUse'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. design_external_control
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_EXTERNAL_CONTROL: AnaTool = {
  name: 'design_external_control',
  description:
    'Design an externally controlled trial per FDA Considerations for the Design and ' +
    'Conduct of Externally Controlled Trials (2023) and ICH E10. Evaluates the external ' +
    'control source (historical trial, concurrent external, natural history, real-world ' +
    'data, registry, or pooled patient-level data) and grades overall suitability ' +
    '(favorable / conditional / unfavorable) based on individual patient-level data ' +
    'availability, endpoint harmonization, endpoint objectivity, predictability of the ' +
    'natural course, prognostic-covariate measurement, and contemporaneity. Returns the ' +
    'source profile, suitability grade with rationale, comparability domains to assess, ' +
    'bias sources to address (confounding, selection, information, immortal-time, secular ' +
    'trend), fit-for-use criteria (relevance, reliability, comparability, ascertainability, ' +
    'pre-specification), recommended analytic safeguards (propensity methods, time-zero ' +
    'definition, E-value/quantitative bias analysis), and ICH E10 considerations. Use when ' +
    'the user proposes a single-arm trial with an external control or asks whether an ' +
    'external control source is adequate. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      diseaseName: {
        type: 'string',
        description: 'Name of the rare disease (optional). Recorded for context only.',
      },
      controlSource: {
        type: 'string',
        enum: [
          'historical_trial',
          'concurrent_external',
          'natural_history',
          'real_world_data',
          'registry',
          'patient_level_pooled',
        ],
        description:
          'Source of the external control data. natural_history is the preferred source ' +
          'for a progressive rare disease; real_world_data requires especially careful ' +
          'reliability/relevance assessment.',
      },
      individualPatientData: {
        type: 'boolean',
        description:
          'Whether individual patient-level data are available (vs. only aggregate/summary). ' +
          'Individual-level data are strongly preferred for comparability assessment and matching.',
      },
      endpointsHarmonized: {
        type: 'boolean',
        description:
          'Whether outcome definitions, ascertainment, and assessment timing match the ' +
          'treated arm. Harmonization reduces information/measurement bias.',
      },
      objectiveEndpoint: {
        type: 'boolean',
        description:
          'Whether the primary endpoint is objective (e.g., death, laboratory value) rather ' +
          'than subjective. Objective endpoints reduce ascertainment bias in a non-blinded comparison.',
      },
      predictableNaturalCourse: {
        type: 'boolean',
        description:
          'Whether the disease has a predictable, well-characterized untreated course. ' +
          'Per ICH E10, external controls are most interpretable when the course is predictable.',
      },
      prognosticCovariatesMeasured: {
        type: 'boolean',
        description:
          'Whether key prognostic baseline covariates are measured in both the treated and ' +
          'external cohorts (enabling covariate adjustment / propensity methods).',
      },
      contemporaneous: {
        type: 'boolean',
        description:
          'Whether the treated and external cohorts are contemporaneous (same calendar era), ' +
          'reducing secular-trend confounding.',
      },
    },
    required: ['controlSource'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. assess_small_population_design
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_SMALL_POPULATION_DESIGN: AnaTool = {
  name: 'assess_small_population_design',
  description:
    'Assess and rank trial designs for a small (rare-disease) population, drawing on FDA ' +
    'Rare Diseases: Common Issues in Drug Development (2019) and EMA CHMP/EWP/83561/2005 ' +
    '(small populations). Evaluates whether the disease is chronic/stable, the effect ' +
    'reversible, the course progressive, randomization feasible, a predictive biomarker ' +
    'available, multiple arms needed, and an external control available, then recommends ' +
    'and ranks designs (parallel RCT, crossover, randomized-withdrawal, N-of-1, ' +
    'group-sequential, multi-arm multi-stage, within-patient control, adaptive enrichment, ' +
    'externally controlled, master-protocol/basket). Returns the ranked designs with a ' +
    'primary recommendation, rationale, per-design profiles (sample efficiency, ' +
    'concurrent-control requirement, assumptions, advantages, tradeoffs, best-when), ' +
    'explicit efficiency tradeoffs, and general small-N design principles. Use when the ' +
    'user needs to choose an efficient design for a very small population or asks about ' +
    'crossover/N-of-1/randomized-withdrawal/within-patient approaches. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      diseaseName: {
        type: 'string',
        description: 'Name of the rare disease (optional). Recorded for context only.',
      },
      chronicStable: {
        type: 'boolean',
        description:
          'Whether the condition is chronic and stable over the trial period. Enables ' +
          'within-patient designs (crossover, N-of-1).',
      },
      reversibleEffect: {
        type: 'boolean',
        description:
          'Whether the treatment effect is reversible on withdrawal/washout. Required for ' +
          'crossover, N-of-1, and randomized-withdrawal designs.',
      },
      progressive: {
        type: 'boolean',
        description:
          'Whether the disease is progressive with a measurable rate of change. Enables ' +
          'within-patient slope (pre/post) comparisons and externally controlled designs.',
      },
      randomizationFeasible: {
        type: 'boolean',
        description:
          'Whether randomization to a concurrent control is feasible and ethical. Defaults ' +
          'to feasible unless explicitly set false; if false, an externally controlled design is favored.',
      },
      predictiveBiomarker: {
        type: 'boolean',
        description:
          'Whether a predictive biomarker or genotype defines a likely-responsive subpopulation ' +
          '(enables adaptive enrichment).',
      },
      multipleArmsNeeded: {
        type: 'boolean',
        description:
          'Whether multiple doses or agents (or related conditions) need to be compared ' +
          '(favors MAMS or master-protocol/basket designs).',
      },
      externalControlAvailable: {
        type: 'boolean',
        description:
          'Whether a strong external control source (e.g., natural history) is available, ' +
          'supporting a single-arm externally controlled trial.',
      },
      estimatedEnrollable: {
        type: 'number',
        description:
          'Estimated number of enrollable patients. Used to emphasize sample-efficiency in the output.',
      },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. plan_bayesian_borrowing
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_BAYESIAN_BORROWING: AnaTool = {
  name: 'plan_bayesian_borrowing',
  description:
    'Plan a Bayesian information-borrowing strategy to augment a small rare-disease trial ' +
    '(typically the control arm) with external/historical data. Grounded in the power-prior ' +
    '(Ibrahim & Chen 2000), commensurate-prior (Hobbs et al. 2011), and meta-analytic-' +
    'predictive / robust-MAP (Neuenschwander et al. 2010; Schmidli et al. 2014) literature. ' +
    'Selects among informative, power, commensurate, MAP, robust-MAP-mixture, and ' +
    'hierarchical EXNEX priors based on the number of historical sources, likelihood of ' +
    'prior-data conflict, and whether dynamic borrowing is required. Returns the recommended ' +
    'method, ranked candidate methods with profiles (static vs. dynamic borrowing, whether it ' +
    'controls prior-data conflict, key parameters, advantages, cautions), effective-sample-size ' +
    '(ESS) guidance (including an illustrative power-prior ESS when alpha and historical N are ' +
    'given), prior-data-conflict detection guidance, type-I-error-inflation considerations, and ' +
    'a power-prior alpha note. Use when the user wants to borrow historical control information, ' +
    'asks about power/commensurate/MAP priors, effective sample size, or dynamic borrowing. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      borrowForControl: {
        type: 'boolean',
        description:
          'Whether the borrowing targets the CONTROL arm (the most common rare-disease ' +
          'application, reducing the number of internal control patients required).',
      },
      numberOfHistoricalSources: {
        type: 'number',
        description:
          'Number of external/historical sources or studies available. Two or more favors ' +
          'MAP-family methods; a single source favors informative/power/commensurate priors.',
      },
      historicalSampleSize: {
        type: 'number',
        description:
          'Approximate total historical sample size available to borrow from. Used with ' +
          'powerPriorAlpha to compute an illustrative effective sample size.',
      },
      priorDataConflictLikely: {
        type: 'boolean',
        description:
          'Whether substantial prior-data conflict (drift between historical and current data) ' +
          'is plausible. If true, dynamic methods (commensurate, robust MAP, EXNEX) are favored.',
      },
      requireDynamicBorrowing: {
        type: 'boolean',
        description:
          'Whether the borrowing must be dynamic (adapt to the agreement between current and ' +
          'historical data) rather than static.',
      },
      powerPriorAlpha: {
        type: 'number',
        description:
          'Desired power-prior discount alpha in [0,1] (0 = ignore historical data, 1 = full ' +
          'borrowing). If provided, the engine reports the borrowing fraction and an illustrative ESS.',
      },
      strictTypeOneControl: {
        type: 'boolean',
        description:
          'Whether strict frequentist type-I-error control is required by the regulator. If true, ' +
          'the engine emphasizes calibrating/capping borrowing so simulated type-I error stays within bounds.',
      },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. assess_rare_disease_endpoint
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_RARE_DISEASE_ENDPOINT: AnaTool = {
  name: 'assess_rare_disease_endpoint',
  description:
    'Assess endpoint selection for a rare disease when natural history is heterogeneous, per ' +
    'FDA Rare Diseases guidance (2019/2023). Recommends and ranks endpoint strategies ' +
    '(existing validated endpoint, within-patient change, novel COA development, multi-domain ' +
    'responder index, surrogate endpoint, time-to-event, biomarker-primary) based on whether a ' +
    'validated endpoint exists, the phenotype is heterogeneous, the disease is multi-system, a ' +
    'measurable baseline trajectory exists, accelerated approval is considered, a biomarker is ' +
    'available, and clinical events are objective. Returns the ranked strategies with a primary ' +
    'recommendation, rationale, per-strategy profiles (whether it handles heterogeneity, ' +
    'validation burden, advantages, cautions), heterogeneity-handling guidance, surrogate-' +
    'justification guidance, and COA-development guidance (content validity, responsiveness, ' +
    'meaningful within-patient change). Use when the user asks how to choose or develop an ' +
    'endpoint for a heterogeneous rare disease, or about responder indices, COAs, or surrogates. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      diseaseName: {
        type: 'string',
        description: 'Name of the rare disease (optional). Recorded for context only.',
      },
      validatedEndpointExists: {
        type: 'boolean',
        description:
          'Whether a validated, fit-for-purpose endpoint already exists. If true, it is ' +
          'recommended to minimize validation burden; if false, novel COA development is emphasized.',
      },
      heterogeneousPhenotype: {
        type: 'boolean',
        description:
          'Whether the disease is phenotypically heterogeneous across patients. Favors ' +
          'within-patient change and novel COAs over absolute cross-patient comparisons.',
      },
      multiSystem: {
        type: 'boolean',
        description:
          'Whether the disease affects multiple organ systems/domains. Favors a multi-domain ' +
          'responder index that accommodates differing per-patient manifestations.',
      },
      measurableBaselineTrajectory: {
        type: 'boolean',
        description:
          'Whether a measurable within-patient baseline trajectory exists. Enables ' +
          'within-patient change endpoints that remove baseline heterogeneity.',
      },
      acceleratedApprovalConsidered: {
        type: 'boolean',
        description:
          'Whether accelerated approval via a surrogate endpoint is being considered. If true, ' +
          'a surrogate reasonably likely to predict clinical benefit is added with confirmatory-evidence guidance.',
      },
      biomarkerAvailable: {
        type: 'boolean',
        description:
          'Whether a mechanistically linked, sensitive biomarker is available to serve as a ' +
          'primary or supportive measure (with adequate justification/qualification).',
      },
      objectiveClinicalEvents: {
        type: 'boolean',
        description:
          'Whether the key clinical events are objective and ascertainable, supporting a ' +
          'time-to-event endpoint anchored to natural history event rates.',
      },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. plan_rare_disease_program
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_RARE_DISEASE_PROGRAM: AnaTool = {
  name: 'plan_rare_disease_program',
  description:
    'Build an integrated rare-disease development plan per FDA Rare Diseases: Common Issues ' +
    '(2019) and Considerations for Development (2023), the CID guidance (2020), and ICH E10. ' +
    'Synthesizes an evidence-generation strategy (leveraging or initiating a natural history ' +
    'study; using or developing an endpoint), determines the control strategy ' +
    '(concurrent_randomized, externally_controlled, hybrid, or undetermined) based on whether ' +
    'randomization is feasible and whether a strong external control exists, and sequences the ' +
    'recommended FDA interaction points (Pre-IND, CID paired meeting, Type B/EOP2, Type C, ' +
    'Breakthrough Therapy, RMAT, Pre-BLA) with profiles and when-to-use guidance. Also returns ' +
    'expedited-program flags (Breakthrough/RMAT/accelerated approval eligibility), natural-history ' +
    'leverage points, and program risks. Use when the user wants an end-to-end rare-disease ' +
    'development strategy, asks single-arm vs. controlled, or asks which FDA meetings/designations ' +
    'to pursue. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      diseaseName: {
        type: 'string',
        description: 'Name of the rare disease (optional). Recorded for context only.',
      },
      naturalHistoryAvailable: {
        type: 'boolean',
        description:
          'Whether a natural history study exists or is planned. If false, the engine ' +
          'recommends initiating a prospective natural history study early.',
      },
      validatedEndpointExists: {
        type: 'boolean',
        description:
          'Whether a validated endpoint exists. If false, the plan adds COA development and a Type C meeting.',
      },
      randomizationFeasible: {
        type: 'boolean',
        description:
          'Whether randomization to a concurrent control is feasible and ethical. Defaults to ' +
          'feasible unless explicitly false. Drives the control-strategy decision.',
      },
      externalControlAvailable: {
        type: 'boolean',
        description:
          'Whether a strong external control source is available. Combined with randomization ' +
          'feasibility to choose concurrent / external / hybrid control strategies.',
      },
      estimatedEnrollable: {
        type: 'number',
        description:
          'Estimated total enrollable patients across the program. Very small populations (<30) ' +
          'raise a program risk favoring within-patient/Bayesian approaches and international collaboration.',
      },
      seriousCondition: {
        type: 'boolean',
        description:
          'Whether the condition is serious or life-threatening (a prerequisite for Breakthrough/RMAT designations).',
      },
      preliminaryStrongEvidence: {
        type: 'boolean',
        description:
          'Whether early efficacy evidence suggests substantial improvement over available therapy ' +
          '(supports Breakthrough Therapy / RMAT eligibility).',
      },
      regenerativeMedicine: {
        type: 'boolean',
        description:
          'Whether the product is a regenerative medicine (cell/gene/tissue-engineered) therapy ' +
          '(routes the expedited-program flag toward RMAT instead of Breakthrough Therapy).',
      },
      complexInnovativeDesign: {
        type: 'boolean',
        description:
          'Whether the proposed design is complex/innovative (Bayesian borrowing, master protocol, ' +
          'adaptive). If true, a CID paired meeting is added to the interaction plan.',
      },
      acceleratedApprovalConsidered: {
        type: 'boolean',
        description:
          'Whether accelerated approval via a surrogate is being considered (adds an accelerated-approval flag with confirmatory-evidence guidance).',
      },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Rare disease development & external control arm tools, spread into ALL_ANA_TOOLS. */
export const RARE_DISEASE_TOOLS: AnaTool[] = [
  DESIGN_NATURAL_HISTORY_STUDY,
  DESIGN_EXTERNAL_CONTROL,
  ASSESS_SMALL_POPULATION_DESIGN,
  PLAN_BAYESIAN_BORROWING,
  ASSESS_RARE_DISEASE_ENDPOINT,
  PLAN_RARE_DISEASE_PROGRAM,
];
