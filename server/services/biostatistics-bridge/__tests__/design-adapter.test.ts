/**
 * Design adapter — the one translation between the design-as-data spine and
 * the biostatistics engines.
 *
 * The property that matters: a design the SAP projection already considers
 * complete adapts into an input the REAL computation and judgment engines
 * accept and size, with no blocking gaps; a design missing what the engine
 * needs yields `input: null` and names the gap, never a number.
 */
import { describe, expect, it } from 'vitest';

import { computationEngine } from '../../ana-biostats/computation-engine';
import { judgmentEngine } from '../../ana-biostats/judgment-engine';
import type { StudyDesign } from '../../study-design/study-design-types';
import { projectSap } from '../../study-design/sap-projection';
import {
  applyPlanPatch,
  computationToPlanPatch,
  phaseLabel,
  regulatoryBodyForRegions,
  statisticalReadiness,
  studyDesignToStatisticalInput,
} from '../design-adapter';

/** The complete design the SAP-projection tests use, plus a target region. */
function completeDesign(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    targetRegions: ['US', 'EU'],
    objectives: [{ level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change' }],
    estimands: [
      {
        endpointName: 'HbA1c change',
        treatmentCondition: 'Drug X 10 mg daily versus placebo',
        population: 'all randomized patients (ITT)',
        variable: 'change from baseline in HbA1c at week 24',
        summaryMeasure: 'difference in means',
        strategy: 'treatment_policy',
        intercurrentEvents: [{ name: 'rescue medication', strategy: 'treatment_policy', justification: 'reflects the treatment-policy estimand' }],
      },
    ],
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c at week 24', timepoint: 'week 24' },
      { name: 'Weight change', role: 'key_secondary', type: 'continuous', definition: 'change from baseline in body weight at week 24' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with type 2 diabetes inadequately controlled on metformin',
      analysisPopulations: [
        { kind: 'ITT', definition: 'all randomized patients', isPrimaryAnalysisSet: true },
        { kind: 'Safety', definition: 'all patients who received any study drug' },
      ],
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
      power: 0.9,
      plannedSampleSize: 400,
      dropoutRate: 0.2,
      plannedAnalyses: [{ endpointName: 'HbA1c change', method: 'MMRM', estimandEndpointName: 'HbA1c change' }],
      multiplicity: { method: 'holm' },
      missingDataStrategy: 'multiple imputation under missing-at-random',
      sensitivityAnalysesSpecified: true,
      powerAssumptions: { effectSize: 0.4, variance: 0.25, evidence: [{ kind: 'prior_data', source: 'Phase 2 NCT01234567' }] },
    },
    safety: { aeDefinitions: 'MedDRA coding', dmcCharter: { present: true, meetingCadence: 'quarterly' } },
  };
}

describe('studyDesignToStatisticalInput — a complete design', () => {
  it('maps every statistical field the engine needs, with no blocking gap', () => {
    const { input, gaps, mapped } = studyDesignToStatisticalInput(completeDesign());
    expect(input).not.toBeNull();
    expect(gaps.filter((g) => g.severity === 'blocking')).toEqual([]);
    expect(input).toMatchObject({
      clientTrack: 'biotech_pharma',
      regulatoryBody: 'FDA',
      studyType: 'superiority',
      objectiveType: 'efficacy',
      endpointType: 'continuous',
      alpha: 0.05,
      powerTarget: 0.9,
      effectSize: 0.4,
      variance: 0.25,
      attritionRate: 0.2,
      allocationRatio: 1,
      comparatorType: 'placebo',
      numberOfGroups: 2,
      numberOfEndpoints: 2,
      multiplicityMethod: 'holm',
      estimandStrategy: 'treatment_policy',
      missingDataMethod: 'multiple_imputation',
      indication: 'type 2 diabetes',
      phase: 'Phase III',
    });
    for (const k of ['alpha', 'powerTarget', 'effectSize', 'variance', 'attritionRate', 'allocationRatio', 'regulatoryBody']) {
      expect(mapped).toContain(k);
    }
  });

  it('is accepted and sized by the real computation and judgment engines', () => {
    const { input } = studyDesignToStatisticalInput(completeDesign());
    const result = computationEngine.compute(input!);
    expect(result.sampleSize.total).toBeGreaterThan(0);
    expect(result.power).toBeGreaterThan(0.5);
    const judgment = judgmentEngine.judge(input!, result);
    expect(['adequate', 'marginal', 'inadequate', 'insufficient_information']).toContain(judgment.overallVerdict);
    expect(judgment.fragility).toBeDefined();
  });
});

describe('studyDesignToStatisticalInput — honest gaps', () => {
  it('refuses to size a design with no effect size (input null, blocking gap named)', () => {
    const d = completeDesign();
    d.statisticalPlan.powerAssumptions = { variance: 0.25 };
    const { input, gaps } = studyDesignToStatisticalInput(d);
    expect(input).toBeNull();
    const blocking = gaps.filter((g) => g.severity === 'blocking');
    expect(blocking.map((g) => g.field)).toContain('effectSize');
    expect(blocking[0].designPath).toBe('statisticalPlan.powerAssumptions.effectSize');
  });

  it('refuses a time-to-event design with no event rate', () => {
    const d = completeDesign();
    d.endpoints[0] = { name: 'OS', role: 'primary', type: 'time_to_event', definition: 'overall survival', eventDefinition: 'death from any cause' };
    d.estimands[0].endpointName = 'OS';
    d.statisticalPlan.powerAssumptions = { effectSize: 0.3 };
    const { input, gaps } = studyDesignToStatisticalInput(d);
    expect(input).toBeNull();
    expect(gaps.some((g) => g.field === 'eventRate' && g.severity === 'blocking')).toBe(true);
  });

  it('refuses a non-inferiority frame with no margin, and carries the margin when set', () => {
    const d = completeDesign();
    d.framework = { inferentialFrame: 'non_inferiority', structuralDesign: 'parallel_group', controlType: 'active' };
    const missing = studyDesignToStatisticalInput(d);
    expect(missing.input).toBeNull();
    expect(missing.gaps.some((g) => g.field === 'nonInferiorityMargin' && g.severity === 'blocking')).toBe(true);

    d.framework.margin = -0.3;
    const withMargin = studyDesignToStatisticalInput(d);
    expect(withMargin.input).toMatchObject({ studyType: 'non_inferiority', nonInferiorityMargin: -0.3, comparatorType: 'active' });
  });

  it('refuses a design with no primary endpoint', () => {
    const d = completeDesign();
    d.endpoints = d.endpoints.map((e) => ({ ...e, role: 'secondary' as const }));
    const { input, gaps } = studyDesignToStatisticalInput(d);
    expect(input).toBeNull();
    expect(gaps.some((g) => g.field === 'primaryEndpoint' && g.severity === 'blocking')).toBe(true);
  });

  it('reports every engine default it applied rather than applying it silently', () => {
    const d = completeDesign();
    d.statisticalPlan = { plannedAnalyses: [], powerAssumptions: { effectSize: 0.4, variance: 0.25 } };
    d.targetRegions = [];
    d.randomization = undefined;
    const { input, gaps } = studyDesignToStatisticalInput(d);
    expect(input).toMatchObject({ alpha: 0.05, powerTarget: 0.8, attritionRate: 0.15, allocationRatio: 1, regulatoryBody: 'FDA' });
    const defaulted = gaps.filter((g) => g.severity === 'defaulted').map((g) => g.field);
    expect(defaulted).toEqual(expect.arrayContaining(['alpha', 'powerTarget', 'attritionRate', 'allocationRatio', 'regulatoryBody']));
  });

  it('translates a one-sided alpha to the engine\'s two-sided boundary and says so', () => {
    const d = completeDesign();
    d.statisticalPlan.alpha = 0.025;
    d.statisticalPlan.oneSided = true;
    const { input, gaps } = studyDesignToStatisticalInput(d);
    expect(input?.alpha).toBeCloseTo(0.05);
    expect(gaps.some((g) => g.field === 'alpha' && g.severity === 'note')).toBe(true);
  });

  it('sizes a binary endpoint from the control rate plus the effect', () => {
    const d = completeDesign();
    d.endpoints[0] = { name: 'ORR', role: 'primary', type: 'binary', definition: 'objective response at week 12' };
    d.estimands[0].endpointName = 'ORR';
    d.statisticalPlan.powerAssumptions = { effectSize: 0.15, eventRate: 0.3 };
    const { input, gaps } = studyDesignToStatisticalInput(d);
    expect(gaps.filter((g) => g.severity === 'blocking')).toEqual([]);
    expect(input).toMatchObject({ endpointType: 'binary', controlRate: 0.3, treatmentRate: 0.45 });
  });

  it('maps product type and regions to the engine vocabularies', () => {
    expect(regulatoryBodyForRegions(['Japan'])).toBe('PMDA');
    expect(regulatoryBodyForRegions(['Mars'])).toBeUndefined();
    expect(phaseLabel('2b')).toBe('Phase IIb');
    expect(phaseLabel('FIH')).toContain('first-in-human');
    const ivd = completeDesign();
    ivd.productType = 'ivd';
    ivd.statisticalPlan.powerAssumptions = {};
    const { input } = studyDesignToStatisticalInput(ivd);
    expect(input).toMatchObject({ clientTrack: 'diagnostics_ivd', studyType: 'diagnostic_accuracy', endpointType: 'sensitivity_specificity' });
  });
});

describe('computationToPlanPatch / applyPlanPatch — the write-back', () => {
  it('writes the computed N, power and assumptions onto the design with a provenance stamp, preserving prior evidence', () => {
    const d = completeDesign();
    const { input } = studyDesignToStatisticalInput(d);
    const result = computationEngine.compute(input!);
    const patch = computationToPlanPatch(input!, result, { engine: 'c2c-stats', version: '1.0.0', inputsSha256: 'abc' });
    const next = applyPlanPatch(d, patch);

    expect(next).not.toBe(d);
    expect(d.statisticalPlan.plannedSampleSize).toBe(400); // untouched
    expect(next.statisticalPlan.plannedSampleSize).toBe(result.adjustedTotal ?? result.sampleSize.total);
    expect(next.statisticalPlan.power).toBe(result.power);
    expect(next.statisticalPlan.plannedAnalyses).toEqual(d.statisticalPlan.plannedAnalyses);
    const evidence = next.statisticalPlan.powerAssumptions?.evidence ?? [];
    expect(evidence.some((e) => e.kind === 'prior_data')).toBe(true);
    expect(evidence.some((e) => e.kind === 'assumption' && e.ref === 'sha256:abc')).toBe(true);

    // A second application supersedes the bridge stamp rather than stacking it.
    const again = applyPlanPatch(next, computationToPlanPatch(input!, result, { engine: 'c2c-stats', version: '1.0.0', inputsSha256: 'def' }));
    const stamps = (again.statisticalPlan.powerAssumptions?.evidence ?? []).filter((e) => e.kind === 'assumption');
    expect(stamps).toHaveLength(1);
    expect(stamps[0].ref).toBe('sha256:def');
  });

  it('the patched design still projects a SAP whose sample-size section is rendered, not missing', () => {
    const d = completeDesign();
    d.statisticalPlan.plannedSampleSize = undefined;
    const { input } = studyDesignToStatisticalInput(d);
    const result = computationEngine.compute(input!);
    const next = applyPlanPatch(d, computationToPlanPatch(input!, result));
    const sap = projectSap(next);
    const sizing = sap.sections.find((s) => /sample size/i.test(s.title));
    expect(sizing).toBeDefined();
    expect(sizing!.status).not.toBe('missing');
  });
});

describe('statisticalReadiness — the list-row summary', () => {
  it('scores a complete design high and reports its headline numbers', () => {
    const r = statisticalReadiness(completeDesign());
    expect(r.percent).toBeGreaterThanOrEqual(90);
    expect(r).toMatchObject({ plannedSampleSize: 400, power: 0.9, alpha: 0.05, primaryEndpoint: 'HbA1c change' });
    expect(r.checks.every((c) => typeof c.label === 'string')).toBe(true);
  });

  it('scores an empty plan low and names the fix for every failed check', () => {
    const d = completeDesign();
    d.statisticalPlan = { plannedAnalyses: [] };
    d.estimands = [];
    const r = statisticalReadiness(d);
    expect(r.percent).toBeLessThan(40);
    for (const c of r.checks.filter((x) => !x.ok)) expect(c.hint).toBeTruthy();
    expect(r.checks.find((c) => c.key === 'estimand')?.ok).toBe(false);
  });

  it('only counts checks that apply (no margin check on a superiority design, one on non-inferiority)', () => {
    const sup = statisticalReadiness(completeDesign());
    expect(sup.checks.some((c) => c.key === 'margin')).toBe(false);
    const d = completeDesign();
    d.framework = { inferentialFrame: 'non_inferiority', structuralDesign: 'parallel_group', controlType: 'active', margin: -0.3 };
    const ni = statisticalReadiness(d);
    const margin = ni.checks.find((c) => c.key === 'margin');
    expect(margin?.ok).toBe(false); // margin set but not justified
  });
});
