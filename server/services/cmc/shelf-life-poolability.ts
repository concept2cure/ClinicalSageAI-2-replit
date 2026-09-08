/**
 * Multi-batch shelf-life poolability — ICH Q1E (ANCOVA combinability test).
 *
 * Decides whether stability batches can be combined into one overall shelf-life
 * estimate, using the ICH Q1E sequential test at the 0.25 significance level:
 *   1. Equality of slopes  (batch × time interaction)  — full vs common-slope model.
 *   2. Equality of intercepts (given common slope)      — common-slope vs pooled model.
 * If both tests fail to reject (p ≥ 0.25), the data are combined and the shelf
 * life comes from the single pooled regression. Otherwise the data are NOT
 * combined and the shelf life is the MINIMUM of the per-batch estimates.
 *
 * Deterministic and exact: the F-tests use the project's tested F-CDF and the
 * per-batch / pooled shelf lives reuse the tested ICH Q1E single-line estimator.
 *
 * @module server/services/cmc/shelf-life-poolability
 */

import { fCdf } from '../stats/f-distribution.js';
import { estimateShelfLife, type SpecDirection } from './shelf-life.js';

const POOL_ALPHA = 0.25; // ICH Q1E combinability significance level.

export interface BatchStabilityData {
  batchId: string;
  data: Array<{ time: number; value: number }>;
}

export interface PoolabilityInput {
  batches: BatchStabilityData[];
  specLimit: number;
  direction: SpecDirection;
  /** One-sided significance for the per-batch/pooled shelf-life CL (default 0.05). */
  alpha?: number;
  maxTime?: number;
}

export interface AncovaTest {
  f: number;
  pValue: number;
  /** True ⇒ fails to reject equality at α=0.25 ⇒ this aspect is poolable. */
  poolable: boolean;
  dfNumerator: number;
  dfDenominator: number;
}

export interface PoolabilityResult {
  batches: number;
  totalPoints: number;
  slopeTest: AncovaTest;
  interceptTest: AncovaTest | null; // null when slopes are not poolable (test not reached)
  poolable: boolean;
  decision: 'pooled' | 'minimum-of-batches';
  /** The recommended shelf life. */
  shelfLife: number;
  /**
   * Where the confidence limit actually crosses the specification, before the
   * ICH Q1E extrapolation cap. Two attributes capped to the same proposable
   * shelf life are told apart by this — it is what makes one of them the
   * limiting attribute rather than their order in the record.
   */
  statisticalCrossing: number;
  perBatchShelfLives: Array<{ batchId: string; shelfLife: number; statisticalCrossing: number; exceedsEvaluatedRange: boolean }>;
  pooledShelfLife: number | null;
  notes: string[];
}

interface Fit { sxx: number; sxy: number; sse: number; xbar: number; ybar: number; slope: number; n: number; x: number[]; y: number[] }

function fitBatch(data: Array<{ time: number; value: number }>): Fit {
  const n = data.length;
  const x = data.map((d) => d.time);
  const y = data.map((d) => d.value);
  const xbar = x.reduce((s, v) => s + v, 0) / n;
  const ybar = y.reduce((s, v) => s + v, 0) / n;
  const sxx = x.reduce((s, v) => s + (v - xbar) ** 2, 0);
  const sxy = x.reduce((s, v, i) => s + (v - xbar) * (y[i] - ybar), 0);
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = ybar - slope * xbar;
  const sse = y.reduce((s, v, i) => s + (v - (intercept + slope * x[i])) ** 2, 0);
  return { sxx, sxy, sse, xbar, ybar, slope, n, x, y };
}

function round(n: number, dp = 6): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Determine batch poolability and the resulting shelf life per ICH Q1E. */
export function assessBatchPoolability(input: PoolabilityInput): PoolabilityResult {
  if (!Array.isArray(input.batches) || input.batches.length < 2) {
    throw new Error('at least 2 batches are required to assess poolability');
  }
  for (const b of input.batches) {
    if (!b.batchId) throw new Error('each batch requires a batchId');
    if (!Array.isArray(b.data) || b.data.length < 3) throw new Error(`batch "${b.batchId}" requires at least 3 (time,value) points`);
    const times = new Set(b.data.map((d) => d.time));
    if (times.size < 2) throw new Error(`batch "${b.batchId}" needs at least two distinct times`);
  }

  const k = input.batches.length;
  const fits = input.batches.map((b) => fitBatch(b.data));
  const N = fits.reduce((s, f) => s + f.n, 0);

  // ── Full model (separate slope + intercept per batch) ──
  const sseFull = fits.reduce((s, f) => s + f.sse, 0);
  const dfFull = N - 2 * k; // residual df

  // ── Common-slope model (one slope, k intercepts) ──
  const sumSxx = fits.reduce((s, f) => s + f.sxx, 0);
  const sumSxy = fits.reduce((s, f) => s + f.sxy, 0);
  const commonSlope = sumSxx === 0 ? 0 : sumSxy / sumSxx;
  const sseCommonSlope = fits.reduce((s, f) => {
    const intercept = f.ybar - commonSlope * f.xbar;
    return s + f.y.reduce((ss, v, i) => ss + (v - (intercept + commonSlope * f.x[i])) ** 2, 0);
  }, 0);
  const dfCommonSlope = N - (k + 1);

  // ── Pooled model (single regression on all points) ──
  const allPoints = input.batches.flatMap((b) => b.data);
  const pooledFit = fitBatch(allPoints);
  const pooledIntercept = pooledFit.ybar - pooledFit.slope * pooledFit.xbar;
  const ssePooled = pooledFit.y.reduce((s, v, i) => s + (v - (pooledIntercept + pooledFit.slope * pooledFit.x[i])) ** 2, 0);

  const notes: string[] = [
    `ICH Q1E combinability test at the ${POOL_ALPHA} significance level (sequential: slopes, then intercepts).`,
  ];

  // ── Slope-equality F-test (full vs common-slope) ──
  // F = ((SSE_commonSlope − SSE_full)/(k−1)) / (SSE_full/(N−2k))
  const slopeDf1 = k - 1;
  if (dfFull < 1) throw new Error('not enough data for the full model (need N > 2·batches)');
  const slopeF = dfFull <= 0 ? 0 : ((sseCommonSlope - sseFull) / slopeDf1) / (sseFull / dfFull);
  const slopePval = 1 - fCdf(Math.max(0, slopeF), slopeDf1, dfFull);
  const slopePoolable = slopePval >= POOL_ALPHA;
  const slopeTest: AncovaTest = { f: round(slopeF), pValue: round(slopePval), poolable: slopePoolable, dfNumerator: slopeDf1, dfDenominator: dfFull };

  // Per-batch shelf lives (always computed; used when not poolable, and informative otherwise).
  const perBatch = input.batches.map((b) => {
    const est = estimateShelfLife({ data: b.data, specLimit: input.specLimit, direction: input.direction, alpha: input.alpha, maxTime: input.maxTime });
    return { batchId: b.batchId, shelfLife: est.shelfLife, statisticalCrossing: est.statisticalCrossing, exceedsEvaluatedRange: est.exceedsEvaluatedRange };
  });

  let interceptTest: AncovaTest | null = null;
  let poolable = false;

  if (slopePoolable) {
    // ── Intercept-equality F-test (common-slope vs pooled) ──
    const interDf1 = k - 1;
    const interF = dfCommonSlope <= 0 ? 0 : ((ssePooled - sseCommonSlope) / interDf1) / (sseCommonSlope / dfCommonSlope);
    const interPval = 1 - fCdf(Math.max(0, interF), interDf1, dfCommonSlope);
    const interPoolable = interPval >= POOL_ALPHA;
    interceptTest = { f: round(interF), pValue: round(interPval), poolable: interPoolable, dfNumerator: interDf1, dfDenominator: dfCommonSlope };
    poolable = interPoolable;
    if (!interPoolable) notes.push('Slopes are poolable but intercepts differ — data are not combined; using the minimum per-batch estimate (conservative).');
  } else {
    notes.push('Slopes differ across batches — data are not combined; using the minimum per-batch estimate.');
  }

  let pooledShelfLife: number | null = null;
  let shelfLife: number;
  let statisticalCrossing: number;
  let decision: 'pooled' | 'minimum-of-batches';
  if (poolable) {
    const pooledEst = estimateShelfLife({ data: allPoints, specLimit: input.specLimit, direction: input.direction, alpha: input.alpha, maxTime: input.maxTime });
    pooledShelfLife = pooledEst.shelfLife;
    shelfLife = pooledEst.shelfLife;
    statisticalCrossing = pooledEst.statisticalCrossing;
    decision = 'pooled';
    notes.push('Batches are combinable — shelf life is from the single pooled regression.');
  } else {
    shelfLife = Math.min(...perBatch.map((p) => p.shelfLife));
    statisticalCrossing = Math.min(...perBatch.map((p) => p.statisticalCrossing));
    decision = 'minimum-of-batches';
  }

  return {
    batches: k,
    totalPoints: N,
    slopeTest,
    interceptTest,
    poolable,
    decision,
    shelfLife: round(shelfLife, 2),
    statisticalCrossing: round(statisticalCrossing, 2),
    perBatchShelfLives: perBatch,
    pooledShelfLife: pooledShelfLife === null ? null : round(pooledShelfLife, 2),
    notes,
  };
}
