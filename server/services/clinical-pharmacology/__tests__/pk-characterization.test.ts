/**
 * Unit tests for PK characterization (dose proportionality + accumulation).
 * Pure module — no mocks.
 */

import { describe, it, expect } from 'vitest';

import { assessDoseProportionality, accumulation } from '../pk-characterization';

describe('assessDoseProportionality', () => {
  it('judges exactly linear exposure as dose-proportional', () => {
    const r = assessDoseProportionality({
      dataPoints: [
        { dose: 50, exposure: 100 },
        { dose: 100, exposure: 200 },
        { dose: 200, exposure: 400 },
        { dose: 400, exposure: 800 },
      ],
    });
    expect(r.slope).toBeCloseTo(1, 3);
    expect(r.verdict).toBe('proportional');
    expect(r.doseRatio).toBe(8);
  });

  it('detects supra-proportional (more than dose-proportional) exposure', () => {
    const r = assessDoseProportionality({
      dataPoints: [
        { dose: 50, exposure: 100 },
        { dose: 100, exposure: 250 },
        { dose: 200, exposure: 650 },
        { dose: 400, exposure: 1700 },
      ],
    });
    expect(r.slope).toBeGreaterThan(1.107);
    expect(r.verdict).toBe('not_proportional');
    expect(r.rationale).toMatch(/more than proportional/);
  });

  it('requires at least two distinct dose levels', () => {
    expect(() =>
      assessDoseProportionality({ dataPoints: [{ dose: 100, exposure: 200 }] }),
    ).toThrow(/two distinct dose levels/);
  });
});

describe('accumulation', () => {
  it('computes accumulation and time to steady state for an 18-h half-life, q24h', () => {
    const r = accumulation(18, 24);
    expect(r.ke).toBeCloseTo(0.0385, 3);
    expect(r.accumulationRatio).toBeCloseTo(1.66, 1);
    expect(r.timeToSteadyStateHours).toBe(90);
  });

  it('shows minimal accumulation when half-life ≪ interval', () => {
    const r = accumulation(2, 24);
    expect(r.accumulationRatio).toBeCloseTo(1, 2);
  });

  it('rejects non-positive inputs', () => {
    expect(() => accumulation(0, 24)).toThrow();
    expect(() => accumulation(18, 0)).toThrow();
  });
});
