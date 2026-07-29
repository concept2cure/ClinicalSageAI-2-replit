/**
 * Multireader-multicase (MRMC) reader-study sizing — Obuchowski–Rockette model.
 *
 * For a fully-crossed two-modality reader study (every reader reads every case
 * under both modalities), this computes the power to detect a difference in a
 * figure of merit (e.g. AUC) between modalities, and solves for the number of
 * readers needed.
 *
 * The reader-averaged modality difference θ̄₁ − θ̄₂ has variance, under the OR
 * error-covariance structure (Cov1 same-reader/different-modality, Cov2
 * different-reader/same-modality, Cov3 different-reader/different-modality, with
 * σ²_ε ≥ Cov1 ≥ Cov2 ≥ Cov3 ≥ 0):
 *
 *   Var(θ̄₁ − θ̄₂) = (2/J)·[ σ²_TR + σ²_ε − Cov1 + (J−1)(Cov2 − Cov3) ]
 *
 * (derived directly from the OR model: the reader main effect cancels in the
 * difference, the treatment×reader term contributes 2σ²_TR/J, and the error
 * term contributes the bracketed combination — see the test that checks this
 * expression numerically). The test statistic is referred to a noncentral F
 * with ν1 = 1 and ν2 = J − 1 (the treatment×reader df; overridable), and
 * noncentrality λ = Δ² / Var(θ̄₁ − θ̄₂).
 *
 * This is the standard Hillis/Obuchowski–Rockette design-stage power. The
 * variance derivation and the noncentral-F machinery are unit-tested; the
 * large-reader limit reduces to the closed-form normal power. The variance
 * components themselves come from a pilot OR analysis supplied by the caller.
 *
 * Pure and deterministic.
 */

import { noncentralFPower } from './f-distribution';
import { buildProvenance, type StatsProvenance } from './computation-provenance';

export interface MrmcInput {
  /** True difference in the figure of merit between the two modalities (Δ). */
  aucDifference: number;
  /** Number of readers J (≥ 2). */
  nReaders: number;
  /** Treatment×reader variance component, σ²_TR ≥ 0. */
  varTR: number;
  /** Error (case-sampling) variance of a single reader-modality FOM, σ²_ε ≥ 0. */
  varError: number;
  /** Same-reader, different-modality error covariance (Cov1). */
  cov1: number;
  /** Different-reader, same-modality error covariance (Cov2). */
  cov2: number;
  /** Different-reader, different-modality error covariance (Cov3). */
  cov3: number;
  alpha?: number;
  /** Denominator df override; defaults to J − 1 (the treatment×reader df). */
  ddf?: number;
}

export interface MrmcPowerResult {
  power: number;
  /** Noncentrality λ = Δ² / Var(θ̄₁ − θ̄₂). */
  lambda: number;
  /** Variance of the reader-averaged modality difference. */
  varianceOfDifference: number;
  numeratorDf: number;
  denominatorDf: number;
  nReaders: number;
  alpha: number;
  provenance: StatsProvenance;
}

function validate(input: MrmcInput): void {
  if (input.nReaders < 2 || !Number.isInteger(input.nReaders)) {
    throw new Error('nReaders must be an integer ≥ 2');
  }
  if (input.varTR < 0 || input.varError < 0) throw new Error('variances must be non-negative');
  // OR ordering: σ²_ε ≥ Cov1 ≥ Cov2 ≥ Cov3 ≥ 0.
  if (!(input.varError >= input.cov1 && input.cov1 >= input.cov2
        && input.cov2 >= input.cov3 && input.cov3 >= 0)) {
    throw new Error('covariances must satisfy varError ≥ cov1 ≥ cov2 ≥ cov3 ≥ 0');
  }
}

/** Variance of the reader-averaged modality difference under the OR model. */
export function varianceOfModalityDifference(input: MrmcInput): number {
  const J = input.nReaders;
  const den = input.varTR + input.varError - input.cov1 + (J - 1) * (input.cov2 - input.cov3);
  return (2 / J) * den;
}

/** Power to detect `aucDifference` between two modalities in a fully-crossed MRMC study. */
export function mrmcPower(input: MrmcInput): MrmcPowerResult {
  validate(input);
  const alpha = input.alpha ?? 0.05;
  const J = input.nReaders;
  const ddf = input.ddf ?? J - 1;
  if (ddf < 1) throw new Error('denominator df must be ≥ 1');

  const varianceOfDifference = varianceOfModalityDifference(input);
  if (!(varianceOfDifference > 0)) {
    throw new Error('variance of the modality difference must be positive');
  }
  const lambda = (input.aucDifference * input.aucDifference) / varianceOfDifference;
  const power = noncentralFPower(1, ddf, lambda, alpha);

  const inputs = { ...input, alpha, ddf };
  return {
    power,
    lambda,
    varianceOfDifference,
    numeratorDf: 1,
    denominatorDf: ddf,
    nReaders: J,
    alpha,
    provenance: buildProvenance({
      method: 'mrmc:power',
      seed: 0,
      inputs,
      note: 'Obuchowski–Rockette modality-difference power via noncentral F; deterministic.',
    }),
  };
}

export interface MrmcReadersResult {
  nReaders: number | null;
  power: number | null;
  targetPower: number;
  searchedUpTo: number;
}

/**
 * Smallest number of readers reaching `targetPower`, holding the per-reader
 * variance components fixed. Returns null when the target is unreachable within
 * `maxReaders` (e.g. the effect is too small for the assumed variability).
 */
export function mrmcReadersForPower(
  input: Omit<MrmcInput, 'nReaders'> & { targetPower: number; maxReaders?: number },
): MrmcReadersResult {
  const maxReaders = input.maxReaders ?? 100;
  if (!(input.targetPower > 0 && input.targetPower < 1)) {
    throw new Error('targetPower must be in (0, 1)');
  }
  for (let J = 2; J <= maxReaders; J++) {
    const r = mrmcPower({ ...input, nReaders: J });
    if (r.power >= input.targetPower) {
      return { nReaders: J, power: r.power, targetPower: input.targetPower, searchedUpTo: J };
    }
  }
  return { nReaders: null, power: null, targetPower: input.targetPower, searchedUpTo: maxReaders };
}
