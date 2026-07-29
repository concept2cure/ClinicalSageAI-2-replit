/**
 * Analytical method validation assessment (ICH Q2(R2)) — deterministic.
 *
 * Evaluates the core quantitative method-validation characteristics from raw
 * data and judges them against acceptance criteria:
 *   - Linearity   — ordinary least-squares regression: slope, intercept, R².
 *   - Precision   — % relative standard deviation (RSD) of replicate results.
 *   - Accuracy    — mean % recovery per concentration level.
 *
 * Pure/closed-form (no DB, no network, no LLM): identical data → identical
 * result. Deliberately scoped to the characteristics that are exact and
 * reproducible; it does NOT compute a lack-of-fit p-value (a rigorous F-test
 * p-value needs the F-distribution and is out of scope) — it will not present
 * an approximate statistic as if it were validation-grade.
 *
 * @module server/services/analytical/method-validation
 */

export interface LinearityPoint {
  /** Nominal/known concentration (x). */
  nominal: number;
  /** Measured response (y). */
  response: number;
}

export interface AcceptanceCriteria {
  /** Minimum acceptable R² for linearity (default 0.995). */
  r2Min?: number;
  /** Maximum acceptable precision %RSD (default 2.0). */
  rsdMax?: number;
  /** Accuracy % recovery lower/upper bounds (default 98–102). */
  accuracyLow?: number;
  accuracyHigh?: number;
}

export interface MethodValidationInput {
  linearity?: LinearityPoint[];
  /** Replicate measured results for the precision assessment. */
  precision?: number[];
  /** Mean % recovery per level (any subset of the three). */
  accuracy?: { LOW?: number; MID?: number; HIGH?: number };
  acceptance?: AcceptanceCriteria;
}

export interface LinearityResult {
  n: number;
  slope: number;
  intercept: number;
  r2: number;
  pass: boolean;
}
export interface PrecisionResult {
  n: number;
  mean: number;
  sd: number;
  rsdPercent: number;
  pass: boolean;
}
export interface AccuracyResult {
  levels: Array<{ level: 'LOW' | 'MID' | 'HIGH'; recoveryPercent: number; pass: boolean }>;
  pass: boolean;
}

export interface MethodValidationResult {
  acceptance: { r2Min: number; rsdMax: number; accuracyBounds: [number, number] };
  linearity?: LinearityResult;
  precision?: PrecisionResult;
  accuracy?: AccuracyResult;
  /** True only when every assessed characteristic passes (and at least one was assessed). */
  overallPass: boolean;
  assessed: string[];
  notes: string[];
}

function round(n: number, dp = 6): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}
function mean(a: number[]): number {
  return a.reduce((s, x) => s + x, 0) / a.length;
}

/** Ordinary least-squares y = intercept + slope·x, with coefficient of determination R². */
function regress(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
  const n = x.length;
  const sx = x.reduce((s, v) => s + v, 0);
  const sy = y.reduce((s, v) => s + v, 0);
  const sxx = x.reduce((s, v) => s + v * v, 0);
  const sxy = x.reduce((s, v, i) => s + v * y[i], 0);
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const yhat = x.map((v) => intercept + slope * v);
  const ybar = mean(y);
  const ssr = yhat.reduce((s, v) => s + (v - ybar) ** 2, 0);
  const sse = y.reduce((s, v, i) => s + (v - yhat[i]) ** 2, 0);
  const r2 = ssr + sse === 0 ? 1 : ssr / (ssr + sse);
  return { slope, intercept, r2 };
}

/**
 * Assess analytical method validation characteristics against acceptance
 * criteria. At least one of linearity/precision/accuracy must be supplied.
 */
export function assessMethodValidation(input: MethodValidationInput): MethodValidationResult {
  const r2Min = input.acceptance?.r2Min ?? 0.995;
  const rsdMax = input.acceptance?.rsdMax ?? 2.0;
  const accLo = input.acceptance?.accuracyLow ?? 98;
  const accHi = input.acceptance?.accuracyHigh ?? 102;

  if (r2Min < 0 || r2Min > 1) throw new Error('acceptance.r2Min must be in [0,1]');
  if (rsdMax < 0) throw new Error('acceptance.rsdMax must be non-negative');
  if (accLo > accHi) throw new Error('acceptance.accuracyLow must be ≤ accuracyHigh');

  const result: MethodValidationResult = {
    acceptance: { r2Min, rsdMax, accuracyBounds: [accLo, accHi] },
    overallPass: false,
    assessed: [],
    notes: [
      'Deterministic ICH Q2 assessment. Lack-of-fit p-value is intentionally not reported (out of scope); compare linearity visually/with residuals as well.',
    ],
  };
  const passes: boolean[] = [];

  if (input.linearity !== undefined) {
    if (!Array.isArray(input.linearity) || input.linearity.length < 3) {
      throw new Error('linearity requires at least 3 points');
    }
    const x = input.linearity.map((p) => p.nominal);
    const y = input.linearity.map((p) => p.response);
    if (x.some((v) => !Number.isFinite(v)) || y.some((v) => !Number.isFinite(v))) {
      throw new Error('linearity points must be finite numbers');
    }
    const { slope, intercept, r2 } = regress(x, y);
    const pass = r2 >= r2Min;
    result.linearity = { n: x.length, slope: round(slope), intercept: round(intercept), r2: round(r2), pass };
    result.assessed.push('linearity');
    passes.push(pass);
  }

  if (input.precision !== undefined) {
    if (!Array.isArray(input.precision) || input.precision.length < 2) {
      throw new Error('precision requires at least 2 replicate results');
    }
    if (input.precision.some((v) => !Number.isFinite(v))) throw new Error('precision results must be finite numbers');
    const m = mean(input.precision);
    const sd = Math.sqrt(input.precision.reduce((s, v) => s + (v - m) ** 2, 0) / (input.precision.length - 1));
    const rsdPercent = m === 0 ? 0 : (sd / Math.abs(m)) * 100;
    const pass = rsdPercent <= rsdMax;
    result.precision = { n: input.precision.length, mean: round(m), sd: round(sd), rsdPercent: round(rsdPercent, 4), pass };
    result.assessed.push('precision');
    passes.push(pass);
  }

  if (input.accuracy !== undefined) {
    const levels: AccuracyResult['levels'] = [];
    for (const level of ['LOW', 'MID', 'HIGH'] as const) {
      const v = input.accuracy[level];
      if (v === undefined) continue;
      if (!Number.isFinite(v)) throw new Error(`accuracy.${level} must be a finite number`);
      levels.push({ level, recoveryPercent: round(v, 4), pass: v >= accLo && v <= accHi });
    }
    if (levels.length === 0) throw new Error('accuracy requires at least one of LOW/MID/HIGH');
    const pass = levels.every((l) => l.pass);
    result.accuracy = { levels, pass };
    result.assessed.push('accuracy');
    passes.push(pass);
  }

  if (passes.length === 0) {
    throw new Error('Supply at least one of linearity, precision, or accuracy to assess.');
  }
  result.overallPass = passes.every(Boolean);
  return result;
}
