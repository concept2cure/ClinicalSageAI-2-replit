/**
 * Exact group-sequential operating characteristics (ICH E9 / adaptive designs).
 *
 * Computes the operating characteristics of a group-sequential design — type I
 * error, power, expected sample size, and per-look stopping probabilities — by
 * the standard recursive numerical integration of the joint distribution of the
 * sequential test statistics (Armitage–McPherson–Rowe; Jennison & Turnbull,
 * Group Sequential Methods, ch. 19). This is an *exact* computation (to the
 * resolution of the integration grid), not a Monte Carlo estimate, so it:
 *
 *   - reproduces identically every time (deterministic; no RNG), and
 *   - matches the closed-form fixed-design result when there is a single look.
 *
 * It complements the Monte Carlo OC estimator in adaptive-trial-operations-
 * service.ts: the exact engine validates the simulator and removes its
 * hard-coded effect grid and its correlation-ignoring boundary approximation.
 *
 * MODEL. Work on the score scale. With information levels I_k = t_k · I_max
 * (we normalize I_max = 1, so t_k are the information fractions and t_K = 1),
 * the score statistics S_k have independent increments
 *   ΔS_k = S_k − S_{k-1} ~ N(θ · ΔI_k, ΔI_k),
 * where θ is the drift (the effect on the score scale; E[Z_K] = θ·√I_max = θ,
 * so θ is the expected final z-statistic). The z-statistic at look k is
 * Z_k = S_k / √I_k, with E[Z_k] = θ·√t_k and corr(Z_j, Z_k) = √(t_j/t_k).
 *
 * SCOPE / honesty. Futility boundaries are treated as BINDING (the continuation
 * region is truncated below at the futility boundary). For a non-binding
 * futility analysis of type I error, omit the futility boundaries (efficacy
 * only) — that is the conservative computation. This is stated rather than
 * silently assumed.
 */

import { normalPdf, normalCdf, normalQuantile } from './normal';
import { seedFromObject } from './rng';
import { buildProvenance, type StatsProvenance } from './computation-provenance';

export type SpendingFunction = 'obrien-fleming' | 'pocock' | 'linear';

export interface GroupSequentialBoundaries {
  /** Information fractions at each analysis, strictly increasing, last = 1. */
  informationFractions: number[];
  /** Upper (efficacy) boundary on the z-scale at each look. */
  efficacyBoundaries: number[];
  /**
   * Lower (futility) boundary on the z-scale at each look, or null for none.
   * Treated as binding. The final look has no separate futility boundary
   * (the trial concludes there).
   */
  futilityBoundaries?: (number | null)[];
}

export interface LookOperatingCharacteristic {
  look: number;
  informationFraction: number;
  efficacyBoundary: number;
  futilityBoundary: number | null;
  /** P(first crossing of the efficacy boundary at this look). */
  efficacyStopProbability: number;
  /** P(first crossing of the futility boundary / non-rejection at this look). */
  futilityStopProbability: number;
  /** P(the trial stops at this look) = efficacy + futility stop probabilities. */
  stopProbability: number;
  /** Cumulative P(reject H0) by this look. */
  cumulativeRejectProbability: number;
}

export interface OperatingCharacteristic {
  /** Drift θ = expected final z-statistic under this scenario. */
  drift: number;
  /** Overall P(reject H0) = power (or type I error when drift = 0). */
  rejectProbability: number;
  /** Overall P(stop for futility / accept H0). */
  futilityStopProbability: number;
  /** E[information fraction at stop] = E[sample size] / max sample size. */
  expectedInformationFraction: number;
  perLook: LookOperatingCharacteristic[];
}

export interface BoundarySolveResult extends GroupSequentialBoundaries {
  /** Target cumulative one-sided alpha spent by each look. */
  cumulativeAlpha: number[];
  /** Incremental alpha spent at each look. */
  incrementalAlpha: number[];
  spendingFunction: SpendingFunction;
  /** The one-sided alpha the upper boundary was solved to spend. */
  alpha: number;
}

interface GridOptions {
  /** Integration step on the score scale (smaller = more accurate, slower). */
  step?: number;
  /** Half-width of the grid in score units beyond the drift (default 12). */
  halfWidth?: number;
}

const DEFAULT_STEP = 0.02;
const DEFAULT_HALF_WIDTH = 12;

// Each grid node represents a cell of width `step` centred on the node. Boundary
// crossings rarely fall on a node, so we weight the boundary cell by the
// fraction of it lying on the relevant side of the boundary. This turns the
// O(step) error of a hard cutoff into O(step²) and conserves probability mass.

/** Fraction of the cell centred at `center` lying at or above the threshold `u`. */
function fracAbove(u: number, center: number, step: number): number {
  const low = center - step / 2;
  const high = center + step / 2;
  if (u <= low) return 1;
  if (u >= high) return 0;
  return (high - u) / step;
}

/** Fraction of the cell centred at `center` lying at or below the threshold `l`. */
function fracBelow(l: number, center: number, step: number): number {
  const low = center - step / 2;
  const high = center + step / 2;
  if (l >= high) return 1;
  if (l <= low) return 0;
  return (l - low) / step;
}

// ---------------------------------------------------------------------------
// Spending functions (one-sided upper target). Each satisfies f(1) = alpha.
// ---------------------------------------------------------------------------

/** Cumulative one-sided alpha spent by information fraction t. */
export function alphaSpent(t: number, alpha: number, fn: SpendingFunction): number {
  if (t <= 0) return 0;
  if (t >= 1) return alpha;
  switch (fn) {
    case 'obrien-fleming':
      // Lan–DeMets O'Brien–Fleming: 2(1 − Φ(z_{1−α/2} / √t)). f(1) = α.
      return 2 * (1 - normalCdf(normalQuantile(1 - alpha / 2) / Math.sqrt(t)));
    case 'pocock':
      return alpha * Math.log(1 + (Math.E - 1) * t);
    case 'linear':
      return alpha * t;
  }
}

// ---------------------------------------------------------------------------
// Core recursion
// ---------------------------------------------------------------------------

interface RecursionResult {
  perLook: Array<{ efficacyStop: number; futilityStop: number; stop: number; cumReject: number }>;
  rejectProbability: number;
  futilityStopProbability: number;
  expectedInformationFraction: number;
}

/**
 * Run the group-sequential recursion for a single drift and return the stopping
 * probabilities and expected information. Pure and deterministic.
 */
function recurse(
  informationFractions: number[],
  efficacyBoundaries: number[],
  futilityBoundaries: (number | null)[] | undefined,
  drift: number,
  grid: Required<GridOptions>,
): RecursionResult {
  const K = informationFractions.length;
  const { step, halfWidth } = grid;

  const lo = Math.min(0, drift) - halfWidth;
  const hi = Math.max(0, drift) + halfWidth;
  const M = Math.max(2, Math.round((hi - lo) / step) + 1);
  const s = new Float64Array(M);
  for (let i = 0; i < M; i++) s[i] = lo + i * step;

  // p holds the (sub-)density of S_k restricted to having survived continuation
  // through look k-1. The mass of p is the probability of reaching look k.
  let p = new Float64Array(M);

  const perLook: RecursionResult['perLook'] = [];
  let cumReject = 0;
  let cumFutility = 0;
  let expInfoFrac = 0;
  let prevI = 0;

  for (let k = 0; k < K; k++) {
    const Ik = informationFractions[k];
    const dI = Ik - prevI;
    const sdInc = Math.sqrt(dI);
    const mInc = drift * dI;

    if (k === 0) {
      for (let i = 0; i < M; i++) p[i] = normalPdf((s[i] - mInc) / sdInc) / sdInc;
    } else {
      // Convolve the previous continuation density with the increment kernel.
      const q = new Float64Array(M);
      for (let j = 0; j < M; j++) {
        const pj = p[j];
        if (pj === 0) continue;
        const w = pj * step;
        for (let i = 0; i < M; i++) {
          q[i] += w * (normalPdf((s[i] - s[j] - mInc) / sdInc) / sdInc);
        }
      }
      p = q;
    }

    const sqrtIk = Math.sqrt(Ik);
    const uK = efficacyBoundaries[k] * sqrtIk;
    const lZ = futilityBoundaries ? futilityBoundaries[k] : null;
    const lK = lZ !== null && lZ !== undefined && Number.isFinite(lZ) ? lZ * sqrtIk : -Infinity;
    const isFinal = k === K - 1;

    // Efficacy crossing: mass at or above the upper boundary (partial-cell weighted).
    let efficacyStop = 0;
    let futilityStop = 0;
    if (isFinal) {
      // The trial concludes: reject above uK, accept (non-reject) below.
      for (let i = 0; i < M; i++) {
        if (p[i] === 0) continue;
        const fa = fracAbove(uK, s[i], step);
        efficacyStop += p[i] * fa;
        futilityStop += p[i] * (1 - fa);
      }
      efficacyStop *= step;
      futilityStop *= step;
      // Zero out continuation (none remains).
      p = new Float64Array(M);
    } else {
      const cont = new Float64Array(M);
      const hasFutility = lK !== -Infinity;
      for (let i = 0; i < M; i++) {
        if (p[i] === 0) continue;
        const fa = fracAbove(uK, s[i], step);
        const fb = hasFutility ? fracBelow(lK, s[i], step) : 0;
        efficacyStop += p[i] * fa;
        futilityStop += p[i] * fb;
        cont[i] = p[i] * Math.max(0, 1 - fa - fb);
      }
      efficacyStop *= step;
      futilityStop *= step;
      p = cont;
    }

    const stop = efficacyStop + futilityStop;
    cumReject += efficacyStop;
    cumFutility += futilityStop;
    expInfoFrac += stop * Ik;

    perLook.push({ efficacyStop, futilityStop, stop, cumReject });
    prevI = Ik;
  }

  return {
    perLook,
    rejectProbability: cumReject,
    futilityStopProbability: cumFutility,
    expectedInformationFraction: expInfoFrac,
  };
}

function toOperatingCharacteristic(
  drift: number,
  boundaries: GroupSequentialBoundaries,
  r: RecursionResult,
): OperatingCharacteristic {
  return {
    drift,
    rejectProbability: r.rejectProbability,
    futilityStopProbability: r.futilityStopProbability,
    expectedInformationFraction: r.expectedInformationFraction,
    perLook: r.perLook.map((look, k) => ({
      look: k + 1,
      informationFraction: boundaries.informationFractions[k],
      efficacyBoundary: boundaries.efficacyBoundaries[k],
      futilityBoundary: boundaries.futilityBoundaries?.[k] ?? null,
      efficacyStopProbability: look.efficacyStop,
      futilityStopProbability: look.futilityStop,
      stopProbability: look.stop,
      cumulativeRejectProbability: look.cumReject,
    })),
  };
}

function validateBoundaries(b: GroupSequentialBoundaries): void {
  const { informationFractions: t, efficacyBoundaries: e } = b;
  if (t.length === 0) throw new Error('informationFractions must be non-empty');
  if (t.length !== e.length) {
    throw new Error('efficacyBoundaries length must match informationFractions');
  }
  for (let i = 0; i < t.length; i++) {
    if (!(t[i] > 0) || t[i] > 1 + 1e-9) {
      throw new Error(`informationFraction ${t[i]} must be in (0, 1]`);
    }
    if (i > 0 && t[i] <= t[i - 1]) {
      throw new Error('informationFractions must be strictly increasing');
    }
  }
  if (Math.abs(t[t.length - 1] - 1) > 1e-9) {
    throw new Error('the final informationFraction must equal 1');
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Operating characteristic for a single drift θ (the expected final z-statistic).
 * At θ = 0 the reject probability is the type I error; at the design drift it is
 * the power.
 */
export function computeOperatingCharacteristic(
  boundaries: GroupSequentialBoundaries,
  drift: number,
  options: GridOptions = {},
): OperatingCharacteristic {
  validateBoundaries(boundaries);
  const grid = {
    step: options.step ?? DEFAULT_STEP,
    halfWidth: options.halfWidth ?? DEFAULT_HALF_WIDTH,
  };
  const r = recurse(
    boundaries.informationFractions,
    boundaries.efficacyBoundaries,
    boundaries.futilityBoundaries,
    drift,
    grid,
  );
  return toOperatingCharacteristic(drift, boundaries, r);
}

/**
 * Solve the efficacy boundaries for an alpha-spending design *exactly*. Unlike
 * the common z_{1−α_k/2} approximation, this accounts for the correlation
 * between sequential looks: at each look the boundary is chosen so the
 * incremental probability of a first efficacy crossing under H0 equals the
 * incremental alpha to be spent. The result therefore controls the type I error
 * at exactly `alpha` (one-sided) to grid resolution.
 */
export function solveSpendingBoundaries(
  informationFractions: number[],
  alpha: number,
  spendingFunction: SpendingFunction,
  options: GridOptions = {},
): BoundarySolveResult {
  if (!(alpha > 0 && alpha < 0.5)) throw new Error('alpha must be in (0, 0.5)');
  validateBoundaries({
    informationFractions,
    efficacyBoundaries: informationFractions.map(() => 0),
  });

  const grid = {
    step: options.step ?? DEFAULT_STEP,
    halfWidth: options.halfWidth ?? DEFAULT_HALF_WIDTH,
  };
  const K = informationFractions.length;
  const cumulativeAlpha = informationFractions.map(t => alphaSpent(t, alpha, spendingFunction));
  const incrementalAlpha = cumulativeAlpha.map((a, i) =>
    Math.max(0, a - (i > 0 ? cumulativeAlpha[i - 1] : 0)),
  );

  // March the null (drift = 0) recursion, solving each boundary against the
  // density of S_k that has not yet crossed an earlier (solved) boundary.
  const { step, halfWidth } = grid;
  const lo = -halfWidth;
  const hi = halfWidth;
  const M = Math.max(2, Math.round((hi - lo) / step) + 1);
  const s = new Float64Array(M);
  for (let i = 0; i < M; i++) s[i] = lo + i * step;

  let p = new Float64Array(M);
  const efficacyBoundaries: number[] = [];
  let prevI = 0;

  for (let k = 0; k < K; k++) {
    const Ik = informationFractions[k];
    const dI = Ik - prevI;
    const sdInc = Math.sqrt(dI);

    if (k === 0) {
      for (let i = 0; i < M; i++) p[i] = normalPdf(s[i] / sdInc) / sdInc;
    } else {
      const q = new Float64Array(M);
      for (let j = 0; j < M; j++) {
        const pj = p[j];
        if (pj === 0) continue;
        const w = pj * step;
        for (let i = 0; i < M; i++) {
          q[i] += w * (normalPdf((s[i] - s[j]) / sdInc) / sdInc);
        }
      }
      p = q;
    }

    const sqrtIk = Math.sqrt(Ik);
    const target = incrementalAlpha[k];

    // Tail mass above a score threshold u, given the current density p
    // (partial-cell weighted to match the recursion's integration exactly).
    const tailMass = (u: number): number => {
      let m = 0;
      for (let i = 0; i < M; i++) {
        if (p[i] === 0) continue;
        m += p[i] * fracAbove(u, s[i], step);
      }
      return m * step;
    };

    // Bisect on the z-boundary b so that tailMass(b·√I_k) = target.
    let bLow = 0;
    let bHigh = 10;
    if (target <= 0) {
      // Nothing to spend at this look: an effectively infinite boundary.
      efficacyBoundaries.push(bHigh);
    } else {
      for (let iter = 0; iter < 80; iter++) {
        const bMid = 0.5 * (bLow + bHigh);
        const mass = tailMass(bMid * sqrtIk);
        if (mass > target) bLow = bMid;
        else bHigh = bMid;
      }
      efficacyBoundaries.push(0.5 * (bLow + bHigh));
    }

    // Truncate p above the solved boundary for the next look's recursion
    // (partial-cell weighted, consistent with tailMass above).
    const uK = efficacyBoundaries[k] * sqrtIk;
    if (k < K - 1) {
      const cont = new Float64Array(M);
      for (let i = 0; i < M; i++) {
        if (p[i] === 0) continue;
        cont[i] = p[i] * (1 - fracAbove(uK, s[i], step));
      }
      p = cont;
    }
    prevI = Ik;
  }

  return {
    informationFractions,
    efficacyBoundaries,
    cumulativeAlpha,
    incrementalAlpha,
    spendingFunction,
    alpha,
  };
}

export interface OperatingCharacteristicsTable {
  boundaries: GroupSequentialBoundaries;
  /** OC for each drift in the requested grid. */
  characteristics: OperatingCharacteristic[];
  /** Type I error (reject probability at drift = 0), for convenience. */
  typeIError: number;
  provenance: StatsProvenance;
}

/**
 * Full operating-characteristics table over a grid of drift values. Deterministic.
 */
export function operatingCharacteristics(
  boundaries: GroupSequentialBoundaries,
  driftGrid: number[],
  options: GridOptions = {},
): OperatingCharacteristicsTable {
  validateBoundaries(boundaries);
  const characteristics = driftGrid.map(d =>
    computeOperatingCharacteristic(boundaries, d, options),
  );
  const nullOC =
    characteristics.find(c => c.drift === 0) ??
    computeOperatingCharacteristic(boundaries, 0, options);

  const inputs = { boundaries, driftGrid, options };
  return {
    boundaries,
    characteristics,
    typeIError: nullOC.rejectProbability,
    provenance: buildProvenance({
      method: 'group-sequential-oc:operatingCharacteristics',
      seed: seedFromObject(inputs),
      inputs,
      note: 'Exact recursive computation; deterministic (no Monte Carlo). Reproduces given the same design and grid.',
    }),
  };
}

export interface PriorNode {
  drift: number;
  weight: number;
}

/**
 * Discretize a normal prior on the drift θ ~ N(mean, sd²) into weighted nodes
 * over [mean − 5·sd, mean + 5·sd]. Deterministic; weights sum to 1.
 */
export function discretizeNormalPrior(mean: number, sd: number, nNodes = 25): PriorNode[] {
  if (!(sd > 0)) return [{ drift: mean, weight: 1 }];
  const lo = mean - 5 * sd;
  const hi = mean + 5 * sd;
  const nodes: PriorNode[] = [];
  let total = 0;
  for (let i = 0; i < nNodes; i++) {
    const x = nNodes === 1 ? mean : lo + ((hi - lo) * i) / (nNodes - 1);
    const w = normalPdf((x - mean) / sd);
    nodes.push({ drift: x, weight: w });
    total += w;
  }
  for (const n of nodes) n.weight /= total;
  return nodes;
}

export interface AssuranceResult {
  /** Prior-averaged probability of rejecting H0 (assurance / expected power). */
  assurance: number;
  /** Prior-averaged probability of stopping for futility. */
  expectedFutilityStopProbability: number;
  /** Prior-averaged expected information fraction at stop. */
  expectedInformationFraction: number;
  /** Prior-averaged probability the trial first stops at each look. */
  stopProbabilityByLook: number[];
  nodes: number;
  provenance: StatsProvenance;
}

/**
 * Assurance and prior-averaged operating characteristics: integrate the OC over
 * a prior on the drift. Deterministic given the prior nodes.
 */
export function assurance(
  boundaries: GroupSequentialBoundaries,
  prior: PriorNode[],
  options: GridOptions = {},
): AssuranceResult {
  validateBoundaries(boundaries);
  if (prior.length === 0) throw new Error('prior must have at least one node');

  const K = boundaries.informationFractions.length;
  let assuranceVal = 0;
  let futility = 0;
  let info = 0;
  const stopByLook = new Array<number>(K).fill(0);
  let weightSum = 0;

  for (const node of prior) {
    const oc = computeOperatingCharacteristic(boundaries, node.drift, options);
    const w = node.weight;
    weightSum += w;
    assuranceVal += w * oc.rejectProbability;
    futility += w * oc.futilityStopProbability;
    info += w * oc.expectedInformationFraction;
    for (let k = 0; k < K; k++) stopByLook[k] += w * oc.perLook[k].stopProbability;
  }

  // Normalize defensively in case caller-supplied weights do not sum to 1.
  const z = weightSum || 1;
  const inputs = { boundaries, prior, options };
  return {
    assurance: assuranceVal / z,
    expectedFutilityStopProbability: futility / z,
    expectedInformationFraction: info / z,
    stopProbabilityByLook: stopByLook.map(v => v / z),
    nodes: prior.length,
    provenance: buildProvenance({
      method: 'group-sequential-oc:assurance',
      seed: seedFromObject(inputs),
      inputs,
      note: 'Prior-averaged exact OC; deterministic given the prior nodes.',
    }),
  };
}

// ---------------------------------------------------------------------------
// Mapping helpers (design ⇄ drift)
// ---------------------------------------------------------------------------

/**
 * Drift for a two-sample comparison of means: θ = δ · √(n_perArm / 2), where δ
 * is the standardized effect (mean difference / SD) and n_perArm is the per-arm
 * sample size at the final analysis. This is the expected final z-statistic.
 */
export function driftForTwoSampleMeans(standardizedEffect: number, nPerArm: number): number {
  return standardizedEffect * Math.sqrt(nPerArm / 2);
}

/** Expected sample size = expected information fraction × maximum sample size. */
export function expectedSampleSize(expectedInformationFraction: number, maxSampleSize: number): number {
  return expectedInformationFraction * maxSampleSize;
}
