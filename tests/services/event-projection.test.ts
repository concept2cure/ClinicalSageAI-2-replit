/**
 * Tests for event-time projection (server/services/stats/event-projection.ts).
 *
 * Validated by an independent numerical integral of the expected-events curve,
 * the closed-form inversion, Monte-Carlo-vs-closed-form agreement, and the
 * expected monotonicities (dropout, hazard ratio, time).
 */

import { describe, it, expect } from 'vitest';
import {
  expectedEventsByTime,
  expectedTimeToEvents,
  projectEventTime,
  type EventProjectionInput,
} from '../../server/services/stats/event-projection';

const LN2 = Math.log(2);

/** Independent brute-force numerical integral of E[D(t)] for cross-checking. */
function bruteExpectedEvents(input: EventProjectionInput, t: number, steps = 20000): number {
  const ratio = input.allocationRatio ?? 1;
  const pT = ratio / (1 + ratio);
  const lambdaC = LN2 / input.medianControl;
  const lambdaD = input.dropoutHazard ?? 0;
  const arms = [
    { frac: 1 - pT, lambda: lambdaC },
    { frac: pT, lambda: input.hazardRatio * lambdaC },
  ];
  const A = input.accrualPeriod;
  const m = Math.min(t, A);
  let total = 0;
  const du = m / steps;
  for (const arm of arms) {
    const k = arm.lambda + lambdaD;
    const c = arm.lambda / k;
    let integral = 0;
    for (let i = 0; i < steps; i++) {
      const u = (i + 0.5) * du;
      integral += (1 - Math.exp(-k * (t - u))) * du;
    }
    total += arm.frac * input.accrualRate * c * integral;
  }
  return total;
}

const base: EventProjectionInput = {
  accrualRate: 10,
  accrualPeriod: 12,
  allocationRatio: 1,
  medianControl: 12,
  hazardRatio: 0.7,
  dropoutHazard: 0.02,
  targetEvents: 60,
};

describe('expectedEventsByTime — closed form vs numerical integral', () => {
  it('matches an independent numerical integration during accrual', () => {
    expect(expectedEventsByTime(base, 8)).toBeCloseTo(bruteExpectedEvents(base, 8), 4);
  });

  it('matches after accrual completes', () => {
    expect(expectedEventsByTime(base, 30)).toBeCloseTo(bruteExpectedEvents(base, 30), 4);
  });

  it('is zero at t=0 and increases with time', () => {
    expect(expectedEventsByTime(base, 0)).toBeCloseTo(0, 10);
    expect(expectedEventsByTime(base, 20)).toBeGreaterThan(expectedEventsByTime(base, 10));
  });

  it('dropout reduces the expected events at a fixed time', () => {
    const noDrop = expectedEventsByTime({ ...base, dropoutHazard: 0 }, 24);
    const withDrop = expectedEventsByTime({ ...base, dropoutHazard: 0.1 }, 24);
    expect(withDrop).toBeLessThan(noDrop);
  });

  it('a smaller hazard ratio (more benefit) yields fewer events', () => {
    const hr1 = expectedEventsByTime({ ...base, hazardRatio: 1.0 }, 24);
    const hr05 = expectedEventsByTime({ ...base, hazardRatio: 0.5 }, 24);
    expect(hr05).toBeLessThan(hr1);
  });
});

describe('expectedEventsByTime — analytic special case', () => {
  it('single hazard, no dropout, still accruing matches r·[t − (1−e^{−λt})/λ]', () => {
    // HR=1 so both arms share λ; no dropout; t < accrualPeriod.
    const inp: EventProjectionInput = {
      accrualRate: 5, accrualPeriod: 100, allocationRatio: 1,
      medianControl: 10, hazardRatio: 1, dropoutHazard: 0, targetEvents: 1,
    };
    const lambda = LN2 / 10;
    const t = 8;
    const expected = inp.accrualRate * (t - (1 - Math.exp(-lambda * t)) / lambda);
    expect(expectedEventsByTime(inp, t)).toBeCloseTo(expected, 6);
  });
});

describe('expectedTimeToEvents', () => {
  it('inverts the expected-events curve', () => {
    const t = expectedTimeToEvents(base);
    expect(expectedEventsByTime(base, t)).toBeCloseTo(base.targetEvents, 4);
  });

  it('returns Infinity when the target exceeds the maximum attainable events', () => {
    // N = 120 patients; with dropout the attainable events are well under 120.
    const t = expectedTimeToEvents({ ...base, targetEvents: 120, dropoutHazard: 0.2 });
    expect(t).toBe(Infinity);
  });
});

describe('projectEventTime — Monte Carlo', () => {
  it('mean time agrees with the closed-form expected time', () => {
    const f = projectEventTime({ ...base, nSim: 4000, seed: 1 });
    expect(f.probReached).toBeGreaterThan(0.9);
    // MC time-to-D vs deterministic inversion; agreement to a few percent.
    expect(Math.abs(f.medianTime - f.expectedTime)).toBeLessThan(0.1 * f.expectedTime);
    expect(f.p10).toBeLessThan(f.medianTime);
    expect(f.medianTime).toBeLessThan(f.p90);
  });

  it('is reproducible for a fixed seed with stable provenance', () => {
    const a = projectEventTime({ ...base, nSim: 1500, seed: 9 });
    const b = projectEventTime({ ...base, nSim: 1500, seed: 9 });
    expect(a.medianTime).toBe(b.medianTime);
    expect(a.p90).toBe(b.p90);
    expect(a.provenance.inputsSha256).toBe(b.provenance.inputsSha256);
    expect(a.provenance.method).toBe('eventProjection:projectEventTime');
  });

  it('needing more events takes longer', () => {
    const few = projectEventTime({ ...base, targetEvents: 40, nSim: 2000, seed: 3 });
    const many = projectEventTime({ ...base, targetEvents: 80, nSim: 2000, seed: 3 });
    expect(many.expectedTime).toBeGreaterThan(few.expectedTime);
  });
});
