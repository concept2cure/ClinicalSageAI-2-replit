/**
 * Risk-model deployed-outcome backtest (§16 governance eval).
 *
 * The risk model already gates at TRAIN time — a retrain only becomes active if it
 * improves holdout log-loss (risk-model.trainModel). This closes the other half:
 * once real outcomes land, `intelligence.risk_predictions` carries the probability we
 * actually surfaced (`predicted_prob`) alongside the realized label (`observed_outcome`).
 * This harness reads those pairs back and measures how the DEPLOYED model actually did —
 * calibration (Brier), discrimination (AUC), log-loss, and a reliability curve — then
 * gates on honest thresholds so a miscalibrated model in production is caught, not assumed.
 *
 * The metrics are pure (no Platt transform — these are already-final probabilities, unlike
 * calibration.ts which fits a curve) so they unit-test without a DB. `backtestRiskModel`
 * is the DB-backed entry point.
 *
 * @module server/services/intelligence/risk-model-backtest
 */

import { pool } from '../../db/runtime.js';
import type { RiskTarget } from './risk-model.js';

export interface LabeledPrediction {
  /** The probability the model surfaced, 0..1. */
  p: number;
  /** The realized outcome for that prediction's target. */
  y: 0 | 1;
}

export interface CalibrationBin {
  bin: number;
  lower: number;
  upper: number;
  meanPredicted: number;
  observedRate: number;
  count: number;
}

export interface BacktestMetrics {
  target: string | null;
  sampleSize: number;
  baseRate: number | null;      // observed positive rate
  brier: number | null;         // calibration (lower is better; 0 perfect)
  logLoss: number | null;
  auc: number | null;           // discrimination (0.5 = chance; null when one class absent)
  calibration: CalibrationBin[];
  passed: boolean;
  reasons: string[];            // why it did not pass (empty when passed)
}

export interface BacktestThresholds {
  minSamples: number;
  minAuc: number;
  maxBrier: number;
}

/** Honest defaults — enough outcomes to mean anything, better-than-chance, and not
 *  worse-calibrated than a naive base-rate guess would typically score. */
export const DEFAULT_THRESHOLDS: BacktestThresholds = { minSamples: 30, minAuc: 0.55, maxBrier: 0.25 };

const clamp01 = (x: number) => Math.min(0.999999, Math.max(0.000001, x));

/** Mean squared error of probability vs realized label. Null on empty. */
export function brierScore(rows: readonly LabeledPrediction[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + (r.p - r.y) ** 2, 0) / rows.length;
}

/** Mean negative log-likelihood (clamped). Null on empty. */
export function logLossScore(rows: readonly LabeledPrediction[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => {
    const c = clamp01(r.p);
    return s - (r.y * Math.log(c) + (1 - r.y) * Math.log(1 - c));
  }, 0) / rows.length;
}

/** ROC AUC via the Mann-Whitney U statistic. Null when either class is absent. */
export function rocAuc(rows: readonly LabeledPrediction[]): number | null {
  const pos = rows.filter((r) => r.y === 1).map((r) => r.p);
  const neg = rows.filter((r) => r.y === 0).map((r) => r.p);
  if (pos.length === 0 || neg.length === 0) return null;
  let u = 0;
  for (const pp of pos) for (const nn of neg) u += pp > nn ? 1 : pp === nn ? 0.5 : 0;
  return u / (pos.length * neg.length);
}

/** Reliability curve: mean predicted vs observed rate per probability bin. */
export function calibrationBins(rows: readonly LabeledPrediction[], nBins = 10): CalibrationBin[] {
  const out: CalibrationBin[] = [];
  for (let i = 0; i < nBins; i++) {
    const lower = i / nBins;
    const upper = (i + 1) / nBins;
    const inBin = rows.filter((r) =>
      i === nBins - 1 ? r.p >= lower && r.p <= upper : r.p >= lower && r.p < upper,
    );
    if (inBin.length === 0) continue;
    out.push({
      bin: i,
      lower,
      upper,
      meanPredicted: inBin.reduce((s, r) => s + r.p, 0) / inBin.length,
      observedRate: inBin.reduce((s, r) => s + r.y, 0) / inBin.length,
      count: inBin.length,
    });
  }
  return out;
}

/**
 * Compute the full backtest + gate verdict for a set of (probability, outcome) pairs.
 * Pure — the DB reader below feeds it.
 */
export function evaluateBacktest(
  rows: readonly LabeledPrediction[],
  target: string | null,
  thresholds: BacktestThresholds = DEFAULT_THRESHOLDS,
): BacktestMetrics {
  const sampleSize = rows.length;
  const brier = brierScore(rows);
  const auc = rocAuc(rows);
  const baseRate = sampleSize > 0 ? rows.reduce((s, r) => s + r.y, 0) / sampleSize : null;

  const reasons: string[] = [];
  if (sampleSize < thresholds.minSamples) {
    reasons.push(`insufficient outcomes: ${sampleSize} < ${thresholds.minSamples} (cannot assess reliably)`);
  }
  if (auc == null) {
    reasons.push('only one outcome class observed — discrimination undefined');
  } else if (auc < thresholds.minAuc) {
    reasons.push(`AUC ${auc.toFixed(3)} < ${thresholds.minAuc} (no better than chance)`);
  }
  if (brier == null) {
    reasons.push('no outcomes to score calibration');
  } else if (brier > thresholds.maxBrier) {
    reasons.push(`Brier ${brier.toFixed(3)} > ${thresholds.maxBrier} (poorly calibrated)`);
  }

  return {
    target,
    sampleSize,
    baseRate,
    brier,
    logLoss: logLossScore(rows),
    auc,
    calibration: calibrationBins(rows),
    passed: reasons.length === 0,
    reasons,
  };
}

/**
 * Read landed predictions (observed_outcome IS NOT NULL) from
 * intelligence.risk_predictions and backtest the deployed model. Optionally scope to a
 * target and/or an organization. Uses `predicted_prob` (the model's probability, 0..1).
 */
export async function backtestRiskModel(opts: {
  target?: RiskTarget;
  organizationId?: number;
  thresholds?: BacktestThresholds;
} = {}): Promise<BacktestMetrics> {
  const where: string[] = ['observed_outcome IS NOT NULL', 'predicted_prob IS NOT NULL'];
  const params: unknown[] = [];
  if (opts.target) { params.push(opts.target); where.push(`target = $${params.length}`); }
  if (opts.organizationId != null) { params.push(opts.organizationId); where.push(`organization_id = $${params.length}`); }

  const res = await pool.query(
    `SELECT predicted_prob, observed_outcome
       FROM intelligence.risk_predictions
      WHERE ${where.join(' AND ')}`,
    params,
  );

  const rows: LabeledPrediction[] = (res.rows as { predicted_prob: number; observed_outcome: boolean }[]).map((r) => ({
    p: Number(r.predicted_prob),
    y: r.observed_outcome ? 1 : 0,
  }));

  return evaluateBacktest(rows, opts.target ?? null, opts.thresholds);
}
