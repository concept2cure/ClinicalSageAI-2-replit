/**
 * Probabilistic sensitivity analysis (PSA) for cost-effectiveness (HEOR).
 *
 * Monte-Carlo over input distributions for an intervention vs a comparator,
 * producing the incremental cost/effect, a point ICER, the probability the
 * intervention is dominant, and a cost-effectiveness acceptability curve (CEAC)
 * across willingness-to-pay thresholds.
 *
 * DETERMINISTIC given a seed: uses the project's seeded RNG (stats/rng), so the
 * same inputs + seed always reproduce the same result — defensible for a dossier.
 *
 * @module server/services/heor/psa
 */

import { Rng } from '../stats/rng.js';

export type PsaDistribution = 'normal' | 'gamma';

export interface PsaParam {
  mean: number;
  sd: number;
  /** Sampling distribution. Cost defaults to gamma (non-negative); effect to normal. */
  dist?: PsaDistribution;
}

export interface PsaArm {
  cost: PsaParam;
  effect: PsaParam;
}

export interface PsaInput {
  intervention: PsaArm;
  comparator: PsaArm;
  /** Monte-Carlo iterations (default 1000, max 100000). */
  samples?: number;
  /** RNG seed for reproducibility (default 12345). */
  seed?: number;
  /** Willingness-to-pay thresholds per unit effect for the CEAC. */
  willingnessToPay: number[];
}

export interface PsaResult {
  samples: number;
  seed: number;
  meanIncrementalCost: number;
  meanIncrementalEffect: number;
  /** Point ICER = mean incremental cost / mean incremental effect (null if mean effect ≈ 0). */
  icer: number | null;
  /** P(intervention dominant: lower/equal cost AND greater/equal effect). */
  probabilityDominant: number;
  /** Cost-effectiveness acceptability curve. */
  ceac: Array<{ willingnessToPay: number; probabilityCostEffective: number }>;
  notes: string[];
}

function round(n: number, dp = 6): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

function draw(rng: Rng, p: PsaParam, defaultDist: PsaDistribution): number {
  const dist = p.dist ?? defaultDist;
  if (dist === 'gamma') {
    if (p.mean <= 0) return Math.max(0, rng.normal(p.mean, p.sd)); // degenerate mean → fall back
    // Method-of-moments: shape = mean²/sd², scale = sd²/mean.
    const variance = p.sd * p.sd;
    if (variance <= 0) return p.mean;
    const shape = (p.mean * p.mean) / variance;
    const scale = variance / p.mean;
    return rng.gamma(shape, scale);
  }
  return rng.normal(p.mean, p.sd);
}

/** Run a probabilistic sensitivity analysis. */
export function runProbabilisticSensitivity(input: PsaInput): PsaResult {
  for (const [armName, arm] of [['intervention', input.intervention], ['comparator', input.comparator]] as const) {
    for (const k of ['cost', 'effect'] as const) {
      const param = arm?.[k];
      if (!param || !Number.isFinite(param.mean) || !Number.isFinite(param.sd) || param.sd < 0) {
        throw new Error(`${armName}.${k} requires a finite mean and non-negative sd`);
      }
    }
  }
  if (!Array.isArray(input.willingnessToPay) || input.willingnessToPay.length === 0) {
    throw new Error('willingnessToPay must be a non-empty array of thresholds');
  }
  if (input.willingnessToPay.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new Error('willingnessToPay thresholds must be non-negative numbers');
  }

  const samples = Math.min(Math.max(Math.floor(input.samples ?? 1000), 1), 100000);
  const seed = Number.isFinite(input.seed) ? (input.seed as number) : 12345;
  const rng = new Rng(seed);

  let sumIncCost = 0;
  let sumIncEff = 0;
  let dominantCount = 0;
  const ceCount = input.willingnessToPay.map(() => 0);

  for (let s = 0; s < samples; s++) {
    const costInt = draw(rng, input.intervention.cost, 'gamma');
    const effInt = draw(rng, input.intervention.effect, 'normal');
    const costComp = draw(rng, input.comparator.cost, 'gamma');
    const effComp = draw(rng, input.comparator.effect, 'normal');

    const incCost = costInt - costComp;
    const incEff = effInt - effComp;
    sumIncCost += incCost;
    sumIncEff += incEff;
    if (incCost <= 0 && incEff >= 0) dominantCount++;

    for (let w = 0; w < input.willingnessToPay.length; w++) {
      const nmb = input.willingnessToPay[w] * incEff - incCost;
      if (nmb >= 0) ceCount[w]++;
    }
  }

  const meanIncCost = sumIncCost / samples;
  const meanIncEff = sumIncEff / samples;

  return {
    samples,
    seed,
    meanIncrementalCost: round(meanIncCost, 4),
    meanIncrementalEffect: round(meanIncEff, 6),
    icer: Math.abs(meanIncEff) < 1e-9 ? null : round(meanIncCost / meanIncEff, 4),
    probabilityDominant: round(dominantCount / samples, 6),
    ceac: input.willingnessToPay.map((w, i) => ({
      willingnessToPay: w,
      probabilityCostEffective: round(ceCount[i] / samples, 6),
    })),
    notes: [
      'Monte-Carlo PSA; cost sampled as gamma and effect as normal by default (override per parameter).',
      `Seeded RNG (seed=${seed}) — reproducible. ICER is the mean-incremental point estimate; the CEAC reflects decision uncertainty.`,
    ],
  };
}
