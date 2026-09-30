/**
 * BOIN — Bayesian Optimal Interval design for phase 1 dose finding
 * (Liu & Yuan 2015).
 *
 * BOIN escalates/de-escalates by comparing the observed DLT rate at the current
 * dose with two optimal boundaries λ_e (escalation) and λ_d (de-escalation)
 * derived to minimize incorrect decisions:
 *
 *   λ_e = ln((1−φ1)/(1−φ)) / ln( φ(1−φ1) / (φ1(1−φ)) )
 *   λ_d = ln((1−φ)/(1−φ2)) / ln( φ2(1−φ) / (φ(1−φ2)) )
 *
 * with target toxicity φ and the neighbourhood (φ1, φ2) = (0.6φ, 1.4φ) by
 * default. These reproduce the published BOIN tables (e.g. φ=0.3 ⇒ λ_e=0.236,
 * λ_d=0.358). A dose is also eliminated for safety when the posterior
 * probability that its toxicity exceeds φ is high (Beta–Binomial).
 *
 * This is the correct optimal-boundary implementation (the existing heuristic in
 * foresight-ai-engine uses fixed 0.6×/1.4× *target* as the boundaries, which is
 * not the BOIN rule). MTD selection at the end uses isotonic regression.
 *
 * Pure and deterministic.
 */

import { betaRegularized } from './special';

/** The elimination rule's prior on the dose's toxicity: Beta(α, β). Fixed; no caller sets it. */
const ELIMINATION_PRIOR = { alpha: 1, beta: 1 } as const;

/**
 * Every default this engine applies, as one constant (Liu & Yuan 2015; Yuan et
 * al. 2016). Exported so a consumer that prints a default prints the engine's
 * own value instead of a copy of it.
 *  - `phi1Ratio` / `phi2Ratio`: the neighbourhood φ1 = 0.6φ and φ2 = 1.4φ,
 *    applied by `boinBoundaries` (and everything built on it) when φ1/φ2 are absent;
 *  - `eliminationThreshold`: `boinDecision` eliminates a dose when the posterior
 *    P(p > φ | data) exceeds it;
 *  - `minEliminationN`: `boinDecision` eliminates no dose with fewer patients;
 *  - `priorAlpha` / `priorBeta` / `prior`: the Beta(1,1) prior of that
 *    posterior. It is fixed: `boinDecision` takes no prior argument.
 */
export const BOIN_DEFAULTS = Object.freeze({
  phi1Ratio: 0.6,
  phi2Ratio: 1.4,
  eliminationThreshold: 0.95,
  minEliminationN: 3,
  priorAlpha: ELIMINATION_PRIOR.alpha,
  priorBeta: ELIMINATION_PRIOR.beta,
  prior: `Beta(${ELIMINATION_PRIOR.alpha},${ELIMINATION_PRIOR.beta})`,
} as const);

export interface BoinBoundaries {
  lambdaE: number;
  lambdaD: number;
  target: number;
  phi1: number;
  phi2: number;
}

/** BOIN escalation/de-escalation boundaries for target toxicity `target`. */
export function boinBoundaries(target: number, phi1?: number, phi2?: number): BoinBoundaries {
  if (!(target > 0 && target < 1)) throw new Error('target must be in (0, 1)');
  const p1 = phi1 ?? BOIN_DEFAULTS.phi1Ratio * target;
  const p2 = phi2 ?? BOIN_DEFAULTS.phi2Ratio * target;
  if (!(p1 < target && target < p2 && p2 < 1)) {
    throw new Error('require phi1 < target < phi2 < 1');
  }
  const lambdaE =
    Math.log((1 - p1) / (1 - target)) /
    Math.log((target * (1 - p1)) / (p1 * (1 - target)));
  const lambdaD =
    Math.log((1 - target) / (1 - p2)) /
    Math.log((p2 * (1 - target)) / (target * (1 - p2)));
  return { lambdaE, lambdaD, target, phi1: p1, phi2: p2 };
}

export type DoseDecision = 'escalate' | 'stay' | 'deescalate' | 'eliminate';

export interface BoinDecisionResult {
  decision: DoseDecision;
  observedRate: number;
  lambdaE: number;
  lambdaD: number;
  /** Posterior P(toxicity > target | data) used for the elimination rule. */
  posteriorExceedance: number;
  eliminated: boolean;
  /** φ1 / φ2 the boundaries were computed from: the caller's, or the engine default ({@link BOIN_DEFAULTS}). */
  phi1: number;
  phi2: number;
  /** The elimination threshold applied: the caller's, or {@link BOIN_DEFAULTS}.eliminationThreshold. */
  eliminationThreshold: number;
  /** The minimum n for elimination applied: the caller's, or {@link BOIN_DEFAULTS}.minEliminationN. */
  minEliminationN: number;
  /** The fixed prior of the elimination posterior ({@link BOIN_DEFAULTS}.prior). */
  prior: string;
}

/**
 * BOIN decision at the current dose given `nDlt` DLTs in `nPatients`. Safety
 * elimination (de-escalate + remove this dose and higher) triggers when the
 * posterior P(p > target) exceeds `eliminationThreshold` with at least
 * `minEliminationN` patients (Beta(1,1) prior). Every value applied — the
 * caller's or {@link BOIN_DEFAULTS} — is returned with the decision.
 */
export function boinDecision(args: {
  nPatients: number;
  nDlt: number;
  target: number;
  phi1?: number;
  phi2?: number;
  eliminationThreshold?: number;
  minEliminationN?: number;
}): BoinDecisionResult {
  const { nPatients, nDlt, target } = args;
  if (!Number.isInteger(nPatients) || nPatients <= 0) throw new Error('nPatients must be a positive integer');
  if (!Number.isInteger(nDlt) || nDlt < 0 || nDlt > nPatients) throw new Error('nDlt must be in [0, nPatients]');
  const { lambdaE, lambdaD, phi1, phi2 } = boinBoundaries(target, args.phi1, args.phi2);
  const elimThreshold = args.eliminationThreshold ?? BOIN_DEFAULTS.eliminationThreshold;
  const minElimN = args.minEliminationN ?? BOIN_DEFAULTS.minEliminationN;

  // Posterior P(p > target | data) under Beta(α,β) = Beta(1,1): Beta(α+x, β+n-x).
  const posteriorExceedance =
    1 - betaRegularized(target, BOIN_DEFAULTS.priorAlpha + nDlt, BOIN_DEFAULTS.priorBeta + nPatients - nDlt);
  const eliminated = nPatients >= minElimN && posteriorExceedance > elimThreshold;

  const observedRate = nDlt / nPatients;
  let decision: DoseDecision;
  if (eliminated) decision = 'eliminate';
  else if (observedRate <= lambdaE) decision = 'escalate';
  else if (observedRate >= lambdaD) decision = 'deescalate';
  else decision = 'stay';

  return {
    decision, observedRate, lambdaE, lambdaD, posteriorExceedance, eliminated,
    phi1, phi2, eliminationThreshold: elimThreshold, minEliminationN: minElimN, prior: BOIN_DEFAULTS.prior,
  };
}

/**
 * BOIN decision-boundary table: for each cohort size n, the largest DLT count
 * that still escalates and the smallest that de-escalates. (Escalate if x ≤
 * floor(λ_e·n); de-escalate if x ≥ ceil(λ_d·n).)
 */
export function boinDecisionTable(
  target: number,
  cohortSizes: number[],
  phi1?: number,
  phi2?: number,
): Array<{ n: number; escalateIfAtMost: number; deescalateIfAtLeast: number }> {
  const { lambdaE, lambdaD } = boinBoundaries(target, phi1, phi2);
  return cohortSizes.map(n => ({
    n,
    escalateIfAtMost: Math.floor(lambdaE * n),
    deescalateIfAtLeast: Math.ceil(lambdaD * n),
  }));
}

/**
 * Pool-adjacent-violators isotonic regression: the monotone non-decreasing fit
 * to `y` (weighted by `w`) minimizing weighted squared error.
 */
export function isotonicRegression(y: number[], w: number[]): number[] {
  const n = y.length;
  const values = y.slice();
  const weights = w.slice();
  // Sequential PAVA: maintain a stack of pooled blocks (level, weight, count).
  const level: number[] = [];
  const lw: number[] = [];
  const count: number[] = [];
  for (let i = 0; i < n; i++) {
    let v = values[i];
    let weight = weights[i];
    let c = 1;
    while (level.length > 0 && level[level.length - 1] >= v) {
      const pv = level.pop()!;
      const pw = lw.pop()!;
      const pc = count.pop()!;
      v = (v * weight + pv * pw) / (weight + pw);
      weight += pw;
      c += pc;
    }
    level.push(v);
    lw.push(weight);
    count.push(c);
  }
  // Expand back to per-element fitted values.
  const out: number[] = [];
  for (let b = 0; b < level.length; b++) {
    for (let k = 0; k < count[b]; k++) out.push(level[b]);
  }
  return out;
}

export interface DoseLevelData {
  /** Patients treated at this dose. */
  nPatients: number;
  /** DLTs observed at this dose. */
  nDlt: number;
  /** Whether the dose has been eliminated for safety. */
  eliminated?: boolean;
}

export interface MtdSelection {
  mtdIndex: number | null;
  isotonicRates: number[];
  target: number;
  /**
   * The lowest dose flagged `eliminated`, or null when none is. BOIN
   * elimination removes that dose and every higher one, so no dose at or above
   * this index is eligible; when it is 0 the trial stopped for safety and
   * `mtdIndex` is null.
   */
  lowestEliminatedIndex: number | null;
}

/**
 * Select the MTD as the dose whose isotonic-regression-smoothed toxicity is
 * closest to the target, among tried doses below the lowest eliminated dose
 * (Liu & Yuan 2015: eliminating a dose eliminates every higher dose too, so a
 * higher dose without its own flag is still out). Ties above target resolve to
 * the lower dose, ties below to the higher dose (BOIN convention). The
 * isotonic fit itself is over every dose as given.
 */
export function selectMtd(doses: DoseLevelData[], target: number): MtdSelection {
  const firstEliminated = doses.findIndex(d => d.eliminated);
  const lowestEliminatedIndex = firstEliminated === -1 ? null : firstEliminated;
  const ceiling = lowestEliminatedIndex ?? doses.length;
  const tried = doses.map((d, i) => d.nPatients > 0 && i < ceiling);
  const rates = doses.map(d => (d.nPatients > 0 ? d.nDlt / d.nPatients : 0));
  const weights = doses.map(d => Math.max(d.nPatients, 1e-9));
  const iso = isotonicRegression(rates, weights);

  let best: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < doses.length; i++) {
    if (!tried[i]) continue;
    const dist = Math.abs(iso[i] - target);
    // Prefer closer; on a near-tie prefer the dose on the correct side of target.
    if (dist < bestDist - 1e-12) {
      bestDist = dist;
      best = i;
    } else if (Math.abs(dist - bestDist) <= 1e-12 && best !== null) {
      const curAbove = iso[best] > target;
      const newAbove = iso[i] > target;
      if (curAbove && !newAbove) best = i; // below-target preferred over above
      else if (curAbove === newAbove && !newAbove) best = i; // both below ⇒ higher dose
    }
  }
  return { mtdIndex: best, isotonicRates: iso, target, lowestEliminatedIndex };
}
