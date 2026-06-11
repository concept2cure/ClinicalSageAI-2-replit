/**
 * Coverage / reimbursement revenue model tests.
 */

import { describe, it, expect } from 'vitest';
import { simulateCoverage } from '../coverage-simulation';

describe('simulateCoverage', () => {
  const baseMix = [
    { name: 'Medicare', sharePct: 40 },
    { name: 'Commercial', sharePct: 55 },
    { name: 'Self-pay', sharePct: 5 },
  ];

  it('stronger clinical utility raises coverage and NPV', () => {
    const strong = simulateCoverage({ annualTestVolume: 50000, basePriceUsd: 300, payerMix: baseMix, clinicalUtilityStrength: 'strong' });
    const weak = simulateCoverage({ annualTestVolume: 50000, basePriceUsd: 300, payerMix: baseMix, clinicalUtilityStrength: 'weak' });
    expect(strong.blendedCoverageProbability).toBeGreaterThan(weak.blendedCoverageProbability);
    expect(strong.npvUsd).toBeGreaterThan(weak.npvUsd);
    expect(strong.steadyStateAnnualRevenueUsd).toBeGreaterThan(0);
  });

  it('normalizes payer shares and reports per-segment economics', () => {
    const r = simulateCoverage({ annualTestVolume: 10000, basePriceUsd: 500, payerMix: [{ name: 'Medicare', sharePct: 1 }, { name: 'Commercial', sharePct: 1 }], clinicalUtilityStrength: 'moderate' });
    const shareSum = r.perSegment.reduce((s, p) => s + p.share, 0);
    expect(shareSum).toBeCloseTo(1, 2);
    expect(r.perSegment).toHaveLength(2);
    expect(r.perSegment.every(p => p.expectedPerTestUsd <= 500)).toBe(true);
  });

  it('respects explicit per-segment coverage overrides', () => {
    const r = simulateCoverage({ annualTestVolume: 1000, basePriceUsd: 200, payerMix: [{ name: 'Commercial', sharePct: 100, coverageProbability: 0.5 }] });
    expect(r.perSegment[0].coverageProbability).toBeCloseTo(0.5, 3);
    expect(r.perSegment[0].expectedPerTestUsd).toBeCloseTo(100, 1);
  });

  it('discounting makes NPV less than undiscounted steady-state revenue × horizon', () => {
    const r = simulateCoverage({ annualTestVolume: 20000, basePriceUsd: 250, payerMix: baseMix, clinicalUtilityStrength: 'strong', horizonYears: 5, rampYears: 1, discountRate: 0.15 });
    expect(r.npvUsd).toBeLessThan(r.steadyStateAnnualRevenueUsd * 5);
  });

  it('rejects an empty payer mix', () => {
    expect(() => simulateCoverage({ annualTestVolume: 1, basePriceUsd: 1, payerMix: [] })).toThrow();
  });
});
