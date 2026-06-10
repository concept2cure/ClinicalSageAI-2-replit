/**
 * Tests for the evidence prior and the synthetic-twin trial simulator.
 *
 * The simulator is stochastic but seeded, so these assert the honesty guarantees a
 * regulator would: reproducibility, agreement with the closed-form assurance integral
 * (the platform's GA bar), a calibrated type-I error under the null, an honestly
 * un-confident number for a diffuse/assumption prior, optimism flagging when the
 * sponsor's planned effect outruns the evidence, and the defensibility gate riding
 * along so a good-looking forecast cannot hide a broken design.
 */

import { describe, it, expect } from 'vitest';
import { buildEffectPrior, type EvidenceObservation } from '../evidence-prior';
import { simulateTrial, type SimulationAssumptions } from '../trial-simulator';
import { assuranceTwoSampleMeans } from '../../stats/assurance';
import { type StudyDesign, type EndpointType, type InferentialFrame } from '../study-design-types';

/** A minimal two-arm superiority design with a continuous primary endpoint. */
function baseDesign(overrides: Partial<StudyDesign> = {}): StudyDesign {
  return {
    title: 'Phase 3 simulation fixture',
    phase: '3',
    indication: 'type 2 diabetes',
    objectives: [
      { level: 'primary', order: 1, text: 'Superiority on the primary', endpointName: 'Primary' },
    ],
    estimands: [
      {
        endpointName: 'Primary',
        treatmentCondition: 'Drug versus placebo',
        population: 'ITT',
        variable: 'change from baseline at week 24',
        summaryMeasure: 'difference in means',
        strategy: 'treatment_policy',
        intercurrentEvents: [
          { name: 'rescue', strategy: 'treatment_policy', justification: 'reflects the estimand' },
        ],
      },
    ],
    endpoints: [
      { name: 'Primary', role: 'primary', type: 'continuous', definition: 'change from baseline', regulatoryAcceptance: 'accepted_precedent' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults',
      analysisPopulations: [{ kind: 'ITT', definition: 'all randomized', isPrimaryAnalysisSet: true }],
      eligibility: [{ type: 'inclusion', text: 'adult' }],
    },
    arms: [
      { name: 'Drug', interventions: [{ name: 'Drug', role: 'investigational' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double' },
    statisticalPlan: {
      alpha: 0.05,
      oneSided: true,
      power: 0.9,
      plannedSampleSize: 300,
      plannedAnalyses: [{ endpointName: 'Primary', method: 'MMRM' }],
      multiplicity: { method: 'none' },
    },
    ...overrides,
  };
}

/** A tight evidence prior centered at a known effect, for cross-validation. */
function tightPrior(mean: number, sd: number) {
  return buildEffectPrior([], { plannedEffect: mean, assumptionSd: sd });
}

describe('buildEffectPrior — honesty of the prior', () => {
  it('refuses to invent a prior with no evidence and no planned effect', () => {
    expect(() => buildEffectPrior([])).toThrow(/no usable evidence/);
  });

  it('marks a no-evidence prior as an assumption and widens it', () => {
    const prior = buildEffectPrior([], { plannedEffect: 0.4 });
    expect(prior.basis).toBe('assumption');
    expect(prior.sd).toBeGreaterThanOrEqual(0.4 * 0.99);
    expect(prior.sources).toHaveLength(0);
    expect(prior.caveats.join(' ')).toMatch(/assumption, not data/i);
  });

  it('pools evidence by inverse variance and reports the sources', () => {
    const obs: EvidenceObservation[] = [
      { source: { kind: 'prior_data', source: 'NCT-A', ref: 'NCT-A' }, effect: 0.28, standardError: 0.08, n: 200 },
      { source: { kind: 'prior_data', source: 'NCT-B', ref: 'NCT-B' }, effect: 0.32, standardError: 0.08, n: 220 },
      { source: { kind: 'literature', source: 'Meta 2021', ref: 'doi:x' }, effect: 0.30, standardError: 0.10, n: 150 },
    ];
    const prior = buildEffectPrior(obs, { plannedEffect: 0.3 });
    expect(prior.basis).toBe('evidence');
    expect(prior.mean).toBeGreaterThan(0.27);
    expect(prior.mean).toBeLessThan(0.33);
    expect(prior.sources).toHaveLength(3);
    expect(prior.totalEvidenceN).toBe(570);
  });

  it('flags an optimistic planned effect against the evidence', () => {
    const obs: EvidenceObservation[] = [
      { source: { kind: 'prior_data', source: 'NCT-A' }, effect: 0.30, standardError: 0.06, n: 300 },
      { source: { kind: 'prior_data', source: 'NCT-B' }, effect: 0.30, standardError: 0.06, n: 300 },
    ];
    const prior = buildEffectPrior(obs, { plannedEffect: 0.6 });
    expect(prior.basis).toBe('evidence_with_assumption');
    expect(prior.mean).toBeLessThan(0.4); // tracks the evidence, not the optimistic 0.6
    expect(prior.caveats.join(' ')).toMatch(/optimistic/i);
  });

  it('widens the prior when sources disagree', () => {
    const agree = buildEffectPrior([
      { source: { kind: 'prior_data', source: 'A' }, effect: 0.30, standardError: 0.06 },
      { source: { kind: 'prior_data', source: 'B' }, effect: 0.30, standardError: 0.06 },
    ]);
    const disagree = buildEffectPrior([
      { source: { kind: 'prior_data', source: 'A' }, effect: 0.10, standardError: 0.06 },
      { source: { kind: 'prior_data', source: 'B' }, effect: 0.55, standardError: 0.06 },
    ]);
    expect(disagree.sd).toBeGreaterThan(agree.sd);
    expect((disagree.heterogeneity ?? 0)).toBeGreaterThan(agree.heterogeneity ?? 0);
  });
});

describe('simulateTrial — reproducibility and validity', () => {
  it('is reproducible: same inputs and seed give the identical report', () => {
    const design = baseDesign();
    const assumptions: SimulationAssumptions = { effectPrior: tightPrior(0.3, 0.06), nRuns: 4000, seed: 42, nPerArm: 150 };
    const a = simulateTrial(design, assumptions);
    const b = simulateTrial(design, assumptions);
    expect(a.summary.probabilityOfSuccess).toBe(b.summary.probabilityOfSuccess);
    expect(a.provenance.seed).toBe(b.provenance.seed);
    expect(a.provenance.inputsSha256).toBe(b.provenance.inputsSha256);
  });

  it('matches the closed-form assurance integral for the continuous case', () => {
    const design = baseDesign();
    const nPerArm = 150;
    const priorMean = 0.3;
    const priorSd = 0.07;
    const report = simulateTrial(design, {
      effectPrior: tightPrior(priorMean, priorSd),
      nRuns: 40000,
      seed: 7,
      nPerArm,
    });
    const quad = assuranceTwoSampleMeans({ priorMean, priorSd, nPerArm, alpha: 0.05, oneSided: true });
    // Monte Carlo assurance and the quadrature must agree within simulation error.
    expect(Math.abs(report.summary.probabilityOfSuccess - quad.assurance)).toBeLessThan(0.02);
    expect(Math.abs(report.summary.powerAtPriorMean - quad.powerAtPriorMean)).toBeLessThan(0.02);
  });

  it('holds its size: empirical type-I error under the null is near alpha', () => {
    const report = simulateTrial(baseDesign(), {
      effectPrior: tightPrior(0.3, 0.07),
      nRuns: 40000,
      seed: 11,
      nPerArm: 150,
    });
    expect(Math.abs(report.summary.typeIErrorUnderNull - 0.05)).toBeLessThan(0.01);
  });

  it('is honestly un-confident: a diffuse prior yields assurance below the point power', () => {
    const design = baseDesign();
    const report = simulateTrial(design, {
      // wide assumption prior at the same mean
      effectPrior: buildEffectPrior([], { plannedEffect: 0.3, assumptionSd: 0.3 }),
      nRuns: 20000,
      seed: 3,
      nPerArm: 150,
    });
    expect(report.assumptions.effectBasis).toBe('assumption');
    expect(report.summary.probabilityOfSuccess).toBeLessThan(report.summary.powerAtPriorMean);
    expect(report.assumptions.caveats.join(' ')).toMatch(/assumption, not data/i);
  });

  it('produces a monotonically increasing sensitivity curve', () => {
    const report = simulateTrial(baseDesign(), {
      effectPrior: tightPrior(0.3, 0.06),
      nRuns: 8000,
      seed: 5,
      nPerArm: 150,
    });
    const pos = report.sensitivity.map(s => s.probabilityOfSuccess);
    // PoS at the largest effect clearly exceeds PoS at zero effect.
    expect(pos[pos.length - 1]).toBeGreaterThan(pos[0] + 0.1);
    // No step drops by more than Monte Carlo noise.
    for (let i = 1; i < pos.length; i++) {
      expect(pos[i]).toBeGreaterThanOrEqual(pos[i - 1] - 0.03);
    }
  });
});

describe('simulateTrial — defensibility and refusals', () => {
  it('attaches the slice-1 gates and flags an indefensible design', () => {
    const broken = baseDesign();
    broken.estimands = []; // primary endpoint now has no estimand → critical finding
    const report = simulateTrial(broken, { effectPrior: tightPrior(0.3, 0.06), nRuns: 2000, seed: 1, nPerArm: 150 });
    expect(report.defensibility.blockingFindings).toBeGreaterThan(0);
    expect(report.defensibility.canAdvance).toBe(false);
  });

  it('refuses to simulate a single-arm / no-control design', () => {
    const single = baseDesign({
      framework: { inferentialFrame: 'superiority', structuralDesign: 'single_arm', controlType: 'none' },
    });
    expect(() => simulateTrial(single, { effectPrior: tightPrior(0.3, 0.06), nPerArm: 100 })).toThrow(/single-arm/i);
  });

  it('refuses to simulate without a sample size', () => {
    const noN = baseDesign();
    delete noN.statisticalPlan.plannedSampleSize;
    expect(() => simulateTrial(noN, { effectPrior: tightPrior(0.3, 0.06) })).toThrow(/sample size/i);
  });

  it('refuses to simulate a design with no primary endpoint', () => {
    const noPrimary = baseDesign();
    noPrimary.endpoints = [{ name: 'Sec', role: 'secondary', type: 'continuous', definition: 'x' }];
    expect(() => simulateTrial(noPrimary, { effectPrior: tightPrior(0.3, 0.06), nPerArm: 100 })).toThrow(/no primary endpoint/i);
  });
});

describe('simulateTrial — binary and time-to-event endpoints', () => {
  function withEndpoint(type: EndpointType, frame: InferentialFrame = 'superiority'): StudyDesign {
    const d = baseDesign();
    d.endpoints = [{ name: 'Primary', role: 'primary', type, definition: 'event', direction: 'decrease' }];
    d.framework = { inferentialFrame: frame, structuralDesign: 'parallel_group', controlType: 'placebo' };
    return d;
  }

  it('simulates a binary endpoint event-level and increases with the effect', () => {
    const design = withEndpoint('binary');
    const small = simulateTrial(design, { effectPrior: tightPrior(0.2, 0.05), nRuns: 8000, seed: 9, nPerArm: 250, controlEventRate: 0.3 });
    const large = simulateTrial(design, { effectPrior: tightPrior(0.9, 0.05), nRuns: 8000, seed: 9, nPerArm: 250, controlEventRate: 0.3 });
    expect(small.summary.estimatedEffect.scale).toMatch(/odds ratio/i);
    expect(small.summary.probabilityOfSuccess).toBeGreaterThan(0);
    expect(small.summary.probabilityOfSuccess).toBeLessThan(1);
    expect(large.summary.probabilityOfSuccess).toBeGreaterThan(small.summary.probabilityOfSuccess);
  });

  it('falls back to a normal approximation for binary with no control rate, and says so', () => {
    const report = simulateTrial(withEndpoint('binary'), { effectPrior: tightPrior(0.5, 0.05), nRuns: 4000, seed: 9, nPerArm: 250 });
    expect(report.assumptions.caveats.join(' ')).toMatch(/normal approximation/i);
  });

  it('simulates a time-to-event endpoint when an event probability is supplied', () => {
    const report = simulateTrial(withEndpoint('time_to_event'), {
      effectPrior: tightPrior(0.3, 0.05),
      nRuns: 8000,
      seed: 13,
      nPerArm: 250,
      eventProbability: 0.6,
    });
    expect(report.summary.estimatedEffect.scale).toMatch(/hazard/i);
    expect(report.summary.probabilityOfSuccess).toBeGreaterThan(0);
    expect(report.summary.probabilityOfSuccess).toBeLessThan(1);
  });

  it('keeps its size for a non-inferiority frame at the margin', () => {
    const design = baseDesign({
      framework: { inferentialFrame: 'non_inferiority', structuralDesign: 'parallel_group', controlType: 'active', margin: 0.2 },
    });
    const report = simulateTrial(design, { effectPrior: tightPrior(0.0, 0.05), nRuns: 30000, seed: 17, nPerArm: 200 });
    // Null for NI is at effect = -margin; the empirical type-I error must be near alpha.
    expect(Math.abs(report.summary.typeIErrorUnderNull - 0.05)).toBeLessThan(0.012);
  });
});
