/**
 * Bayesian device-pivotal design templates (binary endpoint).
 *
 * The Bayesian path that FDA's medical-device guidance (Guidance for the Use of
 * Bayesian Statistics in Medical Device Clinical Trials, 2010) supports: a
 * single-arm pivotal trial that declares success when the posterior probability
 * that the true rate exceeds a performance goal is at least a threshold,
 *
 *     P(θ > performanceGoal | data) ≥ successThreshold,
 *
 * with a Beta(α, β) prior (optionally informative, e.g. encoding borrowed
 * historical information). Because the Beta–Binomial is conjugate, everything
 * here is exact and reference-checkable:
 *
 *   - posterior exceedance, mean, and equal-tailed credible interval;
 *   - the Bayesian decision rule reduces to a critical success count x*, so the
 *     exact operating characteristics (type I at the goal, power at the expected
 *     rate) follow from the binomial tail;
 *   - sample size by exact search;
 *   - interim predictive probability of success via the Beta–Binomial predictive.
 *
 * Pure and deterministic. No fabrication: the OC and predictive probabilities
 * are exact, not simulated approximations.
 */

import { betaRegularized, betaQuantile, binomialTailGE, gammaln } from './special';
import { buildProvenance, type StatsProvenance } from './computation-provenance';

export interface BetaPrior {
  alpha: number;
  beta: number;
}

/** Uniform Beta(1,1) — the default non-informative prior. */
export const UNIFORM_PRIOR: BetaPrior = { alpha: 1, beta: 1 };

/**
 * Encode borrowed historical data as a power prior: a0 ∈ [0,1] fraction of
 * `histSuccesses`/`histFailures` added to a base prior. a0=1 is full borrowing.
 */
export function powerPriorFromHistory(
  histSuccesses: number,
  histFailures: number,
  a0: number,
  base: BetaPrior = UNIFORM_PRIOR,
): BetaPrior {
  if (!(a0 >= 0 && a0 <= 1)) throw new Error('a0 must be in [0, 1]');
  return { alpha: base.alpha + a0 * histSuccesses, beta: base.beta + a0 * histFailures };
}

function validate(x: number, n: number): void {
  if (!Number.isInteger(n) || n < 0) throw new Error('n must be a non-negative integer');
  if (!Number.isInteger(x) || x < 0 || x > n) throw new Error('x must be an integer in [0, n]');
}

/** Posterior probability P(θ > goal | x of n) under a Beta prior. */
export function posteriorExceedance(x: number, n: number, goal: number, prior: BetaPrior): number {
  validate(x, n);
  if (!(goal > 0 && goal < 1)) throw new Error('goal must be in (0, 1)');
  // Posterior is Beta(alpha+x, beta+n-x); P(θ > goal) = 1 - I_goal(·).
  return 1 - betaRegularized(goal, prior.alpha + x, prior.beta + n - x);
}

export interface PosteriorSummary {
  mean: number;
  lower: number;
  upper: number;
  credLevel: number;
}

/** Posterior mean and equal-tailed credible interval. */
export function posteriorSummary(
  x: number, n: number, prior: BetaPrior, credLevel = 0.95,
): PosteriorSummary {
  validate(x, n);
  const a = prior.alpha + x;
  const b = prior.beta + n - x;
  const tail = (1 - credLevel) / 2;
  return {
    mean: a / (a + b),
    lower: betaQuantile(tail, a, b),
    upper: betaQuantile(1 - tail, a, b),
    credLevel,
  };
}

/**
 * Smallest success count x* at which the Bayesian success criterion is met for a
 * trial of size n. Returns n+1 when even a perfect result cannot meet it.
 * Posterior exceedance is monotone increasing in x, so this is well-defined.
 */
export function minimalSuccessCount(
  n: number, goal: number, prior: BetaPrior, successThreshold: number,
): number {
  for (let x = 0; x <= n; x++) {
    if (posteriorExceedance(x, n, goal, prior) >= successThreshold) return x;
  }
  return n + 1;
}

export interface DeviceOC {
  /** Critical success count; the trial succeeds iff observed successes ≥ this. */
  criticalCount: number;
  /** P(success) at the true rate supplied. */
  probabilityOfSuccess: number;
  n: number;
  trueRate: number;
}

/**
 * Exact probability that the Bayesian rule declares success at a given true rate.
 * Use trueRate = goal for the type I error and trueRate = expected for power.
 */
export function deviceOperatingCharacteristic(args: {
  n: number;
  goal: number;
  prior: BetaPrior;
  successThreshold: number;
  trueRate: number;
}): DeviceOC {
  const xStar = minimalSuccessCount(args.n, args.goal, args.prior, args.successThreshold);
  const probabilityOfSuccess = xStar > args.n ? 0 : binomialTailGE(xStar, args.n, args.trueRate);
  return { criticalCount: xStar, probabilityOfSuccess, n: args.n, trueRate: args.trueRate };
}

export interface DeviceSampleSizeResult {
  n: number | null;
  criticalCount: number | null;
  power: number | null;
  typeIError: number | null;
  targetPower: number;
  goal: number;
  expected: number;
  successThreshold: number;
  searchedUpTo: number;
  provenance: StatsProvenance;
}

/**
 * Smallest n whose Bayesian rule attains `targetPower` at the `expected` rate
 * while holding the type I error at the goal ≤ `maxTypeI` (if given). Exact.
 */
export function deviceSampleSize(args: {
  goal: number;
  expected: number;
  prior?: BetaPrior;
  successThreshold: number;
  targetPower: number;
  maxTypeI?: number;
  maxN?: number;
}): DeviceSampleSizeResult {
  const prior = args.prior ?? UNIFORM_PRIOR;
  const maxN = args.maxN ?? 5000;
  if (args.expected <= args.goal) throw new Error('expected must exceed goal');
  if (!(args.targetPower > 0 && args.targetPower < 1)) throw new Error('targetPower must be in (0, 1)');

  let chosen: DeviceSampleSizeResult['n'] = null;
  let xStar: number | null = null;
  let power: number | null = null;
  let typeI: number | null = null;
  for (let n = 1; n <= maxN; n++) {
    const oc = deviceOperatingCharacteristic({
      n, goal: args.goal, prior, successThreshold: args.successThreshold, trueRate: args.expected,
    });
    if (oc.criticalCount > n) continue; // success unattainable at this n
    const t1 = binomialTailGE(oc.criticalCount, n, args.goal);
    if (args.maxTypeI !== undefined && t1 > args.maxTypeI) continue;
    if (oc.probabilityOfSuccess >= args.targetPower) {
      chosen = n; xStar = oc.criticalCount; power = oc.probabilityOfSuccess; typeI = t1;
      break;
    }
  }

  const inputs = {
    goal: args.goal, expected: args.expected, prior,
    successThreshold: args.successThreshold, targetPower: args.targetPower,
    maxTypeI: args.maxTypeI ?? null,
  };
  return {
    n: chosen,
    criticalCount: xStar,
    power,
    typeIError: typeI,
    targetPower: args.targetPower,
    goal: args.goal,
    expected: args.expected,
    successThreshold: args.successThreshold,
    searchedUpTo: chosen ?? maxN,
    provenance: buildProvenance({
      method: 'bayesianDevice:sampleSize',
      seed: 0,
      inputs,
      note: 'Exact Beta–Binomial Bayesian-rule sizing; deterministic.',
    }),
  };
}

/** Beta–Binomial pmf P(Y = y) for m trials with Beta(a, b). */
function betaBinomialPmf(y: number, m: number, a: number, b: number): number {
  // C(m,y) · B(a+y, b+m-y) / B(a, b), evaluated in logs.
  const logChoose = gammaln(m + 1) - gammaln(y + 1) - gammaln(m - y + 1);
  const logBetaNum = gammaln(a + y) + gammaln(b + m - y) - gammaln(a + b + m);
  const logBetaDen = gammaln(a) + gammaln(b) - gammaln(a + b);
  return Math.exp(logChoose + logBetaNum - logBetaDen);
}

export interface PredictiveProbabilityResult {
  predictiveProbabilityOfSuccess: number;
  criticalCount: number;
  nFinal: number;
  futurePatients: number;
}

/**
 * Interim predictive probability of trial success: given `xInterim` of
 * `nInterim` observed, the probability that the final success criterion at
 * `nFinal` will be met, averaging future outcomes over the current posterior
 * (Beta–Binomial predictive). Exact.
 */
export function predictiveProbabilityOfSuccess(args: {
  xInterim: number;
  nInterim: number;
  nFinal: number;
  goal: number;
  prior?: BetaPrior;
  successThreshold: number;
}): PredictiveProbabilityResult {
  validate(args.xInterim, args.nInterim);
  if (args.nFinal < args.nInterim) throw new Error('nFinal must be ≥ nInterim');
  const prior = args.prior ?? UNIFORM_PRIOR;
  const xStar = minimalSuccessCount(args.nFinal, args.goal, prior, args.successThreshold);
  const m = args.nFinal - args.nInterim;

  // Posterior after the interim, used as the predictive prior for future patients.
  const a = prior.alpha + args.xInterim;
  const b = prior.beta + args.nInterim - args.xInterim;
  // Need at least (xStar - xInterim) future successes.
  const yNeeded = xStar - args.xInterim;

  let ppos = 0;
  if (xStar > args.nFinal) {
    ppos = 0; // success unattainable
  } else if (yNeeded <= 0) {
    ppos = 1; // already met regardless of future outcomes
  } else {
    for (let y = yNeeded; y <= m; y++) ppos += betaBinomialPmf(y, m, a, b);
  }

  return {
    predictiveProbabilityOfSuccess: ppos,
    criticalCount: xStar,
    nFinal: args.nFinal,
    futurePatients: m,
  };
}
