/**
 * Risk-register Monte-Carlo tests.
 */

import { describe, it, expect } from 'vitest';
import { simulateRiskRegister } from '../risk-register-sim';

describe('simulateRiskRegister', () => {
  it('summarizes harm exposure and per-item occurrence', () => {
    const r = simulateRiskRegister({
      items: [
        { severity: 'serious', p1: 'occasional', p2: 'occasional' },
        { severity: 'minor', p1: 'probable', p2: 'remote' },
      ],
      seed: 1, iterations: 5000,
    });
    expect(r.itemCount).toBe(2);
    expect(r.perItem).toHaveLength(2);
    expect(r.totalHarm.mean).toBeGreaterThanOrEqual(0);
    expect(r.expectedEventsPerPeriod).toBeGreaterThan(0);
    expect(r.perItem[0].occurrenceProbability).toBeCloseTo(0.05 * 0.05, 6);
  });

  it('higher-probability/severity items raise the serious-event probability', () => {
    const low = simulateRiskRegister({ items: [{ severity: 'serious', p1: 'improbable', p2: 'improbable' }], seed: 2, iterations: 5000 });
    const high = simulateRiskRegister({ items: [{ severity: 'critical', p1: 'frequent', p2: 'frequent' }], seed: 2, iterations: 5000 });
    expect(high.probabilityAnySeriousEvent).toBeGreaterThan(low.probabilityAnySeriousEvent);
  });

  it('is reproducible for a fixed seed', () => {
    const args = { items: [{ severity: 'serious' as const, p1: 'occasional' as const, p2: 'probable' as const }], seed: 9, iterations: 3000 };
    expect(simulateRiskRegister(args).totalHarm.mean).toBe(simulateRiskRegister(args).totalHarm.mean);
  });

  it('rejects empty registers and invalid bands', () => {
    expect(() => simulateRiskRegister({ items: [] })).toThrow();
    // @ts-expect-error invalid severity
    expect(() => simulateRiskRegister({ items: [{ severity: 'oops', p1: 'remote', p2: 'remote' }] })).toThrow();
  });
});
