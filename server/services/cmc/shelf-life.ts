/**
 * Shelf-life (retest period) estimation by regression — ICH Q1E.
 *
 * Fits the stability attribute vs time by ordinary least squares and finds the
 * time at which the one-sided 95% confidence limit for the mean line intersects
 * the specification limit — the standard ICH Q1E estimate for a single batch /
 * single attribute. Deterministic and exact (the t-quantile is solved against
 * the project's tested Student-t CDF), so the result is reproducible.
 *
 * Honest scope: single-attribute, single-factor regression on one data set with
 * the 95% mean-confidence-limit rule. It does NOT perform ICH Q1E batch
 * poolability testing (ANCOVA across batches) — pool batches upstream or assess
 * per batch and take the minimum.
 *
 * @module server/services/cmc/shelf-life
 */

import { studentTCdf } from '../biologics/statistics.js';

export type SpecDirection = 'decreasing' | 'increasing';

export interface ShelfLifePoint {
  /** Time on stability (e.g. months). */
  time: number;
  /** Measured attribute value. */
  value: number;
}

export interface ShelfLifeInput {
  data: ShelfLifePoint[];
  /** Specification limit the attribute must stay within. */
  specLimit: number;
  /**
   * Whether the attribute trends down toward a LOWER spec (e.g. assay/potency)
   * or up toward an UPPER spec (e.g. an impurity).
   */
  direction: SpecDirection;
  /** One-sided significance level (default 0.05 → 95% confidence). */
  alpha?: number;
  /** Upper bound (in time units) for the shelf-life search (default 120). */
  maxTime?: number;
}

export interface ShelfLifeResult {
  /** Estimated shelf life / retest period in the input time units. */
  shelfLife: number;
  /** True when the confidence limit stays within spec across the whole search range. */
  exceedsEvaluatedRange: boolean;
  regression: { slope: number; intercept: number; r2: number; residualSd: number; n: number; df: number };
  confidence: { alpha: number; tQuantile: number; bound: 'lower' | 'upper' };
  notes: string[];
}

function mean(a: number[]): number {
  return a.reduce((s, v) => s + v, 0) / a.length;
}
function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** One-sided upper Student-t quantile q s.t. P(T ≤ q) = 1−alpha, via bisection on the CDF. */
function tQuantile(oneMinusAlpha: number, df: number): number {
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, df) < oneMinusAlpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Estimate shelf life per ICH Q1E (single batch/attribute, 95% mean CL rule). */
export function estimateShelfLife(input: ShelfLifeInput): ShelfLifeResult {
  if (!Array.isArray(input.data) || input.data.length < 3) {
    throw new Error('data requires at least 3 (time, value) points');
  }
  if (input.direction !== 'decreasing' && input.direction !== 'increasing') {
    throw new Error("direction must be 'decreasing' or 'increasing'");
  }
  if (!Number.isFinite(input.specLimit)) throw new Error('specLimit must be a finite number');
  const alpha = input.alpha ?? 0.05;
  if (!(alpha > 0 && alpha < 0.5)) throw new Error('alpha must be in (0, 0.5)');
  const maxTime = input.maxTime ?? 120;
  if (!(maxTime > 0)) throw new Error('maxTime must be > 0');

  const x = input.data.map((p) => p.time);
  const y = input.data.map((p) => p.value);
  if (x.some((v) => !Number.isFinite(v)) || y.some((v) => !Number.isFinite(v))) {
    throw new Error('all time/value points must be finite numbers');
  }
  const n = x.length;
  const xbar = mean(x);
  const Sxx = x.reduce((s, v) => s + (v - xbar) ** 2, 0);
  if (Sxx === 0) throw new Error('time points must vary (need at least two distinct times)');

  const ybar = mean(y);
  const Sxy = x.reduce((s, v, i) => s + (v - xbar) * (y[i] - ybar), 0);
  const slope = Sxy / Sxx;
  const intercept = ybar - slope * xbar;
  const yhat = (t: number) => intercept + slope * t;
  const sse = y.reduce((s, v, i) => s + (v - yhat(x[i])) ** 2, 0);
  const sst = y.reduce((s, v) => s + (v - ybar) ** 2, 0);
  const r2 = sst === 0 ? 1 : 1 - sse / sst;
  const df = n - 2;
  if (df < 1) throw new Error('need at least 3 points (df = n-2 ≥ 1)');
  const residualSd = Math.sqrt(sse / df);

  const tq = tQuantile(1 - alpha, df);
  const margin = (t: number) => tq * residualSd * Math.sqrt(1 / n + (t - xbar) ** 2 / Sxx);
  const bound: 'lower' | 'upper' = input.direction === 'decreasing' ? 'lower' : 'upper';
  const cl = (t: number) => (bound === 'lower' ? yhat(t) - margin(t) : yhat(t) + margin(t));

  // g(t) > 0 ⇒ still within spec. decreasing: cl(t) − L; increasing: U − cl(t).
  const g = (t: number) => (input.direction === 'decreasing' ? cl(t) - input.specLimit : input.specLimit - cl(t));

  const notes: string[] = [
    'ICH Q1E single-batch/attribute estimate using the 95% one-sided mean confidence limit. No multi-batch poolability (ANCOVA) performed.',
  ];

  if (g(0) <= 0) {
    return {
      shelfLife: 0,
      exceedsEvaluatedRange: false,
      regression: { slope: round(slope), intercept: round(intercept), r2: round(r2), residualSd: round(residualSd), n, df },
      confidence: { alpha, tQuantile: round(tq), bound },
      notes: [...notes, 'The confidence limit is already at/over the specification at t=0 — no shelf life can be supported from these data.'],
    };
  }
  if (g(maxTime) > 0) {
    return {
      shelfLife: maxTime,
      exceedsEvaluatedRange: true,
      regression: { slope: round(slope), intercept: round(intercept), r2: round(r2), residualSd: round(residualSd), n, df },
      confidence: { alpha, tQuantile: round(tq), bound },
      notes: [...notes, `The confidence limit stays within spec through the search horizon (${maxTime}); the estimate exceeds the evaluated range — do not extrapolate beyond justified limits.`],
    };
  }

  // Root of g(t)=0 in (0, maxTime) by bisection — g is monotone decreasing here.
  let lo = 0;
  let hi = maxTime;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) > 0) lo = mid;
    else hi = mid;
  }
  const shelfLife = (lo + hi) / 2;

  return {
    shelfLife: round(shelfLife, 2),
    exceedsEvaluatedRange: false,
    regression: { slope: round(slope), intercept: round(intercept), r2: round(r2), residualSd: round(residualSd), n, df },
    confidence: { alpha, tQuantile: round(tq), bound },
    notes,
  };
}
