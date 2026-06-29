/**
 * Deepening tools — deterministic engines exposed to AnA:
 *   assess_batch_poolability -> cmc/shelf-life-poolability.assessBatchPoolability
 *   assess_benefit_risk      -> regulatory/benefit-risk.assessBenefitRisk
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

/** Deepening tools, spread into ALL_ANA_TOOLS. */
export const DEEPENING_TOOLS: AnaTool[] = [ASSESS_BATCH_POOLABILITY, ASSESS_BENEFIT_RISK];
