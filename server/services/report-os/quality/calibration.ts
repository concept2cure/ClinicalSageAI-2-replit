/**
 * Pure prediction-calibration and provider-freshness logic for the Insights
 * "report quality" view. Mirrors the platform's confidence-calibration-service
 * semantics (Brier score + reliability buckets) without any DB or IO concerns.
 */

import type {
  CalibrationBucket,
  CalibrationQuality,
  FreshnessRollup,
  PredictionOutcome,
  QualitySummary,
} from './types';

/** Defensively clamp a predicted probability into [0, 1]. */
function clampPredicted(predicted: number): number {
  if (predicted < 0) return 0;
  if (predicted > 1) return 1;
  return predicted;
}

/**
 * Brier score: the mean of (predicted - actual)^2 across all outcomes.
 * Returns null when there are no outcomes. Predicted values are clamped to
 * [0, 1] defensively before scoring.
 */
export function brierScore(outcomes: PredictionOutcome[]): number | null {
  if (outcomes.length === 0) return null;
  const sum = outcomes.reduce((acc, o) => {
    const diff = clampPredicted(o.predicted) - o.actual;
    return acc + diff * diff;
  }, 0);
  return sum / outcomes.length;
}

/**
 * Splits [0, 1] into `bucketCount` equal-width buckets and rolls up each one.
 *
 * - Predicted values are clamped to [0, 1] before bucketing.
 * - The top bucket is inclusive of 1.0 (its upper bound is 1).
 * - meanPredicted and observedRate are 0 for empty buckets.
 */
export function calibrationBuckets(
  outcomes: PredictionOutcome[],
  bucketCount = 5
): CalibrationBucket[] {
  const count = Math.max(1, Math.floor(bucketCount));
  const width = 1 / count;

  const members: PredictionOutcome[][] = Array.from({ length: count }, () => []);
  for (const outcome of outcomes) {
    const predicted = clampPredicted(outcome.predicted);
    // floor into a bucket; 1.0 (and anything reaching the final edge) lands in
    // the top bucket since it is inclusive of 1.0.
    let index = Math.floor(predicted / width);
    if (index >= count) index = count - 1;
    members[index].push(outcome);
  }

  return members.map((bucketMembers, index) => {
    const lower = index * width;
    const upper = index === count - 1 ? 1 : (index + 1) * width;
    const bucketCountN = bucketMembers.length;

    const meanPredicted =
      bucketCountN === 0
        ? 0
        : bucketMembers.reduce((acc, o) => acc + clampPredicted(o.predicted), 0) / bucketCountN;
    const observedRate =
      bucketCountN === 0
        ? 0
        : bucketMembers.filter(o => o.actual === 1).length / bucketCountN;

    return { lower, upper, count: bucketCountN, meanPredicted, observedRate };
  });
}

/**
 * Maps a Brier score and sample size to a qualitative grade.
 *
 * - 'uncalibrated' when sampleSize < 20 or brier is null (too little signal).
 * - Otherwise thresholds on brier: <0.10 excellent, <0.18 good, <0.25 fair,
 *   else poor.
 */
export function calibrationQuality(
  brier: number | null,
  sampleSize: number
): CalibrationQuality {
  if (sampleSize < 20 || brier === null) return 'uncalibrated';
  if (brier < 0.1) return 'excellent';
  if (brier < 0.18) return 'good';
  if (brier < 0.25) return 'fair';
  return 'poor';
}

/**
 * Composes brierScore, calibrationBuckets, and calibrationQuality into a single
 * quality summary. Pure.
 */
export function summarizeQuality(
  outcomes: PredictionOutcome[],
  bucketCount = 5
): QualitySummary {
  const brier = brierScore(outcomes);
  return {
    sampleSize: outcomes.length,
    brier,
    quality: calibrationQuality(brier, outcomes.length),
    buckets: calibrationBuckets(outcomes, bucketCount),
  };
}

/**
 * Classifies providers as fresh or stale based on how long ago they were
 * observed relative to their freshness budget.
 *
 * A provider is stale when (now - observedAt) > budgetMs, or when observedAt is
 * unparseable; otherwise fresh. Provider names are returned in each list,
 * preserving input order.
 */
export function freshnessRollup(
  providers: Array<{ provider: string; observedAt: string; budgetMs: number }>,
  now: Date = new Date()
): FreshnessRollup {
  const nowMs = now.getTime();
  const fresh: string[] = [];
  const stale: string[] = [];

  for (const { provider, observedAt, budgetMs } of providers) {
    const observedMs = Date.parse(observedAt);
    if (Number.isNaN(observedMs) || nowMs - observedMs > budgetMs) {
      stale.push(provider);
    } else {
      fresh.push(provider);
    }
  }

  return { fresh, stale };
}
