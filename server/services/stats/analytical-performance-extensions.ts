/**
 * Analytical-performance extensions for IVDs.
 *
 * Pure and deterministic. Extends server/services/stats/analytical-performance.ts
 * (EP05/06/07/09/17/28) with the IVD-critical studies the audit flagged as
 * missing: stability (real-time + Arrhenius accelerated), carryover, high-dose
 * hook effect, spike-recovery / dilution linearity, and cut-off determination.
 *
 * Methodological backbone:
 *   - CLSI EP25      — reagent / calibrator stability (real-time)
 *   - Arrhenius      — accelerated stability → activation energy → shelf-life
 *   - CLSI EP10/H26  — carryover (sequence high→low)
 *   - CLSI EP06      — dilution linearity / recovery
 *   - CLSI EP07      — recovery (spike-recovery)
 *   - Youden J / ROC — clinical decision point (cut-off) determination
 *
 * 2026-11-08 (the two stability functions): a missing or malformed number was read as given. An omitted
 * maxPercentChange gave shelfLife null ("no measurable degradation") and "out of spec"; storageTemperatureC '4'
 * (text) gave a shelf-life of 0; two points at one time or temperature gave nulls. Each is refused by field
 * (ComputationRefusal), and the real-time result says when the regression intercept stood in for initialValue.
 */

import { linearRegression } from './analytical-performance';
import { ComputationRefusal, refuseUnlessStated } from '../ana-biostats/computation-engine';
import { statedNumber } from '../immunogenicity/immunogenicity-reference';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The points of a stability series, each field a finite number within its rule, with two distinct `distinct` values. */
function statedPoints<T>(fn: string, points: unknown, rules: Record<string, [(n: number) => boolean, string]>, distinct: string): T[] {
  if (!Array.isArray(points) || points.length < 2) {
    throw new ComputationRefusal(
      points === undefined || points === null ? 'missing_input' : 'invalid_input',
      fn + ': points is required: a list of at least 2 points (got ' + JSON.stringify(points) + ').',
      'points',
    );
  }
  refuseUnlessStated(fn, points.flatMap((p: unknown, i: number) => Object.entries(rules).map(([k, [ok, rule]]) => {
    const v = (p as Record<string, unknown> | null)?.[k];
    return { field: `points[${i}].${k}`, value: v, ok: finite(v) && ok(v), expected: rule };
  })), 'computed');
  if (new Set(points.map((p) => (p as Record<string, number>)[distinct])).size < 2) {
    throw new ComputationRefusal('invalid_input', fn + ': points must have at least 2 distinct ' + distinct + ' values.', 'points');
  }
  return points as T[];
}

const round = (n: number, dp = 4): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

// ─────────────────────────────────────────────────────────────────────────────
// Real-time stability (CLSI EP25) → shelf-life claim
// ─────────────────────────────────────────────────────────────────────────────

export interface StabilityPoint {
  /** Elapsed time (e.g. days or months — caller's unit is preserved). */
  time: number;
  /** Mean measured value at that timepoint. */
  value: number;
}

export interface RealTimeStabilityArgs {
  points: StabilityPoint[];
  /** Initial (t=0) reference value. If omitted, the regression intercept is used. */
  initialValue?: number;
  /**
   * Maximum acceptable percent change from the initial value before the product
   * is out of specification (e.g. 10 for ±10%).
   */
  maxPercentChange: number;
}

export interface RealTimeStabilityResult {
  slopePerUnitTime: number;
  interceptValue: number;
  /** Percent change per unit time relative to the initial value. */
  percentChangePerUnitTime: number;
  /**
   * Time at which the value first reaches the spec limit (the shelf-life claim),
   * or null when the fitted slope is zero and the limit is therefore never
   * reached. Null, not Infinity: `JSON.stringify(Infinity)` is `null` regardless,
   * so returning Infinity puts the same wire value there while asserting a type
   * that is not true — and a stability claim of `null` beside `success: true`
   * reads as a failed computation rather than "no measurable degradation".
   * The caller distinguishes the two from `slopePerUnitTime`, which is zero
   * exactly when this is null.
   */
  shelfLife: number | null;
  /** Whether the product remained within spec across the observed window. */
  withinSpecAcrossWindow: boolean;
  /** 'regression_intercept' when initialValue was not stated and the fitted intercept stood in for it. */
  initialValueSource: 'stated' | 'regression_intercept';
  method: 'CLSI EP25 real-time stability (linear degradation)';
}

/**
 * Estimate shelf-life from a real-time stability series by fitting value vs
 * time and projecting to the specification limit.
 */
export function assessRealTimeStability(args: RealTimeStabilityArgs): RealTimeStabilityResult {
  const a = (args ?? {}) as Partial<RealTimeStabilityArgs>;
  const points = statedPoints<StabilityPoint>('assessRealTimeStability', a.points, {
    time: [(n) => n >= 0, 'an elapsed time, 0 or more'],
    value: [() => true, 'a number'],
  }, 'time');
  refuseUnlessStated('assessRealTimeStability', [
    { field: 'maxPercentChange', value: a.maxPercentChange, ok: finite(a.maxPercentChange) && a.maxPercentChange > 0, expected: 'a percentage above 0' },
  ], 'computed');
  const maxPercentChange = a.maxPercentChange as number;
  const statedInitial = statedNumber('initialValue', a.initialValue, (n) => n !== 0, 'a non-zero number');
  const x = points.map(p => p.time);
  const y = points.map(p => p.value);
  const fit = linearRegression(x, y);
  const initial = statedInitial ?? fit.intercept;
  if (initial === 0) {
    throw new ComputationRefusal('invalid_input', 'Initial value must be non-zero to compute percent change: the regression intercept is 0, so state initialValue.', 'initialValue');
  }

  const slope = fit.slope;
  const percentChangePerUnitTime = (slope / initial) * 100;

  // Absolute change allowed before out of spec.
  const allowedDelta = Math.abs(initial) * (maxPercentChange / 100);
  // Time to reach the spec limit in the direction of drift.
  const shelfLife = slope === 0 ? null : Math.abs(allowedDelta / slope);

  const lastTime = Math.max(...x);
  const observedDelta = Math.abs(slope) * lastTime;
  const withinSpecAcrossWindow = observedDelta <= allowedDelta;

  return {
    slopePerUnitTime: round(slope),
    interceptValue: round(initial),
    percentChangePerUnitTime: round(percentChangePerUnitTime),
    shelfLife: shelfLife === null ? null : round(shelfLife, 2),
    withinSpecAcrossWindow,
    initialValueSource: statedInitial === undefined ? 'regression_intercept' : 'stated',
    method: 'CLSI EP25 real-time stability (linear degradation)',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Accelerated stability (Arrhenius) → predicted real-time shelf-life
// ─────────────────────────────────────────────────────────────────────────────

export interface ArrheniusPoint {
  /** Storage temperature in degrees Celsius. */
  temperatureC: number;
  /** Observed degradation rate constant (k) at that temperature. */
  rateConstant: number;
}

export interface AcceleratedStabilityArgs {
  points: ArrheniusPoint[];
  /** Intended real-time storage temperature in Celsius (e.g. 4, 25). */
  storageTemperatureC: number;
  /** Fraction of degradation that defines end of shelf-life (e.g. 0.1 for 10%). */
  degradationThreshold: number;
}

export interface AcceleratedStabilityResult {
  /** Activation energy in kJ/mol from the Arrhenius fit. */
  activationEnergyKJ: number;
  /** Predicted rate constant at the storage temperature. */
  predictedRateAtStorage: number;
  /**
   * Predicted shelf-life (same time unit as the rate constants), or null when
   * the extrapolated storage-temperature rate constant underflows to zero — the
   * Arrhenius fit is then predicting no degradation at all, which is a statement
   * about the extrapolation rather than a number. Same reasoning as
   * {@link RealTimeStabilityResult.shelfLife}: null, never Infinity.
   */
  predictedShelfLife: number | null;
  /** Goodness of the Arrhenius linear fit (R²). */
  rSquared: number;
  method: 'Arrhenius accelerated stability';
}

const R_GAS = 8.314; // J/(mol·K)

/**
 * Predict real-time shelf-life from accelerated (elevated-temperature) rate
 * constants via the Arrhenius relationship ln(k) = ln(A) − Ea/(R·T).
 */
export function assessAcceleratedStability(
  args: AcceleratedStabilityArgs
): AcceleratedStabilityResult {
  const a = (args ?? {}) as Partial<AcceleratedStabilityArgs>;
  const points = statedPoints<ArrheniusPoint>('assessAcceleratedStability', a.points, {
    temperatureC: [(n) => n > -273.15, 'a temperature above -273.15 °C'],
    rateConstant: [(n) => n > 0, 'a rate constant above 0'],
  }, 'temperatureC');
  refuseUnlessStated('assessAcceleratedStability', [
    { field: 'storageTemperatureC', value: a.storageTemperatureC, ok: finite(a.storageTemperatureC) && a.storageTemperatureC > -273.15, expected: 'a temperature above -273.15 °C' },
    { field: 'degradationThreshold', value: a.degradationThreshold, ok: finite(a.degradationThreshold) && a.degradationThreshold > 0 && a.degradationThreshold < 1, expected: 'a fraction strictly between 0 and 1' },
  ], 'computed');
  const storageTemperatureC = a.storageTemperatureC as number;
  const degradationThreshold = a.degradationThreshold as number;
  // x = 1/T (Kelvin), y = ln(k)
  const x = points.map(p => 1 / (p.temperatureC + 273.15));
  const y = points.map(p => Math.log(p.rateConstant));
  const fit = linearRegression(x, y);
  // slope = -Ea/R  →  Ea = -slope * R
  const eaJ = -fit.slope * R_GAS;

  const tStorageK = storageTemperatureC + 273.15;
  const lnKStorage = fit.intercept + fit.slope * (1 / tStorageK);
  const kStorage = Math.exp(lnKStorage);

  // First-order: t = -ln(1 - threshold) / k  (zero-order fallback if preferred
  // is out of scope; first-order is the conventional default).
  const predictedShelfLife = kStorage > 0 ? -Math.log(1 - degradationThreshold) / kStorage : null;

  // R² of the Arrhenius fit.
  const meanY = y.reduce((a, b) => a + b, 0) / y.length;
  let ssTot = 0;
  let ssRes = 0;
  x.forEach((xi, i) => {
    const pred = fit.intercept + fit.slope * xi;
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - meanY) ** 2;
  });
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return {
    activationEnergyKJ: round(eaJ / 1000, 2),
    predictedRateAtStorage: round(kStorage, 6),
    predictedShelfLife: predictedShelfLife === null ? null : round(predictedShelfLife, 2),
    rSquared: round(rSquared),
    method: 'Arrhenius accelerated stability',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Carryover (CLSI EP10 / H26)
// ─────────────────────────────────────────────────────────────────────────────

export interface CarryoverArgs {
  /** Replicate results measured immediately after a high-concentration sample. */
  lowAfterHigh: number[];
  /** Replicate results of the low sample run in a clean sequence. */
  lowBaseline: number[];
  /** Replicate results of the high-concentration sample. */
  highSample: number[];
  /** Acceptance limit for carryover percent (default 1%). */
  acceptanceLimitPct?: number;
}

export interface CarryoverResult {
  /** Carryover as a percent of the high–low span. */
  carryoverPct: number;
  meanLowAfterHigh: number;
  meanLowBaseline: number;
  meanHigh: number;
  acceptanceLimitPct: number;
  pass: boolean;
  method: 'CLSI EP10 carryover';
}

const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;

/** Estimate carryover/cross-contamination from a high→low run sequence. */
export function assessCarryover(args: CarryoverArgs): CarryoverResult {
  const { lowAfterHigh, lowBaseline, highSample } = args;
  if (lowAfterHigh.length === 0 || lowBaseline.length === 0 || highSample.length === 0) {
    throw new Error('Carryover requires lowAfterHigh, lowBaseline, and highSample replicates.');
  }
  const acceptanceLimitPct = args.acceptanceLimitPct ?? 1;
  const mLowAfter = mean(lowAfterHigh);
  const mLowBase = mean(lowBaseline);
  const mHigh = mean(highSample);
  const span = mHigh - mLowBase;
  if (span === 0) throw new Error('High and low means are equal; carryover is undefined.');
  const carryoverPct = ((mLowAfter - mLowBase) / span) * 100;
  return {
    carryoverPct: round(carryoverPct),
    meanLowAfterHigh: round(mLowAfter),
    meanLowBaseline: round(mLowBase),
    meanHigh: round(mHigh),
    acceptanceLimitPct,
    pass: Math.abs(carryoverPct) <= acceptanceLimitPct,
    method: 'CLSI EP10 carryover',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// High-dose hook effect
// ─────────────────────────────────────────────────────────────────────────────

export interface HookEffectArgs {
  /** Ascending concentration series with measured signal. Must be sorted by concentration. */
  series: { concentration: number; signal: number }[];
  /** Fractional drop from the peak that flags a hook (default 0.05 = 5%). */
  dropThreshold?: number;
}

export interface HookEffectResult {
  hookDetected: boolean;
  /** Concentration at which the signal peaked. */
  peakConcentration: number;
  peakSignal: number;
  /** Maximum fractional drop observed after the peak. */
  maxPostPeakDrop: number;
  method: 'High-dose hook detection';
}

/** Detect a high-dose hook (prozone): non-monotonic signal fall at high analyte. */
export function assessHookEffect(args: HookEffectArgs): HookEffectResult {
  const { series } = args;
  if (series.length < 3) {
    throw new Error('Hook-effect detection requires at least 3 concentration points.');
  }
  const dropThreshold = args.dropThreshold ?? 0.05;
  const sorted = [...series].sort((a, b) => a.concentration - b.concentration);
  let peakIdx = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].signal > sorted[peakIdx].signal) peakIdx = i;
  }
  const peak = sorted[peakIdx];
  let maxPostPeakDrop = 0;
  for (let i = peakIdx + 1; i < sorted.length; i++) {
    const drop = (peak.signal - sorted[i].signal) / peak.signal;
    if (drop > maxPostPeakDrop) maxPostPeakDrop = drop;
  }
  return {
    hookDetected: peakIdx < sorted.length - 1 && maxPostPeakDrop >= dropThreshold,
    peakConcentration: peak.concentration,
    peakSignal: peak.signal,
    maxPostPeakDrop: round(maxPostPeakDrop),
    method: 'High-dose hook detection',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Spike-recovery / dilution linearity (CLSI EP06 / EP07)
// ─────────────────────────────────────────────────────────────────────────────

export interface RecoveryPoint {
  expected: number;
  observed: number;
}

export interface RecoveryArgs {
  points: RecoveryPoint[];
  /** Acceptable recovery band, e.g. [80, 120] for 80–120%. */
  recoveryBandPct?: [number, number];
}

export interface RecoveryResult {
  perPoint: { expected: number; observed: number; recoveryPct: number; inBand: boolean }[];
  meanRecoveryPct: number;
  allInBand: boolean;
  recoveryBandPct: [number, number];
  method: 'CLSI EP06/EP07 recovery';
}

/** Assess spike-recovery or dilution-linearity recovery against an acceptance band. */
export function assessRecovery(args: RecoveryArgs): RecoveryResult {
  if (args.points.length === 0) throw new Error('Recovery requires at least one point.');
  const band = args.recoveryBandPct ?? [80, 120];
  const perPoint = args.points.map(p => {
    if (p.expected === 0) throw new Error('Expected value must be non-zero.');
    const recoveryPct = (p.observed / p.expected) * 100;
    return {
      expected: p.expected,
      observed: p.observed,
      recoveryPct: round(recoveryPct, 2),
      inBand: recoveryPct >= band[0] && recoveryPct <= band[1],
    };
  });
  const meanRecoveryPct =
    perPoint.reduce((s, p) => s + p.recoveryPct, 0) / perPoint.length;
  return {
    perPoint,
    meanRecoveryPct: round(meanRecoveryPct, 2),
    allInBand: perPoint.every(p => p.inBand),
    recoveryBandPct: band,
    method: 'CLSI EP06/EP07 recovery',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cut-off / clinical decision point (Youden J on ROC)
// ─────────────────────────────────────────────────────────────────────────────

export interface CutoffObservation {
  score: number;
  /** True = diseased / positive reference state. */
  positive: boolean;
}

export interface CutoffResult {
  /** Optimal cut-off (a score threshold; predict positive when score ≥ cutoff). */
  cutoff: number;
  sensitivity: number;
  specificity: number;
  /** Youden index J = sensitivity + specificity − 1 at the optimum. */
  youdenJ: number;
  method: 'Youden J cut-off determination';
}

/**
 * Determine a clinical decision point by maximizing the Youden index across
 * candidate thresholds. Higher scores are assumed to indicate disease.
 */
export function determineCutoff(observations: CutoffObservation[]): CutoffResult {
  if (observations.length === 0) throw new Error('Cut-off determination requires observations.');
  const positives = observations.filter(o => o.positive).length;
  const negatives = observations.length - positives;
  if (positives === 0 || negatives === 0) {
    throw new Error('Cut-off determination requires both positive and negative cases.');
  }
  // Candidate thresholds: each unique score plus one above the max.
  const scores = [...new Set(observations.map(o => o.score))].sort((a, b) => a - b);
  const candidates = [...scores, Math.max(...scores) + 1];

  let best: CutoffResult | null = null;
  for (const c of candidates) {
    let tp = 0;
    let fp = 0;
    let tn = 0;
    let fn = 0;
    for (const o of observations) {
      const pred = o.score >= c;
      if (o.positive && pred) tp += 1;
      else if (o.positive && !pred) fn += 1;
      else if (!o.positive && pred) fp += 1;
      else tn += 1;
    }
    const sensitivity = tp / (tp + fn);
    const specificity = tn / (tn + fp);
    const youdenJ = sensitivity + specificity - 1;
    if (!best || youdenJ > best.youdenJ) {
      best = {
        cutoff: c,
        sensitivity: round(sensitivity),
        specificity: round(specificity),
        youdenJ: round(youdenJ),
        method: 'Youden J cut-off determination',
      };
    }
  }
  return best!;
}
