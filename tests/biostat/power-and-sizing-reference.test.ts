/**
 * Power, assurance and sample size — pinned to closed-form theory.
 *
 * ── Why these three, and why they are testable differently ───────────────────
 * Rounds 1 and 2 pinned the group-sequential boundaries and the foundation
 * layer. This file covers the calculations a study team actually runs first:
 * how many subjects, and what is the chance of success.
 *
 * These have a property the earlier files did not: **closed-form answers**. The
 * normal-approximation power for two independent means is
 *
 *     power = Φ( δ·√(n/2) − z₁₋α )
 *
 * so the expected value can be derived in the test rather than quoted from a
 * table, and the derivation is visible to the reader. Where that is possible it
 * is strictly better than a reference constant — a quoted number can be
 * mistranscribed, a formula cannot be transcribed at all.
 *
 * ── The strongest check here is the degenerate case ──────────────────────────
 * Two of these tests are cross-implementation checks rather than value checks:
 *
 *   • MMRM with one visit and ρ=0 must collapse to the classic two-sample
 *     formula n = 2(z_{α/2}+z_β)²σ²/δ². A repeated-measures design reducing
 *     exactly to the textbook answer when the repeated measures are removed is
 *     very hard to fake — it exercises the covariance construction, the matrix
 *     inversion, the variance factor and the rounding, and pins them all against
 *     an answer computed a completely different way.
 *
 *   • Assurance with a point-mass prior must equal frequentist power at that
 *     point. Assurance integrates power over the prior; collapse the prior and
 *     the integral must return the integrand.
 *
 * Both were verified before being written, and both hold to 7 significant
 * figures.
 *
 * ── What is NOT claimed ──────────────────────────────────────────────────────
 * These are the NORMAL-APPROXIMATION formulas. They are the right thing for
 * design work and are what the platform advertises, but they are not exact
 * t-based power, and this file does not assert that they are. A test that
 * demanded exact-t agreement would be testing a different function.
 */

import { describe, it, expect } from 'vitest';
import {
  powerTwoSampleMeans,
  assuranceTwoSampleMeans,
} from '../../server/services/stats/assurance';
import { normalCdf, normalQuantile } from '../../server/services/stats/normal';
import { mmrmSampleSize } from '../../server/services/stats/mmrm-design';

/** The closed form, written out so the expectation is derived and not quoted. */
const closedFormPower = (delta: number, nPerArm: number, alpha: number) =>
  normalCdf(delta * Math.sqrt(nPerArm / 2) - normalQuantile(1 - alpha));

describe('powerTwoSampleMeans matches the closed form it implements', () => {
  it.each([
    [0.5, 64],
    [0.5, 63],
    [1.0, 17],
    [0.2, 400],
    [0.8, 30],
  ])('δ=%s, n=%i per arm', (delta, n) => {
    expect(powerTwoSampleMeans(delta, n, 0.025, true)).toBeCloseTo(
      closedFormPower(delta, n, 0.025),
      12
    );
  });

  it('the canonical design point: δ=0.5, n=64/arm, α=0.025 one-sided → 0.8074', () => {
    // Quoted as well as derived, so a reader can sanity-check the derivation
    // itself against a number they recognise.
    expect(powerTwoSampleMeans(0.5, 64, 0.025, true)).toBeCloseTo(0.80743, 5);
  });

  it('power at ZERO effect equals alpha exactly', () => {
    // The type I error rate falls straight out of the formula, and a sign error
    // or a swapped tail breaks it immediately.
    for (const alpha of [0.005, 0.025, 0.05]) {
      expect(powerTwoSampleMeans(0, 100, alpha, true)).toBeCloseTo(alpha, 10);
    }
  });

  it('rises with n and with effect size, and never leaves (0, 1]', () => {
    // Note the closed bracket. At δ=0.5, n=2000 the power is Φ(13.85), which is
    // 1 to double precision — saturation, not a defect. The first draft asserted
    // a strict `< 1` and failed there. Monotonicity is still strict at every
    // step below because n=500 gives 0.9999999986, which does resolve.
    let prev = 0;
    for (const n of [10, 20, 50, 100, 500, 2000]) {
      const p = powerTwoSampleMeans(0.5, n, 0.025, true);
      expect(p).toBeGreaterThan(prev);
      expect(p).toBeLessThanOrEqual(1);
      prev = p;
    }
    prev = 0;
    for (const d of [0.05, 0.1, 0.25, 0.5, 1.0]) {
      const p = powerTwoSampleMeans(d, 64, 0.025, true);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
  });

  it('returns 0 for a non-positive sample size instead of NaN', () => {
    expect(powerTwoSampleMeans(0.5, 0, 0.025, true)).toBe(0);
    expect(powerTwoSampleMeans(0.5, -10, 0.025, true)).toBe(0);
  });
});

describe('assurance is the prior-average of power', () => {
  const base = { priorMean: 0.5, nPerArm: 64, alpha: 0.025, oneSided: true } as const;

  it('collapses to frequentist power when the prior is a point mass', () => {
    // The defining limiting case: ∫ power(δ)·π(δ) dδ with π → δ-function must
    // return power at that point. Holds to 7 significant figures.
    const r = assuranceTwoSampleMeans({ ...base, priorSd: 0.0001 });
    expect(r.assurance).toBeCloseTo(r.powerAtPriorMean, 6);
    expect(r.assurance).toBeCloseTo(powerTwoSampleMeans(0.5, 64, 0.025, true), 6);
  });

  it('falls as the prior widens, and stays below power at the mean', () => {
    // Power is concave around the design point, so spreading prior mass into the
    // low-effect region costs more than the high-effect region gains. Assurance
    // ABOVE power-at-the-mean would mean the integration is wrong — and it is the
    // direction that would flatter a programme's chance of success, which is
    // exactly the error a sponsor must not be sold.
    let prev = Infinity;
    for (const priorSd of [0.0001, 0.1, 0.25, 0.5]) {
      const r = assuranceTwoSampleMeans({ ...base, priorSd });
      expect(r.assurance).toBeLessThanOrEqual(r.powerAtPriorMean + 1e-9);
      expect(r.assurance).toBeLessThan(prev);
      expect(r.assurance).toBeGreaterThan(0);
      expect(r.assurance).toBeLessThan(1);
      prev = r.assurance;
    }
  });

  it('rejects a non-positive sample size rather than returning an assurance', () => {
    expect(() => assuranceTwoSampleMeans({ ...base, priorSd: 0.2, nPerArm: 0 })).toThrow();
  });
});

describe('MMRM sizing reduces to the classic formula when the design degenerates', () => {
  /** n per arm = 2(z_{α/2} + z_β)²σ²/δ², rounded up. */
  const classicN = (sigma: number, delta: number, alpha: number, power: number) =>
    Math.ceil(
      (2 * (normalQuantile(1 - alpha / 2) + normalQuantile(power)) ** 2 * sigma ** 2) / delta ** 2
    );

  it('one visit, ρ=0, full retention → the textbook two-sample n', () => {
    // 2(1.959964 + 1.281552)² / 0.25 = 84.06 → 85 per arm.
    const expected = classicN(1, 0.5, 0.05, 0.9);
    expect(expected).toBe(85);

    const r = mmrmSampleSize({
      visits: 1,
      covariance: 'CS',
      rho: 0,
      sigma: 1,
      delta: 0.5,
      alpha: 0.05,
      power: 0.9,
    });
    expect(r.nPerArm).toBe(expected);
    // With no repeated measures there is no information to borrow, so the
    // variance factor must be exactly 1 — anything else means the covariance
    // machinery is contributing where it should be inert.
    expect(r.varianceFactor).toBeCloseTo(1, 12);
    expect(r.achievedPower).toBeGreaterThanOrEqual(0.9);
  });

  it.each([
    [1, 0.5, 0.05, 0.9],
    [2, 0.5, 0.05, 0.9],
    [1, 0.25, 0.05, 0.8],
    [1.5, 0.6, 0.01, 0.9],
  ])('σ=%s δ=%s α=%s power=%s reduces correctly', (sigma, delta, alpha, power) => {
    const r = mmrmSampleSize({
      visits: 1,
      covariance: 'CS',
      rho: 0,
      sigma,
      delta,
      alpha,
      power,
    });
    expect(r.nPerArm).toBe(classicN(sigma, delta, alpha, power));
  });

  it('complete follow-up gives MMRM no advantage over completers', () => {
    // Efficiency vs completers is 1 when nobody drops out — there are no
    // incomplete cases whose partial data MMRM could use. A number above 1 here
    // would be claiming a benefit that does not exist.
    const r = mmrmSampleSize({
      visits: 3,
      covariance: 'CS',
      rho: 0.5,
      sigma: 1,
      delta: 0.5,
      alpha: 0.05,
      power: 0.9,
    });
    expect(r.efficiencyVsCompleters).toBeCloseTo(1, 10);
    expect(r.nPerArm).toBe(classicN(1, 0.5, 0.05, 0.9));
  });

  it('achieves at least the requested power, always', () => {
    // The sample size is rounded UP, so achieved power must never fall short of
    // the target. Rounding the wrong way is a silent under-powering of the trial.
    for (const power of [0.8, 0.85, 0.9, 0.95]) {
      const r = mmrmSampleSize({
        visits: 2,
        covariance: 'AR1',
        rho: 0.4,
        sigma: 1,
        delta: 0.4,
        alpha: 0.05,
        power,
      });
      expect(r.achievedPower, `target ${power}`).toBeGreaterThanOrEqual(power);
    }
  });

  it('rejects an out-of-range correlation rather than inverting a bad matrix', () => {
    const bad = { visits: 3, covariance: 'CS' as const, sigma: 1, delta: 0.5 };
    expect(() => mmrmSampleSize({ ...bad, rho: 1 })).toThrow();
    expect(() => mmrmSampleSize({ ...bad, rho: -0.5 })).toThrow();
  });
});
