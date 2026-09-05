/**
 * simulateTrialOutcomes feeds trial success-probability / power figures that
 * justify sample sizes in protocols and reports. It must never return a
 * FABRICATED figure: degenerate inputs (zero variance, zero iterations, an arm
 * of <2) silently produced a 100% success probability or a NaN that read as a
 * real result, and a computation error was rendered as a legitimate-looking
 * "0% probability of success". This test locks in the fail-closed behavior.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));

import { StatisticsService } from '../statistics-service';

const svc = new StatisticsService();

const base = {
  sampleSize: 200,
  treatmentEffect: 0.3,
  controlResponse: 0.5,
  variability: 0.2,
  iterations: 200,
};

describe('simulateTrialOutcomes — fails closed instead of fabricating', () => {
  it('returns a finite probability in [0,1] for valid inputs', () => {
    const r = svc.simulateTrialOutcomes(base);
    expect(Number.isFinite(r.successProbability)).toBe(true);
    expect(r.successProbability).toBeGreaterThanOrEqual(0);
    expect(r.successProbability).toBeLessThanOrEqual(1);
  });

  it('throws on zero variability (old code fabricated a 100% success probability)', () => {
    expect(() => svc.simulateTrialOutcomes({ ...base, variability: 0 })).toThrow(/variability/i);
  });

  it('throws on zero iterations (old code returned NaN as a real result)', () => {
    expect(() => svc.simulateTrialOutcomes({ ...base, iterations: 0 })).toThrow(/iterations/i);
  });

  it('throws when an arm would have fewer than 2 subjects', () => {
    expect(() => svc.simulateTrialOutcomes({ ...base, sampleSize: 2 })).toThrow(/sampleSize/i);
  });
});
