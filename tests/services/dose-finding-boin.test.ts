/**
 * Tests for BOIN dose finding (server/services/stats/dose-finding-boin.ts).
 *
 * The escalation/de-escalation boundaries are validated against the published
 * Liu & Yuan (2015) values; the decision rule, safety elimination, isotonic
 * regression and MTD selection are checked against worked cases.
 */

import { describe, it, expect } from 'vitest';
import {
  BOIN_DEFAULTS,
  boinBoundaries,
  boinDecision,
  boinDecisionTable,
  isotonicRegression,
  selectMtd,
} from '../../server/services/stats/dose-finding-boin';
import { betaRegularized } from '../../server/services/stats/special';

describe('BOIN boundaries — against published values', () => {
  it('reproduces the published values for target 0.30 (table: 0.236 / 0.358)', () => {
    const b = boinBoundaries(0.3);
    expect(b.lambdaE).toBeCloseTo(0.236491, 5); // exact formula value
    expect(b.lambdaD).toBeCloseTo(0.358519, 5);
    expect(b.lambdaE).toBeCloseTo(0.236, 2); // published table to 3 dp
    expect(b.lambdaD).toBeCloseTo(0.358, 2);
  });

  it('reproduces the published values for target 0.25 (table: 0.197 / 0.298)', () => {
    const b = boinBoundaries(0.25);
    expect(b.lambdaE).toBeCloseTo(0.196801, 5);
    expect(b.lambdaD).toBeCloseTo(0.298392, 5);
    expect(b.lambdaE).toBeCloseTo(0.197, 2);
    expect(b.lambdaD).toBeCloseTo(0.298, 2);
  });

  it('boundaries straddle the target', () => {
    const b = boinBoundaries(0.3);
    expect(b.lambdaE).toBeLessThan(0.3);
    expect(b.lambdaD).toBeGreaterThan(0.3);
  });

  it('rejects a malformed neighbourhood', () => {
    expect(() => boinBoundaries(0.3, 0.4, 0.5)).toThrow(/phi1 < target < phi2/);
  });
});

describe('BOIN decision rule', () => {
  it('escalates with no DLTs, stays in the interval, de-escalates above', () => {
    expect(boinDecision({ nPatients: 3, nDlt: 0, target: 0.3 }).decision).toBe('escalate');
    expect(boinDecision({ nPatients: 3, nDlt: 1, target: 0.3 }).decision).toBe('stay'); // 0.333 ∈ (0.236,0.358)
    expect(boinDecision({ nPatients: 6, nDlt: 3, target: 0.3 }).decision).toBe('deescalate'); // 0.5 ≥ 0.358
  });

  it('eliminates an overly toxic dose for safety', () => {
    const r = boinDecision({ nPatients: 6, nDlt: 5, target: 0.3 });
    expect(r.eliminated).toBe(true);
    expect(r.decision).toBe('eliminate');
    expect(r.posteriorExceedance).toBeGreaterThan(0.95);
  });

  it('does not eliminate below the minimum elimination N', () => {
    // 2/2 DLTs but n < minEliminationN (3) ⇒ no elimination from this rule.
    const r = boinDecision({ nPatients: 2, nDlt: 2, target: 0.3 });
    expect(r.eliminated).toBe(false);
    expect(r.decision).toBe('deescalate');
  });
});

describe('BOIN decision-boundary table', () => {
  it('matches the published table for target 0.30', () => {
    const rows = boinDecisionTable(0.3, [3, 6, 9, 12]);
    // λ_e=0.236, λ_d=0.358 ⇒ floor/ceil per n.
    expect(rows[0]).toEqual({ n: 3, escalateIfAtMost: 0, deescalateIfAtLeast: 2 });
    expect(rows[1]).toEqual({ n: 6, escalateIfAtMost: 1, deescalateIfAtLeast: 3 });
    expect(rows[2]).toEqual({ n: 9, escalateIfAtMost: 2, deescalateIfAtLeast: 4 });
    expect(rows[3]).toEqual({ n: 12, escalateIfAtMost: 2, deescalateIfAtLeast: 5 });
  });
});

describe('isotonic regression (PAVA)', () => {
  it('leaves a monotone sequence unchanged', () => {
    expect(isotonicRegression([0.1, 0.2, 0.3], [1, 1, 1])).toEqual([0.1, 0.2, 0.3]);
  });

  it('pools adjacent violators by weighted average', () => {
    // [0.4, 0.2] equal weights ⇒ both become 0.3.
    const out = isotonicRegression([0.4, 0.2], [1, 1]);
    expect(out[0]).toBeCloseTo(0.3, 10);
    expect(out[1]).toBeCloseTo(0.3, 10);
    // Monotone non-decreasing.
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1] - 1e-12);
  });
});

describe('MTD selection', () => {
  it('selects the dose with isotonic toxicity closest to target', () => {
    const doses = [
      { nPatients: 6, nDlt: 0 }, // 0.00
      { nPatients: 6, nDlt: 1 }, // 0.17
      { nPatients: 6, nDlt: 2 }, // 0.33
      { nPatients: 6, nDlt: 4 }, // 0.67
    ];
    const r = selectMtd(doses, 0.3);
    expect(r.mtdIndex).toBe(2); // 0.33 closest to 0.30
  });

  it('respects monotonicity via isotonic smoothing when raw rates are noisy', () => {
    const doses = [
      { nPatients: 6, nDlt: 1 }, // 0.17
      { nPatients: 6, nDlt: 0 }, // 0.00 (violator — should be pooled up)
      { nPatients: 6, nDlt: 3 }, // 0.50
    ];
    const r = selectMtd(doses, 0.3);
    // Isotonic fit pools doses 0,1 to ~0.083; dose 2 = 0.5. Closest to 0.3 is dose 2.
    expect(r.isotonicRates[0]).toBeCloseTo(r.isotonicRates[1], 10);
    expect(r.mtdIndex).toBe(2);
  });

  it('skips eliminated and untried doses', () => {
    const doses = [
      { nPatients: 6, nDlt: 2 }, // 0.33
      { nPatients: 6, nDlt: 5, eliminated: true },
      { nPatients: 0, nDlt: 0 }, // untried
    ];
    const r = selectMtd(doses, 0.3);
    expect(r.mtdIndex).toBe(0);
  });

  it('never selects a dose above an eliminated one: elimination removes the dose and every higher dose (Liu & Yuan 2015)', () => {
    // The reviewer's probe: dose 1 eliminated (6/9 DLTs — the engine's own rule
    // eliminates it), dose 2 above it has no flag of its own and a 0/3 rate.
    const doses = [
      { nPatients: 3, nDlt: 0 },
      { nPatients: 9, nDlt: 6, eliminated: true },
      { nPatients: 3, nDlt: 0 },
    ];
    expect(boinDecision({ nPatients: 9, nDlt: 6, target: 0.3 }).eliminated).toBe(true);
    const r = selectMtd(doses, 0.3);
    expect(r.mtdIndex).toBe(0); // was 2 — a dose above the eliminated one
    expect(r.lowestEliminatedIndex).toBe(1);
    // The isotonic fit is unchanged by the eligibility rule.
    expect(r.isotonicRates).toEqual([0, 0.5, 0.5]);
  });

  it('selects no MTD when the lowest dose is eliminated (the trial stopped for safety)', () => {
    const r = selectMtd([{ nPatients: 6, nDlt: 5, eliminated: true }, { nPatients: 3, nDlt: 1 }], 0.3);
    expect(r.mtdIndex).toBeNull(); // was 1
    expect(r.lowestEliminatedIndex).toBe(0);
  });

  it('the ceiling is the LOWEST flagged dose when, by the BOIN convention, the eliminated dose and every higher one are flagged', () => {
    // A rule that took the highest flag would select dose 1 here — an eliminated dose.
    const a = selectMtd([{ nPatients: 3, nDlt: 0 }, { nPatients: 9, nDlt: 4, eliminated: true }, { nPatients: 3, nDlt: 3, eliminated: true }], 0.3);
    expect(a).toMatchObject({ mtdIndex: 0, lowestEliminatedIndex: 1 });
    // Flags that are not contiguous: the lowest one still bounds everything above it.
    const b = selectMtd([{ nPatients: 3, nDlt: 0 }, { nPatients: 9, nDlt: 6, eliminated: true }, { nPatients: 3, nDlt: 0 }, { nPatients: 6, nDlt: 5, eliminated: true }], 0.3);
    expect(b).toMatchObject({ mtdIndex: 0, lowestEliminatedIndex: 1 });
    // The lowest dose flagged with a higher one: the trial stopped for safety, no MTD.
    const c = selectMtd([{ nPatients: 6, nDlt: 5, eliminated: true }, { nPatients: 3, nDlt: 1, eliminated: true }], 0.3);
    expect(c).toMatchObject({ mtdIndex: null, lowestEliminatedIndex: 0 });
  });

  it('a flagged dose bounds the doses above it even when no patient was treated at it', () => {
    const r = selectMtd([{ nPatients: 3, nDlt: 0 }, { nPatients: 0, nDlt: 0, eliminated: true }, { nPatients: 3, nDlt: 0 }], 0.3);
    expect(r).toMatchObject({ mtdIndex: 0, lowestEliminatedIndex: 1 });
  });

  it('reports lowestEliminatedIndex null and selects as before when no dose is flagged', () => {
    const r = selectMtd([{ nPatients: 6, nDlt: 0 }, { nPatients: 6, nDlt: 2 }, { nPatients: 6, nDlt: 4 }], 0.3);
    expect(r.lowestEliminatedIndex).toBeNull();
    expect(r.mtdIndex).toBe(1);
  });
});

describe('BOIN_DEFAULTS — the one exported constant of every default the engine applies', () => {
  it('states the published BOIN defaults and cannot be mutated', () => {
    expect(BOIN_DEFAULTS).toEqual({
      phi1Ratio: 0.6,
      phi2Ratio: 1.4,
      eliminationThreshold: 0.95,
      minEliminationN: 3,
      priorAlpha: 1,
      priorBeta: 1,
      prior: 'Beta(1,1)',
    });
    expect(Object.isFrozen(BOIN_DEFAULTS)).toBe(true);
  });

  it('is the neighbourhood boinBoundaries applies when φ1/φ2 are absent', () => {
    for (const target of [0.1, 0.2, 0.25, 0.3, 0.33, 0.4]) {
      const b = boinBoundaries(target);
      expect(b.phi1).toBe(BOIN_DEFAULTS.phi1Ratio * target);
      expect(b.phi2).toBe(BOIN_DEFAULTS.phi2Ratio * target);
      expect(b).toEqual(boinBoundaries(target, BOIN_DEFAULTS.phi1Ratio * target, BOIN_DEFAULTS.phi2Ratio * target));
    }
  });

  it('is the elimination rule boinDecision applies when the caller sets none', () => {
    for (let n = 1; n <= 20; n += 1) {
      for (let x = 0; x <= n; x += 1) {
        const d = boinDecision({ nPatients: n, nDlt: x, target: 0.3 });
        const explicit = boinDecision({
          nPatients: n, nDlt: x, target: 0.3,
          eliminationThreshold: BOIN_DEFAULTS.eliminationThreshold, minEliminationN: BOIN_DEFAULTS.minEliminationN,
        });
        expect(d, `n=${n} x=${x}`).toEqual(explicit);
        const stated = n >= BOIN_DEFAULTS.minEliminationN && d.posteriorExceedance > BOIN_DEFAULTS.eliminationThreshold;
        expect(d.eliminated, `n=${n} x=${x}`).toBe(stated);
      }
    }
  });

  it('is the prior of the elimination posterior: Beta(1,1), checked against closed forms', () => {
    // x = n under Beta(1,1) ⇒ posterior Beta(n+1, 1), P(p > φ) = 1 − φ^(n+1).
    expect(boinDecision({ nPatients: 3, nDlt: 3, target: 0.3 }).posteriorExceedance).toBeCloseTo(1 - 0.3 ** 4, 12);
    // x = 0 ⇒ posterior Beta(1, n+1), P(p > φ) = (1 − φ)^(n+1).
    expect(boinDecision({ nPatients: 5, nDlt: 0, target: 0.3 }).posteriorExceedance).toBeCloseTo(0.7 ** 6, 12);
    const d = boinDecision({ nPatients: 9, nDlt: 4, target: 0.25 });
    expect(d.posteriorExceedance).toBe(
      1 - betaRegularized(0.25, BOIN_DEFAULTS.priorAlpha + 4, BOIN_DEFAULTS.priorBeta + 5),
    );
  });

  it('boinDecision reports every value it applied — the caller\'s, or the default', () => {
    const byDefault = boinDecision({ nPatients: 6, nDlt: 1, target: 0.3 });
    expect(byDefault).toMatchObject({
      phi1: BOIN_DEFAULTS.phi1Ratio * 0.3,
      phi2: BOIN_DEFAULTS.phi2Ratio * 0.3,
      eliminationThreshold: BOIN_DEFAULTS.eliminationThreshold,
      minEliminationN: BOIN_DEFAULTS.minEliminationN,
      prior: BOIN_DEFAULTS.prior,
    });
    const given = boinDecision({ nPatients: 6, nDlt: 1, target: 0.3, phi1: 0.2, phi2: 0.4, eliminationThreshold: 0.9, minEliminationN: 6 });
    expect(given).toMatchObject({ phi1: 0.2, phi2: 0.4, eliminationThreshold: 0.9, minEliminationN: 6, prior: 'Beta(1,1)' });
  });
});
