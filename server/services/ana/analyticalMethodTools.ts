/**
 * Analytical method-validation tool — exposes the deterministic ICH Q2(R2)
 * assessment engine (server/services/analytical/method-validation) to AnA. The
 * engine was previously unreachable (no tool, no route). Pure pass-through.
 *
 * @module server/services/ana/analyticalMethodTools
 */

import type { AnaTool } from '../ai-gateway/types';

export const ASSESS_ANALYTICAL_METHOD_VALIDATION: AnaTool = {
  name: 'assess_analytical_method_validation',
  description:
    'Assess analytical method-validation characteristics (ICH Q2(R2)) from raw data and judge them against acceptance criteria: linearity (least-squares slope/intercept/R²), precision (%RSD of replicate results), and accuracy (% recovery per level). DETERMINISTIC and exact. Supply at least one of linearity/precision/accuracy. Honest scope: it does NOT report a lack-of-fit p-value (out of scope). Report the returned numbers and pass/fail verbatim.',
  input_schema: {
    type: 'object',
    properties: {
      linearity: {
        type: 'array',
        description: 'Linearity points (≥3): nominal/known concentration + measured response.',
        items: {
          type: 'object',
          properties: {
            nominal: { type: 'number', description: 'Known/nominal concentration (x).' },
            response: { type: 'number', description: 'Measured response (y).' },
          },
          required: ['nominal', 'response'],
        },
      },
      precision: { type: 'array', items: { type: 'number' }, description: 'Replicate measured results (≥2) for the precision %RSD.' },
      accuracy: {
        type: 'object',
        description: 'Mean % recovery per level (any subset).',
        properties: { LOW: { type: 'number' }, MID: { type: 'number' }, HIGH: { type: 'number' } },
      },
      acceptance: {
        type: 'object',
        description: 'Acceptance criteria (defaults: R²≥0.995, RSD≤2.0%, accuracy 98–102%).',
        properties: {
          r2Min: { type: 'number' },
          rsdMax: { type: 'number' },
          accuracyLow: { type: 'number' },
          accuracyHigh: { type: 'number' },
        },
      },
    },
    required: [],
  },
};

/** Analytical method-validation tools, spread into ALL_ANA_TOOLS. */
export const ANALYTICAL_METHOD_TOOLS: AnaTool[] = [ASSESS_ANALYTICAL_METHOD_VALIDATION];
