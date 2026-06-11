/**
 * Coverage / reimbursement revenue simulation for IVDs.
 *
 * Estimates risk-adjusted revenue (and an NPV usable as `marketValueUsd` for the
 * EMV / EVPI / decision-tree engines) from test volume, price, payer mix, and
 * payer coverage probabilities — where coverage probability is driven by the
 * strength of the clinical-utility evidence (the payer bar, distinct from the
 * regulatory bar). Ties the reimbursement / HTA knowledge to a financial model.
 *
 * Deterministic; no I/O. All economics are caller-supplied or transparent
 * planning defaults.
 */

export type ClinicalUtilityStrength = 'strong' | 'moderate' | 'weak' | 'none';

/** Base per-payer coverage probability by clinical-utility evidence strength. */
const UTILITY_BASE_COVERAGE: Record<ClinicalUtilityStrength, number> = {
  strong: 0.85,
  moderate: 0.6,
  weak: 0.35,
  none: 0.12,
};

/** Coverage-likelihood multiplier by payer type (commercial lags Medicare). */
function segmentFactor(name: string): number {
  const n = name.toLowerCase();
  if (n.includes('medicare')) return 1.0;
  if (n.includes('medicaid')) return 0.75;
  if (n.includes('commercial') || n.includes('private')) return 0.85;
  if (n.includes('self') || n.includes('cash') || n.includes('out-of-pocket')) return 1.0; // patient pays directly
  return 0.85;
}

export interface PayerSegment {
  name: string;
  /** Share of test volume (percent; segments are normalized). */
  sharePct: number;
  /** Override coverage probability (0–1). If omitted, derived from utility strength. */
  coverageProbability?: number;
  /** Realized reimbursement per covered test (USD). Defaults to basePriceUsd. */
  reimbursementUsd?: number;
}

export interface CoverageSimInput {
  annualTestVolume: number;
  basePriceUsd: number;
  payerMix: PayerSegment[];
  /** Drives default coverage probabilities when a segment doesn't override. */
  clinicalUtilityStrength?: ClinicalUtilityStrength;
  /** Years to ramp from 0 to steady-state volume. Default 3. */
  rampYears?: number;
  /** Revenue horizon in years. Default 7. */
  horizonYears?: number;
  /** Annual discount rate. Default 0.12. */
  discountRate?: number;
  /** Gross margin (0–1) to convert revenue to value. Default 1 (revenue = value). */
  grossMargin?: number;
}

export interface CoverageSegmentResult {
  name: string;
  share: number;
  coverageProbability: number;
  reimbursementUsd: number;
  /** Expected per-test realized revenue for this segment (coverage × reimbursement). */
  expectedPerTestUsd: number;
}

export interface CoverageSimResult {
  perSegment: CoverageSegmentResult[];
  blendedCoverageProbability: number;
  blendedRealizedPricePerTestUsd: number;
  steadyStateAnnualRevenueUsd: number;
  /** Risk-adjusted, ramped, discounted NPV — feed as marketValueUsd downstream. */
  npvUsd: number;
  horizonYears: number;
}

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Simulate coverage-adjusted revenue and NPV for an IVD. */
export function simulateCoverage(input: CoverageSimInput): CoverageSimResult {
  if (input.annualTestVolume < 0 || input.basePriceUsd < 0) {
    throw new Error('annualTestVolume and basePriceUsd must be non-negative.');
  }
  if (!Array.isArray(input.payerMix) || input.payerMix.length === 0) {
    throw new Error('payerMix is required.');
  }
  const totalShare = input.payerMix.reduce((s, p) => s + Math.max(0, p.sharePct), 0);
  if (totalShare <= 0) throw new Error('payerMix shares must sum to a positive value.');

  const base = UTILITY_BASE_COVERAGE[input.clinicalUtilityStrength ?? 'moderate'];
  const rampYears = Math.max(1, input.rampYears ?? 3);
  const horizonYears = Math.max(1, input.horizonYears ?? 7);
  const rate = Math.max(0, input.discountRate ?? 0.12);
  const margin = Math.max(0, Math.min(1, input.grossMargin ?? 1));

  let blendedCoverage = 0;
  let blendedPrice = 0;
  const perSegment: CoverageSegmentResult[] = input.payerMix.map(seg => {
    const share = Math.max(0, seg.sharePct) / totalShare;
    const coverage = Math.max(0, Math.min(0.98, seg.coverageProbability ?? base * segmentFactor(seg.name)));
    const reimbursement = seg.reimbursementUsd ?? input.basePriceUsd;
    const expectedPerTest = coverage * reimbursement;
    blendedCoverage += share * coverage;
    blendedPrice += share * expectedPerTest;
    return {
      name: seg.name,
      share: round(share, 4),
      coverageProbability: round(coverage, 4),
      reimbursementUsd: round(reimbursement),
      expectedPerTestUsd: round(expectedPerTest),
    };
  });

  const steadyStateAnnualRevenueUsd = input.annualTestVolume * blendedPrice;

  // Ramp linearly to steady state, discount over the horizon.
  let npv = 0;
  for (let t = 1; t <= horizonYears; t++) {
    const rampFraction = Math.min(1, t / rampYears);
    const revenue = steadyStateAnnualRevenueUsd * rampFraction;
    npv += (revenue * margin) / Math.pow(1 + rate, t);
  }

  return {
    perSegment,
    blendedCoverageProbability: round(blendedCoverage, 4),
    blendedRealizedPricePerTestUsd: round(blendedPrice),
    steadyStateAnnualRevenueUsd: round(steadyStateAnnualRevenueUsd),
    npvUsd: round(npv),
    horizonYears,
  };
}
