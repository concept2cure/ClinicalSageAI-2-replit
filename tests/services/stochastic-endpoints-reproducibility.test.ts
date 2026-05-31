/**
 * Reproducibility tests for the served-statistic simulation services that were
 * de-fabricated in GA workstream #3 (seeded RNG + provenance). These two
 * services run pure Monte Carlo / power simulations with no database access, so
 * they are exercised directly here.
 *
 * The contract: same inputs (or the same explicit seed) reproduce identical
 * simulated statistics, and every simulation carries a provenance record whose
 * inputs hash is stable.
 */

import { describe, it, expect } from 'vitest';
import { MonteCarloService } from '../../server/services/monte-carlo-service';
import { PowerSampleSizeService } from '../../server/services/power-sample-size-service';

describe('MonteCarloService.runSimulation — reproducibility', () => {
  const params = {
    design_type: 'parallel',
    test_type: 'superiority',
    endpoint_type: 'continuous',
    alpha: 0.05,
    effect_size: 0.5,
    variability: 1.0,
    sample_size: 100,
    n_simulations: 500,
    dropout_rate: 0.1,
    allocation_ratio: [1.0, 1.0],
  };

  it('same inputs reproduce identical empirical power, type I error, and CI', async () => {
    const svc = new MonteCarloService();
    const a = await svc.runSimulation(params);
    const b = await svc.runSimulation(params);
    expect(a.empirical_power).toEqual(b.empirical_power);
    expect(a.type_i_error).toEqual(b.type_i_error);
    expect(a.confidence_interval).toEqual(b.confidence_interval);
    expect(a.seed).toEqual(b.seed);
  });

  it('a cross-instance run with the same derived seed matches', async () => {
    const a = await new MonteCarloService().runSimulation(params);
    const b = await new MonteCarloService().runSimulation(params);
    expect(a.empirical_power).toEqual(b.empirical_power);
  });

  it('an explicit seed reproduces and overrides the derived seed', async () => {
    const svc = new MonteCarloService();
    const a = await svc.runSimulation({ ...params, seed: 12345 });
    const b = await svc.runSimulation({ ...params, seed: 12345 });
    expect(a.seed).toEqual(12345);
    expect(a.empirical_power).toEqual(b.empirical_power);
  });

  it('attaches a provenance record with a stable inputs hash', async () => {
    const a = await new MonteCarloService().runSimulation(params);
    const b = await new MonteCarloService().runSimulation(params);
    expect(a.provenance.reproducible).toBe(true);
    expect(a.provenance.method).toBe('monte-carlo:runSimulation');
    expect(a.provenance.inputsSha256).toEqual(b.provenance.inputsSha256);
  });

  it('produces a power in [0,1] (sanity)', async () => {
    const a = await new MonteCarloService().runSimulation(params);
    expect(a.empirical_power).toBeGreaterThanOrEqual(0);
    expect(a.empirical_power).toBeLessThanOrEqual(1);
  });
});

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
