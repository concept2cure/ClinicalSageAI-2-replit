/**
 * Reproducibility tests for the served-statistic simulation service that was
 * de-fabricated in GA workstream #3 (seeded RNG + provenance). It runs pure
 * power simulations with no database access, so it is exercised directly here.
 *
 * The contract: same inputs (or the same explicit seed) reproduce identical
 * simulated statistics, and every simulation carries a provenance record whose
 * inputs hash is stable.
 *
 * The MonteCarloService block that used to live here was removed with
 * server/services/monte-carlo-service.ts (no production caller; canonical
 * simulation and test distributions are server/services/stats/*).
 */

import { describe, it, expect } from 'vitest';
import { PowerSampleSizeService } from '../../server/services/power-sample-size-service';

describe('PowerSampleSizeService — reproducibility', () => {
  it('simulateGroupSequentialTrial reproduces simulated power and carries provenance', () => {
    const svc = new PowerSampleSizeService();
    const a = svc.simulateGroupSequentialTrial(0.5, 1.0, 2, 0.05, 0.8, 'obrien-fleming');
    const b = svc.simulateGroupSequentialTrial(0.5, 1.0, 2, 0.05, 0.8, 'obrien-fleming');
    expect(a.simulatedPower).toEqual(b.simulatedPower);
    expect(a.seed).toEqual(b.seed);
    expect(a.provenance.method).toBe('power-sample-size:simulateGroupSequentialTrial');
    expect(a.provenance.inputsSha256).toEqual(b.provenance.inputsSha256);
    expect(a.simulatedPower).toBeGreaterThanOrEqual(0);
    expect(a.simulatedPower).toBeLessThanOrEqual(1);
  });

  it('an explicit seed reproduces simulateGroupSequentialTrial', () => {
    const svc = new PowerSampleSizeService();
    const a = svc.simulateGroupSequentialTrial(0.4, 1.2, 3, 0.05, 0.8, 'pocock', 777);
    const b = svc.simulateGroupSequentialTrial(0.4, 1.2, 3, 0.05, 0.8, 'pocock', 777);
    expect(a.seed).toEqual(777);
    expect(a.simulatedPower).toEqual(b.simulatedPower);
  });

  it('calculateAdaptiveSampleSize reproduces expected results and carries provenance', () => {
    const svc = new PowerSampleSizeService();
    const a = svc.calculateAdaptiveSampleSize(0.4, 1.0, 'conditional power', 0.05, 0.8);
    const b = svc.calculateAdaptiveSampleSize(0.4, 1.0, 'conditional power', 0.05, 0.8);
    expect(a.expectedResults).toEqual(b.expectedResults);
    expect(a.seed).toEqual(b.seed);
    expect(a.provenance.method).toBe('power-sample-size:calculateAdaptiveSampleSize');
  });
});
