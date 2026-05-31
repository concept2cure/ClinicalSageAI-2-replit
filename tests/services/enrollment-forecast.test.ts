/**
 * Tests for enrollment + dropout forecasting
 * (server/services/stats/enrollment-forecast.ts).
 *
 * GA bar: holdout error reported; intervals calibrated. Validated by exact
 * closed forms, Monte-Carlo-vs-closed-form agreement, and prediction-interval
 * coverage near nominal.
 */

import { describe, it, expect } from 'vitest';
import {
  expectedEnrollmentByTime,
  expectedTimeToEnroll,
  forecastCompletion,
  forecastEnrollmentByTime,
  forecastRetention,
  accrualHoldoutError,
} from '../../server/services/stats/enrollment-forecast';

describe('closed-form expectations', () => {
  it('expected enrollment by time sums site rates over active time', () => {
    const sites = [{ meanRate: 5 }, { meanRate: 3 }];
    expect(expectedEnrollmentByTime(sites, 10)).toBe(80);
  });

  it('respects staggered site activation', () => {
    const sites = [{ meanRate: 5 }, { meanRate: 3, activationTime: 4 }];
    // 5·10 + 3·(10-4) = 50 + 18 = 68.
    expect(expectedEnrollmentByTime(sites, 10)).toBe(68);
  });

  it('expected time to enroll inverts the accrual curve', () => {
    const sites = [{ meanRate: 5 }, { meanRate: 3 }]; // total rate 8
    expect(expectedTimeToEnroll(sites, 80)).toBeCloseTo(10, 10);
  });

  it('expected time to enroll accounts for a late-activating site', () => {
    // Rate 5 until t=10, then +5 (total 10). Need 100 patients.
    // By t=10: 50 accrued. Remaining 50 at rate 10 ⇒ +5 ⇒ t=15.
    const sites = [{ meanRate: 5 }, { meanRate: 5, activationTime: 10 }];
    expect(expectedTimeToEnroll(sites, 100)).toBeCloseTo(15, 10);
  });

  it('returns Infinity when there is no recruitment capacity', () => {
    expect(expectedTimeToEnroll([{ meanRate: 0 }], 10)).toBe(Infinity);
  });
});

describe('forecastCompletion — Monte Carlo vs closed form', () => {
  it('mean completion time matches N / rate for a single Poisson site', () => {
    // One site, rate 2, deterministic (cv=0): time to 100th arrival has mean 50.
    const f = forecastCompletion({ sites: [{ meanRate: 2 }], targetN: 100, nSim: 6000, seed: 1 });
    expect(f.expectedTime).toBeGreaterThan(49);
    expect(f.expectedTime).toBeLessThan(51);
    expect(f.probReached).toBe(1);
    expect(f.p10).toBeLessThan(f.medianTime);
    expect(f.medianTime).toBeLessThan(f.p90);
  });

  it('is reproducible for a fixed seed and carries provenance', () => {
    const args = { sites: [{ meanRate: 3 }, { meanRate: 2 }], targetN: 60, nSim: 2000, seed: 7 };
    const a = forecastCompletion(args);
    const b = forecastCompletion(args);
    expect(a.expectedTime).toBe(b.expectedTime);
    expect(a.p10).toBe(b.p10);
    expect(a.provenance.inputsSha256).toBe(b.provenance.inputsSha256);
    expect(a.provenance.method).toBe('enrollment:forecastCompletion');
  });
});

describe('prediction intervals are calibrated (GA bar)', () => {
  it('two independent 80% bands agree (interval stability)', () => {
    const sites = [{ meanRate: 4 }, { meanRate: 2, activationTime: 2 }];
    const targetN = 120;
    const a = forecastCompletion({ sites, targetN, nSim: 8000, seed: 100 });
    const b = forecastCompletion({ sites, targetN, nSim: 8000, seed: 999 });
    expect(Math.abs(a.p10 - b.p10)).toBeLessThan(0.1 * a.medianTime);
    expect(Math.abs(a.p90 - b.p90)).toBeLessThan(0.1 * a.medianTime);
  });

  it('coverage of the 80% band is close to nominal across fresh draws', () => {
    const sites = [{ meanRate: 5 }];
    const targetN = 100;
    const f = forecastCompletion({ sites, targetN, nSim: 20000, seed: 11 });
    // Generate fresh single realizations and count coverage of [p10, p90].
    // Reuse forecastEnrollmentByTime's RNG path indirectly: simulate completion
    // times here via many tiny single-sim forecasts with distinct seeds.
    let covered = 0;
    const M = 2000;
    for (let i = 0; i < M; i++) {
      const one = forecastCompletion({ sites, targetN, nSim: 1, seed: 50000 + i });
      if (one.expectedTime >= f.p10 && one.expectedTime <= f.p90) covered++;
    }
    const coverage = covered / M;
    expect(coverage).toBeGreaterThan(0.75);
    expect(coverage).toBeLessThan(0.85);
  });
});

describe('forecastEnrollmentByTime — over-dispersion', () => {
  it('expected count is the closed form; percentiles are ordered', () => {
    const sites = [{ meanRate: 8 }];
    const f = forecastEnrollmentByTime({ sites, time: 10, nSim: 4000, seed: 3 });
    expect(f.expected).toBe(80);
    expect(f.p10).toBeLessThanOrEqual(f.median);
    expect(f.median).toBeLessThanOrEqual(f.p90);
  });

  it('between-site rate variability widens the interval', () => {
    const time = 10;
    const poisson = forecastEnrollmentByTime({ sites: [{ meanRate: 8, rateCv: 0 }], time, nSim: 8000, seed: 5 });
    const overdispersed = forecastEnrollmentByTime({ sites: [{ meanRate: 8, rateCv: 0.6 }], time, nSim: 8000, seed: 5 });
    const widthP = poisson.p90 - poisson.p10;
    const widthO = overdispersed.p90 - overdispersed.p10;
    expect(widthO).toBeGreaterThan(widthP);
    // Means agree regardless of dispersion.
    expect(overdispersed.expected).toBe(poisson.expected);
  });
});

describe('forecastRetention — exponential dropout', () => {
  it('no dropout retains everyone', () => {
    const r = forecastRetention({ nEnrolled: 200, dropoutRatePerUnit: 0, atTime: 12 });
    expect(r.retentionProbability).toBe(1);
    expect(r.expectedRetained).toBe(200);
  });

  it('expected retention follows e^{-rho t} with an interval inside [0, n]', () => {
    const r = forecastRetention({ nEnrolled: 200, dropoutRatePerUnit: 0.1, atTime: 10 });
    expect(r.retentionProbability).toBeCloseTo(Math.exp(-1), 10);
    expect(r.expectedRetained).toBeCloseTo(200 * Math.exp(-1), 8);
    expect(r.lower).toBeGreaterThanOrEqual(0);
    expect(r.upper).toBeLessThanOrEqual(200);
    expect(r.lower).toBeLessThan(r.expectedRetained);
    expect(r.upper).toBeGreaterThan(r.expectedRetained);
  });
});

describe('accrualHoldoutError', () => {
  it('reports zero error when observations match the expected curve', () => {
    const sites = [{ meanRate: 5 }, { meanRate: 3 }];
    const observed = [
      { time: 5, cumulative: 40 },
      { time: 10, cumulative: 80 },
    ];
    const e = accrualHoldoutError(sites, observed);
    expect(e.meanAbsoluteError).toBeCloseTo(0, 10);
    expect(e.rootMeanSquaredError).toBeCloseTo(0, 10);
  });

  it('reports the signed gap when accrual lags the forecast', () => {
    const sites = [{ meanRate: 10 }];
    const e = accrualHoldoutError(sites, [{ time: 10, cumulative: 80 }]); // expected 100
    expect(e.points[0].error).toBe(-20);
    expect(e.meanAbsoluteError).toBe(20);
  });
});
