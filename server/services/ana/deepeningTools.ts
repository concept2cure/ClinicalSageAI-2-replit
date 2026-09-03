/**
 * Deepening tools — deterministic engines exposed to AnA:
 *   assess_batch_poolability          -> cmc/shelf-life-poolability.assessBatchPoolability
 *   assess_recorded_batch_poolability -> cmc/recorded-stability.assessRecordedPoolability
 *   list_cmc_registers                -> the CMC registers' identity rows (discovery)
 *   estimate_recorded_shelf_life      -> cmc/recorded-stability.estimateRecordedShelfLife
 *   get_submission_readiness_twin     -> innovation/submission-readiness-twin-service.getDashboard
 *   assess_benefit_risk               -> regulatory/benefit-risk.assessBenefitRisk
 *
 * @module server/services/ana/deepeningTools
 */

import type { AnaTool } from '../ai-gateway/types';

const NOTE = 'Deterministic engine — report the returned numbers/decision verbatim and relay validation errors rather than guessing.';

export const ASSESS_BATCH_POOLABILITY: AnaTool = {
  name: 'assess_batch_poolability',
  description:
    'Decide whether stability batches can be combined into one overall shelf life, per ICH Q1E: a sequential ANCOVA test at the 0.25 level for equality of slopes (batch×time) then intercepts. If both pool, the shelf life is from the single pooled regression; otherwise the data are NOT combined and the shelf life is the MINIMUM of the per-batch estimates. Returns the F-tests (F, p, poolable), the decision, the recommended shelf life, and per-batch shelf lives. DETERMINISTIC. Single-attribute. ' + NOTE,
  input_schema: {
    type: 'object',
    properties: {
      batches: {
        type: 'array',
        description: 'At least 2 batches, each with ≥3 (time,value) stability points.',
        items: {
          type: 'object',
          properties: {
            batchId: { type: 'string' },
            data: {
              type: 'array',
              items: { type: 'object', properties: { time: { type: 'number' }, value: { type: 'number' } }, required: ['time', 'value'] },
            },
          },
          required: ['batchId', 'data'],
        },
      },
      specLimit: { type: 'number', description: 'Specification limit.' },
      direction: { type: 'string', enum: ['decreasing', 'increasing'], description: 'Attribute trends toward a lower (decreasing) or upper (increasing) spec.' },
      alpha: { type: 'number', description: 'One-sided significance for the shelf-life CL (default 0.05).' },
      maxTime: { type: 'number', description: 'Upper bound for the shelf-life search (default 120).' },
    },
    required: ['batches', 'specLimit', 'direction'],
  },
};

/**
 * The same ICH Q1E decision, but over the studies ON FILE.
 *
 * ASSESS_BATCH_POOLABILITY above needs every (time, value) point supplied in the
 * call, so it can only answer once a user has pasted their data in. That is the
 * wrong shape for the question a CMC lead actually asks — "are my primary
 * batches combinable?" — because the answer is already in the stability
 * register. This variant takes study ids and reads the recorded series, so the
 * assessment runs against the system of record rather than a transcription.
 *
 * It also inherits the eligibility refusals (one product, one storage condition,
 * distinct batches, one acceptance criterion per attribute), which the
 * points-in-the-call form cannot check because it never sees the studies.
 */
export const ASSESS_RECORDED_BATCH_POOLABILITY: AnaTool = {
  name: 'assess_recorded_batch_poolability',
  description:
    'Decide whether stability batches ALREADY RECORDED in the CMC stability register can be combined into one overall shelf life, per ICH Q1E. Takes stability study ids and reads each study\'s recorded pull-point results — use this instead of assess_batch_poolability whenever the data are on file, which is the normal case. Refuses and says why when the studies span products or storage conditions, repeat a batch, or disagree on an acceptance criterion. Returns per-attribute ANCOVA F-tests, the pooled-vs-shortest-batch decision, and the supported shelf life. Nothing is written: this is evidence for a shelf-life claim, not the claim. DETERMINISTIC. ' + NOTE,
  input_schema: {
    type: 'object',
    properties: {
      study_ids: {
        type: 'array',
        description: 'At least 2 stability study ids, from the same product and storage condition. Look them up first if the user named batches rather than ids.',
        items: { type: 'number' },
      },
    },
    required: ['study_ids'],
  },
};

/**
 * The Submission Readiness Twin, which had no caller.
 *
 * `services/innovation/submission-readiness-twin-service.ts` scores a program
 * against its submission-type criteria and returns module-level readiness, top
 * risks, ranked recommendations with effort, criteria progress and a trend — and
 * it is served by five live, integration-tested routes with ZERO references
 * anywhere in the client. So the product computes a submission-readiness
 * assessment nobody can reach.
 *
 * Exposed here rather than as another dashboard: the payload is risks,
 * recommendations and gaps — reasoning material — and a permanent grid of
 * percentages is the surface pattern this project's own principles warn against.
 * Asking "how ready are we, and what should I fix first?" is the real interface.
 */
export const GET_SUBMISSION_READINESS_TWIN: AnaTool = {
  name: 'get_submission_readiness_twin',
  description:
    'Read the Submission Readiness Twin for a program: overall readiness score and trend, per-module readiness (including Module 3), predicted approval probability / review time / deficiency count, top risks with mitigations, ranked recommendations with effort estimates, and criteria met-vs-total. Use for "how ready are we to file?", "what is blocking the submission?", "what should we fix first?". Reads the LATEST assessment — it does not run one, so if none exists say so rather than implying the program scored zero. Predictions are model estimates, not commitments: report them as such and never as a probability of approval you are asserting.',
  input_schema: {
    type: 'object',
    properties: {
      program_id: { type: 'string', description: 'The program (uuid) to read. Must belong to the caller\'s organization.' },
      submission_type: { type: 'string', description: 'e.g. IND, NDA, BLA, 510k. Defaults to IND.' },
      agency: { type: 'string', description: 'e.g. FDA, EMA, PMDA. Defaults to FDA.' },
    },
    required: ['program_id'],
  },
};

// Benefit/risk item shape, inlined into both arrays (the AnA schema type does
// not support $ref/$defs).
const BR_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    weight: { type: 'number', description: 'Importance weight (non-negative; normalized within its category).' },
    score: { type: 'number', description: 'Magnitude on a 0–100 favorability/severity scale.' },
    evidenceQuality: { type: 'string', enum: ['high', 'moderate', 'low', 'very_low'], description: 'Context only; not used in the math.' },
    note: { type: 'string' },
  },
  required: ['name', 'weight', 'score'],
} as const;

export const ASSESS_BENEFIT_RISK: AnaTool = {
  name: 'assess_benefit_risk',
  description:
    'Compute a transparent structured benefit-risk assessment (BRAT / FDA structured-benefit-risk style). You supply benefits and risks, each with an importance weight and a 0–100 magnitude score; the engine normalizes weights within each category, computes the weighted benefit, weighted risk, the net, and a favorability call (favorable/unfavorable/borderline), with EVERY item\'s contribution itemized. DETERMINISTIC. This is a structured DECISION AID, not a regulatory determination — report the disclaimer and the per-item contributions, and never present it as an approval decision. ' + NOTE,
  input_schema: {
    type: 'object',
    properties: {
      benefits: { type: 'array', description: 'Benefits (≥1).', items: BR_ITEM_SCHEMA },
      risks: { type: 'array', description: 'Risks (≥1).', items: BR_ITEM_SCHEMA },
      favorabilityThreshold: { type: 'number', description: 'Net-score band for the call (default 10): net ≥ +threshold favorable, ≤ −threshold unfavorable, else borderline.' },
    },
    required: ['benefits', 'risks'],
  },
};


/* ── Recorded-data tools ────────────────────────────────────────────────────
   The coverage evaluation found ONE of ~9 CMC engines connected to recorded
   data (assess_recorded_batch_poolability): every other tool took typed-in
   numbers, so "run a model against our results" meant re-transcribing them
   into chat — friction plus a transcription-error vector in a Part 11
   product. Worse, that one tool's own instruction told the model to "list the
   stability register first" and NO tool could list any register: the pointer
   was dead. These two close that. */

export const LIST_CMC_REGISTERS: AnaTool = {
  name: 'list_cmc_registers',
  description:
    'List what the CMC registers actually hold for this organization — stability studies, analytical methods, specifications, batch records, QC results, container closure systems, reference standards, impurities, dissolution profiles, materials, formulations, manufacturing processes, characterisation studies — with the ids the recorded-data tools need. Call this FIRST whenever the user names a product, a batch or a study by name rather than by id, and whenever you are about to run a recorded assessment. Returns identity and status per row (never the full result series), so it is safe to call broadly. Reads only; writes nothing. Say honestly when a register is empty rather than implying data exists.',
  input_schema: {
    type: 'object',
    properties: {
      register: {
        type: 'string',
        description: 'Which register to list. Omit for a summary count of every register.',
        enum: ['stability', 'method', 'specification', 'batch', 'qc_result', 'container_closure', 'reference_standard', 'impurity_profile', 'dissolution_profile', 'material_spec', 'formulation_record', 'manufacturing_process', 'characterization'],
      },
      search: {
        type: 'string',
        description: 'Case-insensitive filter on the row\'s name/title/number — e.g. a product name or a batch number the user said.',
      },
      limit: { type: 'number', description: 'Maximum rows (default 25, max 100).' },
    },
    required: [],
  },
};

export const ESTIMATE_RECORDED_SHELF_LIFE: AnaTool = {
  name: 'estimate_recorded_shelf_life',
  description:
    'Fit the shelf life supported by a stability study ALREADY RECORDED in the register, per ICH Q1E — ordinary least squares with the one-sided 95% mean confidence limit against the recorded acceptance criterion, one attribute at a time, reporting the LIMITING attribute. Takes a study id and reads that study\'s own pull-point results; use this instead of estimate_shelf_life whenever the data are on file, which is the normal case. Refuses and says why when the study has no recorded results, spans more than one storage condition, has fewer than 3 numeric timepoints for an attribute, or has no numeric acceptance criterion recorded — relay the refusal verbatim rather than falling back to typed-in numbers. Single batch: batch poolability is assess_recorded_batch_poolability and is NOT implied by this estimate. Nothing is written: the registered shelf life is set by a person on the study close-out. DETERMINISTIC. ' + NOTE,
  input_schema: {
    type: 'object',
    properties: {
      study_id: {
        type: 'number',
        description: 'The stability study id. Use list_cmc_registers to find it if the user named a product or batch.',
      },
    },
    required: ['study_id'],
  },
};

export const COMPARE_RECORDED_DISSOLUTION: AnaTool = {
  name: 'compare_recorded_dissolution',
  description:
    'Compute f2 similarity between two dissolution profiles ALREADY RECORDED in the CMC dissolution register, ' +
    'reading their timepoints, means, unit counts and variability from the register rather than taking them ' +
    'typed in. Takes two register ids (use list_cmc_registers to find them). Applies every eligibility ' +
    'condition and REFUSES with the reason when one fails: profiles sampled at different times, fewer than ' +
    'three comparable timepoints after excluding t=0 and truncating above 85% dissolution, no recorded unit ' +
    'count (never assumed to be 12), no recorded SD or %RSD, or variability above the 20% early / 10% later ' +
    'limits. Both profiles reaching 85% within 15 minutes is reported as "no f2 needed", not as a number. ' +
    'Relay a refusal verbatim rather than falling back to assess_dissolution_similarity with typed-in numbers: ' +
    'that would be the same comparison with the eligibility check removed. Reports the timepoints it used, ' +
    'what it discarded and every condition it evaluated. Writes nothing. DETERMINISTIC. ' + NOTE,
  input_schema: {
    type: 'object',
    properties: {
      reference_profile_id: {
        type: 'number',
        description: 'The dissolution register id of the REFERENCE profile.',
      },
      test_profile_id: {
        type: 'number',
        description: 'The dissolution register id of the TEST profile.',
      },
    },
    required: ['reference_profile_id', 'test_profile_id'],
  },
};

/** Deepening tools, spread into ALL_ANA_TOOLS. */
export const DEEPENING_TOOLS: AnaTool[] = [
  ASSESS_BATCH_POOLABILITY,
  ASSESS_RECORDED_BATCH_POOLABILITY,
  LIST_CMC_REGISTERS,
  ESTIMATE_RECORDED_SHELF_LIFE,
  COMPARE_RECORDED_DISSOLUTION,
  GET_SUBMISSION_READINESS_TWIN,
  ASSESS_BENEFIT_RISK,
];
