import { describe, it, expect } from 'vitest';
import {
  statisticsService,
  compareTrials,
  generatePredictiveModel,
  simulateVirtualTrial,
} from '../../server/statistics-service';

const adaptiveParams = {
  sampleSize: 200,
  initialAllocation: [0.5, 0.5],
  responseRates: [0.2, 0.5],
  maxStages: 2,
  adaptationRules: { type: 'bayesian' as const, threshold: 0.5, minAllocation: 0.1 },
  interimLooks: [0.5],
  alpha: 0.05,
  operatingCharNSim: 1000,
  seed: 7,
};

const survivalParams = {
  sampleSize: 200,
  groups: [
    { name: 'control', size: 0.5, medianSurvival: 12 },
    { name: 'treatment', size: 0.5, medianSurvival: 18 },
  ],
  maxFollowup: 36,
  accrualTime: 6,
  survivalModel: 'exponential' as const,
  seed: 42,
};

describe('statistics engine — reproducibility', () => {
  it('simulateAdaptiveTrial is identical for the same seed', async () => {
    const a = await statisticsService.simulateAdaptiveTrial({ ...adaptiveParams });
    const b = await statisticsService.simulateAdaptiveTrial({ ...adaptiveParams });
    expect(a.seed).toEqual(b.seed);
    expect(a.finalResults.pValues).toEqual(b.finalResults.pValues);
    expect(a.simulationMetrics).toEqual(b.simulationMetrics);
    expect(a.provenance.method).toBe('simulateAdaptiveTrial');
    expect(a.provenance.seed).toBe(7);
    expect(a.provenance.reproducible).toBe(true);
  });

  it('simulateAdaptiveTrial differs for a different seed', async () => {
    const a = await statisticsService.simulateAdaptiveTrial({ ...adaptiveParams, seed: 1 });
    const b = await statisticsService.simulateAdaptiveTrial({ ...adaptiveParams, seed: 999 });
    // Stage-level observed responses are stochastic; at least one stage should differ.
    expect(JSON.stringify(a.stageResults)).not.toEqual(JSON.stringify(b.stageResults));
  });

  it('simulateSurvivalData is identical for the same seed and carries provenance', async () => {
    const a = await statisticsService.simulateSurvivalData({ ...survivalParams });
    const b = await statisticsService.simulateSurvivalData({ ...survivalParams });
    expect(a.simulatedData).toEqual(b.simulatedData);
    expect(a.seed).toBe(42);
    expect(a.provenance.inputsSha256).toEqual(b.provenance.inputsSha256);
  });

  it('simulateSurvivalData differs for a different seed', async () => {
    const a = await statisticsService.simulateSurvivalData({ ...survivalParams, seed: 1 });
    const b = await statisticsService.simulateSurvivalData({ ...survivalParams, seed: 2 });
    expect(a.simulatedData[0].survivalTime).not.toEqual(b.simulatedData[0].survivalTime);
  });
});

describe('statistics engine — Monte Carlo operating characteristics', () => {
  it('type I error is controlled near alpha and power exceeds it under a real effect', async () => {
    const res = await statisticsService.simulateAdaptiveTrial({ ...adaptiveParams });
    const { typeIError, power } = res.simulationMetrics;
    // Estimated under the null (all arms = control rate); two-arm design, so ~alpha.
    expect(typeIError).toBeGreaterThanOrEqual(0);
    expect(typeIError).toBeLessThan(0.15);
    // Large separation (0.2 vs 0.5, n=100/arm) -> high power.
    expect(power).toBeGreaterThan(0.8);
    expect(power).toBeGreaterThan(typeIError);
  });
});

describe('statistics engine — no fabricated statistics', () => {
  it('compareTrials refuses to invent a p-value', () => {
    const r = compareTrials({ orr: 30 }, { orr: 45 }, 'orr');
    expect(r.difference).toBe(15);
    expect(r.pValue).toBeNull();
    expect(r.significance).toBe('not-assessable');
    expect(r.note).toMatch(/not assessable/i);
  });

  it('generatePredictiveModel is a deterministic point estimate (no random jitter)', () => {
    const details = [{ effectSize: 0.3 }, { effectSize: 0.4 }, { effectSize: 0.5 }];
    const a = generatePredictiveModel(details, 'effectSize');
    const b = generatePredictiveModel(details, 'effectSize');
    expect(a.predictedEffectSize).toEqual(b.predictedEffectSize);
    expect(a.predictedEffectSize).toBeCloseTo(0.4, 10); // equals the historical mean
  });

  it('simulateVirtualTrial is reproducible for a given seed', () => {
    const details = [{ effectSize: 0.3 }, { effectSize: 0.4 }, { effectSize: 0.5 }];
    const a = simulateVirtualTrial(details, 'effectSize', { seed: 5 });
    const b = simulateVirtualTrial(details, 'effectSize', { seed: 5 });
    const c = simulateVirtualTrial(details, 'effectSize', { seed: 6 });
    expect(a.simulatedOutcome).toEqual(b.simulatedOutcome);
    expect(a.seed).toBe(5);
    expect(a.simulatedOutcome).not.toEqual(c.simulatedOutcome);
  });
});
