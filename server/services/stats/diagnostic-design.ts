/**
 * Diagnostic / IVD performance-study design (the MDX device pack, proportion
 * paths).
 *
 * Covers the sizing that FDA diagnostic submissions and the IVDR
 * performance-evaluation path (clinical performance: sensitivity / specificity
 * against a performance goal) actually require:
 *
 *   - single-proportion sizing against a performance goal, by both the normal
 *     approximation and an exact binomial search (the exact path is what governs
 *     the small disease-positive counts typical of rare-marker IVDs);
 *   - co-primary sensitivity AND specificity sizing, where both endpoints must
 *     succeed, translated through prevalence into a total enrollment;
 *   - exact Clopper–Pearson intervals for reporting observed performance.
 *
 * Multireader (MRMC) reader-study sizing is a separate follow-up; it is not
 * included here so that every number this module returns is checkable against a
 * closed-form reference.
 *
 * Pure and deterministic.
 */

import { normalCdf, normalQuantile } from './normal';
import { binomialTailGE, clopperPearsonInterval } from './special';
import { buildProvenance, type StatsProvenance } from './computation-provenance';

export interface SingleProportionSizingArgs {
  /** Performance goal under the null (e.g. minimum acceptable sensitivity). */
  goal: number;
  /** Expected (true) performance under the alternative; must exceed `goal`. */
  expected: number;
  /** One-sided type I error. Default 0.025. */
  alpha?: number;
  /** Target power. Default 0.9. */
  power?: number;
  /** Cap on the exact-search sample size. Default 5000. */
  maxN?: number;
}

export interface SingleProportionSizingResult {
  /** Sample size from the normal approximation. */
  nNormalApprox: number;
  /** Smallest n whose exact binomial power meets the target. */
  nExact: number;
  /** Critical number of successes at nExact (reject H0 if observed ≥ this). */
  criticalCount: number;
  /** Exact binomial power achieved at nExact. */
  exactPower: number;
  /** Actual one-sided type I error of the exact test at nExact (≤ alpha). */
  exactAlpha: number;
  goal: number;
  expected: number;
  alpha: number;
  power: number;
}

/** Smallest rejection count c such that the exact one-sided level ≤ alpha. */
function exactCriticalCount(n: number, goal: number, alpha: number): number {
  for (let c = 1; c <= n; c++) {
    if (binomialTailGE(c, n, goal) <= alpha) return c;
  }
  return n + 1; // unattainable at this n
}

/**
 * Size a single-proportion test of H0: p ≤ goal vs H1: p = expected (one-sided).
 * Returns both the normal-approximation n and the exact binomial n.
 */
export function sizeSingleProportion(
  args: SingleProportionSizingArgs,
): SingleProportionSizingResult {
  const alpha = args.alpha ?? 0.025;
  const power = args.power ?? 0.9;
  const maxN = args.maxN ?? 5000;
  const { goal, expected } = args;
  if (!(goal > 0 && goal < 1) || !(expected > 0 && expected < 1)) {
    throw new Error('goal and expected must be in (0, 1)');
  }
  if (expected <= goal) throw new Error('expected must exceed goal for a one-sided gain');

  const zA = normalQuantile(1 - alpha);
  const zB = normalQuantile(power);
  const numer = zA * Math.sqrt(goal * (1 - goal)) + zB * Math.sqrt(expected * (1 - expected));
  const nNormalApprox = Math.ceil((numer * numer) / Math.pow(expected - goal, 2));

  // Exact: increase n until the exact binomial power reaches the target.
  let nExact = 0;
  let criticalCount = 0;
  let exactPower = 0;
  let exactAlpha = 0;
  for (let n = 1; n <= maxN; n++) {
    const c = exactCriticalCount(n, goal, alpha);
    if (c > n) continue; // alpha not yet attainable
    const pw = binomialTailGE(c, n, expected);
    if (pw >= power) {
      nExact = n;
      criticalCount = c;
      exactPower = pw;
      exactAlpha = binomialTailGE(c, n, goal);
      break;
    }
  }
  if (nExact === 0) throw new Error(`exact power ${power} not reached within maxN=${maxN}`);

  return {
    nNormalApprox,
    nExact,
    criticalCount,
    exactPower,
    exactAlpha,
    goal,
    expected,
    alpha,
    power,
  };
}

export interface CoPrimaryArgs {
  sensitivityGoal: number;
  sensitivityExpected: number;
  specificityGoal: number;
  specificityExpected: number;
  /** Disease prevalence in the intended-use population, in (0, 1). */
  prevalence: number;
  /** One-sided type I error per endpoint. Default 0.025. */
  alpha?: number;
  /** Per-endpoint (marginal) target power. Default 0.9. */
  power?: number;
  /**
   * If set, raise each endpoint's marginal power to √jointPowerTarget so that
   * the probability of BOTH co-primary endpoints succeeding is ≥ this value
   * (the two tests are independent — disjoint diseased / non-diseased subjects).
   */
  jointPowerTarget?: number;
  maxN?: number;
}

export interface CoPrimaryResult {
  nDiseased: number;
  nNonDiseased: number;
  /** Total enrollment so that, in expectation, both subgroup sizes are met. */
  nTotal: number;
  sensitivity: SingleProportionSizingResult;
  specificity: SingleProportionSizingResult;
  /** Probability both co-primary endpoints succeed (product of exact powers). */
  jointPower: number;
  prevalence: number;
  provenance: StatsProvenance;
}

/**
 * Size a co-primary sensitivity-and-specificity study. Sensitivity is estimated
 * on diseased subjects and specificity on non-diseased subjects (disjoint
 * groups, hence independent tests), so the trial succeeds only if both reject
 * — the joint power is the product. Total enrollment is derived from prevalence.
 */
export function sizeCoPrimarySensSpec(args: CoPrimaryArgs): CoPrimaryResult {
  const alpha = args.alpha ?? 0.025;
  let power = args.power ?? 0.9;
  if (!(args.prevalence > 0 && args.prevalence < 1)) {
    throw new Error('prevalence must be in (0, 1)');
  }
  if (args.jointPowerTarget !== undefined) {
    if (!(args.jointPowerTarget > 0 && args.jointPowerTarget < 1)) {
      throw new Error('jointPowerTarget must be in (0, 1)');
    }
    power = Math.sqrt(args.jointPowerTarget);
  }

  const common = { alpha, power, maxN: args.maxN };
  const sensitivity = sizeSingleProportion({
    goal: args.sensitivityGoal,
    expected: args.sensitivityExpected,
    ...common,
  });
  const specificity = sizeSingleProportion({
    goal: args.specificityGoal,
    expected: args.specificityExpected,
    ...common,
  });

  const nDiseased = sensitivity.nExact;
  const nNonDiseased = specificity.nExact;
  // Enroll enough total subjects that, in expectation, both subgroups are filled.
  const nTotal = Math.max(
    Math.ceil(nDiseased / args.prevalence),
    Math.ceil(nNonDiseased / (1 - args.prevalence)),
  );
  const jointPower = sensitivity.exactPower * specificity.exactPower;

  const inputs = {
    sensitivityGoal: args.sensitivityGoal,
    sensitivityExpected: args.sensitivityExpected,
    specificityGoal: args.specificityGoal,
    specificityExpected: args.specificityExpected,
    prevalence: args.prevalence,
    alpha,
    power,
    jointPowerTarget: args.jointPowerTarget ?? null,
  };
  return {
    nDiseased,
    nNonDiseased,
    nTotal,
    sensitivity,
    specificity,
    jointPower,
    prevalence: args.prevalence,
    provenance: buildProvenance({
      method: 'diagnostic:coPrimarySensSpec',
      seed: 0,
      inputs,
      note: 'Deterministic exact binomial sizing; reproduces given the same goals, prevalence and error rates.',
    }),
  };
}

/** Exact Clopper–Pearson interval and the point estimate for observed performance. */
export function performanceInterval(
  successes: number,
  n: number,
  conf = 0.95,
): { estimate: number; lower: number; upper: number } {
  const { lower, upper } = clopperPearsonInterval(successes, n, conf);
  return { estimate: n > 0 ? successes / n : 0, lower, upper };
}

/** Normal-approximation power of a single-proportion test, for cross-checking. */
export function normalApproxPower(
  n: number,
  goal: number,
  expected: number,
  alpha = 0.025,
): number {
  const zA = normalQuantile(1 - alpha);
  const se0 = Math.sqrt((goal * (1 - goal)) / n);
  const se1 = Math.sqrt((expected * (1 - expected)) / n);
  return normalCdf((expected - goal - zA * se0) / se1);
}
