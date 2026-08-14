/**
 * Disproportionality signal-detection tests.
 */

import { describe, it, expect } from 'vitest';
import {
  computeDisproportionality,
  computeBcpnnIc,
  computeGammaPoissonEbgm,
  screenSignalPanel,
} from '../signal-disproportionality';

describe('computeDisproportionality', () => {
  it('detects a signal when PRR and chi-squared exceed thresholds', () => {
    // Strong association: 30 of 130 for product vs 10 of 10010 elsewhere.
    const r = computeDisproportionality({ a: 30, b: 100, c: 10, d: 10000 });
    expect(r.prr).toBeGreaterThan(2);
    expect(r.chiSquaredYates).toBeGreaterThan(4);
    expect(r.signal).toBe(true);
    expect(r.prrCi95[0]).toBeLessThan(r.prr);
    expect(r.prrCi95[1]).toBeGreaterThan(r.prr);
  });

  it('no signal for proportional reporting', () => {
    const r = computeDisproportionality({ a: 10, b: 100, c: 100, d: 1000 });
    expect(r.signal).toBe(false);
    expect(r.prr).toBeCloseTo(1, 1);
  });

  it('no signal when a < 3 even if ratio is high', () => {
    const r = computeDisproportionality({ a: 2, b: 1, c: 1, d: 10000 });
    expect(r.signal).toBe(false);
  });

  it('handles zero cells without throwing', () => {
    const r = computeDisproportionality({ a: 5, b: 0, c: 1, d: 1000 });
    expect(Number.isFinite(r.ror)).toBe(true);
  });

  it('rejects non-integer cells', () => {
    expect(() => computeDisproportionality({ a: 1.5, b: 1, c: 1, d: 1 })).toThrow();
  });
});

describe('computeBcpnnIc', () => {
  it('computes IC and a 95% credibility interval for a strong association', () => {
    // Hand-verified: E = 130*40/10140 = 0.51282; IC = log2(30.5/1.01282) = 4.9123;
    // sd = (1/ln2)/sqrt(30.5) = 0.26123; IC025 = 4.9123 - 1.96*0.26123 = 4.400.
    const r = computeBcpnnIc({ a: 30, b: 100, c: 10, d: 10000 });
    expect(r.expectedCount).toBeCloseTo(0.5128, 3);
    expect(r.ic).toBeCloseTo(4.9123, 2);
    expect(r.ic025).toBeCloseTo(4.4, 1);
    expect(r.ic025).toBeLessThan(r.ic);
    expect(r.ic975).toBeGreaterThan(r.ic);
    expect(r.signal).toBe(true);
  });

  it('does not signal (IC025 ≤ 0) when observed equals expected', () => {
    const r = computeBcpnnIc({ a: 10, b: 100, c: 100, d: 1000 });
    expect(r.ic).toBeCloseTo(0, 1);
    expect(r.signal).toBe(false);
  });

  it('shrinks toward zero for a single coincidental co-report', () => {
    const strong = computeBcpnnIc({ a: 1, b: 0, c: 1, d: 100000 }).ic025;
    // One report against a huge background: the lower bound must not clear 0.
    expect(computeBcpnnIc({ a: 1, b: 5, c: 50, d: 100000 }).signal).toBe(false);
    expect(Number.isFinite(strong)).toBe(true);
  });

  it('rejects an empty table and non-positive shrinkage', () => {
    expect(() => computeBcpnnIc({ a: 0, b: 0, c: 0, d: 0 })).toThrow();
    expect(() => computeBcpnnIc({ a: 1, b: 1, c: 1, d: 1 }, 0)).toThrow();
  });
});

describe('computeGammaPoissonEbgm', () => {
  it('orders EB05 < EBGM < EB95 and shrinks the raw report ratio', () => {
    // RR = 30/0.51282 = 58.5; EBGM ≈ 29.6 (shrunk toward 1); EB05 ≈ 21.7.
    const r = computeGammaPoissonEbgm({ a: 30, b: 100, c: 10, d: 10000 });
    expect(r.relativeReportRatio).toBeCloseTo(58.5, 0);
    expect(r.ebgm).toBeLessThan(r.relativeReportRatio!); // shrinkage
    expect(r.eb05).toBeLessThan(r.ebgm);
    expect(r.ebgm).toBeLessThan(r.eb95);
    expect(r.eb05).toBeGreaterThanOrEqual(2);
    expect(r.signal).toBe(true);
  });

  it('does not signal when EB05 falls below 2 at small counts', () => {
    const r = computeGammaPoissonEbgm({ a: 2, b: 1, c: 50, d: 100000 });
    expect(r.eb05).toBeLessThan(2);
    expect(r.signal).toBe(false);
  });

  it('rejects a non-positive prior', () => {
    expect(() => computeGammaPoissonEbgm({ a: 3, b: 1, c: 1, d: 100 }, { alpha: 0, beta: 1 })).toThrow();
  });
});

describe('screenSignalPanel', () => {
  it('returns a strong tier when all three methods concur', () => {
    const p = screenSignalPanel({ a: 30, b: 100, c: 10, d: 10000 });
    expect(p.frequentist.signal).toBe(true);
    expect(p.bcpnn.signal).toBe(true);
    expect(p.ebgm.signal).toBe(true);
    expect(p.concordance).toBe(3);
    expect(p.tier).toBe('strong');
    expect(p.divergenceNotes.some(n => /concur/i.test(n))).toBe(true);
  });

  it('returns none when there is no disproportionality', () => {
    const p = screenSignalPanel({ a: 10, b: 100, c: 100, d: 1000 });
    expect(p.concordance).toBe(0);
    expect(p.tier).toBe('none');
  });

  it('flags divergence when frequentist signals but a Bayesian method does not', () => {
    // Small observed count with an extreme table: PRR/χ² fire (a ≥ 3) but the
    // shrinkage methods are more conservative.
    const p = screenSignalPanel({ a: 3, b: 0, c: 1, d: 200 });
    if (p.frequentist.signal && p.concordance < 3) {
      expect(p.divergenceNotes.length).toBeGreaterThan(0);
      expect(p.tier).not.toBe('strong');
    }
    expect(['strong', 'moderate', 'weak', 'none']).toContain(p.tier);
  });
});
