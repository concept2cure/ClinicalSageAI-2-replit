import { describe, it, expect } from 'vitest';
import {
  Rng,
  createRng,
  seedFromString,
  seedFromObject,
  stableStringify,
} from '../../server/services/stats/rng';
import {
  buildProvenance,
  hashInputs,
  STATS_ENGINE_VERSION,
} from '../../server/services/stats/computation-provenance';

describe('Rng — determinism', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 100 }, () => a.uniform());
    const seqB = Array.from({ length: 100 }, () => b.uniform());
    expect(seqA).toEqual(seqB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = Array.from({ length: 50 }, (_, i) => i).map(() => new Rng(1).uniform());
    const b = new Rng(2).uniform();
    expect(a[0]).not.toEqual(b);
  });

  it('uniform draws stay in [0, 1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 10000; i++) {
      const u = r.uniform();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });
});

describe('Rng — distribution sanity', () => {
  it('uniform mean is ~0.5 over a large sample', () => {
    const r = new Rng(99);
    let sum = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) sum += r.uniform();
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.01);
  });

  it('normal has mean ~mu and sd ~sigma', () => {
    const r = new Rng(3);
    const n = 200000;
    const mu = 2;
    const sigma = 3;
    const xs: number[] = [];
    for (let i = 0; i < n; i++) xs.push(r.normal(mu, sigma));
    const mean = xs.reduce((s, x) => s + x, 0) / n;
    const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
    expect(Math.abs(mean - mu)).toBeLessThan(0.05);
    expect(Math.abs(Math.sqrt(variance) - sigma)).toBeLessThan(0.05);
  });

  it('binomial count is in [0, n] and mean ~ n*p', () => {
    const r = new Rng(11);
    const n = 100;
    const p = 0.3;
    const reps = 20000;
    let total = 0;
    for (let i = 0; i < reps; i++) {
      const k = r.binomial(n, p);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(n);
      total += k;
    }
    expect(Math.abs(total / reps - n * p)).toBeLessThan(0.5);
  });

  it('beta mean is ~ a/(a+b)', () => {
    const r = new Rng(21);
    const a = 2;
    const b = 5;
    const reps = 100000;
    let sum = 0;
    for (let i = 0; i < reps; i++) sum += r.beta(a, b);
    expect(Math.abs(sum / reps - a / (a + b))).toBeLessThan(0.01);
  });

  it('exponential mean is ~ 1/rate', () => {
    const r = new Rng(31);
    const rate = 0.5;
    const reps = 200000;
    let sum = 0;
    for (let i = 0; i < reps; i++) sum += r.exponential(rate);
    expect(Math.abs(sum / reps - 1 / rate)).toBeLessThan(0.05);
  });
});

describe('seed derivation', () => {
  it('seedFromString is stable and uint32', () => {
    const s = seedFromString('hello');
    expect(s).toEqual(seedFromString('hello'));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });

  it('seedFromObject is order-independent for object keys', () => {
    expect(seedFromObject({ a: 1, b: 2 })).toEqual(seedFromObject({ b: 2, a: 1 }));
  });

  it('stableStringify sorts keys deterministically', () => {
    expect(stableStringify({ b: 1, a: [3, { y: 2, x: 1 }] })).toEqual(
      '{"a":[3,{"x":1,"y":2}],"b":1}'
    );
  });

  it('createRng with no seed is deterministic', () => {
    expect(createRng().uniform()).toEqual(createRng().uniform());
  });
});

describe('provenance', () => {
  it('hashInputs is stable and order-independent', () => {
    expect(hashInputs({ x: 1, y: 2 })).toEqual(hashInputs({ y: 2, x: 1 }));
  });

  it('buildProvenance records seed, hash, engine version', () => {
    const p = buildProvenance({ method: 'simulateAdaptiveTrial', seed: 42, inputs: { a: 1 } });
    expect(p.seed).toEqual(42);
    expect(p.method).toEqual('simulateAdaptiveTrial');
    expect(p.engineVersion).toEqual(STATS_ENGINE_VERSION);
    expect(p.inputsSha256).toEqual(hashInputs({ a: 1 }));
    expect(p.reproducible).toBe(true);
  });
});
