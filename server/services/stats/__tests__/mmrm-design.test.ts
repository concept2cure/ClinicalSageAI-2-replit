/**
 * MMRM design (sample size / power) — unit tests.
 * Correctness is pinned by two exact boundary identities:
 *   1. ρ = 0  ⇒  variance factor = 1/r_target (reduces to completers-only).
 *   2. complete data  ⇒  variance factor = 1 (standard two-sample final-visit formula).
 * Plus matrix-inverse correctness, MMRM's efficiency gain with correlation,
 * monotonicity in ρ, power round-tripping, and input guards.
 */
import { describe, it, expect } from 'vitest';
import {
  correlationMatrix,
  invert,
  varianceFactor,
  mmrmSampleSize,
  mmrmPower,
  type MmrmDesignInput,
} from '../mmrm-design';
import { normalQuantile } from '../normal';

function approx(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol;
}

describe('correlationMatrix', () => {
  it('builds compound-symmetry and AR(1) structures', () => {
    expect(correlationMatrix(3, 'compound_symmetry', 0.5)).toEqual([
      [1, 0.5, 0.5],
      [0.5, 1, 0.5],
      [0.5, 0.5, 1],
    ]);
    const ar1 = correlationMatrix(3, 'ar1', 0.5);
    expect(ar1[0][2]).toBeCloseTo(0.25, 12); // ρ^2
    expect(ar1[0][1]).toBeCloseTo(0.5, 12);
  });
});

describe('invert', () => {
  it('inverts a matrix so that A·A⁻¹ = I', () => {
    const A = correlationMatrix(3, 'ar1', 0.4);
    const Ai = invert(A);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += A[i][k] * Ai[k][j];
        expect(approx(s, i === j ? 1 : 0, 1e-9)).toBe(true);
      }
    }
  });

  it('throws on a singular matrix', () => {
    expect(() => invert([[1, 1], [1, 1]])).toThrow(/singular|positive-definite/i);
  });
});

describe('varianceFactor — exact boundary identities', () => {
  it('reduces to completers-only when ρ = 0 (factor = 1/r_target)', () => {
    const input: MmrmDesignInput = {
      visits: 4,
      covariance: 'compound_symmetry',
      rho: 0,
      sigma: 1,
      delta: 0.5,
      retention: [1, 0.9, 0.8, 0.7],
    };
    const { factor } = varianceFactor(input);
    expect(approx(factor, 1 / 0.7, 1e-9)).toBe(true);
  });

  it('reduces to factor = 1 with complete data (any ρ / structure)', () => {
    for (const cov of ['compound_symmetry', 'ar1'] as const) {
      const { factor } = varianceFactor({ visits: 5, covariance: cov, rho: 0.65, sigma: 1, delta: 0.4 });
      expect(approx(factor, 1, 1e-9)).toBe(true);
    }
  });
});

describe('MMRM efficiency from partial data', () => {
  const base: MmrmDesignInput = {
    visits: 4,
    covariance: 'compound_symmetry',
    rho: 0.6,
    sigma: 2,
    delta: 1,
    retention: [1, 0.9, 0.8, 0.7],
  };

  it('beats completers-only but cannot exceed full information', () => {
    const { factor } = varianceFactor(base);
    expect(factor).toBeLessThan(1 / 0.7); // better than completers-only
    expect(factor).toBeGreaterThanOrEqual(1); // cannot beat complete data
  });

  it('reports efficiency > 1 vs a completers-only analysis', () => {
    const r = mmrmSampleSize(base);
    expect(r.efficiencyVsCompleters).toBeGreaterThan(1);
  });

  it('needs fewer subjects as within-subject correlation rises (more borrowing)', () => {
    const low = mmrmSampleSize({ ...base, rho: 0.2 });
    const high = mmrmSampleSize({ ...base, rho: 0.8 });
    expect(high.nPerArm).toBeLessThan(low.nPerArm);
  });
});

describe('mmrmSampleSize — agreement with the standard formula at full information', () => {
  it('matches the two-sample final-visit n when data are complete', () => {
    const sigma = 1;
    const delta = 0.5;
    const alpha = 0.05;
    const power = 0.9;
    const r = mmrmSampleSize({ visits: 3, covariance: 'compound_symmetry', rho: 0.5, sigma, delta, alpha, power });
    const za = normalQuantile(1 - alpha / 2);
    const zb = normalQuantile(power);
    const expected = Math.ceil((2 * sigma * sigma * (za + zb) ** 2) / (delta * delta));
    expect(r.varianceFactor).toBe(1);
    expect(r.nPerArm).toBe(expected);
  });

  it('achieves at least the target power at the rounded-up n', () => {
    const r = mmrmSampleSize({
      visits: 4,
      covariance: 'ar1',
      rho: 0.5,
      sigma: 2,
      delta: 1,
      power: 0.9,
      retention: [1, 0.85, 0.75, 0.65],
    });
    expect(r.achievedPower).toBeGreaterThanOrEqual(0.9);
    // Power computed independently at the returned n agrees.
    const p = mmrmPower({
      visits: 4, covariance: 'ar1', rho: 0.5, sigma: 2, delta: 1,
      retention: [1, 0.85, 0.75, 0.65], nPerArm: r.nPerArm,
    });
    expect(p).toBeGreaterThanOrEqual(0.9);
  });

  it('honors an allocation ratio', () => {
    const r = mmrmSampleSize({
      visits: 2, covariance: 'compound_symmetry', rho: 0.5, sigma: 1, delta: 0.5, allocationRatio: 2,
    });
    expect(r.nTotal).toBe(r.nPerArm + Math.ceil(r.nPerArm * 2));
  });

  it('carries reproducible provenance', () => {
    const r = mmrmSampleSize({ visits: 3, covariance: 'compound_symmetry', rho: 0.5, sigma: 1, delta: 0.5 });
    expect(r.provenance.method).toBe('mmrm-design');
    expect(r.provenance.inputsSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('input validation', () => {
  const ok: MmrmDesignInput = { visits: 3, covariance: 'compound_symmetry', rho: 0.5, sigma: 1, delta: 0.5 };
  it('rejects bad rho / sigma / delta / visits', () => {
    expect(() => mmrmSampleSize({ ...ok, rho: 1 })).toThrow(/rho/);
    expect(() => mmrmSampleSize({ ...ok, sigma: 0 })).toThrow(/sigma/);
    expect(() => mmrmSampleSize({ ...ok, delta: 0 })).toThrow(/delta/);
    expect(() => mmrmSampleSize({ ...ok, visits: 0 })).toThrow(/visits/);
  });
  it('rejects a non-monotone or wrong-length retention vector', () => {
    expect(() => mmrmSampleSize({ ...ok, retention: [1, 0.8] })).toThrow(/length 3/);
    expect(() => mmrmSampleSize({ ...ok, retention: [0.8, 0.9, 0.7] })).toThrow(/monotone/);
  });
  it('rejects an out-of-range target visit', () => {
    expect(() => mmrmSampleSize({ ...ok, targetVisit: 5 })).toThrow(/targetVisit/);
  });
});
