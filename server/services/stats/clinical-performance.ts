/**
 * Clinical (population) diagnostic performance — the observed-accuracy
 * computations a diagnostic / IVD submission reports, complementing the SIZING
 * in `diagnostic-design.ts`. Given a 2×2 result table (vs a reference standard,
 * or a comparator for PPA/NPA), compute sensitivity/specificity, predictive
 * values (sample and prevalence-adjusted), likelihood ratios, accuracy, Youden's
 * J and Cohen's κ, with exact Clopper–Pearson confidence intervals.
 *
 * Pure and deterministic; every formula is closed-form and hand-verifiable.
 */

import { clopperPearsonInterval } from './special';
import { buildProvenance, type StatsProvenance } from './computation-provenance';

export interface ConfusionMatrix {
  /** Test-positive AND reference/comparator-positive. */
  tp: number;
  /** Test-positive AND reference/comparator-negative. */
  fp: number;
  /** Test-negative AND reference/comparator-positive. */
  fn: number;
  /** Test-negative AND reference/comparator-negative. */
  tn: number;
}

export interface DiagnosticAccuracyOptions {
  /** Confidence level for intervals. Default 0.95. */
  conf?: number;
  /**
   * Population prevalence for adjusted predictive values. When omitted, only the
   * sample-based PPV/NPV (which depend on the study's case mix) are returned.
   */
  prevalence?: number;
}

export interface Interval {
  lower: number;
  upper: number;
}

export interface DiagnosticAccuracyResult {
  sensitivity: number;
  sensitivityCi: Interval;
  specificity: number;
  specificityCi: Interval;
  /** Positive/negative percent agreement — identical formulas vs a comparator. */
  ppa: number;
  npa: number;
  /** Sample-based predictive values (reflect the study case mix). */
  ppvSample: number;
  npvSample: number;
  /** Prevalence-adjusted predictive values (only when prevalence supplied). */
  ppvAdjusted: number | null;
  npvAdjusted: number | null;
  accuracy: number;
  youdenJ: number;
  /** Likelihood ratios; +∞ when specificity is 1 (LR+) or sensitivity is 1 (LR-). */
  lrPositive: number;
  lrNegative: number;
  cohensKappa: number;
  n: number;
  provenance: StatsProvenance;
}

/** Observed diagnostic accuracy from a 2×2 table. */
export function computeDiagnosticAccuracy(
  cm: ConfusionMatrix,
  options: DiagnosticAccuracyOptions = {}
): DiagnosticAccuracyResult {
  const { tp, fp, fn, tn } = cm;
  for (const [k, v] of Object.entries(cm)) {
    if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
      throw new Error(`Confusion-matrix cell "${k}" must be a non-negative integer.`);
    }
  }
  const conf = options.conf ?? 0.95;
  const positives = tp + fn; // reference/comparator positives
  const negatives = tn + fp; // reference/comparator negatives
  const n = tp + fp + fn + tn;
  if (n === 0) throw new Error('Confusion matrix is empty.');
  if (positives === 0 || negatives === 0) {
    throw new Error('Both reference-positive and reference-negative cases are required.');
  }

  const sensitivity = tp / positives;
  const specificity = tn / negatives;
  const sensitivityCi = clopperPearsonInterval(tp, positives, conf);
  const specificityCi = clopperPearsonInterval(tn, negatives, conf);

  const ppvSample = tp + fp > 0 ? tp / (tp + fp) : NaN;
  const npvSample = tn + fn > 0 ? tn / (tn + fn) : NaN;

  let ppvAdjusted: number | null = null;
  let npvAdjusted: number | null = null;
  if (options.prevalence !== undefined) {
    const p = options.prevalence;
    if (p < 0 || p > 1) throw new Error('prevalence must be in [0, 1].');
    const ppvDen = sensitivity * p + (1 - specificity) * (1 - p);
    const npvDen = (1 - sensitivity) * p + specificity * (1 - p);
    ppvAdjusted = ppvDen > 0 ? (sensitivity * p) / ppvDen : NaN;
    npvAdjusted = npvDen > 0 ? (specificity * (1 - p)) / npvDen : NaN;
  }

  const accuracy = (tp + tn) / n;
  const youdenJ = sensitivity + specificity - 1;
  const lrPositive = specificity < 1 ? sensitivity / (1 - specificity) : Infinity;
  const lrNegative = sensitivity < 1 ? (1 - sensitivity) / specificity : 0;

  // Cohen's κ for agreement (test vs reference).
  const po = (tp + tn) / n;
  const pe = ((tp + fn) * (tp + fp) + (fp + tn) * (fn + tn)) / (n * n);
  const cohensKappa = pe < 1 ? (po - pe) / (1 - pe) : 1;

  return {
    sensitivity,
    sensitivityCi,
    specificity,
    specificityCi,
    ppa: sensitivity,
    npa: specificity,
    ppvSample,
    npvSample,
    ppvAdjusted,
    npvAdjusted,
    accuracy,
    youdenJ,
    lrPositive,
    lrNegative,
    cohensKappa,
    n,
    provenance: buildProvenance({
      method: 'Diagnostic accuracy (2×2)',
      seed: 0,
      inputs: { cm, options },
      note: 'Closed-form sens/spec/PPV/NPV/LR/κ with Clopper–Pearson intervals.',
    }),
  };
}

// ── ROC / AUC (continuous-score diagnostics) ─────────────────────────────────

export interface ScoredObservation {
  /** Continuous test score (higher = more positive). */
  score: number;
  /** True disease/condition status. */
  positive: boolean;
}

export interface RocPoint {
  threshold: number;
  /** True-positive rate (sensitivity) at this threshold. */
  tpr: number;
  /** False-positive rate (1 − specificity) at this threshold. */
  fpr: number;
}

export interface RocResult {
  /** Area under the ROC curve (Mann–Whitney rank estimate; ties handled). */
  auc: number;
  curve: RocPoint[];
  /** Threshold maximising Youden's J (tpr − fpr) and its operating point. */
  optimalThreshold: number;
  optimalTpr: number;
  optimalFpr: number;
  positives: number;
  negatives: number;
  provenance: StatsProvenance;
}

/** Average-rank assignment (1-based) handling ties, for the Mann–Whitney AUC. */
function averageRanks(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(values.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    const avg = (i + j + 2) / 2; // average of 1-based ranks (i+1 .. j+1)
    for (let k = i; k <= j; k++) ranks[order[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

/**
 * ROC analysis for a continuous-score diagnostic: AUC (rank-based, tie-safe),
 * the ROC curve, and the Youden-optimal threshold.
 */
export function computeRoc(observations: ScoredObservation[]): RocResult {
  const positives = observations.filter(o => o.positive).length;
  const negatives = observations.length - positives;
  if (positives === 0 || negatives === 0) {
    throw new Error('ROC requires at least one positive and one negative observation.');
  }

  // AUC via Mann–Whitney U on average ranks.
  const ranks = averageRanks(observations.map(o => o.score));
  let sumRankPos = 0;
  for (let i = 0; i < observations.length; i++) {
    if (observations[i].positive) sumRankPos += ranks[i];
  }
  const auc = (sumRankPos - (positives * (positives + 1)) / 2) / (positives * negatives);

  // ROC curve by sweeping unique score thresholds (predict positive if score ≥ t).
  const thresholds = Array.from(new Set(observations.map(o => o.score))).sort((a, b) => b - a);
  const curve: RocPoint[] = [];
  let optimalThreshold = thresholds[0];
  let optimalTpr = 0;
  let optimalFpr = 0;
  let bestJ = -Infinity;
  for (const t of thresholds) {
    let tp = 0;
    let fp = 0;
    for (const o of observations) {
      if (o.score >= t) {
        if (o.positive) tp++;
        else fp++;
      }
    }
    const tpr = tp / positives;
    const fpr = fp / negatives;
    curve.push({ threshold: t, tpr, fpr });
    if (tpr - fpr > bestJ) {
      bestJ = tpr - fpr;
      optimalThreshold = t;
      optimalTpr = tpr;
      optimalFpr = fpr;
    }
  }

  return {
    auc,
    curve,
    optimalThreshold,
    optimalTpr,
    optimalFpr,
    positives,
    negatives,
    provenance: buildProvenance({
      method: 'ROC / AUC (Mann–Whitney)',
      seed: 0,
      inputs: observations,
      note: 'Rank-based AUC (tie-safe) + threshold-sweep ROC curve + Youden optimum.',
    }),
  };
}
