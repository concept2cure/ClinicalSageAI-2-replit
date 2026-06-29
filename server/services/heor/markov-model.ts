/**
 * Markov cohort model for cost-effectiveness (HEOR).
 *
 * Simulates a closed cohort through a discrete-state Markov chain over a fixed
 * number of cycles, accruing discounted costs and QALYs. Pure/deterministic —
 * identical inputs yield identical results.
 *
 * Conventions (documented so the numbers are reproducible and defensible):
 *   - Costs/utilities accrue once per cycle for t = 1..cycles, using the cohort
 *     distribution at the START of that cycle (no half-cycle correction —
 *     stated explicitly; apply one externally if your SAP requires it).
 *   - Discount factor for cycle t is 1/(1+r)^((t-1)·cycleLengthYears), i.e. the
 *     first cycle is undiscounted.
 *
 * @module server/services/heor/markov-model
 */

export interface MarkovModelInput {
  /** State names, e.g. ["Healthy","Sick","Dead"]. */
  states: string[];
  /** Square transition matrix; row i = probabilities FROM state i (each row sums to 1). */
  transitionMatrix: number[][];
  /** Cost accrued per cycle while in each state (index-aligned to states). */
  stateCosts: number[];
  /** Utility (QALY weight, typically 0–1) per cycle in each state. */
  stateUtilities: number[];
  /** Number of cycles to run (integer ≥ 1). */
  cycles: number;
  /** Annual discount rate (e.g. 0.03). Default 0. */
  discountRate?: number;
  /** Years per cycle, for discounting. Default 1. */
  cycleLengthYears?: number;
  /** Starting distribution across states (sums to 1). Default: all in state 0. */
  initialDistribution?: number[];
  /** Cohort size for absolute membership counts. Default 1 (per-patient). */
  cohortSize?: number;
}

export interface MarkovCycleTrace {
  cycle: number;
  /** Cohort fraction in each state at the start of the cycle. */
  distribution: number[];
  cycleCost: number;
  cycleQALY: number;
  discountFactor: number;
}

export interface MarkovModelResult {
  states: string[];
  cycles: number;
  discountRate: number;
  cycleLengthYears: number;
  trace: MarkovCycleTrace[];
  totalCost: number;
  totalQALY: number;
  undiscountedCost: number;
  undiscountedQALY: number;
  notes: string[];
}

function round(n: number, dp = 6): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

const SUM_TOLERANCE = 1e-6;

/** Run the Markov cohort simulation. */
export function runMarkovModel(input: MarkovModelInput): MarkovModelResult {
  const n = input.states?.length ?? 0;
  if (n < 2) throw new Error('states must have at least 2 entries');
  const M = input.transitionMatrix;
  if (!Array.isArray(M) || M.length !== n || M.some((row) => !Array.isArray(row) || row.length !== n)) {
    throw new Error('transitionMatrix must be square with dimension = number of states');
  }
  M.forEach((row, i) => {
    const s = row.reduce((a, b) => a + b, 0);
    if (row.some((p) => p < 0 || p > 1)) throw new Error(`transitionMatrix row ${i} has a probability outside [0,1]`);
    if (Math.abs(s - 1) > SUM_TOLERANCE) throw new Error(`transitionMatrix row ${i} must sum to 1 (got ${s})`);
  });
  if (input.stateCosts.length !== n || input.stateUtilities.length !== n) {
    throw new Error('stateCosts and stateUtilities must be index-aligned to states');
  }
  if (!Number.isInteger(input.cycles) || input.cycles < 1) throw new Error('cycles must be an integer ≥ 1');

  const discountRate = input.discountRate ?? 0;
  if (discountRate < 0 || discountRate >= 1) throw new Error('discountRate must be in [0,1)');
  const cycleLengthYears = input.cycleLengthYears ?? 1;
  if (cycleLengthYears <= 0) throw new Error('cycleLengthYears must be > 0');
  const cohortSize = input.cohortSize ?? 1;
  if (cohortSize <= 0) throw new Error('cohortSize must be > 0');

  let dist = input.initialDistribution ? [...input.initialDistribution] : Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0));
  if (dist.length !== n) throw new Error('initialDistribution must be index-aligned to states');
  const distSum = dist.reduce((a, b) => a + b, 0);
  if (Math.abs(distSum - 1) > SUM_TOLERANCE) throw new Error(`initialDistribution must sum to 1 (got ${distSum})`);

  const trace: MarkovCycleTrace[] = [];
  let totalCost = 0;
  let totalQALY = 0;
  let undiscountedCost = 0;
  let undiscountedQALY = 0;

  for (let t = 1; t <= input.cycles; t++) {
    const discountFactor = 1 / Math.pow(1 + discountRate, (t - 1) * cycleLengthYears);
    let cycleCost = 0;
    let cycleQALY = 0;
    for (let i = 0; i < n; i++) {
      cycleCost += dist[i] * input.stateCosts[i] * cohortSize;
      cycleQALY += dist[i] * input.stateUtilities[i] * cohortSize;
    }
    trace.push({
      cycle: t,
      distribution: dist.map((d) => round(d)),
      cycleCost: round(cycleCost),
      cycleQALY: round(cycleQALY),
      discountFactor: round(discountFactor),
    });
    undiscountedCost += cycleCost;
    undiscountedQALY += cycleQALY;
    totalCost += cycleCost * discountFactor;
    totalQALY += cycleQALY * discountFactor;

    // Advance the cohort: next[j] = Σ_i dist[i]·M[i][j]
    const next = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) next[j] += dist[i] * M[i][j];
    }
    dist = next;
  }

  return {
    states: input.states,
    cycles: input.cycles,
    discountRate,
    cycleLengthYears,
    trace,
    totalCost: round(totalCost, 4),
    totalQALY: round(totalQALY, 6),
    undiscountedCost: round(undiscountedCost, 4),
    undiscountedQALY: round(undiscountedQALY, 6),
    notes: [
      'Costs/utilities accrue per cycle on the start-of-cycle distribution; no half-cycle correction applied.',
      'Discount factor for cycle t = 1/(1+rate)^((t-1)·cycleLengthYears); first cycle undiscounted.',
    ],
  };
}
