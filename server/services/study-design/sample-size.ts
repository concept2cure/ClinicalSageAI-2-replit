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
 * Built on the same `assuranceTwoSampleMeans` quadrature the simulator is validated
 * against, so `/sample-size` and `/simulate` agree by construction. Binary and
 * time-to-event endpoints are solved on the standardized normal approximation (the same
 * approximation the simulator falls back to), and say so. Pure and deterministic.
 *
 * @module server/services/study-design/sample-size
 */

import { normalCdf, normalQuantile } from '../stats/normal';
import { powerTwoSampleMeans, assuranceTwoSampleMeans } from '../stats/assurance';
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

  /** Per-arm and total size so the point effect reaches the target power. */
  nPerArmForPower: number;
  totalForPower: number;

  /** Per-arm and total size so the probability of success reaches the target assurance. */
  nPerArmForAssurance: number | null;
  totalForAssurance: number | null;
  /** The maximum achievable assurance (the prior's probability the effect is beneficial). */
  assuranceCeiling: number;
  /** True when no finite N reaches the target assurance. */
  assuranceUnreachable: boolean;

  /** Diagnostics at the design's stated planned sample size, when one is present. */
  atPlannedN: { nPerArm: number; power: number; assurance: number } | null;

  /** Enrollment sizes after inflating for the stated dropout rate, when present. */
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

/** Per-arm N so a point effect reaches `targetPower` under the standardized two-sample model. */
export function sampleSizeForPower(effect: number, alphaEff: number, targetPower: number): number {
  const delta = Math.abs(effect);
  if (delta < 1e-9) return N_MAX;
  const za = normalQuantile(1 - alphaEff);
  const zb = normalQuantile(targetPower);
  const nPerArm = 2 * ((za + zb) / delta) ** 2;
  return Math.max(2, Math.ceil(nPerArm));
}

/** Assurance as a function of per-arm N for a normal prior on the standardized effect. */
function assuranceAt(nPerArm: number, priorMean: number, priorSd: number, alphaEff: number): number {
  return assuranceTwoSampleMeans({ priorMean, priorSd, nPerArm, alpha: alphaEff, oneSided: true }).assurance;
}

/**
 * Per-arm N so the probability of success reaches `targetAssurance`, or `null` when the
 * target exceeds the achievable ceiling. Monotone binary search on N.
 */
export function sampleSizeForAssurance(
  priorMean: number,
  priorSd: number,
  alphaEff: number,
  targetAssurance: number,
): { nPerArm: number | null; ceiling: number } {
  // With unbounded N the test rejects iff the true effect is beneficial, so the ceiling
  // is the prior probability the effect is on the beneficial side.
  const ceiling = priorSd > 0 ? 1 - normalCdf(-priorMean / priorSd) : priorMean > 0 ? 1 : 0;
  if (targetAssurance >= ceiling - 1e-6) {
    return { nPerArm: null, ceiling };
  }
  let lo = 2;
  let hi = 2;
  // Expand hi until it meets the target or we hit the cap.
  while (assuranceAt(hi, priorMean, priorSd, alphaEff) < targetAssurance) {
    hi *= 2;
    if (hi >= N_MAX) return { nPerArm: null, ceiling };
  }
  // Binary search the smallest N in (lo, hi] meeting the target.
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (assuranceAt(mid, priorMean, priorSd, alphaEff) >= targetAssurance) hi = mid;
    else lo = mid + 1;
  }
  return { nPerArm: lo, ceiling };
}

/** Number of arms in the primary contrast (for total-N scaling). */
function armCount(design: StudyDesign): number {
  return Math.max(2, design.arms?.length ?? 2);
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
  if (endpoint.type !== 'continuous') {
    caveats.push(`Sample size for the ${endpoint.type} endpoint uses the standardized normal approximation; confirm against an endpoint-specific calculation before locking the protocol.`);
  }
  if (frame !== 'superiority') {
    caveats.push('Sizing is computed on the superiority/standardized form; non-inferiority and equivalence margins shift the required size.');
  }
  caveats.push(...prior.caveats);

  const arms = armCount(design);
  const nForPower = sampleSizeForPower(prior.mean, alpha, targetPower);
  const { nPerArm: nForAssurance, ceiling } = sampleSizeForAssurance(prior.mean, prior.sd, alpha, targetAssurance);

  if (nForAssurance === null) {
    caveats.push(
      `Target assurance ${targetAssurance.toFixed(2)} is not reachable at any sample size; the prior caps the probability of success at ${ceiling.toFixed(2)}. More subjects cannot overcome uncertainty the evidence does not resolve.`,
    );
  }

  // Diagnostics at the stated planned sample size.
  const plannedTotal = design.statisticalPlan?.plannedSampleSize;
  let atPlannedN: SampleSizeReport['atPlannedN'] = null;
  if (plannedTotal && plannedTotal > 0) {
    const nPerArm = Math.max(2, Math.floor(plannedTotal / arms));
    atPlannedN = {
      nPerArm,
      power: powerTwoSampleMeans(prior.mean, nPerArm, alpha, true),
      assurance: assuranceAt(nPerArm, prior.mean, prior.sd, alpha),
    };
  }

  // Dropout inflation.
  const dropout = design.statisticalPlan?.dropoutRate;
  let dropoutAdjusted: SampleSizeReport['dropoutAdjusted'] = null;
  if (dropout && dropout > 0 && dropout < 1) {
    const inflate = (n: number) => Math.ceil(n / (1 - dropout));
    dropoutAdjusted = {
      dropoutRate: dropout,
      enrollPerArmForPower: inflate(nForPower),
      enrollPerArmForAssurance: nForAssurance === null ? null : inflate(nForAssurance),
    };
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
    nPerArmForPower: nForPower,
    totalForPower: nForPower * arms,
    nPerArmForAssurance: nForAssurance,
    totalForAssurance: nForAssurance === null ? null : nForAssurance * arms,
    assuranceCeiling: ceiling,
    assuranceUnreachable: nForAssurance === null,
    atPlannedN,
    dropoutAdjusted,
    caveats,
    provenance: buildProvenance({
      method: 'studyDesign:sampleSize',
      seed: 0,
      inputs,
      note: 'Deterministic: power closed-form + assurance quadrature search. Reproduces for the same design and prior.',
    }),
  };
}
