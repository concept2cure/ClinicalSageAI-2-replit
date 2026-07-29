/**
 * F distribution — central and noncentral — and the power of an F test.
 *
 * Built on the regularized incomplete beta in `special.ts`:
 *   - central CDF:    F_{d1,d2}(f) = I_x(d1/2, d2/2),  x = d1 f / (d1 f + d2)
 *   - quantile:       monotone bisection of the CDF
 *   - noncentral CDF: a Poisson(λ/2) mixture of central incomplete betas with
 *                     the numerator df shifted (Patnaik 1949):
 *                     F'_{d1,d2}(f; λ) = Σ_j e^{-λ/2}(λ/2)^j/j! · I_x(d1/2+j, d2/2)
 *   - power:          1 − F'_{d1,d2}(F_crit; λ),  F_crit = quantile at 1−α
 *
 * Pure and deterministic. These primitives are validated against tabulated F
 * critical values and against the closed-form normal power in the large-df
 * limit (see the tests), then reused by the MRMC reader-study sizing.
 */

import { betaRegularized } from './special';

/** Central F CDF: P(F_{d1,d2} ≤ f). */
export function fCdf(f: number, d1: number, d2: number): number {
  if (d1 <= 0 || d2 <= 0) throw new Error('degrees of freedom must be positive');
  if (f <= 0) return 0;
  const x = (d1 * f) / (d1 * f + d2);
  return betaRegularized(x, d1 / 2, d2 / 2);
}

/** Central F quantile: the f with P(F_{d1,d2} ≤ f) = p. */
export function fQuantile(p: number, d1: number, d2: number): number {
  if (!(p >= 0 && p < 1)) throw new Error('p must be in [0, 1)');
  if (p === 0) return 0;
  // Bracket: grow the upper bound until the CDF exceeds p.
  let hi = 2;
  while (fCdf(hi, d1, d2) < p && hi < 1e12) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (fCdf(mid, d1, d2) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12 * Math.max(1, hi)) break;
  }
  return (lo + hi) / 2;
}

/**
 * Noncentral F CDF: P(F'_{d1,d2}(λ) ≤ f) for noncentrality λ ≥ 0. Evaluated as a
 * Poisson(λ/2)-weighted sum of central incomplete betas, truncated when the
 * remaining Poisson mass is negligible.
 */
export function noncentralFCdf(f: number, d1: number, d2: number, lambda: number): number {
  if (lambda < 0) throw new Error('lambda must be non-negative');
  if (lambda === 0) return fCdf(f, d1, d2);
  if (f <= 0) return 0;
  const x = (d1 * f) / (d1 * f + d2);
  const halfLambda = lambda / 2;

  // Poisson pmf recurrence around j = 0; stop when cumulative weight ≈ 1 and the
  // incremental contribution is negligible. Cap defensively.
  let term = Math.exp(-halfLambda); // Poisson(0)
  let cumulativeWeight = 0;
  let acc = 0;
  const jMax = Math.ceil(halfLambda + 12 * Math.sqrt(halfLambda + 1) + 100);
  for (let j = 0; j <= jMax; j++) {
    acc += term * betaRegularized(x, d1 / 2 + j, d2 / 2);
    cumulativeWeight += term;
    if (cumulativeWeight > 1 - 1e-12 && j > halfLambda) break;
    term *= halfLambda / (j + 1); // Poisson(j) → Poisson(j+1)
  }
  return acc;
}

/**
 * Power of an upper-tailed F test at level alpha against noncentrality λ:
 * P(F'_{d1,d2}(λ) > F_{1−α; d1,d2}).
 */
export function noncentralFPower(d1: number, d2: number, lambda: number, alpha = 0.05): number {
  const fCrit = fQuantile(1 - alpha, d1, d2);
  return 1 - noncentralFCdf(fCrit, d1, d2, lambda);
}
