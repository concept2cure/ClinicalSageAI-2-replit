/**
 * External-control rigor pack.
 *
 * The analytic core for borrowing strength from a historical / external control
 * and defending it: principled down-weighting of the historical control,
 * covariate-balance diagnostics, and the sensitivity ("tipping-point") analyses
 * a regulator expects before accepting borrowed information.
 *
 *   - covariateBalance — standardized mean differences and variance ratios
 *     (Austin 2009), with optional inverse-probability weights and an effective
 *     sample size, plus an overall balance verdict.
 *   - powerPriorBorrow — normal power prior: discount the historical control
 *     precision by a0 ∈ [0, 1] (Ibrahim & Chen 2000).
 *   - commensurateBorrow — normal commensurate prior: borrow through a normal
 *     link with commensurability variance τ², so prior-data conflict
 *     automatically attenuates borrowing (Hobbs et al. 2011).
 *   - tippingPointBias / tippingPointBorrow — vary an assumed historical bias,
 *     or the borrowing strength, until the trial conclusion flips.
 *   - renderExternalControlMemo — a deterministic regulatory-framing memo.
 *
 * Pure and deterministic; every sensitivity result is reproducible and carries
 * provenance. No fabrication: when an input is missing the functions say so
 * rather than inventing a value.
 */

import { normalCdf, normalQuantile } from './normal';
import { buildProvenance, type StatsProvenance } from './computation-provenance';

// ── Covariate balance ────────────────────────────────────────────────────────

export interface CovariateInput {
  name: string;
  type: 'continuous' | 'binary';
  treatment: number[];
  control: number[];
  /** Optional weights on the control sample (e.g. IPTW); length matches control. */
  controlWeights?: number[];
}

export interface CovariateBalanceEntry {
  covariate: string;
  treatmentMean: number;
  controlMean: number;
  standardizedMeanDifference: number;
  varianceRatio: number;
  balanced: boolean;
}

export interface CovariateBalanceResult {
  covariates: CovariateBalanceEntry[];
  maxAbsStandardizedMeanDifference: number;
  allBalanced: boolean;
  /** Effective sample size of the (weighted) control, (Σw)² / Σw². */
  controlEffectiveSampleSize: number | null;
  threshold: number;
  provenance: StatsProvenance;
}

function weightedMoments(x: number[], w?: number[]): { mean: number; variance: number } {
  const n = x.length;
  if (n === 0) return { mean: 0, variance: 0 };
  if (!w) {
    const mean = x.reduce((s, v) => s + v, 0) / n;
    const variance = n > 1 ? x.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
    return { mean, variance };
  }
  const sw = w.reduce((s, v) => s + v, 0);
  if (sw <= 0) return { mean: 0, variance: 0 };
  const mean = x.reduce((s, v, i) => s + w[i] * v, 0) / sw;
  // Reliability-weighted (frequency-style) variance with bias correction.
  const sw2 = w.reduce((s, v) => s + v * v, 0);
  const denom = sw - sw2 / sw;
  const variance = denom > 0 ? x.reduce((s, v, i) => s + w[i] * (v - mean) ** 2, 0) / denom : 0;
  return { mean, variance };
}

function effectiveSampleSize(w: number[]): number {
  const sw = w.reduce((s, v) => s + v, 0);
  const sw2 = w.reduce((s, v) => s + v * v, 0);
  return sw2 > 0 ? (sw * sw) / sw2 : 0;
}

/**
 * Covariate balance via the absolute standardized mean difference. For a
 * continuous covariate SMD = (x̄_t − x̄_c) / √((s²_t + s²_c)/2); for a binary
 * covariate the pooled denominator uses p(1−p). |SMD| < threshold (default 0.1)
 * is the conventional balance bar.
 */
export function covariateBalance(
  covariates: CovariateInput[],
  threshold = 0.1,
): CovariateBalanceResult {
  if (covariates.length === 0) throw new Error('at least one covariate is required');

  const entries: CovariateBalanceEntry[] = covariates.map(cov => {
    if (cov.treatment.length === 0 || cov.control.length === 0) {
      throw new Error(`covariate ${cov.name} needs non-empty treatment and control samples`);
    }
    if (cov.controlWeights && cov.controlWeights.length !== cov.control.length) {
      throw new Error(`covariate ${cov.name}: controlWeights length must match control`);
    }

    const t = weightedMoments(cov.treatment);
    const c = weightedMoments(cov.control, cov.controlWeights);

    let pooledSd: number;
    if (cov.type === 'binary') {
      pooledSd = Math.sqrt((t.mean * (1 - t.mean) + c.mean * (1 - c.mean)) / 2);
    } else {
      pooledSd = Math.sqrt((t.variance + c.variance) / 2);
    }
    const smd = pooledSd > 0 ? (t.mean - c.mean) / pooledSd : 0;
    const varianceRatio = c.variance > 0 ? t.variance / c.variance : NaN;

    return {
      covariate: cov.name,
      treatmentMean: t.mean,
      controlMean: c.mean,
      standardizedMeanDifference: smd,
      varianceRatio,
      balanced: Math.abs(smd) < threshold,
    };
  });

  const maxAbs = Math.max(...entries.map(e => Math.abs(e.standardizedMeanDifference)));
  const weights = covariates[0].controlWeights;
  const inputs = {
    covariates: covariates.map(c => ({
      name: c.name,
      type: c.type,
      nT: c.treatment.length,
      nC: c.control.length,
      weighted: !!c.controlWeights,
    })),
    threshold,
  };

  return {
    covariates: entries,
    maxAbsStandardizedMeanDifference: maxAbs,
    allBalanced: entries.every(e => e.balanced),
    controlEffectiveSampleSize: weights ? effectiveSampleSize(weights) : null,
    threshold,
    provenance: buildProvenance({
      method: 'externalControl:covariateBalance',
      seed: 0,
      inputs,
      note: 'Deterministic standardized mean differences; reproduces for the same samples.',
    }),
  };
}

// ── Borrowing: power prior and commensurate prior ──────────────────────────────

export interface BorrowResult {
  /** Posterior mean of the control parameter after borrowing. */
  posteriorMean: number;
  /** Posterior standard error of the control parameter. */
  posteriorSe: number;
  /** Historical-equivalent sample size actually borrowed. */
  effectiveHistoricalN: number;
  /** Fraction of the posterior precision contributed by the historical control. */
  borrowedPrecisionFraction: number;
}

export interface PowerPriorArgs {
  /** Concurrent control summary. */
  meanC: number;
  seC: number;
  nC: number;
  /** Historical control summary. */
  meanH: number;
  seH: number;
  nH: number;
  /** Power-prior discount a0 ∈ [0, 1]; 1 = full pooling, 0 = no borrowing. */
  a0: number;
}

/** Normal power prior: discount the historical control precision by a0. */
export function powerPriorBorrow(args: PowerPriorArgs): BorrowResult {
  const { meanC, seC, meanH, seH, nH, a0 } = args;
  if (!(a0 >= 0 && a0 <= 1)) throw new Error('a0 must be in [0, 1]');
  if (seC <= 0 || seH <= 0) throw new Error('standard errors must be positive');

  const precC = 1 / (seC * seC);
  const precH = a0 / (seH * seH);
  const precPost = precC + precH;
  const posteriorMean = (meanC * precC + meanH * precH) / precPost;

  return {
    posteriorMean,
    posteriorSe: Math.sqrt(1 / precPost),
    effectiveHistoricalN: a0 * nH,
    borrowedPrecisionFraction: precH / precPost,
  };
}

export interface CommensurateArgs {
  meanC: number;
  seC: number;
  nC: number;
  meanH: number;
  seH: number;
  nH: number;
  /** Commensurability variance τ² ≥ 0; 0 = full borrowing, ∞ = none. */
  tau2: number;
}

/**
 * Normal commensurate prior: the historical control informs the concurrent
 * control through a normal link with variance τ². Prior-data conflict inflates
 * the effective historical variance (seH² + τ²), automatically attenuating the
 * borrowing — so a discrepant historical control is discounted without a manual
 * a0.
 */
export function commensurateBorrow(args: CommensurateArgs): BorrowResult {
  const { meanC, seC, meanH, seH, nH, tau2 } = args;
  if (tau2 < 0) throw new Error('tau2 must be non-negative');
  if (seC <= 0 || seH <= 0) throw new Error('standard errors must be positive');

  const precC = 1 / (seC * seC);
  const precH = 1 / (seH * seH + tau2);
  const precPost = precC + precH;
  const posteriorMean = (meanC * precC + meanH * precH) / precPost;
  // Historical n down-weighted by the commensurability shrinkage seH²/(seH²+τ²).
  const shrink = (seH * seH) / (seH * seH + tau2);

  return {
    posteriorMean,
    posteriorSe: Math.sqrt(1 / precPost),
    effectiveHistoricalN: nH * shrink,
    borrowedPrecisionFraction: precH / precPost,
  };
}

// ── Treatment effect and tipping points ────────────────────────────────────────

export interface EffectResult {
  effect: number;
  se: number;
  z: number;
  pValue: number;
  ciLower: number;
  ciUpper: number;
  significant: boolean;
}

/** Two-sided treatment-vs-borrowed-control effect on the mean difference. */
export function treatmentEffect(
  meanT: number,
  seT: number,
  control: BorrowResult,
  alpha = 0.05,
): EffectResult {
  const effect = meanT - control.posteriorMean;
  const se = Math.sqrt(seT * seT + control.posteriorSe * control.posteriorSe);
  const z = se > 0 ? effect / se : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const zCrit = normalQuantile(1 - alpha / 2);
  return {
    effect,
    se,
    z,
    pValue,
    ciLower: effect - zCrit * se,
    ciUpper: effect + zCrit * se,
    significant: pValue < alpha,
  };
}

export interface TippingPoint<K extends string> {
  grid: Array<{ value: number; pValue: number; significant: boolean } & Record<K, number>>;
  /** First value at which the conclusion flips, or null if it never does. */
  tippingValue: number | null;
  flips: boolean;
  alpha: number;
  provenance: StatsProvenance;
}

export interface TippingBiasArgs extends PowerPriorArgs {
  meanT: number;
  seT: number;
  alpha?: number;
  /** Range of hypothetical additive bias on the historical control mean. */
  biasMin?: number;
  biasMax?: number;
  steps?: number;
}

/**
 * Bias tipping point: add a hypothetical bias δ to the historical control mean
 * (unmeasured confounding / prior-data conflict) and find the smallest |δ| at
 * which the significance of the treatment effect flips. The classic
 * external-control sensitivity analysis.
 */
export function tippingPointBias(args: TippingBiasArgs): TippingPoint<'bias'> {
  const alpha = args.alpha ?? 0.05;
  const steps = args.steps ?? 101;
  const biasMin = args.biasMin ?? -Math.abs(args.meanH) - 5 * args.seH;
  const biasMax = args.biasMax ?? Math.abs(args.meanH) + 5 * args.seH;
  if (steps < 2) throw new Error('steps must be at least 2');

  const baseSig = treatmentEffect(
    args.meanT,
    args.seT,
    powerPriorBorrow(args),
    alpha,
  ).significant;

  const grid: TippingPoint<'bias'>['grid'] = [];
  let tippingValue: number | null = null;
  for (let i = 0; i < steps; i++) {
    const bias = biasMin + ((biasMax - biasMin) * i) / (steps - 1);
    const control = powerPriorBorrow({ ...args, meanH: args.meanH + bias });
    const eff = treatmentEffect(args.meanT, args.seT, control, alpha);
    grid.push({ value: bias, bias, pValue: eff.pValue, significant: eff.significant });
    if (tippingValue === null && eff.significant !== baseSig) tippingValue = bias;
  }

  const inputs = { ...args, alpha, steps, biasMin, biasMax };
  return {
    grid,
    tippingValue,
    flips: tippingValue !== null,
    alpha,
    provenance: buildProvenance({
      method: 'externalControl:tippingPointBias',
      seed: 0,
      inputs,
      note: 'Deterministic bias sweep; reproduces for the same design and grid.',
    }),
  };
}

export interface TippingBorrowArgs {
  meanT: number;
  seT: number;
  meanC: number;
  seC: number;
  nC: number;
  meanH: number;
  seH: number;
  nH: number;
  alpha?: number;
  steps?: number;
}

/**
 * Borrowing tipping point: sweep the power-prior discount a0 from 1 down to 0
 * and find the a0 at which the conclusion flips — how much borrowing the result
 * depends on.
 */
export function tippingPointBorrow(args: TippingBorrowArgs): TippingPoint<'a0'> {
  const alpha = args.alpha ?? 0.05;
  const steps = args.steps ?? 101;
  if (steps < 2) throw new Error('steps must be at least 2');

  const grid: TippingPoint<'a0'>['grid'] = [];
  let tippingValue: number | null = null;
  let prevSig: boolean | null = null;
  for (let i = 0; i < steps; i++) {
    const a0 = 1 - i / (steps - 1); // 1 → 0
    const control = powerPriorBorrow({ ...args, a0 });
    const eff = treatmentEffect(args.meanT, args.seT, control, alpha);
    grid.push({ value: a0, a0, pValue: eff.pValue, significant: eff.significant });
    if (prevSig !== null && eff.significant !== prevSig && tippingValue === null) {
      tippingValue = a0;
    }
    prevSig = eff.significant;
  }

  const inputs = { ...args, alpha, steps };
  return {
    grid,
    tippingValue,
    flips: tippingValue !== null,
    alpha,
    provenance: buildProvenance({
      method: 'externalControl:tippingPointBorrow',
      seed: 0,
      inputs,
      note: 'Deterministic a0 sweep from 1 to 0; reproduces for the same design and grid.',
    }),
  };
}

// ── Regulatory-framing memo ────────────────────────────────────────────────────

export interface MemoInput {
  endpoint: string;
  borrowingMethod: 'power-prior' | 'commensurate';
  borrowingParam: number; // a0 or tau2
  control: BorrowResult;
  effect: EffectResult;
  balance?: CovariateBalanceResult;
  tipping?: TippingPoint<'bias'> | TippingPoint<'a0'>;
}

/**
 * Deterministic regulatory-framing memo. Sentence case, numbers over adjectives,
 * honest about what was borrowed and how fragile the conclusion is. No
 * fabrication: sections are omitted when their inputs are absent.
 */
export function renderExternalControlMemo(input: MemoInput): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const num = (x: number) => x.toFixed(3);
  const lines: string[] = [];

  lines.push('External control — borrowing and sensitivity memo');
  lines.push('');
  const methodLabel = input.borrowingMethod === 'power-prior'
    ? `power prior, a0 = ${num(input.borrowingParam)}`
    : `commensurate prior, tau^2 = ${num(input.borrowingParam)}`;
  lines.push(`Borrowing method: ${methodLabel}.`);
  lines.push(
    `Borrowed historical information: ${num(input.control.effectiveHistoricalN)} ` +
      `equivalent subjects (${pct(input.control.borrowedPrecisionFraction)} of the ` +
      `posterior control precision).`,
  );
  lines.push(
    `Posterior control mean ${num(input.control.posteriorMean)} ` +
      `(se ${num(input.control.posteriorSe)}).`,
  );
  lines.push('');
  lines.push(`Treatment effect on ${input.endpoint}: ${num(input.effect.effect)} ` +
    `(95% CI ${num(input.effect.ciLower)} to ${num(input.effect.ciUpper)}, ` +
    `two-sided p = ${num(input.effect.pValue)}). ` +
    `Conclusion: ${input.effect.significant ? 'significant' : 'not significant'}.`);

  if (input.balance) {
    lines.push('');
    const b = input.balance;
    lines.push(
      `Covariate balance: maximum absolute standardized mean difference ` +
        `${num(b.maxAbsStandardizedMeanDifference)} across ${b.covariates.length} ` +
        `covariates (threshold ${num(b.threshold)}). ` +
        `${b.allBalanced ? 'All covariates balanced.' : 'Some covariates exceed the threshold.'}`,
    );
    if (b.controlEffectiveSampleSize !== null) {
      lines.push(`Weighted control effective sample size: ${num(b.controlEffectiveSampleSize)}.`);
    }
  }

  if (input.tipping) {
    lines.push('');
    if (input.tipping.flips && input.tipping.tippingValue !== null) {
      lines.push(
        `Sensitivity: the conclusion flips at a tipping value of ` +
          `${num(input.tipping.tippingValue)}. Interpret the result against whether a ` +
          `deviation of that magnitude is plausible.`,
      );
    } else {
      lines.push(
        'Sensitivity: the conclusion does not flip anywhere on the analyzed range; ' +
          'the result is robust to the sensitivity parameter over that range.',
      );
    }
  }

  return lines.join('\n');
}
