/**
 * Win ratio and event projection — pinned by exact combinatorics and closed form.
 *
 * ── Why these two together ───────────────────────────────────────────────────
 * Both are checkable *exactly*, by different means, which is what makes them
 * worth pinning precisely:
 *
 *   win-ratio.ts      — a finite pairwise comparison. With n₁ × n₂ pairs the
 *                       answer can be counted by hand, so the expectation is not
 *                       an approximation of anything.
 *   event-projection  — uniform accrual over [0, A] with exponential
 *                       time-to-event integrates in closed form:
 *                       E[D(t)] = rate × [ t − (1 − e^{−λt})/λ ]  for t ≤ A.
 *
 * ── What each decides in a real programme ────────────────────────────────────
 * The win ratio is the primary endpoint in hierarchical composite designs
 * (cardiovascular outcome trials in particular), so wins/losses/ties feed
 * directly into the treatment-effect claim. Event projection sets the interim
 * and final analysis dates in an event-driven trial — get it wrong and the DSMB
 * meets before the events exist.
 *
 * ── Verified before written ──────────────────────────────────────────────────
 * As in rounds 1–3, every expectation below was checked against hand computation
 * or the closed form BEFORE being written down, and no code change was needed.
 * E[events] at t = A = 10 with λ = ln2/10 evaluates to
 * 10 × (10 − 0.5/0.0693147) = 27.865, and the implementation returns 27.86525.
 */

import { describe, it, expect } from 'vitest';
import {
  winRatioAnalysis,
  type LevelSpec,
  type Subject,
} from '../../server/services/stats/win-ratio';
import {
  expectedEventsByTime,
  expectedTimeToEvents,
} from '../../server/services/stats/event-projection';

const higher: LevelSpec = { type: 'continuous', direction: 'higher-better' };
const lower: LevelSpec = { type: 'continuous', direction: 'lower-better' };
const tte: LevelSpec = { type: 'tte', direction: 'higher-better' };

const cont = (...vals: number[]): Subject => ({ levels: vals.map(value => ({ value })) });

describe('win ratio counts pairs exactly', () => {
  it('every pair a win: 4 wins, 0 losses, ratio UNDEFINED not Infinity', () => {
    // treatment {10, 8} vs control {5, 3} — all 2×2 = 4 pairs favour treatment.
    //
    // This test FOUND A DEFECT rather than confirming behaviour. The
    // implementation returned `Infinity` here, and `JSON.stringify(Infinity)` is
    // `null` — so POST /api/biostat/win-ratio emitted `"winRatio": null` beside
    // `"success": true`, indistinguishable from the all-ties case below. A win
    // ratio with zero losses is undefined, not infinite, and now says so
    // explicitly on the wire.
    const r = winRatioAnalysis([cont(10), cont(8)], [cont(5), cont(3)], [higher]);
    expect(r.wins).toBe(4);
    expect(r.losses).toBe(0);
    expect(r.ties).toBe(0);
    expect(r.pairs).toBe(4);
    expect(r.winRatio).toBeNull();
  });

  it('an even split gives a win ratio of exactly 1', () => {
    // treatment {10, 1} vs control {5, 3}: the 10 beats both, the 1 loses to both.
    const r = winRatioAnalysis([cont(10), cont(1)], [cont(5), cont(3)], [higher]);
    expect(r.wins).toBe(2);
    expect(r.losses).toBe(2);
    expect(r.winRatio).toBe(1);
  });

  it('all ties: no wins, no losses, ratio undefined', () => {
    const r = winRatioAnalysis([cont(5), cont(5)], [cont(5), cont(5)], [higher]);
    expect(r.ties).toBe(4);
    expect(r.wins).toBe(0);
    expect(r.losses).toBe(0);
    expect(r.winRatio).toBeNull();
  });

  it('survives JSON serialization — the wire value is intentional', () => {
    // The regression test for the defect above, at the layer where it actually
    // bit. Infinity and NaN both serialize to null SILENTLY, so a result object
    // carrying them arrives at the client as null with `success: true` and no
    // indication anything was undefined. Asserting the round-trip is the only
    // way to notice, because in-process the values look fine.
    const allWins = winRatioAnalysis([cont(10), cont(8)], [cont(5), cont(3)], [higher]);
    const wire = JSON.parse(JSON.stringify(allWins));
    expect(wire.winRatio).toBeNull();
    expect(wire.ciLower).toBeNull();
    expect(wire.ciUpper).toBeNull();
    // …and the caller can still tell WHY, which was the part that was lost.
    expect(wire.wins).toBe(4);
    expect(wire.losses).toBe(0);
    expect(wire.ties).toBe(0);

    const ordinary = winRatioAnalysis([cont(10), cont(1)], [cont(5), cont(3)], [higher]);
    const wire2 = JSON.parse(JSON.stringify(ordinary));
    expect(wire2.winRatio).toBe(1);
    expect(Number.isFinite(wire2.ciLower)).toBe(true);
    expect(Number.isFinite(wire2.ciUpper)).toBe(true);
  });

  it('wins + losses + ties always equals n₁ × n₂', () => {
    // The accounting identity. Any pair silently dropped — the usual symptom of
    // a mishandled tie or censoring case — breaks it.
    const t = [cont(9), cont(4), cont(7)];
    const c = [cont(5), cont(4)];
    const r = winRatioAnalysis(t, c, [higher]);
    expect(r.pairs).toBe(6);
    expect(r.wins + r.losses + r.ties).toBe(6);
  });

  it('direction is honoured: the same data reverses under lower-better', () => {
    const t = [cont(10), cont(8)];
    const c = [cont(5), cont(3)];
    expect(winRatioAnalysis(t, c, [higher]).wins).toBe(4);
    expect(winRatioAnalysis(t, c, [lower]).wins).toBe(0);
    expect(winRatioAnalysis(t, c, [lower]).losses).toBe(4);
  });

  it('the hierarchy falls through: level 1 ties, level 2 decides', () => {
    // The defining behaviour of a hierarchical composite. If level 2 were never
    // consulted these would all be ties, and the endpoint would be inert.
    const t = [cont(5, 9), cont(5, 9)];
    const c = [cont(5, 1), cont(5, 1)];
    const r = winRatioAnalysis(t, c, [higher, higher]);
    expect(r.wins).toBe(4);
    expect(r.ties).toBe(0);
  });

  it('level 1 decides when it can — level 2 must not override it', () => {
    // Reverse of the above: level 1 favours treatment, level 2 favours control.
    // A hierarchical win ratio must stop at the first level that discriminates.
    const t = [cont(9, 0), cont(9, 0)];
    const c = [cont(1, 100), cont(1, 100)];
    const r = winRatioAnalysis(t, c, [higher, higher]);
    expect(r.wins).toBe(4);
    expect(r.losses).toBe(0);
  });

  it('censoring makes a pair indeterminate rather than a win', () => {
    // A subject censored at t=5 cannot be said to have done worse than one who
    // had an event at t=8 — they might have gone on for years. Counting that as
    // a loss is the classic informative-censoring error, and it biases the
    // estimate in the direction of whichever arm is followed less closely.
    const t: Subject[] = [
      { levels: [{ value: 5, event: false }] }, // censored early — indeterminate
      { levels: [{ value: 20, event: true }] }, // outlives both controls
    ];
    const c: Subject[] = [
      { levels: [{ value: 8, event: true }] },
      { levels: [{ value: 9, event: true }] },
    ];
    const r = winRatioAnalysis(t, c, [tte]);
    expect(r.wins).toBe(2);
    expect(r.losses).toBe(0);
    expect(r.ties).toBe(2);
    expect(r.wins + r.losses + r.ties).toBe(4);
  });

  it('refuses an arm too small to compare, rather than returning a ratio', () => {
    expect(() => winRatioAnalysis([cont(1)], [cont(2), cont(3)], [higher])).toThrow();
    expect(() => winRatioAnalysis([cont(1), cont(2)], [cont(3), cont(4)], [])).toThrow();
  });
});

describe('event projection matches the closed form', () => {
  // Uniform accrual: 10 patients per unit over 10 units → N = 100.
  // Control median 10 → λ = ln2/10 = 0.0693147; HR = 1 so both arms share it.
  const base = {
    accrualRate: 10,
    accrualPeriod: 10,
    medianControl: 10,
    hazardRatio: 1,
    targetEvents: 50,
  };
  const LAMBDA = Math.LN2 / 10;

  /** E[D(t)] = rate × [ t − (1 − e^{−λt})/λ ] for t ≤ accrualPeriod. */
  const closedForm = (t: number) =>
    base.accrualRate * (t - (1 - Math.exp(-LAMBDA * t)) / LAMBDA);

  it.each([2, 5, 10])('t=%i (within accrual) matches the integral', t => {
    expect(expectedEventsByTime(base, t)).toBeCloseTo(closedForm(t), 6);
  });

  it('t=10 evaluates to 27.865 — the worked example in the header', () => {
    expect(expectedEventsByTime(base, 10)).toBeCloseTo(27.865, 3);
  });

  it('no events before the trial starts', () => {
    expect(expectedEventsByTime(base, 0)).toBe(0);
  });

  it('approaches N as t → ∞ when nobody drops out', () => {
    // With no competing dropout everyone eventually has the event, so the
    // asymptote is exactly the accrued sample size.
    expect(expectedEventsByTime(base, 1e6)).toBeCloseTo(100, 6);
  });

  it('dropout strictly reduces the events at every horizon', () => {
    for (const t of [5, 10, 30]) {
      const withDropout = expectedEventsByTime({ ...base, dropoutHazard: 0.05 }, t);
      expect(withDropout).toBeLessThan(expectedEventsByTime(base, t));
    }
  });

  it('inverts consistently: project to D events, then evaluate at that time', () => {
    // The strongest check here — the two functions are solved differently, so
    // agreement is a genuine cross-check rather than a restatement. Any
    // disagreement means one of them is wrong about the same trial.
    for (const targetEvents of [10, 25, 50, 80]) {
      const t = expectedTimeToEvents({ ...base, targetEvents });
      expect(expectedEventsByTime(base, t), `D=${targetEvents}`).toBeCloseTo(targetEvents, 4);
    }
  });

  it('returns 0 time for a non-positive target', () => {
    expect(expectedTimeToEvents({ ...base, targetEvents: 0 })).toBe(0);
  });

  it('rejects a negative horizon rather than extrapolating backwards', () => {
    expect(() => expectedEventsByTime(base, -1)).toThrow();
    expect(() => expectedEventsByTime({ ...base, dropoutHazard: -0.1 }, 5)).toThrow();
  });
});
