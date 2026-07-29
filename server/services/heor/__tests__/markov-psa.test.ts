import { describe, it, expect } from 'vitest';
import { runMarkovModel } from '../markov-model.js';
import { runProbabilisticSensitivity } from '../psa.js';

describe('runMarkovModel', () => {
  // Two-state model: Healthy -> Dead absorbing. 10% die per cycle.
  const base = {
    states: ['Healthy', 'Dead'],
    transitionMatrix: [[0.9, 0.1], [0, 1]],
    stateCosts: [1000, 0],
    stateUtilities: [1, 0],
    cycles: 3,
  };

  it('accrues discounted cost/QALY over cycles on the start-of-cycle distribution', () => {
    const r = runMarkovModel({ ...base, discountRate: 0 });
    // Cycle 1: 100% healthy -> cost 1000, QALY 1
    // Cycle 2: 90% healthy -> cost 900, QALY 0.9
    // Cycle 3: 81% healthy -> cost 810, QALY 0.81
    expect(r.undiscountedCost).toBe(2710);
    expect(r.undiscountedQALY).toBe(2.71);
    expect(r.trace[1].distribution[0]).toBe(0.9);
  });

  it('applies discounting (first cycle undiscounted)', () => {
    const r = runMarkovModel({ ...base, discountRate: 0.1 });
    // 1000 + 900/1.1 + 810/1.21
    expect(r.totalCost).toBeCloseTo(1000 + 900 / 1.1 + 810 / 1.21, 2);
  });

  it('validates the transition matrix and inputs', () => {
    expect(() => runMarkovModel({ ...base, transitionMatrix: [[0.9, 0.2], [0, 1]] })).toThrow(/sum to 1/);
    expect(() => runMarkovModel({ ...base, cycles: 0 })).toThrow(/cycles/);
    expect(() => runMarkovModel({ ...base, stateCosts: [1] })).toThrow(/index-aligned/);
  });
});

describe('runProbabilisticSensitivity', () => {
  const input = {
    intervention: { cost: { mean: 50000, sd: 5000 }, effect: { mean: 5, sd: 0.5 } },
    comparator: { cost: { mean: 30000, sd: 4000 }, effect: { mean: 4, sd: 0.5 } },
    willingnessToPay: [20000, 50000, 100000],
    samples: 2000,
    seed: 42,
  };

  it('is deterministic for a fixed seed', () => {
    expect(runProbabilisticSensitivity(input)).toEqual(runProbabilisticSensitivity(input));
  });

  it('produces a CEAC rising with willingness-to-pay and a sensible ICER', () => {
    const r = runProbabilisticSensitivity(input);
    expect(r.samples).toBe(2000);
    expect(r.meanIncrementalEffect).toBeGreaterThan(0);
    expect(r.icer).toBeGreaterThan(0);
    const p = r.ceac.map((c) => c.probabilityCostEffective);
    expect(p[0]).toBeLessThanOrEqual(p[1]);
    expect(p[1]).toBeLessThanOrEqual(p[2]);
    for (const x of p) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1); }
  });

  it('validates inputs', () => {
    expect(() => runProbabilisticSensitivity({ ...input, willingnessToPay: [] })).toThrow(/willingnessToPay/);
    expect(() => runProbabilisticSensitivity({ ...input, intervention: { cost: { mean: NaN, sd: 1 }, effect: { mean: 1, sd: 1 } } })).toThrow(/finite mean/);
  });
});
