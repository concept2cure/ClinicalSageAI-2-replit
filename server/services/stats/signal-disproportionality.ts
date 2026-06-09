/**
 * Disproportionality signal-detection statistics for post-market surveillance.
 *
 * Pure and deterministic. Closes the audit gap "advanced statistical signal
 * detection (PRR/ROR/EBGM) — absent": the existing openFDA surveillance only
 * did simple rate-spike heuristics.
 *
 * Computes the standard 2×2 disproportionality measures used in
 * pharmacovigilance and device vigilance signal detection:
 *
 *                    Event of interest    Other events
 *   Product of int.        a                  b
 *   Other products         c                  d
 *
 *   - PRR  = [a/(a+b)] / [c/(c+d)]            (Proportional Reporting Ratio)
 *   - ROR  = (a/b) / (c/d) = ad/bc            (Reporting Odds Ratio)
 *   - χ²   with Yates correction
 *
 * Signal thresholds (EMA/MHRA convention): PRR ≥ 2, χ² ≥ 4, a ≥ 3.
 */

export interface DisproportionalityCell {
  /** a: reports of the event for the product of interest. */
  a: number;
  /** b: reports of other events for the product of interest. */
  b: number;
  /** c: reports of the event for all other products. */
  c: number;
  /** d: reports of other events for all other products. */
  d: number;
}

export interface DisproportionalityResult {
  prr: number;
  prrCi95: [number, number];
  ror: number;
  rorCi95: [number, number];
  chiSquaredYates: number;
  /** EMA/MHRA signal criterion: PRR ≥ 2 AND χ² ≥ 4 AND a ≥ 3. */
  signal: boolean;
  counts: DisproportionalityCell;
}

const round = (n: number, dp = 4): number => {
  if (!Number.isFinite(n)) return n;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * Compute PRR, ROR (with 95% CIs) and the Yates-corrected chi-squared from a
 * 2×2 contingency table, and apply the standard signalling criterion.
 */
export function computeDisproportionality(
  cell: DisproportionalityCell
): DisproportionalityResult {
  const { a, b, c, d } = cell;
  if ([a, b, c, d].some(v => v < 0 || !Number.isInteger(v))) {
    throw new Error('Contingency cells must be non-negative integers.');
  }
  // Haldane-Anscombe-style guard: avoid divide-by-zero with 0.5 continuity
  // correction only where a denominator would be zero.
  const aa = a || 0.5;
  const bb = b || 0.5;
  const cc = c || 0.5;
  const dd = d || 0.5;

  // PRR
  const prr = (aa / (aa + bb)) / (cc / (cc + dd));
  const lnPrr = Math.log(prr);
  const sePrr = Math.sqrt(1 / aa - 1 / (aa + bb) + 1 / cc - 1 / (cc + dd));
  const prrCi95: [number, number] = [
    round(Math.exp(lnPrr - 1.96 * sePrr)),
    round(Math.exp(lnPrr + 1.96 * sePrr)),
  ];

  // ROR
  const ror = (aa * dd) / (bb * cc);
  const lnRor = Math.log(ror);
  const seRor = Math.sqrt(1 / aa + 1 / bb + 1 / cc + 1 / dd);
  const rorCi95: [number, number] = [
    round(Math.exp(lnRor - 1.96 * seRor)),
    round(Math.exp(lnRor + 1.96 * seRor)),
  ];

  // Yates-corrected chi-squared on the observed (uncorrected) table.
  const n = a + b + c + d;
  let chiSquaredYates = 0;
  if (n > 0) {
    const numerator = n * Math.max(0, Math.abs(a * d - b * c) - n / 2) ** 2;
    const denominator = (a + b) * (c + d) * (a + c) * (b + d);
    chiSquaredYates = denominator === 0 ? 0 : numerator / denominator;
  }

  const signal = prr >= 2 && chiSquaredYates >= 4 && a >= 3;

  return {
    prr: round(prr),
    prrCi95,
    ror: round(ror),
    rorCi95,
    chiSquaredYates: round(chiSquaredYates),
    signal,
    counts: cell,
  };
}
