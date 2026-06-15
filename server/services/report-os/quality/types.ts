/**
 * Types for the Insights "report quality" observability view: prediction
 * calibration (Brier score / reliability buckets) and provider freshness
 * rollups.
 *
 * No DB or IO concerns: these are plain shapes consumed by pure functions.
 */

/** A single prediction paired with its realized binary outcome. */
export interface PredictionOutcome {
  /** Predicted probability of the positive class, expected in [0, 1]. */
  predicted: number;
  /** Realized outcome: 1 if the event occurred, 0 otherwise. */
  actual: 0 | 1;
}

/** A reliability-diagram bucket over a sub-interval of [0, 1]. */
export interface CalibrationBucket {
  /** Inclusive lower bound of the bucket's predicted-probability range. */
  lower: number;
  /** Upper bound of the bucket's predicted-probability range. */
  upper: number;
  /** Number of predictions that fell into this bucket. */
  count: number;
  /** Mean predicted probability of the bucket's members (0 when empty). */
  meanPredicted: number;
  /** Fraction of members whose actual === 1 (0 when empty). */
  observedRate: number;
}

/** Qualitative calibration grade derived from the Brier score. */
export type CalibrationQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'uncalibrated';

/** Composed calibration summary for a set of prediction outcomes. */
export interface QualitySummary {
  sampleSize: number;
  /** Mean squared error of predictions; null when there are no outcomes. */
  brier: number | null;
  quality: CalibrationQuality;
  buckets: CalibrationBucket[];
}

/** Provider names split into fresh vs stale, preserving input order. */
export interface FreshnessRollup {
  fresh: string[];
  stale: string[];
}
