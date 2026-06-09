/**
 * __tests__/pv-signal-detection.test.ts
 *
 * INTEGRATION NOTES
 * -----------------
 * Vitest suite for server/services/compliance/pv-signal-detection.ts. Uses
 * hand-worked numeric examples (PRR, ROR + 95% CI, Yates chi-squared, EBGM/EB05)
 * checked against the textbook disproportionality formulas, plus the
 * conventional PRR>=2 AND chi2>=4 AND a>=3 signal rule.
 *
 * NOTE ON TEST DISCOVERY: the repo's vitest.config.ts include globs cover the
 * `tests` tree and `__tests__` directories under `server`, not the repo-root
 * `__tests__` directory. This file lives at the path requested in the task; run
 * it explicitly with:
 *   npx vitest run --config vitest.config.ts __tests__/pv-signal-detection.test.ts
 * (Passing a file path overrides the include globs.) To wire it into the
 * default run, add the recursive `__tests__` test-file glob to the include
 * array in vitest.config.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  computeDisproportionality,
  ebgmEb05,
  toSafetySignalInput,
} from '../pv-signal-detection';

describe('computeDisproportionality — textbook 2x2 (a=25,b=75,c=100,d=1000)', () => {
  const result = computeDisproportionality({ a: 25, b: 75, c: 100, d: 1000 });

  it('PRR = [a/(a+b)]/[c/(c+d)] = (25/100)/(100/1100) = 2.75', () => {
    // 0.25 / (100/1100 = 0.0909090909) = 2.75 exactly
    expect(result.prr).toBeCloseTo(2.75, 6);
  });

  it('ROR = (a*d)/(b*c) = (25*1000)/(75*100) = 3.3333', () => {
    expect(result.ror).toBeCloseTo(3.333333, 4);
  });

  it('ROR 95% CI via ln(ROR) ± 1.96*sqrt(1/a+1/b+1/c+1/d) ≈ [2.0276, 5.4800]', () => {
    // SE = sqrt(1/25 + 1/75 + 1/100 + 1/1000) = sqrt(0.04+0.013333+0.01+0.001)
    //    = sqrt(0.0643333) = 0.253640
    // ln(3.33333)=1.203973; lower=exp(1.203973-1.96*0.25364)=2.02757
    //                       upper=exp(1.203973+1.96*0.25364)=5.48001
    expect(result.rorCi.lower).toBeCloseTo(2.02757, 3);
    expect(result.rorCi.upper).toBeCloseTo(5.48001, 3);
  });

  it('Yates chi-squared ≈ 23.187', () => {
    // N=1200; |ad-bc|=|25000-7500|=17500; corrected=17500-600=16900
    // chi2 = 1200*16900^2 / (100*1100*125*1075) = 23.1869
    expect(result.chiSquared).toBeCloseTo(23.187, 2);
  });

  it('EBGM/EB05 (simplified GPS): EBGM ≈ 2.29, EB05 ≈ 1.63', () => {
    // E = (a+b)(a+c)/N = 100*125/1200 = 10.4167
    // posterior Gamma(shape=25.5, rate=10.9167); EBGM=exp(psi(25.5)-ln(10.9167))
    expect(result.ebgm).toBeCloseTo(2.29, 1);
    expect(result.eb05).toBeCloseTo(1.63, 1);
  });

  it('signalDetected = true (PRR>=2, chi2>=4, a>=3)', () => {
    expect(result.signalDetected).toBe(true);
  });
});

describe('computeDisproportionality — strong signal (a=50,b=50,c=50,d=9850)', () => {
  const result = computeDisproportionality({ a: 50, b: 50, c: 50, d: 9850 });

  it('PRR = (50/100)/(50/9900) = 99', () => {
    expect(result.prr).toBeCloseTo(99, 4);
  });

  it('ROR = (50*9850)/(50*50) = 197', () => {
    expect(result.ror).toBeCloseTo(197, 6);
  });

  it('ROR 95% CI ≈ [121.84, 318.53]', () => {
    // SE = sqrt(1/50+1/50+1/50+1/9850)=sqrt(0.060102)=0.245158
    // ln(197)=5.283204; lower=exp(5.283204-1.96*0.245158)=121.84; upper=318.53
    expect(result.rorCi.lower).toBeCloseTo(121.84, 1);
    expect(result.rorCi.upper).toBeCloseTo(318.53, 1);
  });

  it('Yates chi-squared is large (> 1000)', () => {
    expect(result.chiSquared).toBeGreaterThan(1000);
  });

  it('EB05 well above the classic EB05>=2 threshold', () => {
    expect(result.eb05).toBeGreaterThan(2);
    expect(result.eb05).toBeCloseTo(26.27, 0);
  });

  it('signalDetected = true', () => {
    expect(result.signalDetected).toBe(true);
  });
});

describe('signalDetected rule edge cases', () => {
  it('a<3 blocks a signal even when PRR and chi2 are high (a=2,b=10,c=100,d=5000)', () => {
    const r = computeDisproportionality({ a: 2, b: 10, c: 100, d: 5000 });
    expect(r.prr).toBeGreaterThanOrEqual(2);
    expect(r.chiSquared).toBeGreaterThanOrEqual(4);
    expect(r.signalDetected).toBe(false); // fails the a>=3 arm
  });

  it('PRR=1 / chi2=0 → no signal (a=10,b=90,c=10,d=90)', () => {
    const r = computeDisproportionality({ a: 10, b: 90, c: 10, d: 90 });
    expect(r.prr).toBeCloseTo(1, 6);
    expect(r.ror).toBeCloseTo(1, 6);
    expect(r.chiSquared).toBeCloseTo(0, 6);
    expect(r.signalDetected).toBe(false);
  });

  it('boundary: PRR exactly 2 and chi2 exactly >=4 with a>=3 is a signal', () => {
    // Construct PRR=2: (a/(a+b)) = 2*(c/(c+d)).
    // a=20,b=80 -> 0.2 ; need c/(c+d)=0.1 -> c=100,d=900
    const r = computeDisproportionality({ a: 20, b: 80, c: 100, d: 900 });
    expect(r.prr).toBeCloseTo(2, 6);
    expect(r.chiSquared).toBeGreaterThanOrEqual(4);
    expect(r.signalDetected).toBe(true);
  });
});

describe('ebgmEb05 — direct, and ordering property', () => {
  it('EB05 <= EBGM (lower bound never exceeds the geometric mean)', () => {
    for (const counts of [
      { a: 25, b: 75, c: 100, d: 1000 },
      { a: 50, b: 50, c: 50, d: 9850 },
      { a: 3, b: 20, c: 200, d: 9000 },
    ]) {
      const { ebgm, eb05 } = ebgmEb05(counts);
      expect(eb05).toBeLessThanOrEqual(ebgm);
    }
  });

  it('returns 0/0 for an empty table', () => {
    expect(ebgmEb05({ a: 0, b: 0, c: 0, d: 0 })).toEqual({ ebgm: 0, eb05: 0 });
  });

  it('larger observed-vs-expected excess yields larger EBGM', () => {
    const weak = ebgmEb05({ a: 5, b: 100, c: 100, d: 1000 });
    const strong = ebgmEb05({ a: 40, b: 60, c: 60, d: 9000 });
    expect(strong.ebgm).toBeGreaterThan(weak.ebgm);
  });
});

describe('toSafetySignalInput mapper (SafetySignal shape)', () => {
  const result = computeDisproportionality({ a: 25, b: 75, c: 100, d: 1000 });
  const mapped = toSafetySignalInput(result, {
    organizationId: 'org-1',
    projectId: 'proj-1',
    drug: 'DrugX',
    event: 'Hepatotoxicity',
  });

  it('produces the Omit<SafetySignal,"id"|"detectedAt"> fields', () => {
    expect(mapped.organizationId).toBe('org-1');
    expect(mapped.projectId).toBe('proj-1');
    expect(mapped.signalSource).toBe('spontaneous');
    expect(mapped.evaluationStatus).toBe('new');
    expect(mapped.action).toBe('none');
    expect(mapped.description).toContain('DrugX');
    expect(mapped.description).toContain('PRR=2.75');
  });

  it('riskBenefitAssessment reflects the signal threshold', () => {
    expect(mapped.riskBenefitAssessment).toMatch(/threshold met/i);
  });
});
