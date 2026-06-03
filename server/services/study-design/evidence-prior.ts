/**
 * Evidence-grounded priors for trial-outcome simulation.
 *
 * A trial simulator is only as honest as the prior it integrates over. This module
 * turns historical evidence — effect sizes read from prior-phase CSRs, comparable
 * registered trials, and the literature — into a prior distribution on the treatment
 * effect, and it refuses to launder an assumption as data: when no evidence is
 * supplied the prior is marked `assumption`, deliberately widened, and every gap is
 * surfaced as a caveat. Between-source disagreement widens the prior (random-effects
 * heterogeneity) rather than being averaged away.
 *
 * The pooled mean and the *predictive* SD (the uncertainty about the effect a NEW
 * trial would see) are exactly the two numbers the assurance integral needs, so the
 * prior produced here drops straight into `simulateTrial`. Pure and deterministic.
 *
 * Method: inverse-variance weighting with optional relevance down-weighting, and the
 * DerSimonian–Laird random-effects estimate of between-source heterogeneity τ². The
 * prior SD returned is the predictive SD √(Var(μ̂) + τ²) — not the (smaller) SD of the
 * pooled mean — because the simulator asks "what effect will the next trial have",
 * not "where is the historical average".
 *
 * @module server/services/study-design/evidence-prior
 */

import type { EvidenceRef } from './study-design-types';

/**
 * One historical observation of the treatment effect, on the design's analysis
 * scale (standardized mean difference for continuous, log hazard ratio for
 * time-to-event, log odds ratio or risk difference for binary — the scale must be
 * consistent across the observations in a single prior).
 */
export interface EvidenceObservation {
  /** Where this observation came from (CSR id, NCT id, DOI). Required — no anonymous priors. */
  source: EvidenceRef;
  /** The observed effect on the analysis scale. */
  effect: number;
  /** Standard error of this observation. Must be > 0. Drives its weight. */
  standardError: number;
  /** Sample size behind the observation, for display and low-information caveats. */
  n?: number;
  /**
   * Similarity of this source to the planned trial (0–1): population, endpoint,
   * control, and era match. Down-weights dissimilar evidence. Defaults to 1.
   */
  relevance?: number;
}

/** How a prior on the effect was formed. */
export type PriorBasis = 'evidence' | 'assumption' | 'evidence_with_assumption';

/** A prior on the treatment effect, ready for the assurance integral. */
export interface EffectPrior {
  /** Prior mean of the effect on the analysis scale. */
  mean: number;
  /** Predictive SD: the uncertainty about the effect the next trial will see. */
  sd: number;
  basis: PriorBasis;
  /** The observations that informed the prior (empty ⇒ assumption-only). */
  observations: EvidenceObservation[];
  /** Between-source heterogeneity τ (random-effects), when ≥ 2 sources. */
  heterogeneity?: number;
  /** Total sample size behind the evidence, when known. */
  totalEvidenceN?: number;
  /** Honest warnings the simulator must surface to the reader. */
  caveats: string[];
  /** The distinct sources behind the prior, for the assumptions ledger. */
  sources: EvidenceRef[];
}

/** Options for {@link buildEffectPrior}. */
export interface BuildEffectPriorOptions {
  /**
   * The planned/assumed effect to fall back on when there is no usable evidence,
   * or to compare the evidence against for an optimism check. This is the number a
   * sponsor put in the power calculation.
   */
  plannedEffect?: number;
  /**
   * Prior SD to use for an assumption-only prior. Deliberately wide so the
   * resulting probability of success is honestly uncertain. Defaults to
   * |plannedEffect| (a coefficient-of-variation of ~1) with a floor.
   */
  assumptionSd?: number;
  /**
   * If the planned effect exceeds the pooled evidence mean by more than this
   * fraction, raise an optimism-bias caveat. Defaults to 0.25 (25%).
   */
  optimismThreshold?: number;
}

const MIN_ASSUMPTION_SD = 0.05;

/** Sum helper. */
function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/** Distinct evidence sources, preserving first-seen order. */
function distinctSources(observations: EvidenceObservation[]): EvidenceRef[] {
  const seen = new Set<string>();
  const out: EvidenceRef[] = [];
  for (const o of observations) {
    const key = `${o.source.kind}|${o.source.ref ?? ''}|${o.source.source}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(o.source);
    }
  }
  return out;
}

/**
 * Build a prior on the treatment effect from historical observations.
 *
 * With no observations the prior is an explicit assumption centered on
 * `plannedEffect` with a wide SD (and a caveat). With observations it is a
 * random-effects (DerSimonian–Laird) pool: the mean is inverse-variance weighted
 * (optionally by relevance), and the SD is the predictive SD √(Var(μ̂) + τ²) so the
 * simulator integrates over genuine between-trial variability. Disagreement among
 * sources widens the prior; a single source cannot estimate heterogeneity and says so.
 */
export function buildEffectPrior(
  observations: EvidenceObservation[],
  options: BuildEffectPriorOptions = {},
): EffectPrior {
  const usable = observations.filter(
    o => Number.isFinite(o.effect) && Number.isFinite(o.standardError) && o.standardError > 0,
  );
  const caveats: string[] = [];

  // ── No usable evidence: an explicit assumption, never invented data. ──
  if (usable.length === 0) {
    if (options.plannedEffect === undefined || !Number.isFinite(options.plannedEffect)) {
      throw new Error(
        'buildEffectPrior: no usable evidence and no plannedEffect — cannot form a prior without an effect assumption.',
      );
    }
    const sd = Math.max(
      options.assumptionSd ?? Math.abs(options.plannedEffect),
      MIN_ASSUMPTION_SD,
    );
    caveats.push(
      'No historical evidence supplied; the prior is an assumption, not data. Probability of success reflects that uncertainty.',
    );
    if (observations.length > usable.length) {
      caveats.push('Some supplied observations were discarded (non-finite effect or non-positive standard error).');
    }
    return {
      mean: options.plannedEffect,
      sd,
      basis: 'assumption',
      observations: [],
      caveats,
      sources: [],
    };
  }

  if (observations.length > usable.length) {
    caveats.push('Some supplied observations were discarded (non-finite effect or non-positive standard error).');
  }

  // Relevance-adjusted inverse-variance weights (fixed-effect stage).
  const rel = usable.map(o => Math.min(Math.max(o.relevance ?? 1, 0), 1));
  if (rel.some(r => r < 1)) {
    caveats.push('Some evidence was down-weighted for limited similarity to the planned trial.');
  }
  const wFixed = usable.map((o, i) => rel[i] / (o.standardError * o.standardError));
  const sumW = sum(wFixed);
  const muFixed = sum(usable.map((o, i) => wFixed[i] * o.effect)) / sumW;

  // DerSimonian–Laird heterogeneity τ² (needs ≥ 2 sources).
  let tau2 = 0;
  if (usable.length >= 2) {
    const Q = sum(usable.map((o, i) => wFixed[i] * (o.effect - muFixed) ** 2));
    const sumWsq = sum(wFixed.map(w => w * w));
    const c = sumW - sumWsq / sumW;
    tau2 = c > 0 ? Math.max(0, (Q - (usable.length - 1)) / c) : 0;
  } else {
    caveats.push('Prior rests on a single source; between-trial heterogeneity cannot be estimated and is likely understated.');
  }

  // Random-effects re-pool with τ² added to each variance.
  const wRand = usable.map((o, i) => rel[i] / (o.standardError * o.standardError + tau2));
  const sumWR = sum(wRand);
  const mean = sum(usable.map((o, i) => wRand[i] * o.effect)) / sumWR;
  const varMean = 1 / sumWR; // variance of the pooled mean
  const predictiveSd = Math.sqrt(varMean + tau2); // SD of the next trial's true effect

  const tau = Math.sqrt(tau2);
  if (usable.length >= 2 && tau > Math.abs(mean) * 0.5 && Math.abs(mean) > 1e-9) {
    caveats.push('Substantial disagreement among sources (heterogeneity exceeds half the pooled effect); the prior is correspondingly wide.');
  }

  const ns = usable.map(o => o.n).filter((n): n is number => typeof n === 'number' && n > 0);
  const totalEvidenceN = ns.length ? sum(ns) : undefined;
  if (totalEvidenceN !== undefined && totalEvidenceN < 100) {
    caveats.push('Total evidence base is small (< 100 subjects); the pooled effect is fragile.');
  }

  let basis: PriorBasis = 'evidence';

  // Optimism check against the sponsor's planned effect.
  if (options.plannedEffect !== undefined && Number.isFinite(options.plannedEffect)) {
    const threshold = options.optimismThreshold ?? 0.25;
    const planned = options.plannedEffect;
    const exceeds = Math.abs(mean) > 1e-9 && Math.abs(planned) > Math.abs(mean) * (1 + threshold);
    const sameDirection = planned * mean >= 0;
    if (exceeds && sameDirection) {
      basis = 'evidence_with_assumption';
      const pct = Math.round((Math.abs(planned) / Math.abs(mean) - 1) * 100);
      caveats.push(
        `Planned effect exceeds the pooled historical effect by ~${pct}%. The simulation uses the evidence-based prior; the planned effect is likely optimistic.`,
      );
    }
  }

  return {
    mean,
    sd: predictiveSd,
    basis,
    observations: usable,
    heterogeneity: usable.length >= 2 ? tau : undefined,
    totalEvidenceN,
    caveats,
    sources: distinctSources(usable),
  };
}
