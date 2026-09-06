/**
 * Out-of-trend (OOT) assessment of a stability series — the PhRMA CMC
 * Statistics and Stability Expert Teams' regression-control-chart method.
 *
 * ── What "out of trend" is, and is not ───────────────────────────────────────
 * An out-of-specification result has crossed a limit. An out-of-trend result
 * has not necessarily crossed anything: it is a result that does not lie where
 * the results before it say it should. The method is a control chart on the
 * regression: for each successive pull point, fit the line to the points
 * BEFORE it, form the prediction interval a new observation at that time should
 * fall in (Student t, n−2 degrees of freedom, two-sided), and flag the point
 * if it falls outside. The interval is a prediction interval, not a confidence
 * band on the mean — it carries the +1 term for the scatter of a single new
 * observation — because the question is "is this one result surprising", not
 * "has the mean line moved".
 *
 * Alongside, the slope of the whole series with its confidence interval, and
 * — where the slope is heading toward a recorded limit — the time the fitted
 * line meets it. That projection is a statement about a limit, so it is made
 * only against the acceptance criterion as RECORDED and PARSED by
 * `parseAcceptanceCriterion` (recorded-stability.ts); this module never reads
 * a specification string itself, and refuses when it is given no criterion.
 *
 * ── What it refuses ──────────────────────────────────────────────────────────
 * Fewer than four prior points cannot support a prediction interval anyone
 * should act on (two degrees of freedom is the floor — t₀.₉₇₅,₂ = 4.30 and the
 * interval is wide, but it is an interval), so a series needs at least five
 * numeric points: four to fit, one to judge. No criterion, or time points that
 * do not vary, are refused with their reason. Nothing is defaulted.
 *
 * Pure and deterministic. The t-quantile and the regression are the ones the
 * analytical-performance module exports — imported, not copied.
 *
 * @module server/services/cmc/stability-trending
 */

import { linearRegression, studentTQuantile } from '../stats/analytical-performance';
import type { ParsedAcceptanceCriterion } from './recorded-stability';

export interface TrendPoint {
  /** Time on stability, in the study's time unit (months, by convention). */
  time: number;
  value: number;
}

export type TrendRefusalReason =
  /** Fewer than `minimumPriorPoints` + 1 usable points. */
  | 'INSUFFICIENT_POINTS'
  /** No acceptance criterion was handed in — nothing to project toward. */
  | 'CRITERION_NOT_RECORDED'
  /** A criterion was recorded but `parseAcceptanceCriterion` could not read it (raised by the recorded-data caller, which holds the text). */
  | 'CRITERION_UNPARSEABLE'
  /** All usable points share one time; no line can be fitted. */
  | 'TIME_POINTS_DO_NOT_VARY'
  /** The study spans storage conditions and its results carry none (raised by the recorded-data caller). */
  | 'CONDITION_NOT_SEPARABLE';

export interface TrendRefusal {
  ok: false;
  reason: TrendRefusalReason;
  /** The reason in words a section can print after "trend not assessed:". */
  detail: string;
  pointsUsable: number;
}

export interface OutOfTrendPoint {
  time: number;
  value: number;
  /** What the line through the prior points predicted at this time. */
  predicted: number;
  /** The two-sided (1 − alpha) prediction interval the value fell outside. */
  interval: { lower: number; upper: number };
  /** How many points the prior line was fitted to. */
  priorPoints: number;
}

export interface TrendAssessment {
  ok: true;
  method: string;
  alpha: number;
  minimumPriorPoints: number;
  /** Numeric points in the series (after dropping non-finite values). */
  pointsUsed: number;
  /** Distinct times among them — fewer than `pointsUsed` when a pull point has replicate results. */
  distinctTimePoints: number;
  /** Points that had enough prior points to be judged. */
  evaluated: number;
  /** Longest time in the series. */
  observedPeriod: number;
  outOfTrend: OutOfTrendPoint[];
  slope: {
    estimate: number;
    standardError: number;
    /** Two-sided (1 − alpha) confidence interval. */
    ci: [number, number];
    /** slope / SE; null when the fit is exact (SE = 0). */
    tStatistic: number | null;
    df: number;
    /** True when the interval excludes zero. */
    significant: boolean;
  };
  intercept: number;
  criterion: ParsedAcceptanceCriterion;
  /**
   * Where the fitted line meets the limit it is heading toward, if the trend
   * continues. Null when the slope is zero or has the safe sign for every
   * bound the criterion sets — a falling impurity, a rising assay — because
   * then no crossing exists to project.
   */
  projection: { bound: 'lower' | 'upper'; limit: number; time: number } | null;
}

export type TrendOutcome = TrendRefusal | TrendAssessment;

export interface TrendOptions {
  /** Two-sided significance level for the prediction and confidence intervals. Default 0.05. */
  alpha?: number;
  /** Prior points a pull point needs before it can be judged. Default 4. */
  minimumPriorPoints?: number;
}

export const OOT_METHOD =
  'PhRMA CMC Statistics and Stability Expert Teams — regression control chart (prediction interval of the line fitted to all prior points)';

const DEFAULT_MINIMUM_PRIOR_POINTS = 4;

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Sxx and x̄ of a set of times — the two regression intermediates `linearRegression` does not return. */
function spread(x: number[]): { mean: number; sxx: number } {
  const mean = x.reduce((s, v) => s + v, 0) / x.length;
  const sxx = x.reduce((s, v) => s + (v - mean) ** 2, 0);
  return { mean, sxx };
}

/**
 * Assess one parameter/condition series for out-of-trend points, the
 * established slope, and the projected crossing of the recorded criterion.
 *
 * `criterion` is the parsed acceptance criterion the series was recorded
 * against, or null when none was recorded. Null is refused — a projection
 * against an assumed limit is a fabricated shelf-life signal.
 */
export function assessTrend(
  points: TrendPoint[],
  criterion: ParsedAcceptanceCriterion | null,
  options: TrendOptions = {},
): TrendOutcome {
  const alpha = options.alpha ?? 0.05;
  if (!(alpha > 0 && alpha < 0.5)) throw new Error('alpha must be in (0, 0.5)');
  const minimumPriorPoints = options.minimumPriorPoints ?? DEFAULT_MINIMUM_PRIOR_POINTS;
  if (!(Number.isInteger(minimumPriorPoints) && minimumPriorPoints >= 3)) {
    throw new Error('minimumPriorPoints must be an integer ≥ 3 (a prediction interval needs n − 2 ≥ 1)');
  }

  /* Sorted by time, stably, so replicate results at one pull point keep their
     recorded order and every point's "prior" set is the points before its time. */
  const series = points
    .filter(p => Number.isFinite(p.time) && Number.isFinite(p.value))
    .map(p => ({ time: p.time, value: p.value }))
    .sort((a, b) => a.time - b.time);
  const pointsUsable = series.length;

  if (!criterion) {
    return {
      ok: false,
      reason: 'CRITERION_NOT_RECORDED',
      detail: 'no acceptance criterion is recorded against these results, so there is no limit to assess the trend toward',
      pointsUsable,
    };
  }
  if (pointsUsable < minimumPriorPoints + 1) {
    return {
      ok: false,
      reason: 'INSUFFICIENT_POINTS',
      detail: `the regression control chart needs at least ${minimumPriorPoints} prior points to fit and one to judge (${minimumPriorPoints + 1} numeric time points); ${pointsUsable} ${pointsUsable === 1 ? 'is' : 'are'} recorded`,
      pointsUsable,
    };
  }
  const distinctTimePoints = new Set(series.map(p => p.time)).size;
  if (distinctTimePoints < 2) {
    return {
      ok: false,
      reason: 'TIME_POINTS_DO_NOT_VARY',
      detail: 'every numeric result is recorded at the same time point, so no line can be fitted through them',
      pointsUsable,
    };
  }

  const twoSided = 1 - alpha / 2;
  const outOfTrend: OutOfTrendPoint[] = [];
  let evaluated = 0;

  for (const point of series) {
    const prior = series.filter(p => p.time < point.time);
    const k = prior.length;
    if (k < minimumPriorPoints) continue;
    const px = prior.map(p => p.time);
    const { mean, sxx } = spread(px);
    if (sxx === 0) continue; // prior results all at one time: no line to judge against
    const fit = linearRegression(px, prior.map(p => p.value));
    const predicted = fit.intercept + fit.slope * point.time;
    const se = fit.residualSd * Math.sqrt(1 + 1 / k + (point.time - mean) ** 2 / sxx);
    const halfWidth = studentTQuantile(twoSided, k - 2) * se;
    const lower = predicted - halfWidth;
    const upper = predicted + halfWidth;
    evaluated += 1;
    /* A prior set that is exactly linear has zero residual SD and a zero-width
       interval; a point that sits on that line to floating-point precision is
       not an excursion. The tolerance is far below any reportable difference. */
    const tolerance = 1e-9 * Math.max(1, Math.abs(predicted));
    if (point.value < lower - tolerance || point.value > upper + tolerance) {
      outOfTrend.push({
        time: point.time,
        value: point.value,
        predicted: round(predicted),
        interval: { lower: round(lower), upper: round(upper) },
        priorPoints: k,
      });
    }
  }

  if (evaluated === 0) {
    return {
      ok: false,
      reason: 'INSUFFICIENT_POINTS',
      detail: `no pull point has ${minimumPriorPoints} prior points at earlier, varying times to be judged against`,
      pointsUsable,
    };
  }

  /* The slope of the whole series, as recorded — out-of-trend points included,
     because dropping them would be a decision the assessment reports, not one
     it makes. */
  const x = series.map(p => p.time);
  const { sxx } = spread(x);
  const fit = linearRegression(x, series.map(p => p.value));
  const df = series.length - 2;
  const standardError = fit.residualSd / Math.sqrt(sxx);
  const t = studentTQuantile(twoSided, df);
  const ci: [number, number] = [fit.slope - t * standardError, fit.slope + t * standardError];
  const significant = ci[0] > 0 || ci[1] < 0;

  /* Which bound the line is heading for — and only that one. A one-sided
     criterion sets one bound; a two-sided range sets both and the sign of the
     slope picks. The safe sign projects nothing. */
  let projection: TrendAssessment['projection'] = null;
  if (fit.slope < 0 && criterion.direction === 'decreasing') {
    projection = { bound: 'lower', limit: criterion.limit, time: 0 };
  } else if (fit.slope > 0) {
    if (criterion.direction === 'increasing') {
      projection = { bound: 'upper', limit: criterion.limit, time: 0 };
    } else if (criterion.twoSided && criterion.upperLimit !== null) {
      projection = { bound: 'upper', limit: criterion.upperLimit, time: 0 };
    }
  }
  if (projection) {
    projection.time = round(Math.max(0, (projection.limit - fit.intercept) / fit.slope), 2);
  }

  return {
    ok: true,
    method: OOT_METHOD,
    alpha,
    minimumPriorPoints,
    pointsUsed: pointsUsable,
    distinctTimePoints,
    evaluated,
    observedPeriod: round(x[x.length - 1], 2),
    outOfTrend,
    slope: {
      estimate: round(fit.slope),
      standardError: round(standardError),
      ci: [round(ci[0]), round(ci[1])],
      tStatistic: standardError > 0 ? round(fit.slope / standardError) : null,
      df,
      significant,
    },
    intercept: round(fit.intercept),
    criterion,
    projection,
  };
}
