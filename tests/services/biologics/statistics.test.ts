import { describe, it, expect } from 'vitest';
import {
  mean,
  sampleStd,
  describe as summarize,
  normalCdf,
  normalInv,
  studentTCdf,
  studentTInv,
  welchDiffCI,
  tost,
  qualityRange,
  fractionWithin,
  wilsonCI,
  newcombeDiffCI,
} from '../../../server/services/biologics/statistics';

describe('biologics/statistics — descriptive', () => {
  const xs = [2, 4, 4, 4, 5, 5, 7, 9];

  it('computes mean and sample SD (Bessel)', () => {
    expect(mean(xs)).toBe(5);
    // sample variance = 32/7 → sd ≈ 2.138
    expect(sampleStd(xs)).toBeCloseTo(2.1381, 3);
  });

  it('describe returns n, mean, sd, sem, min, max', () => {
    const d = summarize(xs);
    expect(d.n).toBe(8);
    expect(d.mean).toBe(5);
    expect(d.min).toBe(2);
    expect(d.max).toBe(9);
    expect(d.sem).toBeCloseTo(2.1381 / Math.sqrt(8), 3);
  });

  it('returns NaN safely on empty / singleton input', () => {
    expect(Number.isNaN(mean([]))).toBe(true);
    expect(Number.isNaN(sampleStd([3]))).toBe(true);
  });
});

describe('biologics/statistics — normal', () => {
  it('normalCdf at known points', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  it('normalInv inverts normalCdf', () => {
    expect(normalInv(0.975)).toBeCloseTo(1.96, 2);
    expect(normalInv(0.5)).toBeCloseTo(0, 6);
    expect(normalInv(0.025)).toBeCloseTo(-1.96, 2);
  });
});

describe('biologics/statistics — Student-t', () => {
  it('studentTInv matches table values', () => {
    expect(studentTInv(0.975, 10)).toBeCloseTo(2.228, 2);
    expect(studentTInv(0.95, 10)).toBeCloseTo(1.8125, 2);
    expect(studentTInv(0.975, 30)).toBeCloseTo(2.042, 2);
    expect(studentTInv(0.5, 5)).toBeCloseTo(0, 6);
  });

  it('studentTCdf round-trips with studentTInv', () => {
    const t = studentTInv(0.9, 12);
    expect(studentTCdf(t, 12)).toBeCloseTo(0.9, 4);
  });

  it('approaches the normal for large df', () => {
    expect(studentTInv(0.975, 100000)).toBeCloseTo(1.96, 2);
  });
});

describe('biologics/statistics — Welch CI & TOST', () => {
  it('identical samples give zero difference', () => {
    const a = [10, 11, 9, 10, 12, 8];
    const ci = welchDiffCI(a, a, 0.9);
    expect(ci.diff).toBeCloseTo(0, 6);
    expect(ci.lower).toBeLessThan(0);
    expect(ci.upper).toBeGreaterThan(0);
  });

  it('declares equivalence when CI is within margins', () => {
    const ref = [100, 99, 101, 100, 98, 102, 100, 99, 101, 100];
    const test = [100, 100, 99, 101, 100, 99, 101, 100, 100, 99];
    const r = tost(test, ref, -3, 3, 0.05);
    expect(r.equivalent).toBe(true);
    expect(r.pValue).toBeLessThan(0.05);
  });

  it('rejects equivalence when the difference exceeds the margin', () => {
    const ref = [100, 99, 101, 100, 98, 102, 100, 99, 101, 100];
    const test = ref.map((x) => x + 8);
    const r = tost(test, ref, -3, 3, 0.05);
    expect(r.equivalent).toBe(false);
  });
});

describe('biologics/statistics — quality range & containment', () => {
  it('builds mean ± k·sd and counts containment', () => {
    const ref = [100, 102, 98, 101, 99, 100, 103, 97];
    const qr = qualityRange(ref, 3);
    expect(qr.center).toBeCloseTo(100, 6);
    // all reference points fall inside their own ±3σ range
    expect(fractionWithin(ref, qr)).toBe(1);
    // a far-out lot is excluded
    expect(fractionWithin([130], qr)).toBe(0);
  });
});

describe('biologics/statistics — binomial proportions', () => {
  it('Wilson interval for 5/100', () => {
    const ci = wilsonCI(5, 100, 0.95);
    expect(ci.p).toBeCloseTo(0.05, 6);
    expect(ci.lower).toBeCloseTo(0.0215, 3);
    expect(ci.upper).toBeCloseTo(0.1119, 3);
  });

  it('Wilson stays within [0,1] at the boundary', () => {
    const ci = wilsonCI(0, 20, 0.95);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBeGreaterThan(0);
  });

  it('Newcombe difference includes zero for equal proportions', () => {
    const d = newcombeDiffCI(5, 100, 5, 100, 0.95);
    expect(d.diff).toBeCloseTo(0, 6);
    expect(d.lower).toBeLessThan(0);
    expect(d.upper).toBeGreaterThan(0);
  });

  it('Newcombe difference excludes zero for a large gap', () => {
    const d = newcombeDiffCI(40, 100, 5, 100, 0.95);
    expect(d.diff).toBeCloseTo(0.35, 6);
    expect(d.lower).toBeGreaterThan(0);
  });
});
