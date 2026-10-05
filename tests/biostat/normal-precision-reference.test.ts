/**
 * Φ and Φ⁻¹ at full double precision (2026-10-05).
 *
 * statistical-core-reference.test.ts pins these to five decimal places, which
 * is the precision a result is printed at. It is not the precision they are
 * computed to, and it let a defect through: the quantile's Halley refinement
 * was taken against an Abramowitz & Stegun CDF accurate only to 7.5e-8, so
 * z(0.975) came out 1.95996280 instead of 1.95996398 while the header promised
 * 1e-12. Every sample size, power and interim boundary in the platform is built
 * from these two functions, and the group-sequential engine integrates over
 * them recursively, so an error here compounds.
 *
 * Reference values are R 4.x `qnorm` / `pnorm` (which implement Wichura AS241
 * and Cody's algorithm respectively), printed with digits = 17.
 */
import { describe, expect, it } from 'vitest';
import { normalCdf, normalQuantile } from '../../server/services/stats/normal';

const QUANTILES: ReadonlyArray<[p: number, z: number]> = [
  [0.975, 1.959963984540054],
  [0.95, 1.6448536269514722],
  [0.995, 2.5758293035489004],
  [0.9, 1.2815515655446004],
  [0.8, 0.8416212335729143],
  [0.5, 0],
  [0.001, -3.090232306167813],
  [0.025, -1.959963984540054],
  [1e-10, -6.361340902404056],
];

const CDF: ReadonlyArray<[x: number, p: number]> = [
  [1.96, 0.9750021048517795],
  [0.5, 0.6914624612740131],
  [-1, 0.15865525393145707],
  [-3, 0.0013498980316300946],
  [3, 0.9986501019683699],
  [-5, 2.866515718791939e-7],
  [-10, 7.619853024160527e-24],
];

describe('normalQuantile — full precision', () => {
  it.each(QUANTILES)('Φ⁻¹(%s) = %s to 1e-12', (p, z) => {
    expect(Math.abs(normalQuantile(p) - z)).toBeLessThan(1e-12);
  });

  it('is the inverse of normalCdf to 1e-14 across the central range', () => {
    for (let p = 0.0005; p < 1; p += 0.0137) {
      expect(Math.abs(normalCdf(normalQuantile(p)) - p)).toBeLessThan(1e-14);
    }
  });
});

describe('normalCdf — full precision, including the tails', () => {
  it.each(CDF)('Φ(%s) = %s to a relative 1e-14', (x, p) => {
    expect(Math.abs(normalCdf(x) - p) / p).toBeLessThan(1e-14);
  });

  it('is symmetric: Φ(−x) + Φ(x) = 1', () => {
    for (let x = 0; x < 8; x += 0.173) {
      expect(Math.abs(normalCdf(-x) + normalCdf(x) - 1)).toBeLessThan(1e-15);
    }
  });

  it('is exactly 0 and 1 beyond ±38 and NaN for NaN', () => {
    expect(normalCdf(-40)).toBe(0);
    expect(normalCdf(40)).toBe(1);
    expect(normalCdf(Number.NaN)).toBeNaN();
  });
});
