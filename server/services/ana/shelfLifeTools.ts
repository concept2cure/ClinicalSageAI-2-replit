/**
 * Shelf-life estimation tool — exposes the deterministic ICH Q1E regression
 * estimator (server/services/cmc/shelf-life) to AnA. Pure pass-through.
 *
 * @module server/services/ana/shelfLifeTools
 */

import type { AnaTool } from '../ai-gateway/types';

export const ESTIMATE_SHELF_LIFE: AnaTool = {
  name: 'estimate_shelf_life',
  description:
    "Estimate a shelf life / retest period from stability data by regression (ICH Q1E): fits the attribute vs time and finds where the one-sided 95% confidence limit for the mean line crosses the specification limit. DETERMINISTIC. Use direction='decreasing' for attributes trending toward a LOWER spec (assay/potency) and 'increasing' for those trending toward an UPPER spec (an impurity). Returns the estimated shelf life, the regression (slope/intercept/R²/residual SD), and the confidence settings. Honest scope: single batch/attribute, 95% mean-CL rule — NOT multi-batch poolability (ANCOVA). Report the returned numbers and notes verbatim; flag exceedsEvaluatedRange rather than extrapolating.",
  input_schema: {
    type: 'object',
    properties: {
      data: {
        type: 'array',
        description: 'Stability data points (≥3) with distinct times.',
        items: {
          type: 'object',
          properties: {
            time: { type: 'number', description: 'Time on stability (e.g. months).' },
            value: { type: 'number', description: 'Measured attribute value.' },
          },
          required: ['time', 'value'],
        },
      },
      specLimit: { type: 'number', description: 'Specification limit the attribute must stay within.' },
      direction: { type: 'string', enum: ['decreasing', 'increasing'], description: 'Attribute trends toward a lower (decreasing) or upper (increasing) spec.' },
      alpha: { type: 'number', description: 'One-sided significance level (default 0.05 → 95%).' },
      maxTime: { type: 'number', description: 'Upper bound for the shelf-life search in time units (default 120).' },
    },
    required: ['data', 'specLimit', 'direction'],
  },
};

/** Shelf-life tools, spread into ALL_ANA_TOOLS. */
export const SHELF_LIFE_TOOLS: AnaTool[] = [ESTIMATE_SHELF_LIFE];
