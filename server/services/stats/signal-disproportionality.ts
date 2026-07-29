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
 * FREQUENTIST measures ({@link computeDisproportionality}):
 *   - PRR  = [a/(a+b)] / [c/(c+d)]            (Proportional Reporting Ratio)
 *   - ROR  = (a/b) / (c/d) = ad/bc            (Reporting Odds Ratio)
 *   - χ²   with Yates correction
 *   Signal thresholds (EMA/MHRA convention): PRR ≥ 2, χ² ≥ 4, a ≥ 3.
 *
 * BAYESIAN shrinkage measures (robust to the small-count false positives that
 * inflate raw PRR/ROR at low a):
 *   - BCPNN Information Component ({@link computeBcpnnIc}) — the WHO-UMC method
 *     (Bate et al. 1998; Norén et al. 2006). IC = log2[(a+α)/(E+α)] with
 *     additive shrinkage; signal when the lower 95% bound IC025 > 0.
 *   - Gamma-Poisson EBGM ({@link computeGammaPoissonEbgm}) — the FDA/MGPS
 *     family (DuMouchel 1999) in its single-table, fixed-prior form. Reports
 *     EBGM (posterior geometric mean of the relative report ratio) with EB05 /
 *     EB95 percentiles; signal when EB05 ≥ 2.
 *
 * {@link screenSignalPanel} runs all three and returns a consolidated,
 * cross-method priority tier plus divergence notes — the multi-method verdict
 * a reviewer actually acts on.
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

// ─────────────────────────────────────────────────────────────────────────────
// Bayesian shrinkage signal detection
// ─────────────────────────────────────────────────────────────────────────────

/** 95% two-sided normal quantile (for IC025/IC975). */
const Z_95 = 1.959964;
/** One-sided 5%/95% normal quantile (for EB05/EB95). */
const Z_90 = 1.644854;

/** Validate + expected count E = (a+b)(a+c)/N for a 2×2 cell. */
function expectedCount(cell: DisproportionalityCell): { a: number; n: number; e: number } {
  const { a, b, c, d } = cell;
  if ([a, b, c, d].some(v => v < 0 || !Number.isInteger(v))) {
    throw new Error('Contingency cells must be non-negative integers.');
  }
  const n = a + b + c + d;
  if (n === 0) {
    throw new Error('Contingency table is empty (all cells zero).');
  }
  const e = ((a + b) * (a + c)) / n;
  return { a, n, e };
}

/**
 * Digamma ψ(x) for x > 0 (Euler recurrence + asymptotic expansion). Accurate to
 * ~1e-8; used for the posterior geometric mean of a Gamma distribution.
 */
function digamma(x: number): number {
  let result = 0;
  let v = x;
  while (v < 6) {
    result -= 1 / v;
    v += 1;
  }
  const inv = 1 / v;
  const inv2 = inv * inv;
  result += Math.log(v) - 0.5 * inv - inv2 / 12 + (inv2 * inv2) / 120 - (inv2 * inv2 * inv2) / 252;
  return result;
}

/**
 * Wilson–Hilferty quantile of a Gamma(shape=k, rate=r) distribution at the given
 * standard-normal quantile z. Approximation (accurate for k ≳ 1); the cube-root
 * base is clamped at 0 so extreme low-percentile requests never go negative.
 */
function gammaQuantileWH(k: number, r: number, z: number): number {
  const t = 1 / (9 * k);
  const base = Math.max(0, 1 - t + z * Math.sqrt(t));
  return (k / r) * base ** 3;
}

export interface BcpnnIcResult {
  /** Information Component IC = log2[(a+α)/(E+α)]. */
  ic: number;
  /** Lower 95% credibility bound. Signal criterion: ic025 > 0. */
  ic025: number;
  /** Upper 95% credibility bound. */
  ic975: number;
  /** Expected count E = (a+b)(a+c)/N under independence. */
  expectedCount: number;
  /** Observed co-report count a. */
  observed: number;
  /** Additive shrinkage constant α used. */
  shrinkage: number;
  /** WHO-UMC signal: the lower 95% credibility bound exceeds zero. */
  signal: boolean;
  counts: DisproportionalityCell;
}

/**
 * BCPNN Information Component with additive (Laplace) shrinkage — the WHO-UMC
 * Bayesian signal-detection statistic (Bate et al. 1998; Norén et al. 2006).
 *
 *   IC   = log2[(a + α) / (E + α)]           (E treated as a known offset)
 *   Var(IC) ≈ (1/ln2)² · 1/(a + α)           (Poisson delta method)
 *   IC025 = IC − z·√Var,  IC975 = IC + z·√Var
 *
 * Signal when IC025 > 0. Shrinkage (default α = 0.5) pulls IC toward 0 for small
 * a, so it does not fire on a handful of coincidental co-reports the way raw PRR
 * does. Deterministic.
 */
export function computeBcpnnIc(
  cell: DisproportionalityCell,
  shrinkage = 0.5
): BcpnnIcResult {
  if (!(shrinkage > 0)) {
    throw new Error('Shrinkage constant α must be a positive number.');
  }
  const { a, e } = expectedCount(cell);
  const ic = Math.log2((a + shrinkage) / (e + shrinkage));
  const sd = Math.sqrt((1 / Math.log(2)) ** 2 * (1 / (a + shrinkage)));
  return {
    ic: round(ic),
    ic025: round(ic - Z_95 * sd),
    ic975: round(ic + Z_95 * sd),
    expectedCount: round(e),
    observed: a,
    shrinkage,
    signal: ic - Z_95 * sd > 0,
    counts: cell,
  };
}

export interface GammaPoissonEbgmResult {
  /** Empirical Bayes Geometric Mean of the relative report ratio. */
  ebgm: number;
  /** 5th percentile of the posterior relative rate. Signal criterion: eb05 ≥ 2. */
  eb05: number;
  /** 95th percentile of the posterior relative rate. */
  eb95: number;
  /** Raw relative report ratio RR = a/E (pre-shrinkage). */
  relativeReportRatio: number;
  /** Expected count E = (a+b)(a+c)/N under independence. */
  expectedCount: number;
  /** Observed co-report count a. */
  observed: number;
  /** Gamma prior (shape α, rate β) applied to the relative rate. */
  prior: { alpha: number; beta: number };
  /** MGPS-convention signal: the 5th posterior percentile EB05 ≥ 2. */
  signal: boolean;
  counts: DisproportionalityCell;
}

/**
 * Gamma-Poisson shrinkage EBGM (the FDA/MGPS family, DuMouchel 1999) in its
 * single-table, fixed-prior form.
 *
 * Model: a ~ Poisson(λ·E) with a Gamma(α, β) prior on the relative rate λ,
 * giving posterior λ | a ~ Gamma(α + a, β + E). We report:
 *
 *   EBGM = geometric mean of the posterior = exp(ψ(α+a) − ln(β+E))
 *   EB05 / EB95 = 5th / 95th posterior percentiles (Wilson–Hilferty)
 *
 * The default prior α = β = 0.5 is weak and centered at λ = 1 (the null), so the
 * estimate shrinks toward "no disproportionality" for small counts. NOTE: the
 * full MGPS fits a two-component Gamma mixture prior by empirical Bayes across
 * the ENTIRE report database; this single-table variant uses a fixed prior, so
 * it is reproducible from one 2×2 table but is not a substitute for a
 * database-wide MGPS fit. Deterministic.
 */
export function computeGammaPoissonEbgm(
  cell: DisproportionalityCell,
  prior: { alpha: number; beta: number } = { alpha: 0.5, beta: 0.5 }
): GammaPoissonEbgmResult {
  const { alpha, beta } = prior;
  if (!(alpha > 0) || !(beta > 0)) {
    throw new Error('Gamma prior parameters α and β must be positive.');
  }
  const { a, e } = expectedCount(cell);
  const k = alpha + a; // posterior shape
  const r = beta + e; // posterior rate
  const ebgm = Math.exp(digamma(k) - Math.log(r));
  const eb05 = gammaQuantileWH(k, r, -Z_90);
  const eb95 = gammaQuantileWH(k, r, Z_90);
  return {
    ebgm: round(ebgm),
    eb05: round(eb05),
    eb95: round(eb95),
    relativeReportRatio: round(e === 0 ? Infinity : a / e),
    expectedCount: round(e),
    observed: a,
    prior: { alpha, beta },
    signal: eb05 >= 2,
    counts: cell,
  };
}

export interface SignalPanelResult {
  frequentist: DisproportionalityResult;
  bcpnn: BcpnnIcResult;
  ebgm: GammaPoissonEbgmResult;
  /** How many of the three methods flag a signal (0–3). */
  concordance: number;
  /** Consolidated priority tier from the concordance count. */
  tier: 'strong' | 'moderate' | 'weak' | 'none';
  /** Human-readable notes where the methods disagree and why. */
  divergenceNotes: string[];
  counts: DisproportionalityCell;
}

/**
 * Run all three signal-detection methods over one 2×2 table and consolidate them
 * into a single priority verdict. The cross-method view is the point: frequentist
 * PRR/ROR is sensitive but noisy at small counts, while the Bayesian shrinkage
 * methods (BCPNN IC, EBGM) suppress those coincidences. Concordance across
 * methods is the strongest evidence; disagreement is surfaced with a note rather
 * than hidden behind a single number. Deterministic.
 */
export function screenSignalPanel(cell: DisproportionalityCell): SignalPanelResult {
  const frequentist = computeDisproportionality(cell);
  const bcpnn = computeBcpnnIc(cell);
  const ebgm = computeGammaPoissonEbgm(cell);

  const flags = [frequentist.signal, bcpnn.signal, ebgm.signal];
  const concordance = flags.filter(Boolean).length;
  const tier: SignalPanelResult['tier'] =
    concordance === 3 ? 'strong' : concordance === 2 ? 'moderate' : concordance === 1 ? 'weak' : 'none';

  const divergenceNotes: string[] = [];
  if (frequentist.signal && !bcpnn.signal) {
    divergenceNotes.push(
      'Frequentist PRR/ROR flags a signal but BCPNN IC025 ≤ 0 — the association is not robust to Bayesian shrinkage (typically a small observed count a). Treat as lower priority.'
    );
  }
  if (frequentist.signal && !ebgm.signal) {
    divergenceNotes.push(
      'Frequentist PRR/ROR flags a signal but EBGM EB05 < 2 — the shrunken relative report ratio does not clear the MGPS threshold. Treat as lower priority.'
    );
  }
  if (!frequentist.signal && (bcpnn.signal || ebgm.signal)) {
    divergenceNotes.push(
      'A Bayesian method flags a signal while the frequentist criterion does not (often the EMA a ≥ 3 count gate). Worth a manual look despite the frequentist miss.'
    );
  }
  if (concordance === 3) {
    divergenceNotes.push('All three methods concur — the strongest disproportionality evidence from a single table.');
  }

  return { frequentist, bcpnn, ebgm, concordance, tier, divergenceNotes, counts: cell };
}
