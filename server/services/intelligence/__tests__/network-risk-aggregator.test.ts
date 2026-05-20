/**
 * Tests for the differentially-private network risk aggregator.
 *
 * Scope: noise/clamp helpers and the privacy invariants that don't require
 * a database. The DB-backed rebuild and lookup paths are covered by
 * integration tests.
 */

import { describe, it, expect } from 'vitest';
import { laplaceNoise, clampRate } from '../network-risk-aggregator';

describe('laplaceNoise', () => {
  it('returns 0 when scale is non-positive', () => {
    expect(laplaceNoise(0, () => 0.42)).toBe(0);
    expect(laplaceNoise(-1, () => 0.42)).toBe(0);
  });

  it('is deterministic for a fixed seed and produces both signs', () => {
    // A reproducible RNG so we can assert sign symmetry.
    // The implementation maps rng() → u = rng() - 0.5, so rng() < 0.5
    // yields u < 0 and a negative noise value; rng() > 0.5 yields positive.
    let i = 0;
    const samples = [0.1, 0.4, 0.5, 0.6, 0.9];
    const rng = () => samples[i++ % samples.length];
    const out = Array.from({ length: 5 }, () => laplaceNoise(0.1, rng));
    expect(out[0]).toBeLessThan(0);    // rng=0.1
    expect(out[1]).toBeLessThan(0);    // rng=0.4
    expect(out[3]).toBeGreaterThan(0); // rng=0.6
    expect(out[4]).toBeGreaterThan(0); // rng=0.9
  });

  it('has empirical mean near zero for large samples', () => {
    let seed = 1;
    const rng = () => {
      // Linear-congruential generator — quick deterministic uniform.
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const n = 10000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += laplaceNoise(0.05, rng);
    expect(Math.abs(sum / n)).toBeLessThan(0.005);
  });

  it('scale parameter controls spread', () => {
    let seed = 1;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const n = 5000;
    const absMean = (scale: number) => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += Math.abs(laplaceNoise(scale, rng));
      return sum / n;
    };
    const small = absMean(0.01);
    const large = absMean(0.5);
    expect(large).toBeGreaterThan(small * 10);
  });
});

describe('clampRate', () => {
  it('clamps to [0, 1]', () => {
    expect(clampRate(-0.5)).toBe(0);
    expect(clampRate(1.5)).toBe(1);
    expect(clampRate(0.42)).toBe(0.42);
  });
  it('handles non-finite input', () => {
    expect(clampRate(Number.NaN)).toBe(0);
    expect(clampRate(Number.POSITIVE_INFINITY)).toBe(1);
  });
});
