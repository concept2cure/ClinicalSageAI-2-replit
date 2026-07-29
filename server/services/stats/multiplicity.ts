/**
 * Multiple-testing procedures with family-wise error rate (FWER) control.
 *
 * Given observed p-values for a family of hypotheses, decide which to reject
 * while controlling the FWER at level alpha. This is the *decision* layer that
 * complements estimand-engine-service.designMultiplicityStrategy (which
 * allocates alpha but does not test hypotheses or demonstrate error control).
 *
 * Procedures:
 *   - bonferroni / weighted Bonferroni — single-step; FWER ≤ α under any dependence.
 *   - holm — step-down; FWER ≤ α under any dependence.
 *   - hochberg — step-up; FWER ≤ α under independence / PRDS.
 *   - fixed-sequence — hierarchical; FWER ≤ α under any dependence.
 *   - graphical (Bretz, Maurer, Brannath & Posch 2009) — the general sequentially
 *     rejective procedure that subsumes the above (Bonferroni–Holm, fixed
 *     sequence, fallback, gatekeeping are special cases). FWER ≤ α under any
 *     dependence.
 *
 * Pure and deterministic. `estimateFWER` provides a seeded Monte Carlo check of
 * error control under the global null — the GA acceptance bar for this work.
 */

import { createRng, seedFromObject } from './rng';
import { buildProvenance, type StatsProvenance } from './computation-provenance';

export type MultiplicityProcedure =
  | 'bonferroni'
  | 'weighted-bonferroni'
  | 'holm'
  | 'hochberg'
  | 'fixed-sequence'
  | 'graphical';

const EPS = 1e-12;

function validatePValues(p: number[]): void {
  if (p.length === 0) throw new Error('pValues must be non-empty');
  for (const x of p) {
    if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1) {
      throw new Error(`p-value ${x} must be a number in [0, 1]`);
    }
  }
}

function normalizedWeights(m: number, weights?: number[]): number[] {
  if (!weights) return new Array(m).fill(1 / m);
  if (weights.length !== m) throw new Error('weights length must match the number of hypotheses');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error('weights must sum to a positive value');
  // Allow weights that sum to ≤ 1 (a valid partial allocation) but never > 1.
  if (sum > 1 + 1e-9) throw new Error('weights must sum to at most 1');
  return weights.slice();
}

/** Single-step (weighted) Bonferroni: reject H_i iff p_i ≤ w_i·α (and w_i > 0). */
export function bonferroniReject(p: number[], alpha: number, weights?: number[]): boolean[] {
  validatePValues(p);
  const w = normalizedWeights(p.length, weights);
  // A hypothesis with no allocated alpha (w_i = 0) is never rejectable.
  return p.map((pi, i) => w[i] > 0 && pi <= w[i] * alpha + EPS);
}

/** Holm step-down procedure (unweighted). FWER ≤ α under any dependence. */
export function holmReject(p: number[], alpha: number): boolean[] {
  validatePValues(p);
  const m = p.length;
  const order = [...Array(m).keys()].sort((a, b) => p[a] - p[b]);
  const rejected = new Array(m).fill(false);
  for (let k = 0; k < m; k++) {
    const i = order[k];
    if (p[i] <= alpha / (m - k) + EPS) rejected[i] = true;
    else break; // step-down: stop at the first non-rejection
  }
  return rejected;
}

/** Hochberg step-up procedure. FWER ≤ α under independence / PRDS. */
export function hochbergReject(p: number[], alpha: number): boolean[] {
  validatePValues(p);
  const m = p.length;
  const order = [...Array(m).keys()].sort((a, b) => p[a] - p[b]);
  const rejected = new Array(m).fill(false);
  for (let k = m; k >= 1; k--) {
    const i = order[k - 1];
    if (p[i] <= alpha / (m - k + 1) + EPS) {
      for (let j = 0; j < k; j++) rejected[order[j]] = true;
      break; // step-up: once a threshold is met, reject it and all smaller
    }
  }
  return rejected;
}

/** Fixed-sequence: test in the given order at full α; stop at the first failure. */
export function fixedSequenceReject(p: number[], alpha: number): boolean[] {
  validatePValues(p);
  const rejected = new Array(p.length).fill(false);
  for (let i = 0; i < p.length; i++) {
    if (p[i] <= alpha + EPS) rejected[i] = true;
    else break;
  }
  return rejected;
}

/**
 * Bretz et al. (2009) graphical procedure. `weights` are the initial alpha
 * fractions (sum ≤ 1); `G` is the transition matrix (rows sum ≤ 1, zero
 * diagonal). Sequentially rejective: repeatedly reject any active H_i with
 * p_i ≤ w_i·α, then propagate its weight along G and update the graph.
 */
export function graphicalReject(
  p: number[],
  alpha: number,
  weights: number[],
  G: number[][],
): boolean[] {
  validatePValues(p);
  const m = p.length;
  if (weights.length !== m) throw new Error('weights length must match hypotheses');
  if (G.length !== m || G.some(row => row.length !== m)) {
    throw new Error('transition matrix must be m×m');
  }

  const rejected = new Array(m).fill(false);
  const active = new Array(m).fill(true);
  const w = weights.slice();
  let g = G.map(row => row.slice());

  for (;;) {
    let j = -1;
    for (let i = 0; i < m; i++) {
      // A hypothesis with no allocated weight (w_i = 0) is not rejectable until
      // it receives weight via propagation from a rejected hypothesis.
      if (active[i] && w[i] > 0 && p[i] <= w[i] * alpha + EPS) {
        j = i;
        break;
      }
    }
    if (j === -1) break;

    rejected[j] = true;
    active[j] = false;

    // Propagate j's weight to the remaining hypotheses.
    for (let i = 0; i < m; i++) {
      if (active[i]) w[i] += w[j] * g[j][i];
    }
    w[j] = 0;

    // Update the graph (remove node j).
    const ng = g.map(row => row.slice());
    for (let i = 0; i < m; i++) {
      if (!active[i]) continue;
      for (let l = 0; l < m; l++) {
        if (!active[l] || l === i) {
          ng[i][l] = 0;
          continue;
        }
        const denom = 1 - g[i][j] * g[j][i];
        ng[i][l] = denom > EPS ? (g[i][l] + g[i][j] * g[j][l]) / denom : 0;
      }
      ng[i][j] = 0;
    }
    g = ng;
  }

  return rejected;
}

export interface MultiplicityTestInput {
  pValues: number[];
  alpha: number;
  procedure: MultiplicityProcedure;
  /** Hypothesis ids, parallel to pValues; defaults to H1..Hm. */
  ids?: string[];
  /** Required for weighted-bonferroni and graphical. */
  weights?: number[];
  /** Required for graphical: the m×m transition matrix. */
  transitionMatrix?: number[][];
}

export interface MultiplicityDecision {
  id: string;
  pValue: number;
  rejected: boolean;
}

export interface MultiplicityTestResult {
  procedure: MultiplicityProcedure;
  alpha: number;
  rejectedIds: string[];
  rejectedIndices: number[];
  decisions: MultiplicityDecision[];
  provenance: StatsProvenance;
}

function applyProcedure(input: MultiplicityTestInput): boolean[] {
  const { pValues: p, alpha, procedure } = input;
  switch (procedure) {
    case 'bonferroni':
      return bonferroniReject(p, alpha);
    case 'weighted-bonferroni':
      return bonferroniReject(p, alpha, normalizedWeights(p.length, input.weights));
    case 'holm':
      return holmReject(p, alpha);
    case 'hochberg':
      return hochbergReject(p, alpha);
    case 'fixed-sequence':
      return fixedSequenceReject(p, alpha);
    case 'graphical': {
      if (!input.weights || !input.transitionMatrix) {
        throw new Error('graphical procedure requires weights and transitionMatrix');
      }
      return graphicalReject(p, alpha, input.weights, input.transitionMatrix);
    }
    default:
      throw new Error(`unknown procedure: ${procedure}`);
  }
}

/** Apply a multiplicity procedure to observed p-values. Deterministic. */
export function testMultiplicity(input: MultiplicityTestInput): MultiplicityTestResult {
  if (!(input.alpha > 0 && input.alpha < 1)) throw new Error('alpha must be in (0, 1)');
  validatePValues(input.pValues);
  const ids = input.ids ?? input.pValues.map((_, i) => `H${i + 1}`);
  if (ids.length !== input.pValues.length) {
    throw new Error('ids length must match pValues');
  }

  const rejected = applyProcedure(input);
  const decisions: MultiplicityDecision[] = input.pValues.map((pv, i) => ({
    id: ids[i],
    pValue: pv,
    rejected: rejected[i],
  }));
  const rejectedIndices = rejected.map((r, i) => (r ? i : -1)).filter(i => i >= 0);

  const inputs = {
    pValues: input.pValues,
    alpha: input.alpha,
    procedure: input.procedure,
    weights: input.weights ?? null,
    transitionMatrix: input.transitionMatrix ?? null,
  };
  return {
    procedure: input.procedure,
    alpha: input.alpha,
    rejectedIds: rejectedIndices.map(i => ids[i]),
    rejectedIndices,
    decisions,
    provenance: buildProvenance({
      method: `multiplicity:${input.procedure}`,
      seed: seedFromObject(inputs),
      inputs,
      note: 'Deterministic given the p-values and procedure configuration.',
    }),
  };
}

export interface FWEREstimate {
  fwer: number;
  nSim: number;
  seed: number;
  alpha: number;
  m: number;
  provenance: StatsProvenance;
}

/**
 * Estimate the family-wise error rate of a procedure under the global null by
 * simulation. Under the global null every hypothesis is true, so any rejection
 * is a family-wise error. p-values are drawn independently Uniform(0,1) (the
 * null distribution of a valid p-value). Seeded and reproducible.
 *
 * `reject` is the procedure applied to a vector of m p-values.
 */
export function estimateFWER(
  reject: (pValues: number[]) => boolean[],
  m: number,
  alpha: number,
  nSim: number,
  seed: number,
): FWEREstimate {
  const rng = createRng(seed);
  let errors = 0;
  const p = new Array<number>(m);
  for (let s = 0; s < nSim; s++) {
    for (let i = 0; i < m; i++) p[i] = rng.uniform();
    const rejected = reject(p);
    if (rejected.some(r => r)) errors++;
  }
  const inputs = { m, alpha, nSim, seed };
  return {
    fwer: errors / nSim,
    nSim,
    seed,
    alpha,
    m,
    provenance: buildProvenance({
      method: 'multiplicity:estimateFWER',
      seed,
      inputs,
      note: 'Monte Carlo FWER under the global null with independent Uniform(0,1) p-values.',
    }),
  };
}
