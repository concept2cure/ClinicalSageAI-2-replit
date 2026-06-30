/**
 * Clinical Trial Statistics & Estimands tools — exposes the deterministic
 * knowledge engines in `server/services/trial-statistics/trial-statistics-knowledge`
 * to AnA as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 *
 * Tools:
 *   define_estimand                   — assemble an ICH E9(R1) estimand (5 attributes)
 *   assess_intercurrent_event_strategy — recommend an ICH E9(R1) ICE strategy
 *   plan_multiplicity_control         — FWER control across a testing structure
 *   design_adaptive_design            — adaptive design selection + type-I-error control
 *   select_missing_data_strategy      — primary estimator + sensitivity analyses
 *   estimate_sample_size              — closed-form n (continuous/binary/TTE)
 *
 * @module server/services/ana/trialStatisticsTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a generic drug submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. define_estimand
// ─────────────────────────────────────────────────────────────────────────────

export const DEFINE_ESTIMAND: AnaTool = {
  name: 'define_estimand',
  description:
    'Construct an ICH E9(R1) estimand from its five attributes — treatment, population, ' +
    'variable/endpoint, intercurrent-event handling, and population-level summary — and run ' +
    'alignment checks. Returns a structured one-sentence estimand description (per ICH E9(R1) ' +
    'Figure 1), the assembled attributes, coherence checks (e.g. flags treatment-policy or ' +
    'while-on-treatment handling of death as incoherent for a non-mortality endpoint, flags ' +
    'principal-stratum assumptions, flags ITT/treatment-policy handling in non-inferiority ' +
    'trials), sensitivity-analysis pointers tied to each chosen strategy, and citations ' +
    '(ICH E9(R1) §A.3 / Figure 1, ICH E9 §5, FDA Multiple Endpoints 2022 §V). Use when the ' +
    'user needs to define, document, or QC the primary or secondary estimand for a trial. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      treatment: {
        type: 'string',
        description:
          'Treatment condition of interest including dose, schedule, and background therapy ' +
          '(e.g. "drug X 50 mg QD added to standard of care").',
      },
      comparator: {
        type: 'string',
        description:
          'Comparator / control condition (e.g. "placebo plus standard of care", ' +
          '"active control 10 mg QD"). Optional.',
      },
      population: {
        type: 'string',
        description:
          'Target population — the denominator of the clinical question (e.g. "adults with ' +
          'moderate-to-severe disease meeting entry criteria"). This is the estimand ' +
          'attribute, not the operational analysis set.',
      },
      endpoint: {
        type: 'string',
        description:
          'Endpoint / variable measured on each subject (e.g. "change from baseline in HbA1c").',
      },
      endpointTimepoint: {
        type: 'string',
        description:
          'When the endpoint is assessed (e.g. "Week 24", "time to first event"). Optional ' +
          'but recommended — leaving it implicit makes the estimand under-specified.',
      },
      intercurrentEvents: {
        type: 'array',
        description:
          'List of anticipated intercurrent events and the ICH E9(R1) strategy chosen for each.',
        items: {
          type: 'object',
          properties: {
            event: {
              type: 'string',
              enum: [
                'treatment-discontinuation',
                'treatment-discontinuation-lack-of-efficacy',
                'treatment-discontinuation-adverse-event',
                'rescue-medication',
                'death',
                'treatment-switching',
                'dose-modification',
                'noncompliance',
                'terminal-event-non-death',
              ],
              description: 'The intercurrent event being addressed.',
            },
            strategy: {
              type: 'string',
              enum: [
                'treatment-policy',
                'hypothetical',
                'composite',
                'while-on-treatment',
                'principal-stratum',
              ],
              description: 'The ICH E9(R1) strategy chosen for this intercurrent event.',
            },
            rationale: {
              type: 'string',
              description: 'Optional free-text rationale for the strategy choice.',
            },
          },
          required: ['event', 'strategy'],
        },
      },
      populationSummary: {
        type: 'string',
        enum: [
          'difference-in-means',
          'ratio-of-means',
          'risk-difference',
          'risk-ratio',
          'odds-ratio',
          'hazard-ratio',
          'difference-in-proportion-responders',
          'win-ratio',
          'restricted-mean-survival-time-difference',
        ],
        description: 'Population-level summary measure for comparing treatment conditions.',
      },
      objectiveTier: {
        type: 'string',
        enum: ['primary', 'key-secondary', 'secondary'],
        description: 'Objective tier this estimand supports (default "primary").',
      },
      comparisonType: {
        type: 'string',
        enum: ['superiority', 'non-inferiority', 'equivalence'],
        description: 'Whether the objective is superiority, non-inferiority, or equivalence.',
      },
    },
    required: [
      'treatment',
      'population',
      'endpoint',
      'intercurrentEvents',
      'populationSummary',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. assess_intercurrent_event_strategy
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_INTERCURRENT_EVENT_STRATEGY: AnaTool = {
  name: 'assess_intercurrent_event_strategy',
  description:
    'Recommend, for each intercurrent event, which of the five ICH E9(R1) strategies ' +
    '(treatment-policy, hypothetical, composite, while-on-treatment, principal-stratum) best ' +
    'matches the clinical question, given the endpoint type, therapeutic context, and ' +
    'regulatory objective. Handles treatment discontinuation (for lack of efficacy / due to ' +
    'adverse event), rescue medication, death, treatment switching, dose modification, ' +
    'non-compliance, and non-fatal terminal events. Returns the recommended strategy plus an ' +
    'alternative, the rationale, the typical estimator, the sensitivity-analysis approach, and ' +
    'citations (ICH E9(R1) §A.3.4 / §A.4, FDA Multiple Endpoints 2022 §V). Use when the user ' +
    'needs to decide how to handle rescue, discontinuation, switching, or death in an estimand. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      events: {
        type: 'array',
        description: 'The intercurrent events to be addressed.',
        items: {
          type: 'string',
          enum: [
            'treatment-discontinuation',
            'treatment-discontinuation-lack-of-efficacy',
            'treatment-discontinuation-adverse-event',
            'rescue-medication',
            'death',
            'treatment-switching',
            'dose-modification',
            'noncompliance',
            'terminal-event-non-death',
          ],
        },
      },
      endpointType: {
        type: 'string',
        enum: ['continuous', 'binary', 'time-to-event', 'count', 'ordinal'],
        description: 'Nature of the endpoint — drives which strategies are coherent.',
      },
      measurableAfterEvent: {
        type: 'boolean',
        description:
          'Whether the endpoint can still be measured after the intercurrent event occurs ' +
          '(default true). If false, treatment-policy is generally not available.',
      },
      context: {
        type: 'string',
        enum: [
          'symptomatic-chronic',
          'disease-modifying',
          'oncology-survival',
          'acute',
          'prevention',
        ],
        description: 'Therapeutic context (default "symptomatic-chronic").',
      },
      objective: {
        type: 'string',
        enum: ['effectiveness-pragmatic', 'efficacy-mechanistic', 'safety'],
        description:
          'Regulatory question framing — pragmatic effectiveness vs mechanistic efficacy vs ' +
          'safety (default "effectiveness-pragmatic"). Materially changes the recommendation.',
      },
    },
    required: ['events', 'endpointType'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. plan_multiplicity_control
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_MULTIPLICITY_CONTROL: AnaTool = {
  name: 'plan_multiplicity_control',
  description:
    'Recommend a family-wise error rate (FWER) control strategy across a testing structure of ' +
    'multiple endpoints, doses, or subgroups for a given alpha. Selects among no-adjustment ' +
    '(single primary or co-primary intersection-union), fixed-sequence/hierarchical testing, ' +
    'Holm step-down, Hochberg step-up, Bonferroni, Dunnett many-to-one (shared control), the ' +
    'graphical Bonferroni-Holm (Bretz-Maurer-Posch) approach, and serial/parallel gatekeeping. ' +
    'Returns the recommended method, rationale, alpha-allocation description, worked nominal ' +
    'thresholds where a closed form exists, alternative methods, an explicit FWER statement, ' +
    'cautions, and citations (FDA Multiple Endpoints 2022 §III-§IV, ICH E9 §5.6). Use when the ' +
    'user has multiple hypotheses and needs to control the type I error across them. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      sources: {
        type: 'array',
        description: 'The sources of multiplicity present in the trial.',
        items: {
          type: 'string',
          enum: [
            'multiple-primary-endpoints',
            'co-primary-endpoints',
            'multiple-doses',
            'multiple-subgroups',
            'primary-plus-key-secondary',
            'multiple-timepoints',
            'interim-analyses',
          ],
        },
      },
      numberOfHypotheses: {
        type: 'number',
        description: 'Number of hypotheses being tested (family size, >= 1).',
      },
      familyWiseAlpha: {
        type: 'number',
        description: 'Family-wise alpha to protect (default 0.05).',
      },
      hasNaturalOrdering: {
        type: 'boolean',
        description:
          'Whether the hypotheses have a clinically motivated ordering (enables fixed-sequence ' +
          'or graphical procedures). Default false.',
      },
      requireAllToSucceed: {
        type: 'boolean',
        description:
          'Whether ALL hypotheses must be significant to declare success (co-primary / ' +
          'intersection-union). No alpha penalty but a power penalty applies. Default false.',
      },
      sharedControl: {
        type: 'boolean',
        description:
          'Whether the comparisons share a common control arm (e.g. multiple doses vs placebo). ' +
          'Enables Dunnett. Default false.',
      },
      positivelyCorrelated: {
        type: 'boolean',
        description:
          'Whether the test statistics are positively correlated or the joint distribution is ' +
          'known (enables Hochberg / Dunnett). Default false.',
      },
    },
    required: ['sources', 'numberOfHypotheses'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. design_adaptive_design
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_ADAPTIVE_DESIGN: AnaTool = {
  name: 'design_adaptive_design',
  description:
    'Select and outline an adaptive trial design with type-I-error-control considerations, per ' +
    'the FDA Adaptive Designs guidance (2019). Maps the adaptation goal to a design: group ' +
    'sequential with alpha spending (early stopping for efficacy/futility), blinded vs ' +
    'unblinded sample-size re-estimation, adaptive population enrichment, inferentially ' +
    'seamless Phase 2/3, multi-arm multi-stage (MAMS), and adaptive dose selection. Returns the ' +
    'recommended adaptation, alpha-spending function, rationale, an explicit type-I-error-' +
    'control statement, illustrative O\'Brien-Fleming-type interim boundaries (nominal Z and ' +
    'alpha by information fraction), operational cautions, regulatory considerations, and ' +
    'citations (FDA Adaptive Designs 2019, ICH E9 §4.5-§4.6). Use when the user is considering ' +
    'interim analyses, re-sizing, enrichment, or arm/dose selection. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      goal: {
        type: 'string',
        enum: [
          'stop-early-efficacy',
          'stop-early-futility',
          'reestimate-sample-size',
          'select-population',
          'select-dose',
          'combine-phases',
          'compare-many-arms',
        ],
        description: 'The primary goal driving the adaptation.',
      },
      unblindedInterim: {
        type: 'boolean',
        description:
          'Whether interim looks use unblinded comparative (treatment-effect) data. Default ' +
          'false. Unblinded adaptations require stronger type-I-error and integrity controls.',
      },
      numberOfInterims: {
        type: 'number',
        description: 'Number of planned interim analyses excluding the final (default 2).',
      },
      nuisanceParameterUncertain: {
        type: 'boolean',
        description:
          'Whether the nuisance parameter (variance or control event rate) is uncertain ' +
          '(motivates blinded sample-size re-estimation). Default false.',
      },
      biomarkerSubgroupPlausible: {
        type: 'boolean',
        description:
          'Whether a predictive biomarker subgroup is plausible (enables adaptive enrichment). ' +
          'Default false.',
      },
      numberOfArms: {
        type: 'number',
        description: 'Number of experimental arms / doses under consideration (default 1).',
      },
      alpha: {
        type: 'number',
        description: 'Family-wise alpha to protect (default 0.05).',
      },
    },
    required: ['goal'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. select_missing_data_strategy
// ─────────────────────────────────────────────────────────────────────────────

export const SELECT_MISSING_DATA_STRATEGY: AnaTool = {
  name: 'select_missing_data_strategy',
  description:
    'Choose a primary estimator and a set of sensitivity analyses for missing data, aligned to ' +
    "the estimand's intercurrent-event strategy and the assumed missingness mechanism " +
    '(MCAR/MAR/MNAR). Selects among MMRM, multiple imputation under MAR, ANCOVA on completers, ' +
    'GEE, and reference-based imputation as the primary estimator; and proposes sensitivity ' +
    'analyses including control-based / jump-to-reference / copy-reference imputation, ' +
    'delta-adjustment tipping-point, pattern-mixture and selection models. Returns the primary ' +
    'estimator with rationale and assumption, the sensitivity analyses with purpose and ' +
    'assumption, an estimand-alignment note, cautions (LOCF/BOCF discouraged; conduct is the ' +
    'first defense), and citations (ICH E9(R1) §A.4, ICH E9 §5.3, NRC 2010). Use when the user ' +
    'needs a missing-data analysis plan for the SAP. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      endpointType: {
        type: 'string',
        enum: ['continuous-longitudinal', 'continuous-single', 'binary', 'time-to-event'],
        description: 'Type of endpoint requiring a missing-data plan.',
      },
      estimandStrategy: {
        type: 'string',
        enum: [
          'treatment-policy',
          'hypothetical',
          'composite',
          'while-on-treatment',
          'principal-stratum',
        ],
        description:
          "The estimand's intercurrent-event strategy that the missing-data plan must serve. " +
          'This determines which observations count as "missing" versus "out of scope".',
      },
      assumedMechanism: {
        type: 'string',
        enum: ['MCAR', 'MAR', 'MNAR', 'unknown'],
        description: 'Assumed dominant missingness mechanism (default MAR).',
      },
      expectedMissingFraction: {
        type: 'number',
        description:
          'Expected proportion of subjects with a missing primary outcome (0..1, default 0.1). ' +
          'Values above 0.2 trigger a high-missingness caution.',
      },
      monotoneDropout: {
        type: 'boolean',
        description:
          'Whether monotone (dropout) missingness dominates over intermittent missingness ' +
          '(default true). Intermittent missingness adds a control-based sensitivity analysis.',
      },
    },
    required: ['endpointType', 'estimandStrategy'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. estimate_sample_size
// ─────────────────────────────────────────────────────────────────────────────

export const ESTIMATE_SAMPLE_SIZE: AnaTool = {
  name: 'estimate_sample_size',
  description:
    'Compute a closed-form sample size for continuous (two-sample t/z), binary (two-proportion ' +
    'z), or time-to-event (Schoenfeld event-driven) endpoints, under superiority, ' +
    'non-inferiority, or equivalence (TOST). Derives n from the effect size, alpha (one- or ' +
    'two-sided), power, allocation ratio, and dropout fraction, and for time-to-event also ' +
    'returns the required number of events. Returns per-arm sample sizes (control / ' +
    'experimental), total randomized after dropout inflation, the exact formula applied in ' +
    'plain text, the derived quantities (z-values, standardized effect, log-hazard-ratio), ' +
    'assumptions, and citations (ICH E9 §3.5, FDA Non-Inferiority 2016 §III, Schoenfeld 1983). ' +
    'Use when the user needs to size a trial or check a sponsor\'s sample-size justification. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      endpointKind: {
        type: 'string',
        enum: ['continuous', 'binary', 'time-to-event'],
        description: 'The type of primary endpoint.',
      },
      comparison: {
        type: 'string',
        enum: ['superiority', 'non-inferiority', 'equivalence'],
        description: 'The design comparison type.',
      },
      alpha: {
        type: 'number',
        description:
          'Significance level (default 0.05). Convention: two-sided for superiority/equivalence, ' +
          'one-sided for non-inferiority.',
      },
      twoSided: {
        type: 'boolean',
        description:
          'Whether alpha is two-sided. Defaults to true for superiority/equivalence and false ' +
          'for non-inferiority.',
      },
      power: {
        type: 'number',
        description: 'Target power (1 - beta), default 0.90.',
      },
      allocationRatio: {
        type: 'number',
        description: 'Allocation ratio k = n_experimental / n_control (default 1 for 1:1).',
      },
      dropoutFraction: {
        type: 'number',
        description:
          'Anticipated dropout fraction (0..1) used to inflate n by 1/(1-dropout). Default 0.',
      },
      meanDifference: {
        type: 'number',
        description:
          'Continuous endpoint: mean difference to detect (superiority) or expected true ' +
          'difference (NI/equivalence).',
      },
      standardDeviation: {
        type: 'number',
        description: 'Continuous endpoint: common standard deviation.',
      },
      controlProportion: {
        type: 'number',
        description: 'Binary endpoint: control-arm event proportion (0..1).',
      },
      experimentalProportion: {
        type: 'number',
        description: 'Binary endpoint: experimental-arm event proportion (0..1).',
      },
      hazardRatio: {
        type: 'number',
        description: 'Time-to-event: hazard ratio to detect.',
      },
      eventProbability: {
        type: 'number',
        description:
          'Time-to-event: overall probability that a subject has an event during the study ' +
          '(0..1), used to convert required events to randomized n.',
      },
      niMargin: {
        type: 'number',
        description:
          'Non-inferiority margin on the endpoint contrast scale (mean difference for ' +
          'continuous, risk difference for binary, hazard ratio e.g. 1.3 for time-to-event).',
      },
      equivalenceMargin: {
        type: 'number',
        description:
          'Equivalence margin (symmetric, absolute; for time-to-event expressed as a hazard ' +
          'ratio bound).',
      },
    },
    required: ['endpointKind', 'comparison'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Clinical trial statistics & estimands tools, spread into ALL_ANA_TOOLS. */
export const TRIAL_STATISTICS_TOOLS: AnaTool[] = [
  DEFINE_ESTIMAND,
  ASSESS_INTERCURRENT_EVENT_STRATEGY,
  PLAN_MULTIPLICITY_CONTROL,
  DESIGN_ADAPTIVE_DESIGN,
  SELECT_MISSING_DATA_STRATEGY,
  ESTIMATE_SAMPLE_SIZE,
];
