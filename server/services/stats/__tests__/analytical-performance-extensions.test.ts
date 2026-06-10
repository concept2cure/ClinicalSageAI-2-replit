/**
 * Analytical-performance extension tests (stability, carryover, hook,
 * recovery, cut-off).
 */

import { describe, it, expect } from 'vitest';
import {
  assessRealTimeStability,
  assessAcceleratedStability,
  assessCarryover,
  assessHookEffect,
  assessRecovery,
  determineCutoff,
} from '../analytical-performance-extensions';

describe('assessRealTimeStability', () => {
  it('projects shelf-life from a declining series', () => {
    // 100 → 99 → 98 → 97 over 0,30,60,90 days = -1/30 per day ≈ -0.0333/day
    const r = assessRealTimeStability({
      points: [
        { time: 0, value: 100 },
        { time: 30, value: 99 },
        { time: 60, value: 98 },
        { time: 90, value: 97 },
      ],
      initialValue: 100,
      maxPercentChange: 10, // ±10 units
    });
    expect(r.slopePerUnitTime).toBeCloseTo(-1 / 30, 3);
    // 10 units allowed / (1/30 per day) = 300 days
    expect(r.shelfLife).toBeCloseTo(300, 0);
    expect(r.withinSpecAcrossWindow).toBe(true);
  });
});

describe('assessAcceleratedStability', () => {
  it('derives a positive activation energy and shelf-life', () => {
    // Faster degradation at higher temperature.
    const r = assessAcceleratedStability({
      points: [
        { temperatureC: 25, rateConstant: 0.001 },
        { temperatureC: 37, rateConstant: 0.004 },
        { temperatureC: 50, rateConstant: 0.02 },
      ],
      storageTemperatureC: 4,
      degradationThreshold: 0.1,
    });
    expect(r.activationEnergyKJ).toBeGreaterThan(0);
    expect(r.predictedRateAtStorage).toBeLessThan(0.001);
    expect(r.predictedShelfLife).toBeGreaterThan(0);
    expect(r.rSquared).toBeGreaterThan(0.9);
  });
});

describe('assessCarryover', () => {
  it('passes when carryover is below 1%', () => {
    const r = assessCarryover({
      lowAfterHigh: [1.05, 1.06],
      lowBaseline: [1.0, 1.0],
      highSample: [100, 100],
    });
    expect(r.carryoverPct).toBeCloseTo(0.055, 2);
    expect(r.pass).toBe(true);
  });

  it('fails when carryover exceeds the limit', () => {
    const r = assessCarryover({
      lowAfterHigh: [3, 3],
      lowBaseline: [1, 1],
      highSample: [100, 100],
    });
    expect(r.pass).toBe(false);
  });
});

describe('assessHookEffect', () => {
  it('detects a high-dose hook', () => {
    const r = assessHookEffect({
      series: [
        { concentration: 1, signal: 10 },
        { concentration: 10, signal: 80 },
        { concentration: 100, signal: 100 },
        { concentration: 1000, signal: 40 }, // drop after peak
      ],
    });
    expect(r.hookDetected).toBe(true);
    expect(r.peakConcentration).toBe(100);
  });

  it('no hook for a monotonic series', () => {
    const r = assessHookEffect({
      series: [
        { concentration: 1, signal: 10 },
        { concentration: 10, signal: 50 },
        { concentration: 100, signal: 100 },
      ],
    });
    expect(r.hookDetected).toBe(false);
  });
});

describe('assessRecovery', () => {
  it('passes when all points are within the band', () => {
    const r = assessRecovery({
      points: [
        { expected: 100, observed: 98 },
        { expected: 50, observed: 52 },
      ],
    });
    expect(r.allInBand).toBe(true);
    expect(r.meanRecoveryPct).toBeCloseTo(101, 0);
  });

  it('flags an out-of-band point', () => {
    const r = assessRecovery({ points: [{ expected: 100, observed: 50 }] });
    expect(r.allInBand).toBe(false);
  });
});

describe('determineCutoff', () => {
  it('selects the Youden-optimal threshold', () => {
    const r = determineCutoff([
      { score: 1, positive: false },
      { score: 2, positive: false },
      { score: 3, positive: false },
      { score: 7, positive: true },
      { score: 8, positive: true },
      { score: 9, positive: true },
    ]);
    // Perfect separation at cutoff between 3 and 7.
    expect(r.sensitivity).toBe(1);
    expect(r.specificity).toBe(1);
    expect(r.youdenJ).toBe(1);
    expect(r.cutoff).toBeGreaterThan(3);
    expect(r.cutoff).toBeLessThanOrEqual(7);
  });

  it('throws without both classes', () => {
    expect(() => determineCutoff([{ score: 1, positive: true }])).toThrow();
  });
});
