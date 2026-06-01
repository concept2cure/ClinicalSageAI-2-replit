/**
 * Tests for BOIN dose finding (server/services/stats/dose-finding-boin.ts).
 *
 * The escalation/de-escalation boundaries are validated against the published
 * Liu & Yuan (2015) values; the decision rule, safety elimination, isotonic
 * regression and MTD selection are checked against worked cases.
 */

import { describe, it, expect } from 'vitest';
import {
  boinBoundaries,
  boinDecision,
  boinDecisionTable,
  isotonicRegression,
  selectMtd,
} from '../../server/services/stats/dose-finding-boin';

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
});
