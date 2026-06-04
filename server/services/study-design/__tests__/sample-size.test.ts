/**
 * Tests for sample-size solving. Deterministic closed-form + quadrature, with two
 * cross-checks that keep it honest: the assurance-based N must reproduce the target
 * probability of success when fed back into the simulator, and a target assurance the
 * prior cannot support must be reported as unreachable, not sized away.
 */

import { describe, it, expect } from 'vitest';
import {
  solveSampleSize,
  sampleSizeForPower,
  sampleSizeForAssurance,
} from '../sample-size';
import { buildEffectPrior } from '../evidence-prior';
import { simulateTrial } from '../trial-simulator';
import { powerTwoSampleMeans } from '../../stats/assurance';
import { type StudyDesign } from '../study-design-types';

function design(overrides: Partial<StudyDesign> = {}): StudyDesign {
  return {
    title: 'Sizing fixture',
    phase: '3',
    indication: 'type 2 diabetes',
    objectives: [{ level: 'primary', order: 1, text: 'Superiority', endpointName: 'Primary' }],
    estimands: [],
    endpoints: [{ name: 'Primary', role: 'primary', type: 'continuous', definition: 'change' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: 'adults', analysisPopulations: [{ kind: 'ITT', definition: 'all' }], eligibility: [] },
    arms: [
      { name: 'Drug', interventions: [{ name: 'Drug', role: 'investigational' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double' },
    // alpha 0.05 two-sided ⇒ effective one-sided 0.025
    statisticalPlan: { alpha: 0.05, oneSided: false, plannedSampleSize: 200, plannedAnalyses: [] },
    ...overrides,
  };
}

describe('sampleSizeForPower', () => {
  it('reproduces the textbook two-sample size for a standardized effect', () => {
    // d = 0.5, one-sided alpha 0.025, power 0.90 → ~85 per arm.
    expect(sampleSizeForPower(0.5, 0.025, 0.9)).toBe(85);
    // power 0.80 → ~63 per arm.
    expect(sampleSizeForPower(0.5, 0.025, 0.8)).toBe(63);
  });

  it('grows as the effect shrinks', () => {
    expect(sampleSizeForPower(0.3, 0.025, 0.9)).toBeGreaterThan(sampleSizeForPower(0.5, 0.025, 0.9));
  });
});

describe('sampleSizeForAssurance', () => {
  it('needs more subjects than power for the same target when the prior is uncertain', () => {
    const nPower = sampleSizeForPower(0.4, 0.025, 0.8);
    const { nPerArm } = sampleSizeForAssurance(0.4, 0.15, 0.025, 0.8);
    expect(nPerArm).not.toBeNull();
    expect(nPerArm!).toBeGreaterThan(nPower);
  });

  it('reports a ceiling and returns null when the target exceeds it', () => {
    // mean 0.1, sd 0.4 → ceiling = Φ(0.1/0.4) ≈ 0.60; target 0.8 is unreachable.
    const { nPerArm, ceiling } = sampleSizeForAssurance(0.1, 0.4, 0.025, 0.8);
    expect(nPerArm).toBeNull();
    expect(ceiling).toBeGreaterThan(0.55);
    expect(ceiling).toBeLessThan(0.65);
  });
});

describe('solveSampleSize', () => {
  it('returns both sizes and reconciles with the planned N', () => {
    const prior = buildEffectPrior([], { plannedEffect: 0.4, assumptionSd: 0.18 });
    // Same target for both, so the assurance N must exceed the power N (it integrates uncertainty).
    const report = solveSampleSize(design(), prior, { targetPower: 0.8, targetAssurance: 0.8 });
    expect(report.nPerArmForPower).toBe(sampleSizeForPower(0.4, 0.025, 0.8));
    expect(report.nPerArmForAssurance).not.toBeNull();
    expect(report.nPerArmForAssurance!).toBeGreaterThan(report.nPerArmForPower);
    // Power at the solved N meets the target.
    expect(powerTwoSampleMeans(0.4, report.nPerArmForPower, 0.025, true)).toBeGreaterThanOrEqual(0.8);
    // Planned-N diagnostics present.
    expect(report.atPlannedN).not.toBeNull();
    expect(report.atPlannedN!.power).toBeGreaterThan(0);
  });

  it('flags an unreachable assurance target with a caveat', () => {
    const prior = buildEffectPrior([], { plannedEffect: 0.1, assumptionSd: 0.4 });
    const report = solveSampleSize(design(), prior, { targetAssurance: 0.85 });
    expect(report.assuranceUnreachable).toBe(true);
    expect(report.nPerArmForAssurance).toBeNull();
    expect(report.caveats.join(' ')).toMatch(/not reachable/i);
  });

  it('inflates enrollment for the dropout rate', () => {
    const prior = buildEffectPrior([], { plannedEffect: 0.4, assumptionSd: 0.12 });
    const d = design({ statisticalPlan: { alpha: 0.05, oneSided: false, dropoutRate: 0.2, plannedSampleSize: 200, plannedAnalyses: [] } });
    const report = solveSampleSize(d, prior, {});
    expect(report.dropoutAdjusted).not.toBeNull();
    expect(report.dropoutAdjusted!.enrollPerArmForPower).toBeGreaterThan(report.nPerArmForPower);
  });

  it('cross-checks: the assurance-based N reproduces the target PoS in the simulator', () => {
    const prior = buildEffectPrior([], { plannedEffect: 0.4, assumptionSd: 0.15 });
    const report = solveSampleSize(design(), prior, { targetAssurance: 0.8 });
    expect(report.nPerArmForAssurance).not.toBeNull();
    const sim = simulateTrial(design(), {
      effectPrior: prior,
      nPerArm: report.nPerArmForAssurance!,
      nRuns: 40000,
      seed: 4,
    });
    // The simulated probability of success should land at (or just above) the target.
    expect(sim.summary.probabilityOfSuccess).toBeGreaterThan(0.78);
    expect(sim.summary.probabilityOfSuccess).toBeLessThan(0.86);
  });
});
