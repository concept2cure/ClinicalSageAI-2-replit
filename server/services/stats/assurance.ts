/**
 * Bayesian assurance (a.k.a. probability of success).
 *
 * Assurance is the unconditional probability that a trial will succeed, obtained
 * by averaging the (frequentist) power over a prior distribution on the
 * treatment effect:  assurance = ∫ power(θ) · π(θ) dθ  (O'Hagan, Stevens &
 * Campbell 2005). Unlike power — which is conditional on a single assumed effect
 * — assurance reflects genuine uncertainty about the effect and is bounded well
 * away from 1 even for a "well-powered" design when the prior is diffuse.
 *
 * This module is pure and deterministic for the quadrature path. It decouples
 * the averaging (`assurance`) from the power function, ships a closed-form power
 * for the common two-sample designs, and provides a seeded Monte Carlo estimator
 * (`assuranceMonteCarloTwoSampleMeans`) so the quadrature result can be checked
 * against simulation — the GA acceptance bar for this workstream.
 */

import { normalCdf, normalQuantile } from './normal';
import { createRng, seedFromObject } from './rng';
import { buildProvenance, type StatsProvenance } from './computation-provenance';

export interface PriorNode {
  /** A sampled value of the treatment effect. */
  value: number;
  /** The prior weight on this value; weights are normalized to sum to 1. */
  weight: number;
}

/**
 * Discretize a normal prior N(mean, sd²) into weighted nodes over
 * [mean − 5·sd, mean + 5·sd]. Deterministic; weights sum to 1. A non-positive sd
 * collapses to a single point mass at the mean.
 */
export function discretizeNormalPrior(mean: number, sd: number, nNodes = 33): PriorNode[] {
  if (!(sd > 0) || nNodes <= 1) return [{ value: mean, weight: 1 }];
  const lo = mean - 5 * sd;
  const hi = mean + 5 * sd;
  const nodes: PriorNode[] = [];
  let total = 0;
  for (let i = 0; i < nNodes; i++) {
    const x = lo + ((hi - lo) * i) / (nNodes - 1);
    // Weight ∝ normal density (the √(2π)·sd constant cancels in normalization).
    const w = Math.exp(-0.5 * Math.pow((x - mean) / sd, 2));
    nodes.push({ value: x, weight: w });
    total += w;
  }
  for (const n of nodes) n.weight /= total;
  return nodes;
}

/**
 * Assurance = prior-weighted average of a power function. Pure: deterministic
 * given the power function and the prior nodes. Weights are normalized
 * defensively in case the caller's weights do not sum to exactly 1.
 */
export function assurance(powerFunction: (effect: number) => number, prior: PriorNode[]): number {
  if (prior.length === 0) throw new Error('prior must have at least one node');
  let acc = 0;
  let weightSum = 0;
  for (const node of prior) {
    acc += node.weight * powerFunction(node.value);
    weightSum += node.weight;
  }
  return acc / (weightSum || 1);
}

/** Critical z value for a one- or two-sided test at level alpha. */
function criticalZ(alpha: number, oneSided: boolean): number {
  return oneSided ? normalQuantile(1 - alpha) : normalQuantile(1 - alpha / 2);
}

/**
 * Power of a two-sample test of means for a standardized effect δ = (μ₁−μ₀)/σ,
 * with `nPerArm` subjects per arm and equal allocation. Uses the normal
 * approximation power = Φ(δ·√(nPerArm/2) − z_crit) (upper rejection only; for a
 * two-sided test the opposite-tail contribution is negligible for δ > 0).
 */
export function powerTwoSampleMeans(
  standardizedEffect: number,
  nPerArm: number,
  alpha = 0.025,
  oneSided = true,
): number {
  if (nPerArm <= 0) return 0;
  const zCrit = criticalZ(alpha, oneSided);
  const ncp = standardizedEffect * Math.sqrt(nPerArm / 2);
  return normalCdf(ncp - zCrit);
}

export interface AssuranceMeansArgs {
  /** Prior mean of the standardized effect δ. */
  priorMean: number;
  /** Prior SD of δ (uncertainty about the effect). 0 ⇒ assurance equals power. */
  priorSd: number;
  nPerArm: number;
  alpha?: number;
  oneSided?: boolean;
  nNodes?: number;
}

export interface AssuranceResult {
  assurance: number;
  /** Power evaluated at the prior mean, for comparison (the naive "design power"). */
  powerAtPriorMean: number;
  priorMean: number;
  priorSd: number;
  nPerArm: number;
  alpha: number;
  oneSided: boolean;
  nNodes: number;
  provenance: StatsProvenance;
}

/**
 * Assurance for a two-sample means design with a normal prior on the
 * standardized effect. Deterministic (Gaussian quadrature over the prior grid).
 */
export function assuranceTwoSampleMeans(args: AssuranceMeansArgs): AssuranceResult {
  const alpha = args.alpha ?? 0.025;
  const oneSided = args.oneSided ?? true;
  const nNodes = args.nNodes ?? 33;
  if (args.nPerArm <= 0) throw new Error('nPerArm must be positive');

  const prior = discretizeNormalPrior(args.priorMean, args.priorSd, nNodes);
  const powerFn = (delta: number) => powerTwoSampleMeans(delta, args.nPerArm, alpha, oneSided);
  const value = assurance(powerFn, prior);

  const inputs = {
    priorMean: args.priorMean,
    priorSd: args.priorSd,
    nPerArm: args.nPerArm,
    alpha,
    oneSided,
    nNodes,
  };
  return {
    assurance: value,
    powerAtPriorMean: powerFn(args.priorMean),
    priorMean: args.priorMean,
    priorSd: args.priorSd,
    nPerArm: args.nPerArm,
    alpha,
    oneSided,
    nNodes,
    provenance: buildProvenance({
      method: 'assurance:twoSampleMeans',
      seed: seedFromObject(inputs),
      inputs,
      note: 'Deterministic Gaussian quadrature over the prior; reproduces given the same prior and design.',
    }),
  };
}

export interface AssuranceMonteCarloResult {
  assurance: number;
  nSim: number;
  seed: number;
  provenance: StatsProvenance;
}

/**
 * Monte Carlo assurance for a two-sample means design: draw δ from the prior,
 * draw the trial's z-statistic ~ N(δ·√(n/2), 1), and count rejections. Seeded
 * and reproducible. This is the simulation the quadrature `assuranceTwoSampleMeans`
 * is validated against.
 */
export function assuranceMonteCarloTwoSampleMeans(
  args: AssuranceMeansArgs & { nSim?: number; seed?: number },
): AssuranceMonteCarloResult {
  const alpha = args.alpha ?? 0.025;
  const oneSided = args.oneSided ?? true;
  const nSim = args.nSim ?? 200_000;
  const zCrit = criticalZ(alpha, oneSided);
  const sqrtHalfN = Math.sqrt(args.nPerArm / 2);

  const inputs = {
    priorMean: args.priorMean,
    priorSd: args.priorSd,
    nPerArm: args.nPerArm,
    alpha,
    oneSided,
    nSim,
  };
  const seed = args.seed !== undefined && Number.isFinite(args.seed)
    ? Math.trunc(args.seed)
    : seedFromObject(inputs);
  const rng = createRng(seed);

  let successes = 0;
  for (let i = 0; i < nSim; i++) {
    const delta = args.priorSd > 0 ? rng.normal(args.priorMean, args.priorSd) : args.priorMean;
    const z = rng.normal(delta * sqrtHalfN, 1);
    if (z >= zCrit) successes++;
  }

  return {
    assurance: successes / nSim,
    nSim,
    seed,
    provenance: buildProvenance({
      method: 'assurance:twoSampleMeansMonteCarlo',
      seed,
      inputs,
      note: 'Monte Carlo assurance; reproduces given this seed and these inputs.',
    }),
  };
}
