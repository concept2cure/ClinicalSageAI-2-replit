/**
 * Special functions for exact small-sample statistics.
 *
 * Provides the regularized incomplete beta function and the exact binomial tail
 * probabilities derived from it. These underpin exact (non-asymptotic)
 * diagnostic performance sizing and Clopper–Pearson confidence intervals, where
 * the normal approximation is unreliable at the small disease-positive counts
 * typical of IVD/IVDR performance studies.
 *
 * The incomplete-beta continued fraction follows the standard Lentz evaluation
 * (Numerical Recipes, betacf); it is accurate to ~1e-12 over the usable range.
 * Pure and deterministic.
 */

const FPMIN = 1e-300;

// Lanczos coefficients for ln Γ(x).
const LANCZOS = [
  76.18009172947146, -86.50532032941678, 24.01409824083091,
  -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
];

/** Natural log of the gamma function, ln Γ(x), for x > 0. */
export function gammaln(x: number): number {
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += LANCZOS[j] / y;
  }
  return -tmp + Math.log((Math.sqrt(2 * Math.PI) * ser) / x);
}

/** Continued-fraction core of the incomplete beta (valid for x < (a+1)/(a+b+2)). */
function betacf(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}

/**
 * Regularized incomplete beta function I_x(a, b) = B(x; a, b) / B(a, b),
 * the CDF of a Beta(a, b) distribution evaluated at x ∈ [0, 1].
 */
export function betaRegularized(x: number, a: number, b: number): number {
  if (a <= 0 || b <= 0) throw new Error('a and b must be positive');
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betacf(a, b, x)) / a;
  }
  return 1 - (front * betacf(b, a, 1 - x)) / b;
}

/**
 * Inverse of I_x(a, b) in x for a given probability p — the quantile of a
 * Beta(a, b) distribution. Monotone bisection; sufficient for CI endpoints.
 */
export function betaQuantile(p: number, a: number, b: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (betaRegularized(mid, a, b) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-14) break;
  }
  return (lo + hi) / 2;
}

/**
 * Exact upper binomial tail P(X ≥ k) for X ~ Binomial(n, p), via the identity
 * P(X ≥ k) = I_p(k, n − k + 1). Returns 1 for k ≤ 0 and 0 for k > n.
 */
export function binomialTailGE(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  return betaRegularized(p, k, n - k + 1);
}

/** Exact lower binomial tail P(X ≤ k) for X ~ Binomial(n, p). */
export function binomialTailLE(k: number, n: number, p: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  return 1 - betaRegularized(p, k + 1, n - k);
}

/**
 * Two-sided Clopper–Pearson (exact) confidence interval for a binomial
 * proportion from x successes in n trials at confidence level `conf`.
 */
export function clopperPearsonInterval(
  x: number,
  n: number,
  conf = 0.95,
): { lower: number; upper: number } {
  if (x < 0 || x > n || n <= 0) throw new Error('require 0 ≤ x ≤ n and n > 0');
  const alpha = 1 - conf;
  const lower = x === 0 ? 0 : betaQuantile(alpha / 2, x, n - x + 1);
  const upper = x === n ? 1 : betaQuantile(1 - alpha / 2, x + 1, n - x);
  return { lower, upper };
}
