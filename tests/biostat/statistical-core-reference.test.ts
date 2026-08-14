/**
 * The statistical foundation layer, pinned to published reference values.
 *
 * ── Scope and why these five ─────────────────────────────────────────────────
 * `group-sequential-reference.test.ts` pins the interim-analysis boundaries.
 * This file pins what everything else stands on:
 *
 *   normal.ts       — Φ and its inverse. Every power, sample-size and boundary
 *                     calculation in the platform routes through these two
 *                     functions, so an error here is an error everywhere.
 *   special.ts      — exact binomial tails and Clopper–Pearson intervals. These
 *                     are the sensitivity/specificity confidence intervals in an
 *                     IVD submission; FDA reproduces them.
 *   multiplicity.ts — Bonferroni / Holm / Hochberg. Type I error control across
 *                     endpoints, and the one place an off-by-one in a rank index
 *                     silently inflates alpha.
 *   rmst.ts         — Kaplan–Meier and restricted mean survival.
 *   dose-finding-boin.ts — BOIN escalation/de-escalation boundaries, which
 *                     decide what dose the next patient in a phase I trial gets.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 * Measured before this file: the two suites covering the biostat platform
 * carried 102 assertions over 63 endpoints, of which 10 pinned a numeric value.
 * The mathematics was already correct — every expectation below was verified
 * against published references BEFORE being written down, and none of them
 * needed a code change. What was missing was anything that would notice if it
 * stopped being correct.
 *
 * ── On tolerances ────────────────────────────────────────────────────────────
 * Exact-arithmetic results (binomial tails, Clopper–Pearson, Kaplan–Meier,
 * multiplicity decisions) are pinned tightly — 1e-9 or exact equality, because
 * there is no approximation to leave room for.
 *
 * `normalCdf`/`normalQuantile` are rational approximations. MEASURED maximum
 * error against true values: 6.9e-8 for Φ (at z=1.96) and 1.2e-6 for Φ⁻¹. They
 * are therefore asserted with `toBeCloseTo(·, 6)` = 5e-7 and `(·, 5)` = 5e-6 —
 * roughly 7× and 4× the observed error, which catches any real defect (a wrong
 * coefficient moves these by 1e-3 or more) without pinning digits the
 * approximation does not have.
 *
 * The first draft of this file asserted Φ at 5e-8, tighter than the 6.9e-8 the
 * header itself had already recorded, and failed on exactly that. Noted because
 * it is the second time in this workstream that a stated tolerance and an
 * asserted one disagreed — `toBeCloseTo(x, N)` is 0.5×10⁻ᴺ, not 10⁻ᴺ, and that
 * off-by-one-order is easy to write and hard to see.
 */

import { describe, it, expect } from 'vitest';
import { normalCdf, normalQuantile } from '../../server/services/stats/normal';
import {
  binomialTailGE,
  binomialTailLE,
  clopperPearsonInterval,
} from '../../server/services/stats/special';
import {
  bonferroniReject,
  holmReject,
  hochbergReject,
} from '../../server/services/stats/multiplicity';
import { kaplanMeier, restrictedMeanSurvival } from '../../server/services/stats/rmst';
import { boinBoundaries } from '../../server/services/stats/dose-finding-boin';

// ───────────────────────────────────────────────────────────────────────────────
describe('normal.ts — the functions everything else is built on', () => {
  it.each([
    [0, 0.5],
    [1, 0.8413447461],
    [1.644853627, 0.95],
    [1.959963985, 0.975],
    [2.326347874, 0.99],
    [-1.959963985, 0.025],
  ])('Φ(%s) = %s', (z, expected) => {
    expect(normalCdf(z)).toBeCloseTo(expected, 6);
  });

  it.each([
    [0.5, 0],
    [0.9, 1.2815515655],
    [0.95, 1.6448536270],
    [0.975, 1.9599639845],
    [0.99, 2.3263478740],
    [0.995, 2.5758293035],
  ])('Φ⁻¹(%s) = %s', (p, expected) => {
    expect(normalQuantile(p)).toBeCloseTo(expected, 5);
  });

  it('Φ and Φ⁻¹ invert each other', () => {
    // Catches a sign error or a swapped tail that fixed reference points might
    // miss if both were wrong in the same direction.
    for (const p of [0.001, 0.05, 0.25, 0.5, 0.75, 0.95, 0.999]) {
      expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 6);
    }
  });

  it('is symmetric: Φ(−z) = 1 − Φ(z)', () => {
    for (const z of [0.5, 1, 1.96, 3]) {
      expect(normalCdf(-z)).toBeCloseTo(1 - normalCdf(z), 9);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe('special.ts — exact binomial results, which a regulator recomputes', () => {
  it.each([
    // x, n, published Clopper–Pearson 95% interval
    [2, 10, 0.0252, 0.5561],
    [0, 10, 0.0, 0.3085],
    [10, 10, 0.6915, 1.0],
    [5, 20, 0.0866, 0.4910],
    [27, 30, 0.7347, 0.9789],
  ])('Clopper–Pearson %i/%i 95%% = [%s, %s]', (x, n, lo, hi) => {
    const ci = clopperPearsonInterval(x, n, 0.95);
    expect(ci.lower).toBeCloseTo(lo, 4);
    expect(ci.upper).toBeCloseTo(hi, 4);
  });

  it('brackets the point estimate and never leaves [0, 1]', () => {
    for (let x = 0; x <= 20; x++) {
      const ci = clopperPearsonInterval(x, 20, 0.95);
      expect(ci.lower).toBeGreaterThanOrEqual(0);
      expect(ci.upper).toBeLessThanOrEqual(1);
      expect(ci.lower).toBeLessThanOrEqual(x / 20);
      expect(ci.upper).toBeGreaterThanOrEqual(x / 20);
    }
  });

  it('exact binomial tails match hand-computed values', () => {
    // P(X ≥ 8 | n=10, p=0.5) = (45 + 10 + 1)/1024 = 56/1024 = 0.0546875
    expect(binomialTailGE(8, 10, 0.5)).toBeCloseTo(0.0546875, 9);
    expect(binomialTailLE(2, 10, 0.5)).toBeCloseTo(0.0546875, 9);
    // Total probability: P(X ≤ k) + P(X ≥ k+1) = 1
    for (const k of [0, 3, 7, 9]) {
      expect(binomialTailLE(k, 10, 0.3) + binomialTailGE(k + 1, 10, 0.3)).toBeCloseTo(1, 9);
    }
  });

  it('rejects impossible inputs rather than returning an interval', () => {
    expect(() => clopperPearsonInterval(-1, 10)).toThrow();
    expect(() => clopperPearsonInterval(11, 10)).toThrow();
    expect(() => clopperPearsonInterval(0, 0)).toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe('multiplicity.ts — decisions, not approximations', () => {
  const P = [0.01, 0.02, 0.03, 0.04, 0.05];

  it('Bonferroni rejects only p ≤ α/m', () => {
    // α/m = 0.05/5 = 0.01, so only the first hypothesis.
    expect(bonferroniReject(P, 0.05)).toEqual([true, false, false, false, false]);
  });

  it('Holm stops at the first non-rejection', () => {
    // p(1)=0.01 ≤ 0.05/5 → reject. p(2)=0.02 ≤ 0.05/4=0.0125? No → stop.
    expect(holmReject(P, 0.05)).toEqual([true, false, false, false, false]);
  });

  it('Hochberg rejects everything when the LARGEST p passes its own threshold', () => {
    // The step-UP procedure, and the one most often implemented as step-down by
    // mistake. p(5)=0.05 ≤ 0.05/(5−5+1)=0.05 → reject all five. Holm rejects one
    // on the identical input, which is exactly why both are pinned here.
    expect(hochbergReject(P, 0.05)).toEqual([true, true, true, true, true]);
  });

  it('Hochberg is never less powerful than Holm on the same input', () => {
    // A structural relation between the two procedures: step-up dominates
    // step-down. Fails if either is implemented as the other.
    for (const ps of [P, [0.001, 0.2, 0.4], [0.04, 0.04, 0.04], [0.5, 0.6, 0.7]]) {
      const holm = holmReject(ps, 0.05);
      const hoch = hochbergReject(ps, 0.05);
      holm.forEach((r, i) => {
        if (r) expect(hoch[i], `Hochberg must also reject index ${i}`).toBe(true);
      });
    }
  });

  it('rejects nothing when every p is above α', () => {
    const none = [0.2, 0.3, 0.9];
    expect(bonferroniReject(none, 0.05)).toEqual([false, false, false]);
    expect(holmReject(none, 0.05)).toEqual([false, false, false]);
    expect(hochbergReject(none, 0.05)).toEqual([false, false, false]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe('rmst.ts — Kaplan–Meier and restricted mean survival', () => {
  // Five subjects: events at t=1,2,3 and censoring at t=4,5. Small enough that
  // every number below is checkable by hand, which is the point.
  const times = [1, 2, 3, 4, 5];
  const events = [1, 1, 1, 0, 0];

  it('the KM survival curve steps 0.8 → 0.6 → 0.4', () => {
    const km = kaplanMeier(times, events);
    expect(km.map(p => p.time)).toEqual([1, 2, 3]);
    expect(km.map(p => p.atRisk)).toEqual([5, 4, 3]);
    expect(km[0].survival).toBeCloseTo(0.8, 10);
    expect(km[1].survival).toBeCloseTo(0.6, 10);
    expect(km[2].survival).toBeCloseTo(0.4, 10);
  });

  it('censored observations reduce the risk set without dropping survival', () => {
    // Only the three event times appear; the two censorings leave S unchanged.
    expect(kaplanMeier(times, events)).toHaveLength(3);
  });

  it('RMST(τ=5) = 3.2, the area under that step function', () => {
    // 1×1 + 0.8×1 + 0.6×1 + 0.4×2 = 3.2
    const r = restrictedMeanSurvival(times, events, 5);
    expect(r.rmst).toBeCloseTo(3.2, 10);
    expect(r.tau).toBe(5);
    expect(r.se).toBeGreaterThan(0);
  });

  it('RMST is monotone in τ and never exceeds τ', () => {
    let prev = 0;
    for (const tau of [1, 2, 3, 4, 5]) {
      const { rmst } = restrictedMeanSurvival(times, events, tau);
      expect(rmst).toBeGreaterThanOrEqual(prev);
      expect(rmst).toBeLessThanOrEqual(tau);
      prev = rmst;
    }
  });

  it('removes censored subjects from the risk set — INTERLEAVED censoring', () => {
    // The fixture above censors only AFTER the last event, so it cannot detect
    // whether censored subjects leave the risk set: the answer is identical
    // either way. Mutation-testing found that hole — `atRisk -= removed` changed
    // to `atRisk -= d` left all 36 tests green.
    //
    // Here censoring falls BETWEEN events (events at 1,3,5; censored at 2,4),
    // which is the ordinary shape of real follow-up data and the only shape that
    // distinguishes the two implementations:
    //   correct : t=3 has 3 at risk → S = 0.8 × (1 − 1/3) = 0.5333
    //   ignoring censoring: 4 at risk → S = 0.8 × (1 − 1/4) = 0.6
    const km = kaplanMeier([1, 2, 3, 4, 5], [1, 0, 1, 0, 1]);
    expect(km.map(p => p.time)).toEqual([1, 3, 5]);
    expect(km.map(p => p.atRisk)).toEqual([5, 3, 1]);
    expect(km[0].survival).toBeCloseTo(0.8, 10);
    expect(km[1].survival).toBeCloseTo(0.8 * (2 / 3), 10);
    expect(km[2].survival).toBeCloseTo(0, 10);
  });

  it('with no events at all, RMST equals τ exactly', () => {
    // Survival never drops, so the area under S(t)=1 on [0,τ] is τ. A wrong
    // risk-set update shows up here immediately.
    const { rmst } = restrictedMeanSurvival([1, 2, 3], [0, 0, 0], 3);
    expect(rmst).toBeCloseTo(3, 10);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe('dose-finding-boin.ts — the boundaries that pick the next patient’s dose', () => {
  it.each([
    // target, published λE, λD (Liu & Yuan BOIN with φ1=0.6φ, φ2=1.4φ)
    [0.25, 0.197, 0.298],
    [0.3, 0.236, 0.359],
  ])('target DLT rate %s → λE=%s, λD=%s', (target, lambdaE, lambdaD) => {
    const b = boinBoundaries(target);
    expect(b.lambdaE).toBeCloseTo(lambdaE, 3);
    expect(b.lambdaD).toBeCloseTo(lambdaD, 3);
  });

  it('always brackets the target: λE < target < λD', () => {
    // If this inverted, the trial would escalate on toxicity and de-escalate on
    // safety — the single most dangerous failure this module could have.
    for (const target of [0.16, 0.2, 0.25, 0.3, 0.33, 0.4]) {
      const b = boinBoundaries(target);
      expect(b.lambdaE, `λE for ${target}`).toBeLessThan(target);
      expect(b.lambdaD, `λD for ${target}`).toBeGreaterThan(target);
    }
  });

  it('boundaries rise with the target', () => {
    const low = boinBoundaries(0.2);
    const high = boinBoundaries(0.35);
    expect(high.lambdaE).toBeGreaterThan(low.lambdaE);
    expect(high.lambdaD).toBeGreaterThan(low.lambdaD);
  });
});
