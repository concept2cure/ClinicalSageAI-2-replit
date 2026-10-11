/**
 * Sample size solved from the design's own assumptions — power and assurance.
 *
 * Two numbers, deliberately side by side:
 *   • N for power — the textbook size so the *planned* (point) effect clears the test
 *     at the target power. This is what a protocol usually states.
 *   • N for assurance — the size so the trial's *probability of success* hits a target,
 *     integrating the genuine uncertainty in the effect (the prior). Because assurance
 *     averages power over the prior, this N is larger than the textbook N, and a target
 *     assurance can be unreachable at any N when the prior puts real mass on a null or
 *     harmful effect. Surfacing that ceiling is the honest point of this module: more
 *     subjects cannot buy certainty the evidence does not support.
 *
 * Method per endpoint family (each named on the report as `sizingMethod`):
 *   • continuous (and families without a dedicated model) — two-sample z test on the
 *     standardized mean difference, normal approximation with known variance:
 *     n = 2(z₁₋α + z₁₋β)²/δ² per arm. It is NOT the t test: for δ = 0.5, α .025 one-sided,
 *     power .8 this gives 62.79 → 63, where R `power.t.test` gives 63.77 → 64.
 *   • binary — the prior is a risk difference (treatment − control proportion, benefit-
 *     oriented) and the control proportion comes from the design or the caller. Pooled-
 *     variance normal approximation (Fleiss, Levin & Paik 2003, §4.2), NO continuity
 *     correction: n = [z₁₋α√(2p̄q̄) + z₁₋β√(p₀q₀+p₁q₁)]²/Δ². The continuity-corrected size
 *     (Fleiss–Tytun–Ury 1980) is reported alongside. Without a control proportion a risk
 *     difference cannot be sized and the solver refuses rather than standardizing it.
 *   • time-to-event — the prior is the log hazard-ratio reduction −ln(HR) (benefit-
 *     oriented). The design is sized in EVENTS, Schoenfeld (1983): D = 4(z₁₋α + z₁₋β)²/θ²
 *     for 1:1 allocation. Subjects follow only from an event probability (the share of
 *     subjects expected to have an event over follow-up); without one the subject
 *     counts are null and a caveat says why.
 *
 * Power and assurance delegate to `stats/assurance` (`powerTwoSampleMeans`,
 * `assuranceTwoSampleMeans`, `assurance`) and `stats/normal`; nothing here re-derives a
 * distribution. For a continuous endpoint `/sample-size` and `/simulate` integrate the
 * same quadrature. Pure and deterministic.
 *
 * @module server/services/study-design/sample-size
 */

import { normalCdf, normalQuantile } from '../stats/normal';
import {
  powerTwoSampleMeans,
  assuranceTwoSampleMeans,
  assurance as assuranceOverPrior,
  discretizeNormalPrior,
} from '../stats/assurance';
import { buildProvenance, type StatsProvenance } from '../stats/computation-provenance';
import type { StudyDesign } from './study-design-types';
import { primaryEndpoints } from './study-design-types';
import type { EffectPrior } from './evidence-prior';

/** Upper bound on the per-arm search; beyond this an assurance target is "unreachable". */
const N_MAX = 1_000_000;

export interface SolveSampleSizeOptions {
  /** Target power for the point-effect size. Default 0.9. */
  targetPower?: number;
  /** Target probability of success (assurance). Default 0.8. */
  targetAssurance?: number;
  /**
   * Binary endpoints: control-arm event proportion. Falls back to
   * `statisticalPlan.powerAssumptions.eventRate`; with neither, a binary design is not sized.
   */
  controlEventRate?: number;
  /**
   * Time-to-event endpoints: probability a subject has an event over follow-up. Falls back
   * to `statisticalPlan.powerAssumptions.eventRate`; with neither, only events are sized.
   */
  eventProbability?: number;
}

export interface SampleSizeReport {
  endpointName: string;
  endpointType: string;
  frame: string;
  /** Effective one-sided alpha used for the calculation. */
  alpha: number;
  oneSided: boolean;
  /** The point effect (prior mean) the power calculation targets. */
  effect: number;
  priorSd: number;
  priorBasis: EffectPrior['basis'];
  targetPower: number;
  targetAssurance: number;

  /**
   * The quantity that drives the design: `'events'` for time-to-event (subjects derive
   * from events through the event probability), `'subjects'` otherwise. The `nPerArm*`
   * and `total*` fields always count SUBJECTS.
   */
  unit: 'subjects' | 'events';
  /** The sizing method, named so no reader mistakes the approximation for another test. */
  sizingMethod: string;
  /** The scale the prior effect is read on. */
  effectScale: string;
  /** False when subjects cannot be computed (time-to-event without an event probability). */
  subjectsComputable: boolean;

  /** Per-arm and total SUBJECTS so the point effect reaches the target power; null when not computable. */
  nPerArmForPower: number | null;
  totalForPower: number | null;

  /** Per-arm and total SUBJECTS so the probability of success reaches the target assurance. */
  nPerArmForAssurance: number | null;
  totalForAssurance: number | null;
  /** The maximum achievable assurance (the prior's probability the effect is beneficial). */
  assuranceCeiling: number;
  /** True when no finite N reaches the target assurance. */
  assuranceUnreachable: boolean;

  /** Time-to-event only: the required number of events (Schoenfeld), and the event probability used. */
  events: { forPower: number; forAssurance: number | null; eventProbability: number | null } | null;

  /** Binary only: the rates sized and the continuity-corrected size for comparison. */
  binary: {
    controlRate: number;
    treatmentRate: number;
    /** Fleiss–Tytun–Ury continuity-corrected per-arm size for the point effect. */
    nPerArmForPowerContinuityCorrected: number;
  } | null;

  /** Diagnostics at the design's stated planned sample size, when one is present and computable. */
  atPlannedN: { nPerArm: number; power: number; assurance: number } | null;

  /** Enrollment sizes after inflating for the stated dropout rate, when present and computable. */
  dropoutAdjusted: {
    dropoutRate: number;
    enrollPerArmForPower: number;
    enrollPerArmForAssurance: number | null;
  } | null;

  caveats: string[];
  provenance: StatsProvenance;
}

/** Resolve the effective one-sided alpha for a design (mirrors the simulator). */
function effectiveAlpha(design: StudyDesign): { alpha: number; oneSided: boolean } {
  const frame = design.framework?.inferentialFrame ?? 'superiority';
  const alpha = design.statisticalPlan?.alpha ?? 0.05;
  const oneSided = design.statisticalPlan?.oneSided ?? false;
  const effOneSided = frame === 'superiority' ? oneSided : true;
  return { alpha: effOneSided ? alpha : alpha / 2, oneSided: effOneSided };
}

const CONTINUOUS_METHOD =
  'Two-sample z test on the standardized mean difference (normal approximation, known variance): n = 2(z₁₋α + z₁₋β)²/δ² per arm. Not the t test; the t-based size is slightly larger at small N.';
const BINARY_METHOD =
  'Two proportions, pooled-variance normal approximation (Fleiss, Levin & Paik 2003), no continuity correction: n = [z₁₋α√(2p̄q̄) + z₁₋β√(p₀q₀+p₁q₁)]²/Δ² per arm.';
const TTE_METHOD =
  'Log-rank, Schoenfeld (1983) required events for 1:1 allocation: D = 4(z₁₋α + z₁₋β)²/θ², θ = −ln(HR); subjects = D / event probability.';

/**
 * Per-arm N so a point effect reaches `targetPower` under the two-sample z test on the
 * standardized effect — the normal approximation with known variance, NOT the t test
 * (δ = 0.5, one-sided α .025, power .8 → 62.79 → 63; the t-based answer is 64).
 */
export function sampleSizeForPower(effect: number, alphaEff: number, targetPower: number): number {
  const delta = Math.abs(effect);
  if (delta < 1e-9) return N_MAX;
  const za = normalQuantile(1 - alphaEff);
  const zb = normalQuantile(targetPower);
  const nPerArm = 2 * ((za + zb) / delta) ** 2;
  return Math.max(2, Math.ceil(nPerArm));
}

/**
 * Schoenfeld (1983) required events for a log hazard-ratio reduction θ, 1:1 allocation:
 * D = 4(z₁₋α + z₁₋β)²/θ². HR 0.7, one-sided α .025, power .8 → 246.79 → 247.
 */
export function eventsForPower(logHazardReduction: number, alphaEff: number, targetPower: number): number {
  const theta = Math.abs(logHazardReduction);
  if (theta < 1e-9) return N_MAX;
  const za = normalQuantile(1 - alphaEff);
  const zb = normalQuantile(targetPower);
  return Math.max(4, Math.ceil(4 * ((za + zb) / theta) ** 2));
}

/**
 * Power of the one-sided pooled-variance two-proportion z test at `nPerArm` per arm, for
 * the benefit-oriented risk difference `riskDifference` (treatment − control in the benefit
 * direction) and control proportion `p0`:
 *   Φ( (Δ√n − z₁₋α√(2p̄q̄)) / √(p₀q₀ + p₁q₁) ).
 */
export function powerTwoProportions(
  riskDifference: number,
  p0: number,
  nPerArm: number,
  alphaEff: number,
  benefitSign: 1 | -1 = 1,
): number {
  if (nPerArm <= 0) return 0;
  const p1 = clampProportion(p0 + benefitSign * riskDifference);
  const d = benefitSign * (p1 - p0);
  const pBar = (p0 + p1) / 2;
  const za = normalQuantile(1 - alphaEff);
  const sdAlt = Math.sqrt(p0 * (1 - p0) + p1 * (1 - p1));
  return normalCdf((d * Math.sqrt(nPerArm) - za * Math.sqrt(2 * pBar * (1 - pBar))) / sdAlt);
}

/** Pooled-variance per-arm size (unrounded) for two proportions; Fleiss, no continuity correction. */
function nTwoProportionsExact(p0: number, p1: number, alphaEff: number, targetPower: number): number {
  const d = Math.abs(p1 - p0);
  if (d < 1e-9) return N_MAX;
  const za = normalQuantile(1 - alphaEff);
  const zb = normalQuantile(targetPower);
  const pBar = (p0 + p1) / 2;
  return (za * Math.sqrt(2 * pBar * (1 - pBar)) + zb * Math.sqrt(p0 * (1 - p0) + p1 * (1 - p1))) ** 2 / (d * d);
}

/** Fleiss–Tytun–Ury (1980) continuity correction of a two-proportion per-arm size. */
function continuityCorrected(n: number, d: number): number {
  return (n / 4) * (1 + Math.sqrt(1 + 4 / (n * Math.abs(d)))) ** 2;
}

function clampProportion(p: number): number {
  return Math.min(Math.max(p, 1e-9), 1 - 1e-9);
}

/** Assurance as a function of per-arm N for a normal prior on the standardized effect. */
function assuranceAt(nPerArm: number, priorMean: number, priorSd: number, alphaEff: number): number {
  return assuranceTwoSampleMeans({ priorMean, priorSd, nPerArm, alpha: alphaEff, oneSided: true }).assurance;
}

/** The prior's probability the effect is beneficial — the assurance any finite N approaches. */
function assuranceCeilingFor(priorMean: number, priorSd: number): number {
  // With unbounded N the test rejects iff the true effect is beneficial, so the ceiling
  // is the prior probability the effect is on the beneficial side.
  return priorSd > 0 ? 1 - normalCdf(-priorMean / priorSd) : priorMean > 0 ? 1 : 0;
}

/**
 * Smallest integer size ≥ `min` whose assurance meets the target, or null when the target
 * is at or above the ceiling or the search passes N_MAX. Monotone doubling + bisection.
 */
function smallestSizeFor(
  assuranceOf: (n: number) => number,
  target: number,
  ceiling: number,
  min: number,
): number | null {
  if (target >= ceiling - 1e-6) return null;
  let lo = min;
  let hi = min;
  while (assuranceOf(hi) < target) {
    hi *= 2;
    if (hi >= N_MAX) return null;
  }
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (assuranceOf(mid) >= target) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Per-arm N so the probability of success reaches `targetAssurance`, or `null` when the
 * target exceeds the achievable ceiling. Standardized two-sample model.
 */
export function sampleSizeForAssurance(
  priorMean: number,
  priorSd: number,
  alphaEff: number,
  targetAssurance: number,
): { nPerArm: number | null; ceiling: number } {
  const ceiling = assuranceCeilingFor(priorMean, priorSd);
  const nPerArm = smallestSizeFor((n) => assuranceAt(n, priorMean, priorSd, alphaEff), targetAssurance, ceiling, 2);
  return { nPerArm, ceiling };
}

/** Number of arms in the primary contrast (for total-N scaling). */
function armCount(design: StudyDesign): number {
  return Math.max(2, design.arms?.length ?? 2);
}

/** A proportion strictly inside (0, 1), or undefined. */
function proportion(...candidates: (number | undefined)[]): number | undefined {
  for (const c of candidates) if (typeof c === 'number' && c > 0 && c < 1) return c;
  return undefined;
}

/** What one endpoint family contributes: the sizes and the diagnostics at a given per-arm N. */
interface FamilySizing {
  unit: SampleSizeReport['unit'];
  sizingMethod: string;
  effectScale: string;
  nForPower: number | null;
  nForAssurance: number | null;
  ceiling: number;
  events: SampleSizeReport['events'];
  binary: SampleSizeReport['binary'];
  /** Power and assurance at a per-arm subject count, or null when not computable. */
  diagnosticsAt: (nPerArm: number) => { power: number; assurance: number } | null;
  inputs: Record<string, unknown>;
}

/** Everything a family sizer reads. `caveats` is appended to. */
interface SizingContext {
  design: StudyDesign;
  direction: 'increase' | 'decrease' | 'either' | undefined;
  prior: EffectPrior;
  alpha: number;
  targetPower: number;
  targetAssurance: number;
  options: SolveSampleSizeOptions;
  caveats: string[];
}

function sizeContinuous({ prior, alpha, targetPower, targetAssurance }: SizingContext): FamilySizing {
  const { nPerArm, ceiling } = sampleSizeForAssurance(prior.mean, prior.sd, alpha, targetAssurance);
  return {
    unit: 'subjects',
    sizingMethod: CONTINUOUS_METHOD,
    effectScale: 'standardized mean difference (benefit-oriented)',
    nForPower: sampleSizeForPower(prior.mean, alpha, targetPower),
    nForAssurance: nPerArm,
    ceiling,
    events: null,
    binary: null,
    diagnosticsAt: (n) => ({
      power: powerTwoSampleMeans(prior.mean, n, alpha, true),
      assurance: assuranceAt(n, prior.mean, prior.sd, alpha),
    }),
    inputs: {},
  };
}

function sizeBinary(ctx: SizingContext): FamilySizing {
  const { design, direction, prior, alpha, targetPower, targetAssurance, options } = ctx;
  const p0 = proportion(options.controlEventRate, design.statisticalPlan?.powerAssumptions?.eventRate);
  if (p0 === undefined) {
    throw new Error(
      'Cannot size a binary endpoint without the control-arm event proportion (statisticalPlan.powerAssumptions.eventRate, strictly between 0 and 1). A risk difference has no sample size until the control rate is known.',
    );
  }
  // Benefit is "more events" unless the endpoint is one where fewer events is better.
  const benefitSign: 1 | -1 = direction === 'decrease' ? -1 : 1;
  const p1 = p0 + benefitSign * prior.mean;
  if (!(p1 > 0 && p1 < 1)) {
    throw new Error(
      `Cannot size a binary endpoint: control proportion ${p0} with risk difference ${prior.mean} puts the treatment proportion at ${p1}, outside (0, 1).`,
    );
  }
  const exact = nTwoProportionsExact(p0, p1, alpha, targetPower);
  const nForPower = exact >= N_MAX ? N_MAX : Math.max(2, Math.ceil(exact));
  const nCc = exact >= N_MAX ? N_MAX : Math.max(2, Math.ceil(continuityCorrected(exact, p1 - p0)));

  const nodes = discretizeNormalPrior(prior.mean, prior.sd);
  const assuranceOf = (n: number) => assuranceOverPrior((d) => powerTwoProportions(d, p0, n, alpha, benefitSign), nodes);
  const ceiling = assuranceCeilingFor(prior.mean, prior.sd);
  return {
    unit: 'subjects',
    sizingMethod: BINARY_METHOD,
    effectScale: 'risk difference (treatment − control event proportion, benefit-oriented)',
    nForPower,
    nForAssurance: smallestSizeFor(assuranceOf, targetAssurance, ceiling, 2),
    ceiling,
    events: null,
    binary: {
      controlRate: p0,
      treatmentRate: Number(p1.toFixed(12)),
      nPerArmForPowerContinuityCorrected: nCc,
    },
    diagnosticsAt: (n) => ({ power: powerTwoProportions(prior.mean, p0, n, alpha, benefitSign), assurance: assuranceOf(n) }),
    inputs: { controlRate: p0, treatmentRate: p1 },
  };
}

function sizeTimeToEvent(ctx: SizingContext): FamilySizing {
  const { design, prior, alpha, targetPower, targetAssurance, options, caveats } = ctx;
  const pa = design.statisticalPlan?.powerAssumptions?.eventRate;
  const pEvent =
    typeof options.eventProbability === 'number' && options.eventProbability > 0 && options.eventProbability <= 1
      ? options.eventProbability
      : typeof pa === 'number' && pa > 0 && pa <= 1
        ? pa
        : null;

  // Power at D events is Φ(θ√D/2 − z), i.e. the standardized two-sample power at n = D/2.
  const powerAtEvents = (d: number) => powerTwoSampleMeans(prior.mean, d / 2, alpha, true);
  const assuranceAtEvents = (d: number) => assuranceAt(d / 2, prior.mean, prior.sd, alpha);
  const ceiling = assuranceCeilingFor(prior.mean, prior.sd);
  const dPower = eventsForPower(prior.mean, alpha, targetPower);
  const dAssurance = smallestSizeFor(assuranceAtEvents, targetAssurance, ceiling, 4);

  // Subjects per arm from events: total = ⌈D / p⌉, split 1:1.
  const subjectsPerArm = (d: number | null) => (d === null || pEvent === null ? null : Math.ceil(Math.ceil(d / pEvent) / 2));
  if (pEvent === null) {
    caveats.push(
      `Time-to-event sizing gives ${dPower} events for the target power. Subjects are not computable without an event probability (the share of subjects expected to have an event over follow-up); record it as statisticalPlan.powerAssumptions.eventRate.`,
    );
  }
  return {
    unit: 'events',
    sizingMethod: TTE_METHOD,
    effectScale: 'log hazard-ratio reduction −ln(HR) (benefit-oriented)',
    nForPower: subjectsPerArm(dPower),
    nForAssurance: subjectsPerArm(dAssurance),
    ceiling,
    events: { forPower: dPower, forAssurance: dAssurance, eventProbability: pEvent },
    binary: null,
    diagnosticsAt: (n) => {
      if (pEvent === null) return null;
      const d = pEvent * 2 * n;
      return { power: powerAtEvents(d), assurance: assuranceAtEvents(d) };
    },
    inputs: { eventProbability: pEvent },
  };
}

/** Dispatch to the endpoint family's sizer, recording the family's method caveat. */
function sizeFamily(endpointType: string, ctx: SizingContext): FamilySizing {
  if (endpointType === 'binary') {
    const sizing = sizeBinary(ctx);
    ctx.caveats.push(
      'The binary prior is read as a risk difference. The trial simulator\'s event-level binary model reads its prior as a log odds ratio, so a /simulate run on the same prior describes a different effect.',
    );
    return sizing;
  }
  if (endpointType === 'time_to_event') return sizeTimeToEvent(ctx);
  if (endpointType !== 'continuous') {
    ctx.caveats.push(`Sample size for the ${endpointType} endpoint uses the standardized normal approximation; confirm against an endpoint-specific calculation before locking the protocol.`);
  }
  return sizeContinuous(ctx);
}

/** Caveats that come from the design's frame and allocation rather than its endpoint. */
function designCaveats(design: StudyDesign, frame: string): string[] {
  const out: string[] = [];
  if (frame !== 'superiority') {
    out.push('Sizing is computed on the superiority/standardized form; non-inferiority and equivalence margins shift the required size.');
  }
  const ratio = design.randomization?.ratio;
  if (Array.isArray(ratio) && ratio.length >= 2 && ratio[0] > 0 && ratio[1] > 0 && ratio[0] !== ratio[1]) {
    out.push(`Sized for 1:1 allocation; the design randomizes ${ratio.join(':')}, which needs more subjects for the same power.`);
  }
  return out;
}

/** Power and assurance at the design's stated planned sample size, when present and computable. */
function plannedDiagnostics(design: StudyDesign, arms: number, sizing: FamilySizing): SampleSizeReport['atPlannedN'] {
  const plannedTotal = design.statisticalPlan?.plannedSampleSize;
  if (!plannedTotal || plannedTotal <= 0) return null;
  const nPerArm = Math.max(2, Math.floor(plannedTotal / arms));
  const diag = sizing.diagnosticsAt(nPerArm);
  return diag ? { nPerArm, ...diag } : null;
}

/** Enrollment inflated for the stated dropout rate — subjects only, so null when subjects are unknown. */
function dropoutAdjustment(design: StudyDesign, sizing: FamilySizing): SampleSizeReport['dropoutAdjusted'] {
  const dropout = design.statisticalPlan?.dropoutRate;
  if (!dropout || dropout <= 0 || dropout >= 1 || sizing.nForPower === null) return null;
  const inflate = (n: number) => Math.ceil(n / (1 - dropout));
  return {
    dropoutRate: dropout,
    enrollPerArmForPower: inflate(sizing.nForPower),
    enrollPerArmForAssurance: sizing.nForAssurance === null ? null : inflate(sizing.nForAssurance),
  };
}

/**
 * Solve the sample size a design needs from its own primary endpoint and effect prior,
 * reporting both the power-based and the assurance-based sizes and reconciling them with
 * the stated planned sample size.
 */
export function solveSampleSize(
  design: StudyDesign,
  prior: EffectPrior,
  options: SolveSampleSizeOptions = {},
): SampleSizeReport {
  const primaries = primaryEndpoints(design);
  if (primaries.length === 0) throw new Error('Cannot size a design with no primary endpoint.');
  const endpoint = primaries[0];
  const frame = design.framework?.inferentialFrame ?? 'superiority';
  const { alpha, oneSided } = effectiveAlpha(design);
  const targetPower = options.targetPower ?? 0.9;
  const targetAssurance = options.targetAssurance ?? 0.8;

  const caveats: string[] = [];
  const sizing = sizeFamily(endpoint.type, {
    design, direction: endpoint.direction, prior, alpha, targetPower, targetAssurance, options, caveats,
  });
  caveats.push(...designCaveats(design, frame), ...prior.caveats);

  const arms = armCount(design);
  const { nForPower, nForAssurance, ceiling } = sizing;
  // Unreachable is a property of the prior, not of whether subjects can be counted.
  const assuranceUnreachable = sizing.events ? sizing.events.forAssurance === null : nForAssurance === null;
  if (assuranceUnreachable) {
    caveats.push(
      `Target assurance ${targetAssurance.toFixed(2)} is not reachable at any sample size; the prior caps the probability of success at ${ceiling.toFixed(2)}. More subjects cannot overcome uncertainty the evidence does not resolve.`,
    );
  }

  const inputs = {
    endpoint: endpoint.name,
    type: endpoint.type,
    frame,
    alpha,
    priorMean: prior.mean,
    priorSd: prior.sd,
    targetPower,
    targetAssurance,
    arms,
    ...sizing.inputs,
  };

  return {
    endpointName: endpoint.name,
    endpointType: endpoint.type,
    frame,
    alpha,
    oneSided,
    effect: prior.mean,
    priorSd: prior.sd,
    priorBasis: prior.basis,
    targetPower,
    targetAssurance,
    unit: sizing.unit,
    sizingMethod: sizing.sizingMethod,
    effectScale: sizing.effectScale,
    subjectsComputable: nForPower !== null,
    nPerArmForPower: nForPower,
    totalForPower: nForPower === null ? null : nForPower * arms,
    nPerArmForAssurance: nForAssurance,
    totalForAssurance: nForAssurance === null ? null : nForAssurance * arms,
    assuranceCeiling: ceiling,
    assuranceUnreachable,
    events: sizing.events,
    binary: sizing.binary,
    atPlannedN: plannedDiagnostics(design, arms, sizing),
    dropoutAdjusted: dropoutAdjustment(design, sizing),
    caveats,
    provenance: buildProvenance({
      method: 'studyDesign:sampleSize',
      seed: 0,
      inputs,
      note: 'Deterministic: closed-form power size + assurance quadrature search. Reproduces for the same design and prior.',
    }),
  };
}
