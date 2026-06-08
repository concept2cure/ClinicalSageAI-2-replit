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
import { buildProvenance, type StatsProvenance } from './computation-provenance';

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
