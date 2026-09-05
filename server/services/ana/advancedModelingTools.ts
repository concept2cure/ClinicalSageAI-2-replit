/**
 * Advanced HEOR modeling + CDISC pipeline tools — deterministic engines exposed
 * to AnA:
 *   model_markov_cohort           -> heor/markov-model.runMarkovModel
 *   run_probabilistic_sensitivity -> heor/psa.runProbabilisticSensitivity (seeded)
 *   run_cdisc_pipeline            -> cdisc/pipeline.runCdiscPipeline
 *
 * @module server/services/ana/advancedModelingTools
 */

import type { AnaTool } from '../ai-gateway/types';

const NOTE = 'Deterministic engine — report the returned numbers verbatim. Relay validation errors and ask for missing inputs rather than guessing.';

// PSA arm schema (inlined; the AnA tool schema type does not support $ref/$defs).
const PARAM_SCHEMA = {
  type: 'object',
  properties: { mean: { type: 'number' }, sd: { type: 'number' }, dist: { type: 'string', enum: ['normal', 'gamma'] } },
  required: ['mean', 'sd'],
} as const;
const ARM_SCHEMA = {
  type: 'object',
  description: 'Cost and effect distributions for one arm.',
  properties: { cost: PARAM_SCHEMA, effect: PARAM_SCHEMA },
  required: ['cost', 'effect'],
} as const;

export const MODEL_MARKOV_COHORT: AnaTool = {
  name: 'model_markov_cohort',
  description:
    'Simulate a Markov cohort model for cost-effectiveness: a closed cohort moves through discrete states via a transition matrix over N cycles, accruing discounted costs and QALYs. Returns the per-cycle trace, total discounted/undiscounted cost and QALYs. Conventions: start-of-cycle accrual (no half-cycle correction), first cycle undiscounted. ' + NOTE,
  input_schema: {
    type: 'object',
    properties: {
      states: { type: 'array', items: { type: 'string' }, description: 'State names (≥2), e.g. ["Healthy","Sick","Dead"].' },
      transitionMatrix: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Square matrix; row i = probabilities FROM state i (each row sums to 1).' },
      stateCosts: { type: 'array', items: { type: 'number' }, description: 'Per-cycle cost in each state (index-aligned).' },
      stateUtilities: { type: 'array', items: { type: 'number' }, description: 'Per-cycle utility (QALY weight) in each state (index-aligned).' },
      cycles: { type: 'number', description: 'Number of cycles (integer ≥ 1).' },
      discountRate: { type: 'number', description: 'Annual discount rate (e.g. 0.03). Default 0.' },
      cycleLengthYears: { type: 'number', description: 'Years per cycle (default 1).' },
      initialDistribution: { type: 'array', items: { type: 'number' }, description: 'Starting distribution across states (sums to 1). Default: all in state 0.' },
      cohortSize: { type: 'number', description: 'Cohort size for absolute counts (default 1 = per-patient).' },
    },
    required: ['states', 'transitionMatrix', 'stateCosts', 'stateUtilities', 'cycles'],
  },
};

export const RUN_PROBABILISTIC_SENSITIVITY: AnaTool = {
  name: 'run_probabilistic_sensitivity',
  description:
    'Run a probabilistic sensitivity analysis (PSA) for cost-effectiveness: Monte-Carlo over input distributions for an intervention vs comparator, returning mean incremental cost/effect, a point ICER, the probability the intervention is dominant, and a cost-effectiveness acceptability curve (CEAC) across willingness-to-pay thresholds. DETERMINISTIC for a fixed seed (cost sampled as gamma, effect as normal by default). ' + NOTE,
  input_schema: {
    type: 'object',
    properties: {
      intervention: ARM_SCHEMA,
      comparator: ARM_SCHEMA,
      willingnessToPay: { type: 'array', items: { type: 'number' }, description: 'WTP thresholds per unit effect for the CEAC.' },
      samples: { type: 'number', description: 'Monte-Carlo iterations (default 1000, max 100000).' },
      seed: { type: 'number', description: 'RNG seed for reproducibility (default 12345).' },
    },
    required: ['intervention', 'comparator', 'willingnessToPay'],
  },
};

export const RUN_CDISC_PIPELINE: AnaTool = {
  name: 'run_cdisc_pipeline',
  description:
    'Run the full CDISC pipeline over a dataset spec (SDTM/ADaM): structural + deeper conformance rules (required identifier vars, naming, types, codelist resolution + hygiene, duplicate vars, ADaM ADSL presence), generate define.xml, and return a consolidated submission-readiness report (error/warning counts + submissionReady + the Define-XML version emitted). Honest scope: mechanical rules only, not a Pinnacle21/CDISC-CT substitute. ' + NOTE,
  input_schema: {
    type: 'object',
    properties: {
      spec: {
        type: 'object',
        description:
          "The dataset spec (same shape as generate_define_xml): { studyName, standard, datasets[], codelists[], defineVersion? }. defineVersion is '2.0' or '2.1' (default '2.1').",
      },
    },
    required: ['spec'],
  },
};

/** Advanced HEOR + CDISC pipeline tools, spread into ALL_ANA_TOOLS. */
export const ADVANCED_MODELING_TOOLS: AnaTool[] = [
  MODEL_MARKOV_COHORT,
  RUN_PROBABILISTIC_SENSITIVITY,
  RUN_CDISC_PIPELINE,
];
