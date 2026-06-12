/**
 * MMRM design — sample size & power for a longitudinal continuous endpoint.
 *
 * The mixed model for repeated measures (MMRM) is the FDA-favoured primary
 * analysis for continuous longitudinal endpoints under a missing-at-random (MAR)
 * assumption: a saturated visit-by-treatment mean model with an unstructured
 * within-subject covariance, comparing arms at a target (usually final) visit.
 * Its planning advantage over a completers-only final-visit analysis is that it
 * recovers information on dropouts through their earlier, correlated visits.
 *
 * This module computes that advantage *exactly* at the planning stage. Under an
 * assumed within-subject correlation (compound symmetry or AR(1)), homogeneous
 * visit variance σ², and a monotone dropout pattern (given by per-visit
 * retention), the variance of the GLS estimate of the target-visit mean is
 *
 *   Var(μ̂_T per arm) = (σ² / n) · [ I_unit⁻¹ ]_{T,T},
 *   I_unit = Σ_k (r_k − r_{k+1}) · Eₖ' R_{1:k}⁻¹ Eₖ,
 *
 * summing the per-subject information over monotone dropout groups (a subject
 * last seen at visit k observes visits 1..k; Eₖ embeds the k×k inverse into the
 * full T×T index). The treatment-effect variance is then σ²·[I⁻¹]_{T,T}·(1/n₁+1/n₂).
 * This is the standard mixed-model information for monotone patterns — exact,
 * deterministic, no iterative REML fit.
 *
 * HONESTY / SCOPE. This is a *planning* tool under an assumed structured
 * covariance and monotone MAR dropout. Real MMRM fits an unstructured covariance
 * from the observed data; intermittent (non-monotone) missingness and
 * visit-heterogeneous variances are not modelled here. Use it to size a trial
 * and to quantify MMRM's efficiency gain over a completers-only analysis — not as
 * the analysis itself. The two boundary behaviours are exact sanity checks:
 * ρ = 0 reduces to completers-only (factor 1/r_T); complete data reduces to the
 * standard two-sample final-visit formula (factor 1).
 *
 * @module server/services/stats/mmrm-design
 */

import { normalQuantile } from './normal';
import { buildProvenance, type StatsProvenance } from './computation-provenance';

export type MmrmCovariance = 'compound_symmetry' | 'ar1';

export interface MmrmDesignInput {
  /** Number of post-baseline visits, T ≥ 1. Target contrast is at `targetVisit` (default T). */
  visits: number;
  /** Assumed within-subject correlation structure. */
  covariance: MmrmCovariance;
  /** Correlation parameter ρ ∈ [0, 1). CS: common pairwise ρ. AR(1): lag-1 ρ. */
  rho: number;
  /** Common SD of the (change-from-baseline) response at each visit, σ > 0. */
  sigma: number;
  /** Between-arm difference in mean change at the target visit (|δ| > 0). */
  delta: number;
  /** Two-sided significance level (default 0.05). */
  alpha?: number;
  /** Target power (default 0.90). */
  power?: number;
  /**
   * Per-visit retention r_t = fraction still observed at visit t, length = visits,
   * monotone non-increasing in (0, 1]. Default: all 1 (complete data).
   */
  retention?: number[];
  /** Visit at which the contrast is tested (1-based, default = final visit). */
  targetVisit?: number;
  /** Allocation ratio n₂/n₁ (default 1). */
  allocationRatio?: number;
}

export interface MmrmDesignResult {
  nPerArm: number;
  nTotal: number;
  /** [I_unit⁻¹]_{target,target} — the variance inflation vs a hypothetical σ²/n at full information. */
  varianceFactor: number;
  /** Efficiency of MMRM vs a completers-only target-visit analysis: (1/r_target) / varianceFactor ≥ 1. */
  efficiencyVsCompleters: number;
  /** Achieved power at the returned (rounded-up) sample size. */
  achievedPower: number;
  inputs: Required<Omit<MmrmDesignInput, 'alpha' | 'power' | 'retention' | 'targetVisit' | 'allocationRatio'>> & {
    alpha: number;
    power: number;
    retention: number[];
    targetVisit: number;
    allocationRatio: number;
  };
  provenance: StatsProvenance;
}

const METHOD = 'mmrm-design';
const METHOD_VERSION = '1.0.0';

/** Build a T×T correlation matrix for the chosen structure. */
export function correlationMatrix(t: number, covariance: MmrmCovariance, rho: number): number[][] {
  const R: number[][] = Array.from({ length: t }, () => new Array(t).fill(0));
  for (let i = 0; i < t; i++) {
    for (let j = 0; j < t; j++) {
      if (i === j) R[i][j] = 1;
      else R[i][j] = covariance === 'ar1' ? Math.pow(rho, Math.abs(i - j)) : rho;
    }
  }
  return R;
}

/** Invert a small symmetric positive-definite matrix via Gauss–Jordan with partial pivoting. */
export function invert(matrix: number[][]): number[][] {
  const n = matrix.length;
  // Augment [A | I].
  const a = matrix.map((row, i) => [...row, ...identityRow(i, n)]);
  for (let col = 0; col < n; col++) {
    // Partial pivot.
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error('Matrix is singular or not positive-definite.');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const d = a[col][col];
    for (let k = 0; k < 2 * n; k++) a[col][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let k = 0; k < 2 * n; k++) a[r][k] -= f * a[col][k];
    }
  }
  return a.map(row => row.slice(n));
}

function identityRow(i: number, n: number): number[] {
  const r = new Array(n).fill(0);
  r[i] = 1;
  return r;
}

/** Leading k×k block of a matrix. */
function leadingBlock(m: number[][], k: number): number[][] {
  return m.slice(0, k).map(row => row.slice(0, k));
}

/**
 * Per-subject information matrix (σ²-free) summed over monotone dropout groups.
 * A subject last seen at visit k contributes the k×k inverse of R_{1:k} embedded
 * into the full T×T index, weighted by the fraction of subjects in that group.
 */
export function unitInformation(R: number[][], retention: number[]): number[][] {
  const t = R.length;
  const I: number[][] = Array.from({ length: t }, () => new Array(t).fill(0));
  // Group weights: fraction whose LAST observed visit is exactly k = r_k − r_{k+1} (r_{T+1}=0).
  for (let k = 1; k <= t; k++) {
    const rNext = k < t ? retention[k] : 0;
    const weight = retention[k - 1] - rNext;
    if (weight <= 0) continue;
    const invBlock = invert(leadingBlock(R, k)); // R_{1:k}⁻¹
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        I[i][j] += weight * invBlock[i][j];
      }
    }
  }
  return I;
}

/** Validate and fill defaults for the retention vector. */
function resolveRetention(input: MmrmDesignInput): number[] {
  const t = input.visits;
  const r = input.retention ?? new Array(t).fill(1);
  if (r.length !== t) throw new Error(`retention must have length ${t} (one per visit).`);
  for (let i = 0; i < t; i++) {
    if (!(r[i] > 0) || r[i] > 1) throw new Error('retention values must be in (0, 1].');
    if (i > 0 && r[i] > r[i - 1] + 1e-12) throw new Error('retention must be monotone non-increasing (monotone dropout).');
  }
  return r;
}

function validate(input: MmrmDesignInput): void {
  if (!Number.isInteger(input.visits) || input.visits < 1) throw new Error('visits must be a positive integer.');
  if (!(input.rho >= 0 && input.rho < 1)) throw new Error('rho must be in [0, 1).');
  if (!(input.sigma > 0)) throw new Error('sigma must be > 0.');
  if (!(Math.abs(input.delta) > 0)) throw new Error('delta must be non-zero.');
}

/**
 * Compute the σ²-free variance factor [I_unit⁻¹]_{target,target} for an MMRM
 * target-visit contrast. Exposed for testing and direct use.
 */
export function varianceFactor(input: MmrmDesignInput): { factor: number; retention: number[]; targetVisit: number } {
  validate(input);
  const t = input.visits;
  const targetVisit = input.targetVisit ?? t;
  if (!Number.isInteger(targetVisit) || targetVisit < 1 || targetVisit > t) {
    throw new Error(`targetVisit must be an integer in 1..${t}.`);
  }
  const retention = resolveRetention(input);
  const R = correlationMatrix(t, input.covariance, input.rho);
  const I = unitInformation(R, retention);
  const Iinv = invert(I);
  return { factor: Iinv[targetVisit - 1][targetVisit - 1], retention, targetVisit };
}

/**
 * MMRM sample size for a two-arm comparison at the target visit. Returns the per-arm
 * and total n, the variance factor, MMRM's efficiency vs a completers-only analysis,
 * and the achieved power at the rounded-up n.
 */
export function mmrmSampleSize(input: MmrmDesignInput): MmrmDesignResult {
  const alpha = input.alpha ?? 0.05;
  const power = input.power ?? 0.9;
  const allocationRatio = input.allocationRatio ?? 1;
  if (!(alpha > 0 && alpha < 1)) throw new Error('alpha must be in (0, 1).');
  if (!(power > 0 && power < 1)) throw new Error('power must be in (0, 1).');
  if (!(allocationRatio > 0)) throw new Error('allocationRatio must be > 0.');

  const { factor, retention, targetVisit } = varianceFactor(input);
  const za = normalQuantile(1 - alpha / 2);
  const zb = normalQuantile(power);
  const sigma2 = input.sigma * input.sigma;

  // SE² = σ²·factor·(1/n₁ + 1/n₂), n₂ = allocationRatio·n₁.
  // Require SE² ≤ (δ/(z_a+z_b))²  ⇒  n₁ = factor·σ²·(1 + 1/k)·(z_a+z_b)²/δ².
  const k = allocationRatio;
  const n1 = (factor * sigma2 * (1 + 1 / k) * Math.pow(za + zb, 2)) / (input.delta * input.delta);
  const nPerArm = Math.ceil(n1);
  const n2 = Math.ceil(nPerArm * k);
  const nTotal = nPerArm + n2;

  const achievedPower = mmrmPowerForN(factor, sigma2, input.delta, alpha, nPerArm, n2);
  const completersFactor = 1 / retention[targetVisit - 1];

  return {
    nPerArm,
    nTotal,
    varianceFactor: round(factor, 6),
    efficiencyVsCompleters: round(completersFactor / factor, 4),
    achievedPower: round(achievedPower, 4),
    inputs: {
      visits: input.visits,
      covariance: input.covariance,
      rho: input.rho,
      sigma: input.sigma,
      delta: input.delta,
      alpha,
      power,
      retention,
      targetVisit,
      allocationRatio,
    },
    provenance: buildProvenance({
      method: METHOD,
      methodVersion: METHOD_VERSION,
      seed: 0,
      inputs: { ...input, alpha, power, allocationRatio, retention, targetVisit },
      note: 'Deterministic MMRM sample-size under structured covariance + monotone MAR dropout.',
    }),
  };
}

/** Power for a given per-arm n (and n₂) under the same model — exposed for power curves. */
export function mmrmPower(input: MmrmDesignInput & { nPerArm: number; n2?: number }): number {
  const alpha = input.alpha ?? 0.05;
  const { factor } = varianceFactor(input);
  const n2 = input.n2 ?? Math.ceil(input.nPerArm * (input.allocationRatio ?? 1));
  return round(mmrmPowerForN(factor, input.sigma * input.sigma, input.delta, alpha, input.nPerArm, n2), 6);
}

function mmrmPowerForN(factor: number, sigma2: number, delta: number, alpha: number, n1: number, n2: number): number {
  const se = Math.sqrt(sigma2 * factor * (1 / n1 + 1 / n2));
  const za = normalQuantile(1 - alpha / 2);
  const z = Math.abs(delta) / se - za;
  return standardNormalCdf(z);
}

// Local standard-normal CDF (Abramowitz–Stegun 7.1.26) to avoid a circular import.
function standardNormalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

function round(x: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
