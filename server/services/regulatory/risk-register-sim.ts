/**
 * Risk-register Monte-Carlo — quantifies an ISO 14971 residual-risk profile.
 *
 * Turns a set of residual risk items (severity + decomposed probability P1×P2)
 * into a simulated distribution of total harm exposure over a use period, the
 * probability of at least one serious-or-worse event, and the probability the
 * exposure exceeds an acceptability threshold. Complements the deterministic
 * iso-14971-risk engine with a probabilistic view.
 *
 * Seeded/reproducible.
 */

import { createRng } from '../stats/rng';
import { percentile } from '../stats/monte-carlo';
import {
  SEVERITY_SCALE,
  PROBABILITY_SCALE,
  type Severity,
  type Probability,
} from './iso-14971-risk';

/** Illustrative per-use-period occurrence rate for each probability band. */
const BAND_RATE: Record<Probability, number> = {
  improbable: 0.001,
  remote: 0.01,
  occasional: 0.05,
  probable: 0.2,
  frequent: 0.5,
};

export interface ResidualRiskItem {
  id?: string;
  severity: Severity;
  /** Probability of the hazardous situation. */
  p1: Probability;
  /** Probability the hazardous situation leads to harm. */
  p2: Probability;
}

export interface RiskRegisterSimArgs {
  items: ResidualRiskItem[];
  iterations?: number;
  seed?: number;
  /** Severity at/above which an event counts as "serious". Default 'serious'. */
  seriousAt?: Severity;
  /** Total-harm score above which a trial is "unacceptable". Default = sum of severity weights × 0.5. */
  harmThreshold?: number;
}

interface DistributionSummary {
  mean: number; median: number; p2_5: number; p95: number; max: number;
}

export interface PerItemRisk {
  id: string;
  severityWeight: number;
  occurrenceProbability: number;
  /** Expected harm contribution per period (severity × occurrence). */
  expectedHarm: number;
}

export interface RiskRegisterSimResult {
  iterations: number;
  itemCount: number;
  perItem: PerItemRisk[];
  /** Distribution of total harm score per use period. */
  totalHarm: DistributionSummary;
  /** Probability ≥1 serious-or-worse event occurs in a period. */
  probabilityAnySeriousEvent: number;
  /** Expected number of harmful events per period. */
  expectedEventsPerPeriod: number;
  harmThreshold: number;
  /** Probability the total harm exceeds the acceptability threshold. */
  probabilityExceedsThreshold: number;
}

const round = (n: number, dp = 4): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

function severityWeight(s: Severity): number {
  return SEVERITY_SCALE.indexOf(s) + 1; // 1..5
}

/** Run a Monte-Carlo over residual risks and summarize the harm exposure. */
export function simulateRiskRegister(args: RiskRegisterSimArgs): RiskRegisterSimResult {
  if (!Array.isArray(args.items) || args.items.length === 0) {
    throw new Error('At least one residual risk item is required.');
  }
  const iterations = Math.min(100000, Math.max(1000, args.iterations ?? 10000));
  const rng = createRng(args.seed ?? 0x14971);
  const seriousIndex = SEVERITY_SCALE.indexOf(args.seriousAt ?? 'serious');

  const perItem: PerItemRisk[] = args.items.map((it, i) => {
    if (!SEVERITY_SCALE.includes(it.severity)) throw new Error(`Invalid severity: ${it.severity}`);
    if (!PROBABILITY_SCALE.includes(it.p1) || !PROBABILITY_SCALE.includes(it.p2)) {
      throw new Error('Invalid probability band.');
    }
    const w = severityWeight(it.severity);
    // P = P1 × P2 (ISO/TR 24971 decomposition).
    const occ = BAND_RATE[it.p1] * BAND_RATE[it.p2];
    return { id: it.id ?? `risk-${i + 1}`, severityWeight: w, occurrenceProbability: round(occ, 6), expectedHarm: round(w * occ, 6) };
  });

  const defaultThreshold = perItem.reduce((s, p) => s + p.severityWeight, 0) * 0.5;
  const harmThreshold = args.harmThreshold ?? round(defaultThreshold, 2);

  const totals: number[] = [];
  let seriousTrials = 0;
  let eventSum = 0;
  let exceedTrials = 0;

  for (let t = 0; t < iterations; t++) {
    let harm = 0;
    let events = 0;
    let serious = false;
    for (let i = 0; i < args.items.length; i++) {
      if (rng.uniform() < perItem[i].occurrenceProbability) {
        harm += perItem[i].severityWeight;
        events += 1;
        if (SEVERITY_SCALE.indexOf(args.items[i].severity) >= seriousIndex) serious = true;
      }
    }
    totals.push(harm);
    eventSum += events;
    if (serious) seriousTrials += 1;
    if (harm > harmThreshold) exceedTrials += 1;
  }

  const sorted = [...totals].sort((a, b) => a - b);
  const mean = totals.reduce((s, v) => s + v, 0) / totals.length;
  const totalHarm: DistributionSummary = {
    mean: round(mean, 3),
    median: round(percentile(sorted, 50), 3),
    p2_5: round(percentile(sorted, 2.5), 3),
    p95: round(percentile(sorted, 95), 3),
    max: round(sorted[sorted.length - 1], 3),
  };

  return {
    iterations,
    itemCount: args.items.length,
    perItem,
    totalHarm,
    probabilityAnySeriousEvent: round(seriousTrials / iterations),
    expectedEventsPerPeriod: round(eventSum / iterations, 4),
    harmThreshold,
    probabilityExceedsThreshold: round(exceedTrials / iterations),
  };
}
