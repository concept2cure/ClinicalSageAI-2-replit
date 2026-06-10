/**
 * Analytical (bench) performance for IVD / diagnostic assays — the CLSI EP
 * computations an FDA IVD submission and the EU IVDR analytical-performance
 * section actually require, and the piece the platform's existing
 * `diagnostic-design.ts` (CLINICAL performance: sensitivity/specificity sizing)
 * did not cover.
 *
 * Implemented, each checkable against a closed-form reference:
 *
 *   - EP05 imprecision: one-way random-effects ANOVA → repeatability (within-run)
 *     and within-laboratory SD/CV. (Single-factor model; the full day×run nested
 *     EP05-A3 design is a documented follow-up, scoped out so every number here
 *     is hand-verifiable — the same discipline diagnostic-design.ts applied to
 *     MRMC.)
 *   - EP17 detection capability: parametric LoB and LoD. (The classic
 *     LoB = mean_blank + cp·SD_blank, LoD = LoB + cβ·SD_low form. The finite-
 *     sample bias-correction factor K of EP17-A2 is exposed but defaults to 1;
 *     the non-parametric percentile path is a follow-up.)
 *   - EP06 linearity: ordinary-least-squares linear fit plus a best nonlinear
 *     (quadratic/cubic) polynomial fit, and the per-level deviation-from-
 *     linearity that governs the reportable range.
 *
 * Pure and deterministic.
 */

import { normalQuantile } from './normal';
import { betaQuantile } from './special';
import { buildProvenance, type StatsProvenance } from './computation-provenance';

/**
 * Student's t quantile, derived from the inverse regularized incomplete beta:
 * for X ~ Beta(ν/2, 1/2), t = sign·sqrt(ν(1−x)/x). Used for regression
 * confidence bounds (EP25). Matches standard tables (t₀.₉₇₅,₁₀ ≈ 2.228).
 */
export function studentTQuantile(p: number, nu: number): number {
  if (p === 0.5) return 0;
  const upper = p > 0.5;
  const pp = upper ? p : 1 - p;
  const x = betaQuantile(2 * (1 - pp), nu / 2, 0.5);
  const t = Math.sqrt((nu * (1 - x)) / x);
  return upper ? t : -t;
}

// ── EP05 · Imprecision (one-way random-effects ANOVA) ────────────────────────

export interface ImprecisionArgs {
  /**
   * Balanced measurement design: one inner array per run, each holding that
   * run's replicate measurements. All runs must share the same replicate count.
   */
  runs: number[][];
}

export interface ImprecisionResult {
  grandMean: number;
  /** Total number of measurements (runs × replicates). */
  n: number;
  runCount: number;
  replicatesPerRun: number;
  /** Within-run (repeatability) SD and CV%. */
  repeatabilitySd: number;
  repeatabilityCvPct: number;
  /** Between-run SD (0 when the between-run variance estimate is negative). */
  betweenRunSd: number;
  /** Within-laboratory (total) SD and CV% = sqrt(repeatability² + between-run²). */
  withinLabSd: number;
  withinLabCvPct: number;
  /** ANOVA intermediates, exposed so the result is auditable. */
  anova: {
    msWithin: number;
    msBetween: number;
    dfWithin: number;
    dfBetween: number;
  };
  provenance: StatsProvenance;
}

/**
 * CLSI EP05 single-factor imprecision. Estimates repeatability and
 * within-laboratory imprecision from a balanced runs × replicates design via
 * one-way random-effects ANOVA.
 */
export function estimateImprecision(args: ImprecisionArgs): ImprecisionResult {
  const runs = args.runs;
  const runCount = runs.length;
  if (runCount < 2) {
    throw new Error('EP05 imprecision requires at least 2 runs.');
  }
  const replicatesPerRun = runs[0].length;
  if (replicatesPerRun < 2) {
    throw new Error('EP05 imprecision requires at least 2 replicates per run.');
  }
  if (runs.some(r => r.length !== replicatesPerRun)) {
    throw new Error('EP05 imprecision requires a balanced design (equal replicates per run).');
  }

  const n = runCount * replicatesPerRun;
  const all = runs.flat();
  const grandMean = all.reduce((s, x) => s + x, 0) / n;
  const runMeans = runs.map(r => r.reduce((s, x) => s + x, 0) / replicatesPerRun);

  // Sum of squares.
  let ssWithin = 0;
  for (let i = 0; i < runCount; i++) {
    for (const x of runs[i]) ssWithin += (x - runMeans[i]) ** 2;
  }
  let ssBetween = 0;
  for (const m of runMeans) ssBetween += (m - grandMean) ** 2;
  ssBetween *= replicatesPerRun;

  const dfWithin = runCount * (replicatesPerRun - 1);
  const dfBetween = runCount - 1;
  const msWithin = ssWithin / dfWithin;
  const msBetween = ssBetween / dfBetween;

  // Variance components (one-way random effects).
  const repeatabilityVar = msWithin;
  const betweenRunVar = Math.max(0, (msBetween - msWithin) / replicatesPerRun);
  const withinLabVar = repeatabilityVar + betweenRunVar;

  const repeatabilitySd = Math.sqrt(repeatabilityVar);
  const betweenRunSd = Math.sqrt(betweenRunVar);
  const withinLabSd = Math.sqrt(withinLabVar);
  const cv = (sd: number) => (grandMean !== 0 ? (sd / Math.abs(grandMean)) * 100 : NaN);

  return {
    grandMean,
    n,
    runCount,
    replicatesPerRun,
    repeatabilitySd,
    repeatabilityCvPct: cv(repeatabilitySd),
    betweenRunSd,
    withinLabSd,
    withinLabCvPct: cv(withinLabSd),
    anova: { msWithin, msBetween, dfWithin, dfBetween },
    provenance: buildProvenance({
      method: 'CLSI EP05 one-way imprecision',
      seed: 0,
      inputs: args,
      note: 'Deterministic ANOVA variance-component estimate (single-factor model).',
    }),
  };
}

// ── EP17 · Detection capability (LoB / LoD) ──────────────────────────────────

export interface DetectionCapabilityArgs {
  /** Replicate measurements of blank (analyte-free) samples. */
  blankReplicates: number[];
  /**
   * Low-concentration samples near the anticipated LoD. One inner array per
   * sample (its replicates); the pooled within-sample SD drives the LoD.
   */
  lowSamples: number[][];
  /** False-positive rate (governs LoB). Default 0.05 → cp ≈ 1.645. */
  alpha?: number;
  /** False-negative rate (governs LoD). Default 0.05 → cβ ≈ 1.645. */
  beta?: number;
  /**
   * EP17-A2 finite-sample bias-correction factor K applied to cβ. Default 1
   * (no correction); supply the table value for a fully EP17-A2-conformant LoD.
   */
  biasCorrectionK?: number;
}

export interface DetectionCapabilityResult {
  /** Limit of Blank = mean(blank) + cp · SD(blank). */
  lob: number;
  /** Limit of Detection = LoB + (K·cβ) · SD_low(pooled). */
  lod: number;
  blankMean: number;
  blankSd: number;
  /** Pooled within-sample SD across the low-concentration samples. */
  pooledLowSd: number;
  cp: number;
  cBeta: number;
  alpha: number;
  beta: number;
  provenance: StatsProvenance;
}

/** Sample standard deviation (n − 1). */
function sampleSd(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((s, x) => s + x, 0) / n;
  const ss = values.reduce((s, x) => s + (x - mean) ** 2, 0);
  return Math.sqrt(ss / (n - 1));
}

/**
 * CLSI EP17 parametric detection capability. Returns LoB and LoD from blank and
 * low-concentration replicate data.
 */
export function estimateDetectionCapability(
  args: DetectionCapabilityArgs
): DetectionCapabilityResult {
  const { blankReplicates, lowSamples } = args;
  const alpha = args.alpha ?? 0.05;
  const beta = args.beta ?? 0.05;
  const K = args.biasCorrectionK ?? 1;

  if (blankReplicates.length < 2) {
    throw new Error('EP17 requires at least 2 blank replicates.');
  }
  if (lowSamples.length < 1 || lowSamples.some(s => s.length < 2)) {
    throw new Error('EP17 requires low-concentration samples with at least 2 replicates each.');
  }

  const cp = normalQuantile(1 - alpha);
  const cBeta = normalQuantile(1 - beta);

  const blankMean = blankReplicates.reduce((s, x) => s + x, 0) / blankReplicates.length;
  const blankSd = sampleSd(blankReplicates);
  const lob = blankMean + cp * blankSd;

  // Pooled within-sample SD: sqrt( Σ(nᵢ−1)·sᵢ² / Σ(nᵢ−1) ).
  let pooledNum = 0;
  let pooledDen = 0;
  for (const s of lowSamples) {
    const df = s.length - 1;
    const sd = sampleSd(s);
    pooledNum += df * sd * sd;
    pooledDen += df;
  }
  const pooledLowSd = Math.sqrt(pooledNum / pooledDen);
  const lod = lob + K * cBeta * pooledLowSd;

  return {
    lob,
    lod,
    blankMean,
    blankSd,
    pooledLowSd,
    cp,
    cBeta,
    alpha,
    beta,
    provenance: buildProvenance({
      method: 'CLSI EP17 parametric detection capability',
      seed: 0,
      inputs: args,
      note: 'LoB = mean_blank + cp·SD_blank; LoD = LoB + K·cβ·SD_low(pooled).',
    }),
  };
}

// ── EP06 · Linearity ─────────────────────────────────────────────────────────

export interface LinearFit {
  slope: number;
  intercept: number;
  /** Coefficient of determination. */
  r2: number;
  /** Residual standard deviation (sqrt of SSE/(n−2)). */
  residualSd: number;
}

/** Ordinary-least-squares simple linear regression of y on x. */
export function linearRegression(x: number[], y: number[]): LinearFit {
  const n = x.length;
  if (n < 2 || y.length !== n) {
    throw new Error('linearRegression requires matching x/y of length ≥ 2.');
  }
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - meanX) ** 2;
    sxy += (x[i] - meanX) * (y[i] - meanY);
    syy += (y[i] - meanY) ** 2;
  }
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * x[i];
    sse += (y[i] - pred) ** 2;
  }
  const r2 = syy === 0 ? 1 : 1 - sse / syy;
  const residualSd = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  return { slope, intercept, r2, residualSd };
}

/**
 * Polynomial least-squares fit (coefficients low→high order, length degree+1)
 * via the normal equations solved with Gaussian elimination. degree 1 is
 * consistent with {@link linearRegression}.
 */
export function polynomialFit(x: number[], y: number[], degree: number): number[] {
  const n = x.length;
  if (degree < 1 || n < degree + 1) {
    throw new Error(`polynomialFit needs at least ${degree + 1} points for degree ${degree}.`);
  }
  const m = degree + 1;
  // Vandermonde-derived normal matrix A (m×m) and vector b (m).
  const sumsX = new Array(2 * degree + 1).fill(0);
  for (let i = 0; i < n; i++) {
    let p = 1;
    for (let k = 0; k <= 2 * degree; k++) {
      sumsX[k] += p;
      p *= x[i];
    }
  }
  const b = new Array(m).fill(0);
  for (let i = 0; i < n; i++) {
    let p = 1;
    for (let r = 0; r < m; r++) {
      b[r] += y[i] * p;
      p *= x[i];
    }
  }
  const A: number[][] = [];
  for (let r = 0; r < m; r++) {
    A.push([]);
    for (let c = 0; c < m; c++) A[r].push(sumsX[r + c]);
  }
  return solveLinearSystem(A, b);
}

/** Gaussian elimination with partial pivoting. Returns the solution vector. */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const m = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < m; col++) {
    let pivot = col;
    for (let r = col + 1; r < m; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) throw new Error('Singular system in polynomialFit.');
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < m; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= m; c++) M[r][c] -= factor * M[col][c];
    }
  }
  // After Gauss-Jordan elimination each row is diagonal: sol.i = M[i][m] / M[i][i].
  const solution = new Array(m);
  for (let i = 0; i < m; i++) solution[i] = M[i][m] / M[i][i];
  return solution;
}

// ── EP09 · Method comparison (bias estimation) ───────────────────────────────

export interface MethodComparisonArgs {
  /** Reference (comparator) measurements. */
  reference: number[];
  /** Test (candidate) measurements, paired with `reference`. */
  test: number[];
  /** Optional medical-decision level at which to report systematic bias. */
  decisionLevel?: number;
}

export interface MethodComparisonResult {
  /** OLS slope/intercept/R² of test on reference. */
  slope: number;
  intercept: number;
  r2: number;
  /** Mean of (test − reference) and its SD — the average bias. */
  meanBias: number;
  sdBias: number;
  /** Predicted bias (regression estimate − level) at the decision level, if given. */
  biasAtDecisionLevel: number | null;
  /** Bland–Altman 95% limits of agreement: meanBias ± 1.96·sdBias. */
  limitsOfAgreement: { lower: number; upper: number };
  n: number;
  provenance: StatsProvenance;
}

/**
 * CLSI EP09 method comparison: regress the candidate method on the comparator
 * and report systematic bias (mean and, optionally, at a medical-decision level).
 */
export function compareMethods(args: MethodComparisonArgs): MethodComparisonResult {
  const { reference, test } = args;
  const n = reference.length;
  if (n < 2 || test.length !== n) {
    throw new Error('EP09 method comparison requires paired reference/test of length ≥ 2.');
  }
  const fit = linearRegression(reference, test);
  const diffs = test.map((t, i) => t - reference[i]);
  const meanBias = diffs.reduce((s, d) => s + d, 0) / n;
  const sdBias =
    n > 1
      ? Math.sqrt(diffs.reduce((s, d) => s + (d - meanBias) ** 2, 0) / (n - 1))
      : 0;
  const biasAtDecisionLevel =
    args.decisionLevel !== undefined
      ? fit.intercept + fit.slope * args.decisionLevel - args.decisionLevel
      : null;

  return {
    slope: fit.slope,
    intercept: fit.intercept,
    r2: fit.r2,
    meanBias,
    sdBias,
    biasAtDecisionLevel,
    limitsOfAgreement: { lower: meanBias - 1.96 * sdBias, upper: meanBias + 1.96 * sdBias },
    n,
    provenance: buildProvenance({
      method: 'CLSI EP09 method comparison',
      seed: 0,
      inputs: args,
      note: 'OLS regression of test on reference; systematic bias + Bland–Altman LoA.',
    }),
  };
}

// ── EP07 · Interference ──────────────────────────────────────────────────────

export interface InterferenceArgs {
  /** Replicates of the sample WITHOUT the interferent (control), at a fixed analyte level. */
  baseline: number[];
  /** Replicates of the same sample WITH the interferent added. */
  withInterferent: number[];
  /** Maximum allowable bias (%) before the substance is flagged as interfering. */
  allowableBiasPct?: number;
}

export interface InterferenceResult {
  baselineMean: number;
  interferentMean: number;
  /** Percent bias attributable to the interferent: (test − control)/control × 100. */
  percentBias: number;
  /** Absolute bias in measurement units. */
  absoluteBias: number;
  /** True when |percentBias| exceeds allowableBiasPct (only when that is supplied). */
  interferes: boolean | null;
  provenance: StatsProvenance;
}

/**
 * CLSI EP07 interference: percent bias introduced by an interferent at a fixed
 * analyte level, from paired baseline / with-interferent replicate sets.
 */
export function assessInterference(args: InterferenceArgs): InterferenceResult {
  const { baseline, withInterferent } = args;
  if (baseline.length < 1 || withInterferent.length < 1) {
    throw new Error('EP07 interference requires baseline and with-interferent measurements.');
  }
  const baselineMean = baseline.reduce((s, x) => s + x, 0) / baseline.length;
  const interferentMean = withInterferent.reduce((s, x) => s + x, 0) / withInterferent.length;
  if (baselineMean === 0) throw new Error('Baseline mean is zero; percent bias is undefined.');
  const absoluteBias = interferentMean - baselineMean;
  const percentBias = (absoluteBias / baselineMean) * 100;
  const interferes =
    args.allowableBiasPct !== undefined
      ? Math.abs(percentBias) > args.allowableBiasPct
      : null;

  return {
    baselineMean,
    interferentMean,
    percentBias,
    absoluteBias,
    interferes,
    provenance: buildProvenance({
      method: 'CLSI EP07 interference',
      seed: 0,
      inputs: args,
      note: 'Percent bias = (with-interferent − baseline)/baseline × 100.',
    }),
  };
}

// ── EP28 · Reference intervals ───────────────────────────────────────────────

export interface ReferenceIntervalArgs {
  /** Reference-population measurements. */
  values: number[];
  /** Lower tail probability for the interval. Default 0.025. */
  lowerQuantile?: number;
  /** Upper tail probability for the interval. Default 0.975. */
  upperQuantile?: number;
}

export interface ReferenceIntervalResult {
  lowerLimit: number;
  upperLimit: number;
  /** 90% confidence intervals on each reference limit (normal-approx rank method). */
  lowerLimitCi: { lower: number; upper: number };
  upperLimitCi: { lower: number; upper: number };
  n: number;
  method: 'nonparametric-percentile';
  provenance: StatsProvenance;
}

/** Type-7 (linear-interpolation) quantile of a sorted ascending array. */
function quantileSorted(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const idx = q * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * CLSI EP28 nonparametric reference interval. Returns the lower/upper reference
 * limits (percentiles) and a 90% CI on each limit via the normal approximation
 * to the binomial rank distribution. (EP28-A3c recommends n ≥ 120 for the
 * nonparametric method; the computation is exposed for any n.)
 */
export function estimateReferenceInterval(args: ReferenceIntervalArgs): ReferenceIntervalResult {
  const values = [...args.values].sort((a, b) => a - b);
  const n = values.length;
  if (n < 3) throw new Error('EP28 reference interval requires at least 3 values.');
  const ql = args.lowerQuantile ?? 0.025;
  const qu = args.upperQuantile ?? 0.975;
  if (!(ql > 0 && qu < 1 && ql < qu)) {
    throw new Error('Require 0 < lowerQuantile < upperQuantile < 1.');
  }

  const lowerLimit = quantileSorted(values, ql);
  const upperLimit = quantileSorted(values, qu);

  // 90% CI on a quantile limit via the rank normal approximation:
  // rank ≈ q·n ± z·sqrt(n·q·(1−q)), z = 1.645 for a 90% two-sided interval.
  const z = 1.645;
  const ciForQuantile = (q: number) => {
    const mean = q * n;
    const sd = Math.sqrt(n * q * (1 - q));
    const loRank = Math.max(0, Math.floor(mean - z * sd) - 1);
    const hiRank = Math.min(n - 1, Math.ceil(mean + z * sd) - 1);
    return { lower: values[loRank], upper: values[hiRank] };
  };

  return {
    lowerLimit,
    upperLimit,
    lowerLimitCi: ciForQuantile(ql),
    upperLimitCi: ciForQuantile(qu),
    n,
    method: 'nonparametric-percentile',
    provenance: buildProvenance({
      method: 'CLSI EP28 nonparametric reference interval',
      seed: 0,
      inputs: args,
      note: 'Type-7 percentile limits with normal-approx rank CIs.',
    }),
  };
}

export interface LinearityLevel {
  /** Assigned/relative concentration for the level. */
  concentration: number;
  /** Replicate measurements at this level. */
  measurements: number[];
}

export interface LinearityResult {
  linear: LinearFit;
  /** Best nonlinear fit considered (quadratic when ≥3 levels, else null). */
  bestNonlinearDegree: number | null;
  bestNonlinearCoefficients: number[] | null;
  /** Per-level deviation-from-linearity as a percentage of the linear estimate. */
  deviationFromLinearityPct: { concentration: number; deviationPct: number }[];
  /** Largest absolute deviation-from-linearity (%) across levels. */
  maxDeviationPct: number;
  provenance: StatsProvenance;
}

/**
 * CLSI EP06 linearity assessment. Fits a linear model and the best nonlinear
 * (quadratic/cubic) polynomial, then reports the deviation-from-linearity at
 * each level — the quantity that bounds the reportable (linear) range.
 */
export function assessLinearity(levels: LinearityLevel[]): LinearityResult {
  if (levels.length < 3) {
    throw new Error('EP06 linearity requires at least 3 concentration levels.');
  }
  const x: number[] = [];
  const y: number[] = [];
  for (const lvl of levels) {
    for (const m of lvl.measurements) {
      x.push(lvl.concentration);
      y.push(m);
    }
  }
  const linear = linearRegression(x, y);

  // Highest polynomial degree we can fit (cap at cubic; need degree+1 distinct levels).
  const maxDegree = Math.min(3, levels.length - 1);
  let bestNonlinearDegree: number | null = null;
  let bestNonlinearCoefficients: number[] | null = null;
  if (maxDegree >= 2) {
    bestNonlinearDegree = maxDegree;
    bestNonlinearCoefficients = polynomialFit(x, y, maxDegree);
  }

  const evalPoly = (coeffs: number[], xi: number) =>
    coeffs.reduce((acc, c, k) => acc + c * xi ** k, 0);

  const deviationFromLinearityPct = levels.map(lvl => {
    const linPred = linear.intercept + linear.slope * lvl.concentration;
    const nlPred = bestNonlinearCoefficients
      ? evalPoly(bestNonlinearCoefficients, lvl.concentration)
      : linPred;
    const deviationPct = linPred !== 0 ? ((nlPred - linPred) / linPred) * 100 : 0;
    return { concentration: lvl.concentration, deviationPct };
  });
  const maxDeviationPct = deviationFromLinearityPct.reduce(
    (mx, d) => Math.max(mx, Math.abs(d.deviationPct)),
    0
  );

  return {
    linear,
    bestNonlinearDegree,
    bestNonlinearCoefficients,
    deviationFromLinearityPct,
    maxDeviationPct,
    provenance: buildProvenance({
      method: 'CLSI EP06 linearity',
      seed: 0,
      inputs: levels,
      note: 'Linear vs best nonlinear polynomial fit; deviation-from-linearity per level.',
    }),
  };
}

// ── EP25 · Stability / shelf-life (ICH Q1E regression) ───────────────────────

export interface StabilityArgs {
  /** Stability time points (e.g. months) and the measured attribute value. */
  points: { time: number; value: number }[];
  /** Acceptance limit the attribute must not cross. */
  specLimit: number;
  /** Which side of the limit matters: 'lower' (degradation) or 'upper'. */
  direction: 'lower' | 'upper';
  /** One-sided confidence for the regression bound. Default 0.95. */
  confidence?: number;
}

export interface StabilityResult {
  slope: number;
  intercept: number;
  /** Time where the fitted line itself meets the spec (null if it never does). */
  nominalCrossing: number | null;
  /** Shelf-life: time where the one-sided confidence bound meets the spec. */
  shelfLife: number | null;
  n: number;
  provenance: StatsProvenance;
}

/**
 * CLSI/ICH Q1E shelf-life: regress value on time and find where the one-sided
 * confidence bound on the mean response crosses the acceptance limit. The bound
 * is ŷ(t) ∓ t₍conf,n−2₎·s·√(1/n + (t−t̄)²/Sxx); shelf-life is the largest t for
 * which the attribute is still within spec.
 */
export function estimateShelfLife(args: StabilityArgs): StabilityResult {
  const pts = args.points;
  const n = pts.length;
  if (n < 3) throw new Error('EP25 stability requires at least 3 time points.');
  const conf = args.confidence ?? 0.95;
  const t = pts.map(p => p.time);
  const y = pts.map(p => p.value);
  const fit = linearRegression(t, y);
  const meanT = t.reduce((s, v) => s + v, 0) / n;
  const sxx = t.reduce((s, v) => s + (v - meanT) ** 2, 0);
  const tCrit = studentTQuantile(conf, n - 2);

  // Nominal crossing: where intercept + slope·t = specLimit.
  const nominalCrossing =
    fit.slope !== 0 ? (args.specLimit - fit.intercept) / fit.slope : null;

  // One-sided bound that approaches the spec from the in-spec side.
  const bound = (tt: number): number => {
    const se = fit.residualSd * Math.sqrt(1 / n + (tt - meanT) ** 2 / sxx);
    const pred = fit.intercept + fit.slope * tt;
    return args.direction === 'lower' ? pred - tCrit * se : pred + tCrit * se;
  };
  const inSpec = (tt: number) =>
    args.direction === 'lower' ? bound(tt) >= args.specLimit : bound(tt) <= args.specLimit;

  // Scan forward from t=0 to find where the bound first leaves spec.
  let shelfLife: number | null = null;
  if (inSpec(0)) {
    const horizon = nominalCrossing && nominalCrossing > 0 ? nominalCrossing * 1.5 : Math.max(...t) * 3 || 1;
    const step = horizon / 10000;
    let prev = 0;
    for (let tt = step; tt <= horizon; tt += step) {
      if (!inSpec(tt)) {
        shelfLife = prev;
        break;
      }
      prev = tt;
    }
    if (shelfLife === null) shelfLife = horizon; // still in spec across the horizon
  } else {
    shelfLife = 0;
  }

  return {
    slope: fit.slope,
    intercept: fit.intercept,
    nominalCrossing,
    shelfLife,
    n,
    provenance: buildProvenance({
      method: 'ICH Q1E / CLSI EP25 shelf-life',
      seed: 0,
      inputs: args,
      note: 'Regression with one-sided confidence-bound crossing of the spec limit.',
    }),
  };
}

// ── EP12 · Qualitative dose-response (C5–C95 interval) ────────────────────────

export interface QualitativeLevel {
  concentration: number;
  /** Number of replicates tested at this concentration. */
  n: number;
  /** Number that tested positive. */
  positives: number;
}

export interface QualitativeDoseResponseResult {
  /** Logistic fit logit(p) = a + b·concentration. */
  intercept: number;
  slope: number;
  /** Concentrations at 5%, 50%, 95% positivity. */
  c5: number;
  c50: number;
  c95: number;
  iterations: number;
  converged: boolean;
  provenance: StatsProvenance;
}

/**
 * CLSI EP12 qualitative dose-response. Fits a logistic curve to grouped
 * positive/negative data by IRLS (Newton–Raphson) and reports the C5–C95
 * interval — the analyte range over which the assay transitions from negative
 * to positive.
 */
export function fitQualitativeDoseResponse(
  levels: QualitativeLevel[]
): QualitativeDoseResponseResult {
  if (levels.length < 2) throw new Error('EP12 requires at least 2 concentration levels.');
  for (const l of levels) {
    if (l.n <= 0 || l.positives < 0 || l.positives > l.n) {
      throw new Error('Each level needs 0 ≤ positives ≤ n and n > 0.');
    }
  }

  // IRLS for grouped logistic regression of positivity on concentration.
  let a = 0;
  let b = 0;
  let iterations = 0;
  let converged = false;
  for (let iter = 0; iter < 100; iter++) {
    iterations = iter + 1;
    // Build the 2×2 Fisher information and the score vector.
    let g0 = 0;
    let g1 = 0;
    let h00 = 0;
    let h01 = 0;
    let h11 = 0;
    for (const l of levels) {
      const eta = a + b * l.concentration;
      const p = 1 / (1 + Math.exp(-eta));
      const w = l.n * p * (1 - p);
      const resid = l.positives - l.n * p;
      g0 += resid;
      g1 += resid * l.concentration;
      h00 += w;
      h01 += w * l.concentration;
      h11 += w * l.concentration * l.concentration;
    }
    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-12) break;
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (-h01 * g0 + h00 * g1) / det;
    a += da;
    b += db;
    if (Math.abs(da) < 1e-10 && Math.abs(db) < 1e-10) {
      converged = true;
      break;
    }
  }
  if (b === 0) throw new Error('Degenerate fit (zero slope); cannot resolve C5–C95.');

  const logit = (q: number) => Math.log(q / (1 - q));
  const concAt = (q: number) => (logit(q) - a) / b;

  return {
    intercept: a,
    slope: b,
    c5: concAt(0.05),
    c50: concAt(0.5),
    c95: concAt(0.95),
    iterations,
    converged,
    provenance: buildProvenance({
      method: 'CLSI EP12 qualitative dose-response',
      seed: 0,
      inputs: levels,
      note: 'IRLS logistic fit; C5/C50/C95 by inverting logit(p)=a+b·conc.',
    }),
  };
}
