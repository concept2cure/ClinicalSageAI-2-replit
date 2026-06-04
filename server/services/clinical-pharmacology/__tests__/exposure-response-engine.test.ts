/**
 * Unit tests for the exposure-response / dose-selection engine.
 *
 * Pure module — no mocks. The headline case reproduces the Project Optimus
 * story: a 200 mg dose chosen on the efficacy plateau, below the 400 mg MTD.
 */

import { describe, it, expect } from 'vitest';

import { selectExposureResponseDose } from '../exposure-response-engine';

describe('selectExposureResponseDose — Project Optimus worked example', () => {
  const base = {
    dosesMg: [50, 100, 200, 400, 800],
    exposurePerMgDose: 1,
    efficacy: { ec50: 20, hill: 1 },
    safety: { intercept: -4, slope: 0.006, acceptableAeProbability: 0.3 },
    targetEfficacyFraction: 0.9,
  };

  it('selects 200 mg on the efficacy plateau, below the 400 mg MTD', () => {
    const r = selectExposureResponseDose(base);
    expect(r.optimizedDoseMg).toBe(200);
    expect(r.mtdMg).toBe(400);
    expect(r.belowMtd).toBe(true);
    expect(r.limitedBy).toBe('efficacy_plateau');
    expect(r.rationale).toMatch(/Project Optimus/);
  });

  it('marks 100 mg as safe but sub-therapeutic and 800 mg as unsafe', () => {
    const r = selectExposureResponseDose(base);
    const byDose = Object.fromEntries(r.predictions.map(p => [p.doseMg, p]));
    expect(byDose[100].safe).toBe(true);
    expect(byDose[100].efficacious).toBe(false);
    expect(byDose[200].efficacious).toBe(true);
    expect(byDose[800].safe).toBe(false);
    expect(byDose[200].pAE).not.toBeNull();
  });
});

describe('selectExposureResponseDose — safety-limited selection', () => {
  it('flags when the plateau is only reached above the MTD', () => {
    const r = selectExposureResponseDose({
      dosesMg: [10, 20, 40],
      exposurePerMgDose: 1,
      efficacy: { ec50: 200, hill: 1 }, // plateau far above the safe range
      safety: { intercept: -2, slope: 0.05, acceptableAeProbability: 0.3 },
      targetEfficacyFraction: 0.9,
    });
    expect(r.optimizedDoseMg).toBeNull();
    expect(r.limitedBy).toBe('safety');
    expect(r.mtdMg).not.toBeNull();
  });
});

describe('selectExposureResponseDose — threshold safety model & overrides', () => {
  it('supports an exposure-threshold safety model', () => {
    const r = selectExposureResponseDose({
      dosesMg: [100, 200, 400],
      exposurePerMgDose: 1,
      efficacy: { ec50: 50 },
      safety: { thresholdExposure: 300 },
      targetEfficacyFraction: 0.7,
    });
    // 400 exposure ≥ 300 threshold → unsafe; MTD = 200.
    expect(r.mtdMg).toBe(200);
    expect(r.predictions.find(p => p.doseMg === 400)?.safe).toBe(false);
  });

  it('honours explicit per-dose exposures (non-linear PK)', () => {
    const r = selectExposureResponseDose({
      dosesMg: [100, 200],
      exposuresByDose: { 100: 50, 200: 400 }, // supra-proportional at 200
      efficacy: { ec50: 60 },
      safety: { thresholdExposure: 300 },
      targetEfficacyFraction: 0.5,
    });
    expect(r.predictions.find(p => p.doseMg === 200)?.exposure).toBe(400);
    expect(r.predictions.find(p => p.doseMg === 200)?.safe).toBe(false);
  });

  it('throws without an exposure mapping', () => {
    expect(() =>
      selectExposureResponseDose({
        dosesMg: [100],
        efficacy: { ec50: 50 },
        safety: { thresholdExposure: 300 },
      }),
    ).toThrow(/exposurePerMgDose or exposuresByDose/);
  });
});
