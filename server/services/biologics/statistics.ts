/**
 * Biologics workbench — biostatistics core.
 *
 * Dependency-free, deterministic statistical primitives used by the BLA 351(a)
 * analytical-similarity, comparability, and immunogenicity engines. Every
 * function here is a pure function of its inputs so the engines that consume
 * it can be unit-tested against hand-computable expectations.
 *
 * Implements:
 *   - descriptive statistics (mean, sample SD, SEM, range)
 *   - the normal distribution (CDF via erf, quantile via Acklam)
 *   - the Student-t distribution (CDF via the regularized incomplete beta,
 *     quantile via a bracketed Newton iteration)
 *   - the two-sample (Welch) difference confidence interval
 *   - the two one-sided tests (TOST) procedure for equivalence
 *   - quality-range (mean ± k·SD) construction and containment
 *   - the Wilson score interval and the Newcombe difference interval for
 *     binomial proportions (immunogenicity incidence)
 *
 * @module server/services/biologics/statistics
 */

// ============================================================================
// DESCRIPTIVE STATISTICS
// ============================================================================

export interface DescriptiveStats {
  /** Number of observations. */
  n: number;
  /** Arithmetic mean. NaN when n === 0. */
  mean: number;
  /** Sample standard deviation (divisor n − 1). NaN when n < 2. */
  sd: number;
  /** Standard error of the mean (sd / √n). NaN when n < 2. */
  sem: number;
  min: number;
  max: number;
}

/** Filter to finite numbers — guards against null/NaN slipping in from JSON. */
export function finiteOnly(xs: ReadonlyArray<number>): number[] {
  return xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
}

export function mean(xs: ReadonlyArray<number>): number {
  const v = finiteOnly(xs);
  if (v.length === 0) return NaN;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** Sample standard deviation (Bessel-corrected, divisor n − 1). */
export function sampleStd(xs: ReadonlyArray<number>): number {
  const v = finiteOnly(xs);
  if (v.length < 2) return NaN;
  const m = mean(v);
  const ss = v.reduce((a, b) => a + (b - m) * (b - m), 0);
  return Math.sqrt(ss / (v.length - 1));
}

export function describe(xs: ReadonlyArray<number>): DescriptiveStats {
  const v = finiteOnly(xs);
  const n = v.length;
  const m = mean(v);
  const sd = sampleStd(v);
  return {
    n,
    mean: m,
    sd,
    sem: n >= 2 ? sd / Math.sqrt(n) : NaN,
    min: n ? Math.min(...v) : NaN,
    max: n ? Math.max(...v) : NaN,
  };
}

// ============================================================================
// NORMAL DISTRIBUTION
// ============================================================================

/** Error function — Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7). */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF. */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * Standard normal quantile (inverse CDF) — Acklam's rational approximation.
 * Relative error < 1.15e-9 across the full open interval (0, 1).
 */
export function normalInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];

  const plow = 0.02425;
  const phigh = 1 - plow;

  let q: number;
  let r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

// ============================================================================
// GAMMA / BETA (for the Student-t CDF)
// ============================================================================

/** Natural log of the gamma function — Lanczos approximation. */
export function lnGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // Reflection formula.
    return (
      Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x)
    );
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Regularized incomplete beta function I_x(a, b) — Lentz's continued fraction
 * (Numerical Recipes `betai`/`betacf`). Used for the Student-t CDF.
 */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lbeta =
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) +
    a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(lbeta);

  // Continued fraction, evaluated with the Lentz algorithm.
  const betacf = (xx: number, aa: number, bb: number): number => {
    const tiny = 1e-30;
    const qab = aa + bb;
    const qap = aa + 1;
    const qam = aa - 1;
    let c = 1;
    let d = 1 - (qab * xx) / qap;
    if (Math.abs(d) < tiny) d = tiny;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 200; m++) {
      const m2 = 2 * m;
      let aaa = (m * (bb - m) * xx) / ((qam + m2) * (aa + m2));
      d = 1 + aaa * d;
      if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aaa / c;
      if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      h *= d * c;
      aaa = -((aa + m) * (qab + m) * xx) / ((aa + m2) * (qap + m2));
      d = 1 + aaa * d;
      if (Math.abs(d) < tiny) d = tiny;
      c = 1 + aaa / c;
      if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 3e-12) break;
    }
    return h;
  };

  if (x < (a + 1) / (a + b + 2)) {
    return (front * betacf(x, a, b)) / a;
  }
  return 1 - (Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) +
    a * Math.log(x) + b * Math.log(1 - x),
  ) * betacf(1 - x, b, a)) / b;
}

// ============================================================================
// STUDENT-T DISTRIBUTION
// ============================================================================

/** Student-t CDF with `df` degrees of freedom. */
export function studentTCdf(t: number, df: number): number {
  if (df <= 0) return NaN;
  const x = df / (df + t * t);
  const ib = regularizedIncompleteBeta(x, df / 2, 0.5);
  return t > 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

/**
 * Student-t quantile (inverse CDF). Bracketed Newton iteration seeded from the
 * normal quantile, with bisection fallback so it cannot diverge. Accurate to
 * ~1e-10 for df ≥ 1.
 */
export function studentTInv(p: number, df: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (!Number.isFinite(df) || df <= 0) return NaN;
  if (Math.abs(p - 0.5) < 1e-15) return 0;

  // Symmetry: solve for p ≥ 0.5 then mirror.
  const upper = p > 0.5;
  const pp = upper ? p : 1 - p;

  // Bracket the root. The t quantile is always wider than the normal quantile.
  let lo = 0;
  let hi = Math.max(1, normalInv(pp)) ;
  // Expand hi until it overshoots.
  while (studentTCdf(hi, df) < pp && hi < 1e6) hi *= 2;

  let x = Math.min(Math.max(normalInv(pp), lo + 1e-6), hi);
  for (let i = 0; i < 80; i++) {
    const fx = studentTCdf(x, df) - pp;
    if (Math.abs(fx) < 1e-12) break;
    // Student-t PDF for the Newton step.
    const pdf = Math.exp(
      lnGamma((df + 1) / 2) -
        lnGamma(df / 2) -
        0.5 * Math.log(df * Math.PI) -
        ((df + 1) / 2) * Math.log(1 + (x * x) / df),
    );
    if (fx > 0) hi = x;
    else lo = x;
    let next = pdf > 0 ? x - fx / pdf : NaN;
    // Fall back to bisection if Newton leaves the bracket.
    if (!Number.isFinite(next) || next <= lo || next >= hi) {
      next = 0.5 * (lo + hi);
    }
    if (Math.abs(next - x) < 1e-12) {
      x = next;
      break;
    }
    x = next;
  }

  return upper ? x : -x;
}

// ============================================================================
// TWO-SAMPLE DIFFERENCE (WELCH) + TOST EQUIVALENCE
// ============================================================================

export interface DiffCI {
  /** mean(test) − mean(reference). */
  diff: number;
  /** Standard error of the difference. */
  se: number;
  /** Welch–Satterthwaite degrees of freedom. */
  df: number;
  /** Lower bound of the two-sided CI at the requested confidence. */
  lower: number;
  /** Upper bound of the two-sided CI at the requested confidence. */
  upper: number;
  /** Confidence used (e.g. 0.90). */
  confidence: number;
}

/**
 * Two-sample difference confidence interval using Welch's unequal-variance
 * approximation. `confidence` is the two-sided level (default 0.90, which gives
 * the 90% CI the FDA Tier-1 equivalence test inspects — equivalent to the TOST
 * at α = 0.05).
 */
export function welchDiffCI(
  test: ReadonlyArray<number>,
  reference: ReadonlyArray<number>,
  confidence = 0.9,
): DiffCI {
  const t = describe(test);
  const r = describe(reference);
  const diff = t.mean - r.mean;
  const se = Math.sqrt((t.sd * t.sd) / t.n + (r.sd * r.sd) / r.n);
  // Welch–Satterthwaite df.
  const vt = (t.sd * t.sd) / t.n;
  const vr = (r.sd * r.sd) / r.n;
  const df =
    (vt + vr) * (vt + vr) /
    ((vt * vt) / (t.n - 1) + (vr * vr) / (r.n - 1));
  const tcrit = studentTInv(1 - (1 - confidence) / 2, df);
  return {
    diff,
    se,
    df,
    lower: diff - tcrit * se,
    upper: diff + tcrit * se,
    confidence,
  };
}

export interface TostResult {
  /** True when the (1 − 2α) CI of the difference lies within (lower, upper). */
  equivalent: boolean;
  /** The (1 − 2α) confidence interval inspected. */
  ci: DiffCI;
  /** p-value of the lower one-sided test (H0: diff ≤ lower). */
  pLower: number;
  /** p-value of the upper one-sided test (H0: diff ≥ upper). */
  pUpper: number;
  /** The governing TOST p-value (max of the two one-sided p-values). */
  pValue: number;
}

/**
 * Two one-sided tests (TOST) for equivalence on the mean difference.
 * Equivalence is declared when the (1 − 2α) confidence interval of
 * mean(test) − mean(reference) is fully contained in (lower, upper).
 */
export function tost(
  test: ReadonlyArray<number>,
  reference: ReadonlyArray<number>,
  lower: number,
  upper: number,
  alpha = 0.05,
): TostResult {
  const ci = welchDiffCI(test, reference, 1 - 2 * alpha);
  const tLower = (ci.diff - lower) / ci.se; // H0: diff ≤ lower → reject if large +
  const tUpper = (ci.diff - upper) / ci.se; // H0: diff ≥ upper → reject if large −
  const pLower = 1 - studentTCdf(tLower, ci.df);
  const pUpper = studentTCdf(tUpper, ci.df);
  return {
    equivalent: ci.lower >= lower && ci.upper <= upper,
    ci,
    pLower,
    pUpper,
    pValue: Math.max(pLower, pUpper),
  };
}

// ============================================================================
// QUALITY RANGE (mean ± k·SD)
// ============================================================================

export interface QualityRange {
  lower: number;
  upper: number;
  /** Centre of the range (reference mean). */
  center: number;
  /** Multiplier k applied to the reference SD. */
  k: number;
}

/**
 * Construct a quality range from reference data: mean_R ± k·σ_R. The FDA
 * "Development of Therapeutic Protein Biosimilars: Comparative Analytical
 * Assessment" framework uses quality ranges for moderately critical (Tier 2)
 * attributes; k is typically 2 or 3.
 */
export function qualityRange(reference: ReadonlyArray<number>, k = 3): QualityRange {
  const r = describe(reference);
  return { lower: r.mean - k * r.sd, upper: r.mean + k * r.sd, center: r.mean, k };
}

/** Fraction of `values` that fall within [range.lower, range.upper] inclusive. */
export function fractionWithin(values: ReadonlyArray<number>, range: { lower: number; upper: number }): number {
  const v = finiteOnly(values);
  if (v.length === 0) return NaN;
  const inside = v.filter((x) => x >= range.lower && x <= range.upper).length;
  return inside / v.length;
}

// ============================================================================
// BINOMIAL PROPORTIONS (immunogenicity incidence)
// ============================================================================

export interface ProportionCI {
  /** Point estimate successes / n. */
  p: number;
  successes: number;
  n: number;
  lower: number;
  upper: number;
  confidence: number;
}

/**
 * Wilson score interval for a binomial proportion — well-behaved for the small
 * n and extreme proportions typical of ADA/NAb incidence.
 */
export function wilsonCI(successes: number, n: number, confidence = 0.95): ProportionCI {
  if (n <= 0) {
    return { p: NaN, successes, n, lower: NaN, upper: NaN, confidence };
  }
  const z = normalInv(1 - (1 - confidence) / 2);
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    p,
    successes,
    n,
    lower: Math.max(0, center - half),
    upper: Math.min(1, center + half),
    confidence,
  };
}

export interface ProportionDiffCI {
  /** p1 − p2 (e.g. test incidence − reference incidence). */
  diff: number;
  lower: number;
  upper: number;
  confidence: number;
}

/**
 * Newcombe's method 10 for the confidence interval of a difference between two
 * independent binomial proportions, built from the two Wilson intervals. More
 * reliable than the Wald interval when incidence is low (the immunogenicity
 * case), and never produces bounds outside [−1, 1].
 */
export function newcombeDiffCI(
  s1: number,
  n1: number,
  s2: number,
  n2: number,
  confidence = 0.95,
): ProportionDiffCI {
  const w1 = wilsonCI(s1, n1, confidence);
  const w2 = wilsonCI(s2, n2, confidence);
  const p1 = s1 / n1;
  const p2 = s2 / n2;
  const diff = p1 - p2;
  const lower = diff - Math.sqrt((p1 - w1.lower) ** 2 + (w2.upper - p2) ** 2);
  const upper = diff + Math.sqrt((w1.upper - p1) ** 2 + (p2 - w2.lower) ** 2);
  return {
    diff,
    lower: Math.max(-1, lower),
    upper: Math.min(1, upper),
    confidence,
  };
}

/** Round to a fixed number of decimals, returning a number (for stable JSON). */
export function round(x: number, decimals = 4): number {
  if (!Number.isFinite(x)) return x;
  const f = Math.pow(10, decimals);
  return Math.round(x * f) / f;
}
