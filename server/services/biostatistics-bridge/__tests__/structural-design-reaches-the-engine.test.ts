/**
 * A protocol's structural design reaches the sizing (2026-10-11).
 *
 * `studyTypeFor` maps five StructuralDesign members — single_arm, adaptive,
 * basket, platform, dose_ranging — and every other one fell through to
 * `superiority`. Nothing else in the adapter read `framework.structuralDesign`.
 * So a protocol that declares a 2×2 CROSSOVER was adapted into a plain
 * two-parallel-group input and came back sized as one: for d = 0.5, ρ = 0.5
 * that is ~128 subjects where the crossover needs 32. The caller got a number,
 * the design had said it was a crossover, and no gap mentioned it.
 *
 * The engine's crossover method existed and was reference-pinned the whole
 * time (`tests/biostat/ana-sizing-reference.test.ts`), reachable only from its
 * own unit test.
 *
 * These cases are about the TRANSLATION, so they assert what the adapter
 * passes and what it refuses, not the arithmetic — that is pinned where the
 * formula lives.
 */
import { describe, expect, it } from 'vitest';

import type { StudyDesign } from '../../study-design/study-design-types';
import { studyDesignToStatisticalInput } from '../design-adapter';

/** A continuous-endpoint design the adapter sizes without blocking gaps. */
function crossoverDesign(): StudyDesign {
  return {
    title: 'A two-period crossover study of Drug X in type 2 diabetes',
    phase: '2',
    indication: 'type 2 diabetes',
    productType: 'drug',
    targetRegions: ['US'],
    objectives: [{ level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change' }],
    estimands: [
      {
        endpointName: 'HbA1c change',
        treatmentCondition: 'Drug X 10 mg daily versus placebo',
        population: 'all randomized patients (ITT)',
        variable: 'change from baseline in HbA1c at week 12',
        summaryMeasure: 'difference in means',
        strategy: 'treatment_policy',
        intercurrentEvents: [],
      },
    ],
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c at week 12', timepoint: 'week 12' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'crossover', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with type 2 diabetes',
      analysisPopulations: [{ kind: 'ITT', definition: 'all randomized patients', isPrimaryAnalysisSet: true }],
      eligibility: [{ type: 'inclusion', text: 'HbA1c 7.0–10.0% at screening' }],
    },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg', route: 'oral' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double' },
    statisticalPlan: {
      alpha: 0.05,
      oneSided: false,
      power: 0.8,
      dropoutRate: 0.1,
      plannedAnalyses: [{ endpointName: 'HbA1c change', method: 'MMRM', estimandEndpointName: 'HbA1c change' }],
      powerAssumptions: { effectSize: 0.5, variance: 1 },
    },
  } as unknown as StudyDesign;
}

const withRho = (d: StudyDesign, rho: number): StudyDesign => {
  d.statisticalPlan.mmrmAssumptions = {
    endpointName: 'HbA1c change',
    visits: 2,
    covariance: 'compound_symmetry',
    rho,
    sigma: 1,
    delta: 0.5,
    retention: [1, 0.9],
  };
  return d;
};

describe('a crossover design is adapted as a crossover', () => {
  it('passes the periods and the correlation the plan records', () => {
    const { input, mapped } = studyDesignToStatisticalInput(withRho(crossoverDesign(), 0.5));
    expect(input).not.toBeNull();
    expect(input?.crossoverPeriods).toBe(2);
    expect(input?.withinSubjectCorrelation).toBe(0.5);
    expect(mapped).toContain('crossoverPeriods');
    expect(mapped).toContain('withinSubjectCorrelation');
  });

  it('discloses that the correlation was recorded for a different analysis', () => {
    const { gaps } = studyDesignToStatisticalInput(withRho(crossoverDesign(), 0.5));
    const g = gaps.find((x) => x.field === 'withinSubjectCorrelation');
    expect(g?.severity).toBe('defaulted');
    expect(g?.message).toMatch(/MMRM/);
    expect(g?.designPath).toBe('statisticalPlan.mmrmAssumptions.rho');
  });

  it('names the carryover assumption the sizing does not verify', () => {
    const { gaps } = studyDesignToStatisticalInput(withRho(crossoverDesign(), 0.5));
    expect(gaps.some((g) => g.field === 'carryover' && /washout/i.test(g.message))).toBe(true);
  });

  it('refuses rather than sizing it as parallel groups when no correlation is recorded', () => {
    const { input, gaps } = studyDesignToStatisticalInput(crossoverDesign());
    expect(input).toBeNull();
    const g = gaps.find((x) => x.field === 'withinSubjectCorrelation');
    expect(g?.severity).toBe('blocking');
    expect(g?.message).toMatch(/1 − ρ|1 - ρ/);
  });

  it('refuses a crossover whose primary endpoint is not continuous', () => {
    const d = withRho(crossoverDesign(), 0.5);
    d.endpoints[0].type = 'binary';
    const { input, gaps } = studyDesignToStatisticalInput(d);
    expect(input).toBeNull();
    expect(gaps.some((g) => g.severity === 'blocking' && /McNemar/.test(g.message))).toBe(true);
  });

  it('leaves a parallel-group design untouched', () => {
    const d = withRho(crossoverDesign(), 0.5);
    d.framework.structuralDesign = 'parallel_group';
    const { input, gaps } = studyDesignToStatisticalInput(d);
    expect(input?.crossoverPeriods).toBeUndefined();
    expect(input?.withinSubjectCorrelation).toBeUndefined();
    expect(gaps.some((g) => g.field === 'carryover')).toBe(false);
  });
});

describe('structural designs the engine has no method for say so', () => {
  it.each(['factorial', 'umbrella', 'mams'] as const)('reports %s as sized by the parallel two-group method', (structuralDesign) => {
    const d = withRho(crossoverDesign(), 0.5);
    d.framework.structuralDesign = structuralDesign;
    const { input, gaps } = studyDesignToStatisticalInput(d);
    // A figure is still produced — it is a defensible per-comparison starting
    // point — and the caveat travels with it.
    expect(input).not.toBeNull();
    const g = gaps.find((x) => x.field === 'studyType' && x.designPath === 'framework.structuralDesign');
    expect(g?.severity).toBe('defaulted');
    expect(g?.message).toMatch(/two parallel groups/);
  });
});
