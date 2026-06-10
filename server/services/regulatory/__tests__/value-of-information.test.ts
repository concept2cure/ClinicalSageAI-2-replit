/**
 * Expected Value of Perfect Information tests.
 */

import { describe, it, expect } from 'vitest';
import { expectedValueOfPerfectInformation } from '../value-of-information';

describe('expectedValueOfPerfectInformation', () => {
  it('EVPI is positive when scenarios straddle the go/no-go boundary', () => {
    // High scenario: go is very profitable; low scenario: go loses money.
    const r = expectedValueOfPerfectInformation({
      marketValueUsd: 10_000_000,
      costToCompleteUsd: 3_000_000,
      scenarios: [
        { label: 'biomarker validated', probability: 0.5, probabilityOfSuccess: 0.8 },
        { label: 'biomarker fails', probability: 0.5, probabilityOfSuccess: 0.1 },
      ],
    });
    expect(r.evpi).toBeGreaterThan(0);
    expect(r.expectedValueWithPerfectInfo).toBeGreaterThanOrEqual(r.expectedValueWithoutInfo);
    expect(r.scenarioPayoffs).toHaveLength(2);
    // The two scenarios pick opposite info-optimal actions.
    const actions = new Set(r.scenarioPayoffs.map(s => s.infoOptimal));
    expect(actions.has('go')).toBe(true);
    expect(actions.has('no_go')).toBe(true);
  });

  it('EVPI is zero when go is optimal in every scenario', () => {
    const r = expectedValueOfPerfectInformation({
      marketValueUsd: 10_000_000,
      costToCompleteUsd: 500_000,
      scenarios: [
        { probability: 0.5, probabilityOfSuccess: 0.7 },
        { probability: 0.5, probabilityOfSuccess: 0.9 },
      ],
    });
    expect(r.evpi).toBe(0);
    expect(r.baselineDecision).toBe('go');
  });

  it('normalizes scenario probabilities that do not sum to 1', () => {
    const r = expectedValueOfPerfectInformation({
      marketValueUsd: 1_000_000,
      costToCompleteUsd: 100_000,
      scenarios: [
        { probability: 3, probabilityOfSuccess: 0.5 },
        { probability: 1, probabilityOfSuccess: 0.2 },
      ],
    });
    const sum = r.scenarioPayoffs.reduce((s, sp) => s + sp.probability, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it('rejects empty scenarios', () => {
    expect(() => expectedValueOfPerfectInformation({ marketValueUsd: 1, costToCompleteUsd: 0, scenarios: [] })).toThrow();
  });
});
