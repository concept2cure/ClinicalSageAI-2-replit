/**
 * Disproportionality signal-detection tests.
 */

import { describe, it, expect } from 'vitest';
import { computeDisproportionality } from '../signal-disproportionality';

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
