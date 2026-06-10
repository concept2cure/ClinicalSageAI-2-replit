/**
 * Monte-Carlo / probabilistic layer for IVD analysis.
 *
 * Deterministic (seeded) Monte-Carlo utilities that turn point estimates into
 * distributions with credible intervals — for diagnostic accuracy (Beta-
 * posterior credible intervals on a 2×2) and for propagating evidence-
 * completion uncertainty through the reviewer simulation into a distribution of
 * likely review outcomes.
 *
 * Reuses the repository's seeded RNG (server/services/stats/rng.ts) so results
 * are reproducible for a given seed.
 */

import { createRng, type Rng } from './rng';
import {
  simulateIvdReview,
  type ReviewProfile,
  type EvidencePresence,
} from '../regulatory/reviewer-simulation-ivd';

const round = (n: number, dp = 4): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Percentile of an already-sorted ascending numeric array (linear interp). */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface DistributionSummary {
  mean: number;
  median: number;
  p2_5: number;
  p97_5: number;
  min: number;
  max: number;
}

function summarize(samples: number[]): DistributionSummary {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  return {
    mean: round(mean),
    median: round(percentile(sorted, 50)),
    p2_5: round(percentile(sorted, 2.5)),
    p97_5: round(percentile(sorted, 97.5)),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostic-accuracy credible intervals (Beta posterior, Jeffreys prior)
// ─────────────────────────────────────────────────────────────────────────────

export interface AccuracyMonteCarloArgs {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  iterations?: number;
  seed?: number;
}

export interface AccuracyMonteCarloResult {
  iterations: number;
  sensitivity: DistributionSummary;
  specificity: DistributionSummary;
  ppv: DistributionSummary;
  npv: DistributionSummary;
  method: 'Beta-posterior Monte-Carlo (Jeffreys prior)';
}

/**
 * Monte-Carlo credible intervals for diagnostic accuracy from a 2×2 table.
 * Sensitivity ~ Beta(tp+0.5, fn+0.5), Specificity ~ Beta(tn+0.5, fp+0.5);
 * predictive values are derived per draw using the observed prevalence.
 */
export function diagnosticAccuracyMonteCarlo(args: AccuracyMonteCarloArgs): AccuracyMonteCarloResult {
  const { tp, fp, fn, tn } = args;
  if ([tp, fp, fn, tn].some(v => v < 0 || !Number.isInteger(v))) {
    throw new Error('2x2 cells must be non-negative integers.');
  }
  const total = tp + fp + fn + tn;
  if (total === 0) throw new Error('2x2 table is empty.');
  const iterations = Math.min(100000, Math.max(1000, args.iterations ?? 10000));
  const rng: Rng = createRng(args.seed ?? 0xC0FFEE);
  const prevalence = (tp + fn) / total;

  const sens: number[] = [];
  const spec: number[] = [];
  const ppv: number[] = [];
  const npv: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const se = rng.beta(tp + 0.5, fn + 0.5);
    const sp = rng.beta(tn + 0.5, fp + 0.5);
    sens.push(se);
    spec.push(sp);
    // Predictive values via Bayes at the observed prevalence.
    const ppvDenom = se * prevalence + (1 - sp) * (1 - prevalence);
    const npvDenom = sp * (1 - prevalence) + (1 - se) * prevalence;
    ppv.push(ppvDenom > 0 ? (se * prevalence) / ppvDenom : 0);
    npv.push(npvDenom > 0 ? (sp * (1 - prevalence)) / npvDenom : 0);
  }

  return {
    iterations,
    sensitivity: summarize(sens),
    specificity: summarize(spec),
    ppv: summarize(ppv),
    npv: summarize(npv),
    method: 'Beta-posterior Monte-Carlo (Jeffreys prior)',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Time-to-market simulation
// ─────────────────────────────────────────────────────────────────────────────

/** Triangular variate with lower a, mode c, upper b. */
function triangular(rng: Rng, a: number, c: number, b: number): number {
  if (b <= a) return a;
  const u = rng.uniform();
  const fc = (c - a) / (b - a);
  return u < fc ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

export interface TimeToMarketArgs {
  /** Sequenced phases; studies within a phase run in parallel (duration ≈ max). */
  phases: { name: string; studyWeeks: number[] }[];
  /** Upside risk factor on the mode estimate (e.g., 0.6 → up to 1.6× slippage). */
  slipFactor?: number;
  iterations?: number;
  seed?: number;
}

export interface TimeToMarketResult {
  iterations: number;
  /** Distribution of total calendar weeks (phases run sequentially). */
  totalWeeks: DistributionSummary;
  perPhase: { name: string; weeks: DistributionSummary }[];
  /** Planning-friendly percentiles. */
  p50Weeks: number;
  p90Weeks: number;
  method: 'Triangular per-study, parallel-within-phase Monte-Carlo';
}

/**
 * Simulate program calendar time: each study's actual duration varies
 * triangularly around its estimate (0.85× lower, 1× mode, (1+slip)·1.5 upper),
 * phases run in parallel internally and sequentially overall.
 */
export function timeToMarketMonteCarlo(args: TimeToMarketArgs): TimeToMarketResult {
  if (!Array.isArray(args.phases) || args.phases.length === 0) {
    throw new Error('phases is required and must be non-empty.');
  }
  const iterations = Math.min(50000, Math.max(500, args.iterations ?? 5000));
  const slip = Math.max(0, args.slipFactor ?? 0.5);
  const rng = createRng(args.seed ?? 0x7117ee);
  const totals: number[] = [];
  const phaseSamples: number[][] = args.phases.map(() => []);

  for (let i = 0; i < iterations; i++) {
    let total = 0;
    args.phases.forEach((phase, pi) => {
      let phaseDuration = 0;
      for (const base of phase.studyWeeks) {
        if (base <= 0) continue;
        const dur = triangular(rng, base * 0.85, base, base * (1 + slip) * 1.5);
        if (dur > phaseDuration) phaseDuration = dur; // parallel within phase
      }
      phaseSamples[pi].push(phaseDuration);
      total += phaseDuration;
    });
    totals.push(total);
  }

  const sortedTotals = [...totals].sort((a, b) => a - b);
  return {
    iterations,
    totalWeeks: summarize(totals),
    perPhase: args.phases.map((p, i) => ({ name: p.name, weeks: summarize(phaseSamples[i]) })),
    p50Weeks: round(percentile(sortedTotals, 50), 1),
    p90Weeks: round(percentile(sortedTotals, 90), 1),
    method: 'Triangular per-study, parallel-within-phase Monte-Carlo',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Probabilistic review-outcome simulation
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewOutcomeMonteCarloArgs {
  profile: Omit<ReviewProfile, 'evidence'>;
  /** Per-evidence-element probability of being complete by submission (0–1). */
  evidenceProbabilities: Partial<Record<keyof EvidencePresence, number>>;
  iterations?: number;
  seed?: number;
}

export interface ReviewOutcomeMonteCarloResult {
  iterations: number;
  readinessScore: DistributionSummary;
  /** Probability mass over the three verdicts. */
  verdictProbabilities: {
    likely_acceptance: number;
    additional_information_likely: number;
    not_substantially_complete: number;
  };
  /** Probability the submission would be substantially complete (no majors). */
  probabilitySubstantiallyComplete: number;
  meanEstimatedReviewCycles: number;
}

/**
 * Propagate uncertainty in evidence completion through the reviewer simulation:
 * each trial draws each evidence element present with its supplied probability,
 * runs the deterministic reviewer engine, and aggregates the outcome distribution.
 */
export function reviewOutcomeMonteCarlo(args: ReviewOutcomeMonteCarloArgs): ReviewOutcomeMonteCarloResult {
  const iterations = Math.min(50000, Math.max(500, args.iterations ?? 5000));
  const rng = createRng(args.seed ?? 0xBADA55);
  const keys = Object.keys(args.evidenceProbabilities) as (keyof EvidencePresence)[];

  const scores: number[] = [];
  const verdicts = { likely_acceptance: 0, additional_information_likely: 0, not_substantially_complete: 0 };
  let cyclesSum = 0;

  for (let i = 0; i < iterations; i++) {
    const evidence: EvidencePresence = {};
    for (const k of keys) {
      const p = args.evidenceProbabilities[k] ?? 0;
      evidence[k] = rng.bernoulli(Math.max(0, Math.min(1, p)));
    }
    const r = simulateIvdReview({ ...args.profile, evidence });
    scores.push(r.readinessScore);
    verdicts[r.verdict] += 1;
    cyclesSum += r.estimatedReviewCycles;
  }

  return {
    iterations,
    readinessScore: summarize(scores),
    verdictProbabilities: {
      likely_acceptance: round(verdicts.likely_acceptance / iterations),
      additional_information_likely: round(verdicts.additional_information_likely / iterations),
      not_substantially_complete: round(verdicts.not_substantially_complete / iterations),
    },
    probabilitySubstantiallyComplete: round(
      (verdicts.likely_acceptance + verdicts.additional_information_likely) / iterations
    ),
    meanEstimatedReviewCycles: round(cyclesSum / iterations, 2),
  };
}
