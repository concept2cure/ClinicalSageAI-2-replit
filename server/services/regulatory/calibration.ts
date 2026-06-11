/**
 * Calibration / back-test harness for the IVD readiness→approval model.
 *
 * Replays labeled historical cases (a submission profile + the known outcome)
 * through the reviewer simulation and the readiness→approval-probability map,
 * then reports calibration and discrimination metrics (Brier score, log loss,
 * accuracy, AUC, and reliability bins). Lets the heuristics be validated and
 * tuned against real outcomes rather than asserted.
 *
 * Deterministic; no I/O.
 */

import { simulateIvdReview, type ReviewProfile } from './reviewer-simulation-ivd';
import { readinessToApprovalProbability } from './decision-tree';

export interface BacktestCase {
  profile: ReviewProfile;
  /** Known historical outcome: true = approved/cleared. */
  approved: boolean;
  label?: string;
}

export interface CalibrationBin {
  binLow: number;
  binHigh: number;
  count: number;
  predictedMean: number;
  observedRate: number;
}

export interface CalibrationResult {
  n: number;
  /** Mean predicted probability of success. */
  meanPredicted: number;
  /** Observed approval rate in the dataset. */
  observedApprovalRate: number;
  /** Brier score (mean squared error of probabilities; lower is better). */
  brierScore: number;
  /** Log loss (cross-entropy; lower is better). */
  logLoss: number;
  /** Accuracy at a 0.5 threshold. */
  accuracy: number;
  /** Area under the ROC curve (discrimination; 0.5 = chance). */
  auc: number | null;
  /** Reliability diagram bins. */
  calibrationBins: CalibrationBin[];
}

const round = (n: number, dp = 4): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Mann–Whitney AUC from predicted scores + binary labels. */
function computeAuc(scores: number[], labels: boolean[]): number | null {
  const pos = scores.filter((_, i) => labels[i]);
  const neg = scores.filter((_, i) => !labels[i]);
  if (pos.length === 0 || neg.length === 0) return null;
  let wins = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (p > n) wins += 1;
      else if (p === n) wins += 0.5;
    }
  }
  return round(wins / (pos.length * neg.length));
}

/** Run the back-test and compute calibration + discrimination metrics. */
export function calibrate(cases: BacktestCase[]): CalibrationResult {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error('At least one labeled case is required.');
  }

  const predictions: number[] = [];
  const outcomes: boolean[] = [];
  for (const c of cases) {
    const review = simulateIvdReview(c.profile);
    const p = readinessToApprovalProbability(review.readinessScore, review.verdict);
    predictions.push(p);
    outcomes.push(c.approved === true);
  }

  const n = cases.length;
  const meanPredicted = predictions.reduce((s, v) => s + v, 0) / n;
  const observedApprovalRate = outcomes.filter(Boolean).length / n;

  let brier = 0;
  let logLoss = 0;
  let correct = 0;
  for (let i = 0; i < n; i++) {
    const y = outcomes[i] ? 1 : 0;
    const p = Math.max(1e-9, Math.min(1 - 1e-9, predictions[i]));
    brier += (p - y) ** 2;
    logLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    if ((p >= 0.5 ? 1 : 0) === y) correct += 1;
  }

  // Reliability bins (width 0.2).
  const edges = [0, 0.2, 0.4, 0.6, 0.8, 1.0001];
  const calibrationBins: CalibrationBin[] = [];
  for (let b = 0; b < edges.length - 1; b++) {
    const lo = edges[b];
    const hi = edges[b + 1];
    const idx = predictions.map((p, i) => ({ p, y: outcomes[i] })).filter(x => x.p >= lo && x.p < hi);
    if (idx.length === 0) continue;
    calibrationBins.push({
      binLow: lo,
      binHigh: b === edges.length - 2 ? 1 : hi,
      count: idx.length,
      predictedMean: round(idx.reduce((s, x) => s + x.p, 0) / idx.length),
      observedRate: round(idx.filter(x => x.y).length / idx.length),
    });
  }

  return {
    n,
    meanPredicted: round(meanPredicted),
    observedApprovalRate: round(observedApprovalRate),
    brierScore: round(brier / n),
    logLoss: round(logLoss / n),
    accuracy: round(correct / n),
    auc: computeAuc(predictions, outcomes),
    calibrationBins,
  };
}
