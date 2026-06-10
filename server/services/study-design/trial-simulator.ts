/**
 * Trial-outcome simulator — seeded synthetic-twin Monte Carlo over a StudyDesign.
 *
 * Given the structured design (the slice-1 object) and an evidence-grounded prior on
 * the treatment effect, this runs many synthetic replicate trials ("twins"), each with
 * its own true effect drawn from the prior and its own simulated result under the
 * design's frame, margin, sample size, and alpha. The fraction of twins that meet the
 * success criterion is the probability of success (assurance) — an honest forecast that
 * integrates over genuine uncertainty about the effect, not a single optimistic point.
 *
 * Honesty is built in, not bolted on:
 *   • Reproducible. Every draw comes from the seeded engine in `../stats/rng`; the
 *     report carries a provenance record (seed + input hash) so any number reproduces.
 *   • Calibrated. The report includes the empirical type-I error from re-running the
 *     twins under the frame-appropriate null; a reviewer can see the test holds its size.
 *   • Grounded. The probability of success integrates over the evidence prior, so a
 *     diffuse or assumption-only prior yields an honestly un-confident number, and the
 *     assumptions ledger states exactly what was evidence and what was assumed.
 *   • Defensible. The slice-1 design gates run alongside; an indefensible design is
 *     flagged regardless of how good its simulated success looks.
 *   • No fabrication. With no effect evidence and no planned effect, it refuses to run
 *     rather than invent a number.
 *
 * It reuses the platform stats engine (`../stats/assurance` cross-validates the
 * continuous path; `../stats/rng`, `../stats/normal`, `../stats/computation-provenance`)
 * rather than reimplementing the mathematics. Pure and deterministic given a seed.
 *
 * Scope (this slice): two-arm parallel comparisons for continuous, binary, and
 * time-to-event primary endpoints under superiority, non-inferiority, and equivalence
 * frames. Single-arm/external-control designs and duration (enrollment/event) timeline
 * projection are explicitly not simulated here and are surfaced as caveats.
 *
 * @module server/services/study-design/trial-simulator
 */

import { Rng, createRng, seedFromObject } from '../stats/rng';
import { normalCdf, normalQuantile } from '../stats/normal';
import { buildProvenance, type StatsProvenance } from '../stats/computation-provenance';
import type { Endpoint, EndpointType, InferentialFrame, StudyDesign } from './study-design-types';
import { primaryEndpoints } from './study-design-types';
import { validateDesign } from './design-validation';
import type { EffectPrior } from './evidence-prior';

/** Inputs the simulator needs beyond the design itself. */
export interface SimulationAssumptions {
  /**
   * Prior on the *benefit-oriented* treatment effect: positive = benefit, on the
   * model's native scale (standardized mean difference for continuous, log odds ratio
   * for binary, log hazard-ratio reduction for time-to-event). Built by
   * {@link buildEffectPrior} from CSR/historical evidence.
   */
  effectPrior: EffectPrior;
  /** Number of synthetic-twin replicates. Default 5000. */
  nRuns?: number;
  /** Explicit seed for reproducibility; otherwise derived from a hash of the inputs. */
  seed?: number;
  /** Override per-arm sample size; otherwise derived from the design. */
  nPerArm?: number;
  /** Control-arm event proportion for binary/time-to-event endpoints, when known. */
  controlEventRate?: number;
  /** Overall event probability over follow-up for time-to-event endpoints, when known. */
  eventProbability?: number;
}

/** Median and 95% interval of a simulated quantity across the twins. */
export interface EstimateDistribution {
  median: number;
  lower: number;
  upper: number;
  /** Human-readable scale of the estimate, e.g. "standardized mean difference". */
  scale: string;
}

/** A single sensitivity point: probability of success at a fixed effect. */
export interface SensitivityPoint {
  effect: number;
  probabilityOfSuccess: number;
  /** Relation of this effect to the prior mean, for labeling (e.g. 0.5 = half). */
  fractionOfPrior: number;
}

/** The synthetic-twin operating characteristics. */
export interface SyntheticTwinSummary {
  /** Fraction of twins meeting the success criterion, integrating over the prior. */
  probabilityOfSuccess: number;
  /** Power evaluated at the prior mean (the naive single-point "design power"). */
  powerAtPriorMean: number;
  /** Distribution of the estimated effect across the twins. */
  estimatedEffect: EstimateDistribution;
  /** Empirical type-I error from re-running the twins under the frame-appropriate null. */
  typeIErrorUnderNull: number;
  /** Per-arm sample size actually simulated (after any dropout adjustment). */
  effectivePerArm: number;
  nRuns: number;
}

/** The honesty ledger: what was evidence and what was assumed. */
export interface AssumptionsLedger {
  effectBasis: EffectPrior['basis'];
  priorMean: number;
  priorSd: number;
  /** Distinct evidence sources behind the prior (empty ⇒ assumption-only). */
  evidenceSources: EffectPrior['sources'];
  /** Every caveat the reader must see. */
  caveats: string[];
}

/** Defensibility snapshot from the slice-1 gates, attached to the forecast. */
export interface DefensibilitySnapshot {
  canAdvance: boolean;
  riskLevel: string;
  blockingFindings: number;
}

export interface TrialSimulationReport {
  design: {
    title: string;
    phase: string;
    primaryEndpointName: string;
    endpointType: EndpointType;
    frame: InferentialFrame;
    alpha: number;
    oneSided: boolean;
    margin?: number;
    nPerArm: number;
  };
  summary: SyntheticTwinSummary;
  /** Probability of success across a grid of fixed effects — tipping points. */
  sensitivity: SensitivityPoint[];
  assumptions: AssumptionsLedger;
  defensibility: DefensibilitySnapshot;
  provenance: StatsProvenance;
}

const DEFAULT_RUNS = 5000;

/** Endpoint families simulated on the standardized normal model with a caveat. */
const APPROXIMATED_AS_CONTINUOUS: ReadonlySet<EndpointType> = new Set([
  'ordinal',
  'count',
  'composite',
  'patient_reported',
]);

/**
 * A endpoint model maps a true benefit-oriented effect and the seeded engine to one
 * simulated trial's signed test statistic z (positive = toward benefit) and its effect
 * estimate on the model's native scale. The success rule is applied to z (and, for the
 * margin frames, to the estimate).
 */
interface EndpointModel {
  scale: string;
  /** Information multiplier m such that, under the normal model, z ≈ effect·m + N(0,1). */
  infoMultiplier: number;
  /** Simulate one trial: returns the signed z and the benefit-oriented effect estimate. */
  simulate(trueEffect: number, rng: Rng): { z: number; estimate: number };
  /** True when the margin-frame test uses a normal approximation (per-twin SE varies). */
  marginApproximate?: boolean;
  caveats: string[];
}

/** Clamp a probability into the open interval to keep logits finite. */
function clampProb(p: number): number {
  return Math.min(Math.max(p, 1e-6), 1 - 1e-6);
}

function logit(p: number): number {
  const c = clampProb(p);
  return Math.log(c / (1 - c));
}

/** The standardized normal model: continuous endpoints and approximated families. */
function continuousModel(n1: number, n2: number, scale: string, caveats: string[]): EndpointModel {
  const m = 1 / Math.sqrt(1 / n1 + 1 / n2);
  return {
    scale,
    infoMultiplier: m,
    caveats,
    simulate(trueEffect: number, rng: Rng) {
      const z = trueEffect * m + rng.normal(0, 1);
      return { z, estimate: z / m };
    },
  };
}

/**
 * Event-level binary model: simulate events in each arm from the control rate and a
 * benefit-oriented log odds ratio, then form the log-OR z-test (Haldane–Anscombe
 * correction for empty cells). Only used when a control event rate is supplied.
 */
function binaryEventModel(
  n1: number,
  n2: number,
  controlRate: number,
  direction: Endpoint['direction'],
  caveats: string[],
): EndpointModel {
  const p0 = clampProb(controlRate);
  // Benefit is "more events" when direction is increase, "fewer events" otherwise.
  const benefitSign = direction === 'decrease' ? -1 : 1;
  // m for display/parity only; the simulation is event-level, not normal-approx.
  const m = 1 / Math.sqrt(1 / n1 + 1 / n2);
  return {
    scale: 'log odds ratio (benefit-oriented)',
    infoMultiplier: m,
    marginApproximate: true,
    caveats,
    simulate(trueEffect: number, rng: Rng) {
      // trueEffect is the benefit-oriented log OR; convert to the event-rate log OR.
      const logOr = benefitSign * trueEffect;
      const p1 = clampProb(1 / (1 + Math.exp(-(logit(p0) + logOr))));
      const e0 = rng.binomial(n1, p0);
      const e1 = rng.binomial(n2, p1);
      // Haldane–Anscombe 0.5 correction when a cell is empty.
      let a0 = e0, b0 = n1 - e0, a1 = e1, b1 = n2 - e1;
      if (a0 === 0 || b0 === 0 || a1 === 0 || b1 === 0) {
        a0 += 0.5; b0 += 0.5; a1 += 0.5; b1 += 0.5;
      }
      const logOrHat = Math.log((a1 / b1) / (a0 / b0));
      const se = Math.sqrt(1 / a0 + 1 / b0 + 1 / a1 + 1 / b1);
      return { z: (benefitSign * logOrHat) / se, estimate: benefitSign * logOrHat };
    },
  };
}

/**
 * Time-to-event model: the log hazard-ratio estimate has variance ≈ 4/D, where D is the
 * expected number of events. The prior effect is the benefit-oriented log hazard-ratio
 * reduction (positive = fewer hazards), so the true log HR is −effect.
 */
function timeToEventModel(events: number, caveats: string[]): EndpointModel {
  const m = Math.sqrt(events) / 2; // 1/SE where SE = 2/√D
  return {
    scale: 'log hazard-ratio reduction (benefit-oriented)',
    infoMultiplier: m,
    caveats,
    simulate(trueEffect: number, rng: Rng) {
      // logHRhat ~ N(trueLogHR, (1/m)^2), trueLogHR = −effect; benefit z = −logHRhat·m.
      const logHrHat = -trueEffect + rng.normal(0, 1 / m);
      return { z: -logHrHat * m, estimate: -logHrHat };
    },
  };
}

/** Resolve per-arm sample sizes for the primary two-arm contrast. */
function resolvePerArm(
  design: StudyDesign,
  assumptions: SimulationAssumptions,
  caveats: string[],
): { n1: number; n2: number } {
  if (assumptions.nPerArm !== undefined) {
    if (!(assumptions.nPerArm > 0)) throw new Error('nPerArm must be positive.');
    return { n1: assumptions.nPerArm, n2: assumptions.nPerArm };
  }
  const total = design.statisticalPlan?.plannedSampleSize;
  if (!total || total <= 0) {
    throw new Error(
      'Cannot simulate without a sample size: supply assumptions.nPerArm or design.statisticalPlan.plannedSampleSize.',
    );
  }
  const ratio = design.randomization?.ratio;
  let r1 = 1, r2 = 1;
  if (ratio && ratio.length >= 2 && ratio[0] > 0 && ratio[1] > 0) {
    r1 = ratio[0];
    r2 = ratio[1];
    if (ratio.length > 2) {
      caveats.push('Design has more than two arms; reduced to the primary two-arm contrast (first two allocation ratios).');
    }
  }
  const frac = r1 + r2;
  let n1 = (total * r1) / frac;
  let n2 = (total * r2) / frac;
  const dropout = design.statisticalPlan?.dropoutRate;
  if (dropout && dropout > 0 && dropout < 1) {
    n1 *= 1 - dropout;
    n2 *= 1 - dropout;
  }
  return { n1: Math.max(2, Math.floor(n1)), n2: Math.max(2, Math.floor(n2)) };
}

/** Build the endpoint model for the primary endpoint. */
function buildModel(
  design: StudyDesign,
  endpoint: Endpoint,
  assumptions: SimulationAssumptions,
  n1: number,
  n2: number,
): EndpointModel {
  const caveats: string[] = [];
  const type = endpoint.type;

  if (type === 'continuous') {
    return continuousModel(n1, n2, 'standardized mean difference', caveats);
  }

  if (type === 'binary') {
    const rate = assumptions.controlEventRate ?? design.statisticalPlan?.powerAssumptions?.eventRate;
    if (rate !== undefined && rate > 0 && rate < 1) {
      return binaryEventModel(n1, n2, rate, endpoint.direction, caveats);
    }
    caveats.push('No control event rate supplied; the binary endpoint is simulated on a standardized normal approximation rather than event-level.');
    return continuousModel(n1, n2, 'standardized effect (normal approximation)', caveats);
  }

  if (type === 'time_to_event') {
    const eventProb =
      assumptions.eventProbability ??
      assumptions.controlEventRate ??
      design.statisticalPlan?.powerAssumptions?.eventRate;
    if (eventProb !== undefined && eventProb > 0 && eventProb <= 1) {
      const events = Math.max(4, Math.round(eventProb * (n1 + n2)));
      return timeToEventModel(events, caveats);
    }
    caveats.push('No event probability supplied; the time-to-event endpoint is simulated on a standardized normal approximation, not an event-driven model.');
    return continuousModel(n1, n2, 'standardized effect (normal approximation)', caveats);
  }

  if (APPROXIMATED_AS_CONTINUOUS.has(type)) {
    caveats.push(`The ${type} endpoint is simulated on a standardized normal approximation; a type-specific model is a later slice.`);
    return continuousModel(n1, n2, 'standardized effect (normal approximation)', caveats);
  }

  caveats.push(`Endpoint type ${type} is simulated on a standardized normal approximation.`);
  return continuousModel(n1, n2, 'standardized effect (normal approximation)', caveats);
}

/**
 * Apply the design's frame to a simulated trial. Returns whether the success criterion
 * is met. `margin` is on the benefit-oriented effect scale (positive = tolerable loss
 * for non-inferiority, half-width for equivalence).
 */
function isSuccess(
  z: number,
  estimate: number,
  m: number,
  frame: InferentialFrame,
  zCrit: number,
  margin: number | undefined,
): boolean {
  if (frame === 'non_inferiority') {
    const marg = margin ?? 0;
    // Reject H0: effect ≤ −margin  ⇔  (estimate + margin)·m ≥ zCrit.
    return (estimate + marg) * m >= zCrit;
  }
  if (frame === 'equivalence') {
    const marg = margin ?? 0;
    // Two one-sided tests: estimate within ±margin.
    return (estimate + marg) * m >= zCrit && (marg - estimate) * m >= zCrit;
  }
  // superiority
  return z >= zCrit;
}

/** Quantile of a numeric array via linear interpolation on the sorted values. */
function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Count the fraction of twins that succeed at a fixed true effect. */
function powerAtFixedEffect(
  model: EndpointModel,
  effect: number,
  frame: InferentialFrame,
  zCrit: number,
  margin: number | undefined,
  nRuns: number,
  rng: Rng,
): number {
  let wins = 0;
  for (let i = 0; i < nRuns; i++) {
    const { z, estimate } = model.simulate(effect, rng);
    if (isSuccess(z, estimate, model.infoMultiplier, frame, zCrit, margin)) wins++;
  }
  return wins / nRuns;
}

/**
 * Simulate the trial described by `design` against the prior in `assumptions`, returning
 * a reproducible operating-characteristics report.
 */
export function simulateTrial(
  design: StudyDesign,
  assumptions: SimulationAssumptions,
): TrialSimulationReport {
  const primaries = primaryEndpoints(design);
  if (primaries.length === 0) {
    throw new Error('Cannot simulate: the design has no primary endpoint.');
  }
  const endpoint = primaries[0];
  const frame = design.framework?.inferentialFrame ?? 'superiority';

  const structural = design.framework?.structuralDesign;
  const control = design.framework?.controlType;
  if (structural === 'single_arm' || control === 'none') {
    throw new Error(
      'Single-arm / no-control designs are not simulated in this slice (a one-sample or external-control model is required).',
    );
  }

  const prior = assumptions.effectPrior;
  const nRuns = assumptions.nRuns ?? DEFAULT_RUNS;
  if (!(nRuns > 0)) throw new Error('nRuns must be positive.');

  const alpha = design.statisticalPlan?.alpha ?? 0.05;
  const oneSided = design.statisticalPlan?.oneSided ?? false;
  // Non-inferiority and equivalence are conventionally one-sided at the stated alpha.
  const effectiveOneSided = frame === 'superiority' ? oneSided : true;
  const alphaEff = effectiveOneSided ? alpha : alpha / 2;
  const zCrit = normalQuantile(1 - alphaEff);
  const margin = design.framework?.margin;

  const perArmCaveats: string[] = [];
  const { n1, n2 } = resolvePerArm(design, assumptions, perArmCaveats);
  const model = buildModel(design, endpoint, assumptions, n1, n2);
  if (frame !== 'superiority' && model.marginApproximate) {
    model.caveats.push(
      'The non-inferiority/equivalence margin test uses a normal approximation for this endpoint (per-replicate standard error varies); the superiority decision is exact.',
    );
  }

  // Deterministic seed: explicit, else a stable hash of every input that moves the result.
  const seedInputs = {
    title: design.title,
    endpoint: endpoint.name,
    type: endpoint.type,
    frame,
    alphaEff,
    margin: margin ?? null,
    n1,
    n2,
    priorMean: prior.mean,
    priorSd: prior.sd,
    nRuns,
    controlEventRate: assumptions.controlEventRate ?? null,
    eventProbability: assumptions.eventProbability ?? null,
  };
  const seed =
    assumptions.seed !== undefined && Number.isFinite(assumptions.seed)
      ? Math.trunc(assumptions.seed)
      : seedFromObject(seedInputs);

  // ── Pass 1: probability of success (assurance), integrating over the prior. ──
  const rng = createRng(seed);
  let successes = 0;
  const estimates: number[] = new Array(nRuns);
  for (let i = 0; i < nRuns; i++) {
    const trueEffect = prior.sd > 0 ? rng.normal(prior.mean, prior.sd) : prior.mean;
    const { z, estimate } = model.simulate(trueEffect, rng);
    if (isSuccess(z, estimate, model.infoMultiplier, frame, zCrit, margin)) successes++;
    estimates[i] = estimate;
  }
  const probabilityOfSuccess = successes / nRuns;
  estimates.sort((a, b) => a - b);

  // ── Pass 2: power at the prior mean (the naive single-point design power). ──
  const powerAtPriorMean = powerAtFixedEffect(
    model,
    prior.mean,
    frame,
    zCrit,
    margin,
    nRuns,
    createRng(seed + 1),
  );

  // ── Pass 3: empirical type-I error under the frame-appropriate null. ──
  const nullEffect = frame === 'superiority' ? 0 : -(margin ?? 0);
  const typeIErrorUnderNull = powerAtFixedEffect(
    model,
    nullEffect,
    frame,
    zCrit,
    margin,
    nRuns,
    createRng(seed + 2),
  );

  // ── Pass 4: sensitivity grid over fixed effects (tipping points). ──
  const fractions = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5];
  const sensitivity: SensitivityPoint[] = fractions.map((f, idx) => {
    const effect = prior.mean * f;
    const pos = powerAtFixedEffect(model, effect, frame, zCrit, margin, nRuns, createRng(seed + 10 + idx));
    return { effect, probabilityOfSuccess: pos, fractionOfPrior: f };
  });

  // Defensibility from the slice-1 gates — a rosy number cannot hide a broken design.
  const validation = validateDesign(design);

  const caveats = [...prior.caveats, ...perArmCaveats, ...model.caveats];
  if (typeIErrorUnderNull > alphaEff * 1.5 && typeIErrorUnderNull - alphaEff > 0.005) {
    caveats.push(
      `Empirical type-I error (${typeIErrorUnderNull.toFixed(3)}) exceeds the nominal level (${alphaEff.toFixed(3)}); interpret the success rate with caution.`,
    );
  }

  return {
    design: {
      title: design.title,
      phase: design.phase,
      primaryEndpointName: endpoint.name,
      endpointType: endpoint.type,
      frame,
      alpha: alphaEff,
      oneSided: effectiveOneSided,
      margin,
      nPerArm: Math.min(n1, n2),
    },
    summary: {
      probabilityOfSuccess,
      powerAtPriorMean,
      estimatedEffect: {
        median: quantileSorted(estimates, 0.5),
        lower: quantileSorted(estimates, 0.025),
        upper: quantileSorted(estimates, 0.975),
        scale: model.scale,
      },
      typeIErrorUnderNull,
      effectivePerArm: Math.min(n1, n2),
      nRuns,
    },
    sensitivity,
    assumptions: {
      effectBasis: prior.basis,
      priorMean: prior.mean,
      priorSd: prior.sd,
      evidenceSources: prior.sources,
      caveats,
    },
    defensibility: {
      canAdvance: validation.canAdvance,
      riskLevel: validation.riskLevel,
      blockingFindings: validation.counts.critical,
    },
    provenance: buildProvenance({
      method: 'studyDesign:trialSimulator',
      seed,
      inputs: seedInputs,
      note: 'Seeded synthetic-twin Monte Carlo; reproduces given this seed and these inputs.',
    }),
  };
}

/** Normal-approximation closed-form power, exposed for callers that want a fast check. */
export function normalApproxPower(effect: number, infoMultiplier: number, zCrit: number): number {
  return 1 - normalCdf(zCrit - effect * infoMultiplier);
}
