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
