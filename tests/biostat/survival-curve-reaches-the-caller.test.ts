/**
 * The survival curve the engine already computed reaches the caller
 * (2026-10-12).
 *
 * `restrictedMeanSurvival` calls `kaplanMeier(times, events)` and walks its
 * steps to integrate the area and accumulate the Greenwood-type variance — so
 * it holds the full Kaplan–Meier table: each event time with the number at
 * risk, the number of events, and the survival estimate. It then returned the
 * scalar RMST, its variance, its SE, τ and the tail flag, and DISCARDED the
 * table.
 *
 * Those four columns are the survival table every oncology CSR §14 and every
 * Module 2.7 carries. A sponsor who posted their survival data to
 * `/api/biostat/survival/rmst` got the restricted mean and could not get the
 * curve behind it — not because nothing computes it, but because the result
 * shape dropped it on the way out. `kaplanMeier` is exported, so the
 * alternative was a second route recomputing what this one already has, which
 * the working agreement forbids.
 *
 * No new statistics are introduced here. A Greenwood confidence band per step
 * would make this a publication figure rather than a table, and that is new
 * math that needs its own reference values; it is deliberately not invented
 * along the way.
 *
 * REFERENCE. times [1,2,3,4,5], events [1,0,1,1,0] — two right-censored:
 *   t=1  at risk 5, 1 event  → S = 1 · (1 − 1/5)       = 0.8
 *   t=2  censored, so no step; the risk set drops to 3
 *   t=3  at risk 3, 1 event  → S = 0.8 · (1 − 1/3)     = 0.533333…
 *   t=4  at risk 2, 1 event  → S = 0.533333 · (1 − 1/2) = 0.266667
 *   t=5  censored, no step
 * RMST(4) = 1·1 + 2·0.8 + 1·0.533333 = 3.133333…
 */
import { describe, expect, it } from 'vitest';
import {
  kaplanMeier,
  restrictedMeanSurvival,
  rmstDifference,
} from '../../server/services/stats/rmst.js';

const TIMES = [1, 2, 3, 4, 5];
const EVENTS = [1, 0, 1, 1, 0];

describe('the Kaplan–Meier table', () => {
  it('is the hand-computed one', () => {
    const steps = kaplanMeier(TIMES, EVENTS);
    expect(steps).toEqual([
      { time: 1, atRisk: 5, events: 1, survival: 0.8 },
      { time: 3, atRisk: 3, events: 1, survival: 0.5333333333333334 },
      { time: 4, atRisk: 2, events: 1, survival: 0.2666666666666667 },
    ]);
  });

  it('travels with the RMST result, instead of being discarded', () => {
    const r = restrictedMeanSurvival(TIMES, EVENTS, 4);
    expect(r.rmst).toBeCloseTo(3.133333, 6);
    // The four columns a CSR survival table carries.
    expect(r.survivalCurve).toEqual(kaplanMeier(TIMES, EVENTS));
  });

  it('carries every step, not only the ones inside τ', () => {
    // The integration stops at τ; the TABLE should not, or a reader cannot see
    // what happened after the restriction point they chose.
    const r = restrictedMeanSurvival(TIMES, EVENTS, 2);
    expect(r.rmst).toBeCloseTo(1.8, 10);          // 1·1 + 1·0.8
    expect(r.survivalCurve).toHaveLength(3);      // steps at 1, 3 and 4 remain
    expect(r.survivalCurve.at(-1)!.time).toBe(4);
  });

  it('comes with both arms when two arms were compared', () => {
    const treatment = { times: TIMES, events: EVENTS };
    const control = { times: [1, 1, 2, 3, 6], events: [1, 1, 1, 0, 1] };
    const d = rmstDifference(treatment, control, 4);

    /* Through the embedded arm results, NOT as a second pair of fields on the
       difference: `rmstDifference` already carries each arm's whole
       RmstResult, so copying the curves up would be two places holding one
       table. */
    expect(d.treatment.survivalCurve).toEqual(kaplanMeier(TIMES, EVENTS));
    expect(d.control.survivalCurve).toEqual(kaplanMeier(control.times, control.events));
    // And each curve belongs to the arm it is under: the control arm's first
    // step is at risk 5 with TWO events at t = 1.
    expect(d.control.survivalCurve[0]).toMatchObject({ time: 1, atRisk: 5, events: 2 });
  });

  it('is a step function that only ever decreases', () => {
    const r = restrictedMeanSurvival(TIMES, EVENTS, 5);
    const survivals = r.survivalCurve.map((s) => s.survival);
    for (let i = 1; i < survivals.length; i++) {
      expect(survivals[i]).toBeLessThan(survivals[i - 1]);
    }
    expect(survivals[0]).toBeLessThanOrEqual(1);
    expect(survivals.at(-1)).toBeGreaterThan(0);
  });
});
