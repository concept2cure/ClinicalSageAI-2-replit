/**
 * Statistical review — the gate findings and the engine judgment become one
 * risk table with a defensibility verdict. Every row must be traceable to the
 * codes it rests on; an element with no finding reads as low risk with the
 * standard it meets, never as a blank.
 */
import { describe, expect, it } from 'vitest';

import { validateDesign } from '../../study-design/design-validation';
import type { StudyDesign } from '../../study-design/study-design-types';
import { computationEngine } from '../../ana-biostats/computation-engine';
import { judgmentEngine } from '../../ana-biostats/judgment-engine';
import { studyDesignToStatisticalInput } from '../design-adapter';
import { buildStatisticalReview, elementForCode, REVIEW_ELEMENTS } from '../statistical-review';

function design(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    targetRegions: ['US'],
    objectives: [{ level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change' }],
    estimands: [{
      endpointName: 'HbA1c change', treatmentCondition: 'Drug X versus placebo', population: 'all randomized (ITT)',
      variable: 'change from baseline in HbA1c at week 24', summaryMeasure: 'difference in means', strategy: 'treatment_policy',
      intercurrentEvents: [{ name: 'rescue medication', strategy: 'treatment_policy', justification: 'treatment-policy estimand' }],
    }],
    endpoints: [{ name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c at week 24' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with T2D', eligibility: [{ type: 'inclusion', text: 'HbA1c 7–10%' }],
      analysisPopulations: [{ kind: 'ITT', definition: 'all randomized', isPrimaryAnalysisSet: true }, { kind: 'Safety', definition: 'all treated' }],
    },
    arms: [{ name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational' }] }, { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] }],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double' },
    statisticalPlan: {
      alpha: 0.05, power: 0.9, plannedSampleSize: 400, dropoutRate: 0.2,
      plannedAnalyses: [{ endpointName: 'HbA1c change', method: 'MMRM' }],
      multiplicity: { method: 'none' },
      missingDataStrategy: 'multiple imputation under MAR with tipping-point sensitivity',
      sensitivityAnalysesSpecified: true,
      powerAssumptions: { effectSize: 0.4, variance: 0.25, evidence: [{ kind: 'prior_data', source: 'Phase 2' }] },
    },
  };
}

function review(d: StudyDesign) {
  const validation = validateDesign(d);
  const adapter = studyDesignToStatisticalInput(d);
  const computation = adapter.input ? computationEngine.compute(adapter.input) : null;
  const judgment = adapter.input && computation ? judgmentEngine.judge(adapter.input, computation) : null;
  return buildStatisticalReview({ validation, judgment, computation, input: adapter.input, gaps: adapter.gaps });
}

describe('buildStatisticalReview', () => {
  it('produces one row per element, in the review order, each traceable to codes', () => {
    const r = review(design());
    expect(r.rows.map((x) => x.element)).toEqual([...REVIEW_ELEMENTS]);
    for (const row of r.rows) {
      expect(['low', 'medium', 'high', 'critical']).toContain(row.risk);
      expect(row.finding.length).toBeGreaterThan(10);
      expect(row.action.length).toBeGreaterThan(5);
      expect(Array.isArray(row.codes)).toBe(true);
    }
  });

  it('a clean design reads low across the board with a low challenge likelihood', () => {
    const r = review(design());
    const nonLow = r.rows.filter((x) => x.risk !== 'low').map((x) => `${x.element}:${x.risk}:${x.codes.join('/')}`);
    expect(nonLow, 'unexpected risk rows: ' + nonLow.join(', ')).toEqual([]);
    expect(r.verdict.challengeLikelihood).toBe('low');
    expect(r.verdict.mostVulnerable).toBeNull();
    expect(r.verdict.recommendedActions).toEqual([]);
    expect(r.rows.find((x) => x.element === 'Sample size')!.finding).toMatch(/Sized at \d+ subjects/);
  });

  it('routes each gate code to its element', () => {
    expect(elementForCode('EST-001')).toBe('Primary endpoint');
    expect(elementForCode('EPT-003')).toBe('Primary endpoint');
    expect(elementForCode('FRM-001')).toBe('Design framework');
    expect(elementForCode('FRM-003')).toBe('Populations');
    expect(elementForCode('PWR-002')).toBe('Sample size');
    expect(elementForCode('MUL-001')).toBe('Multiplicity');
    expect(elementForCode('MTH-002')).toBe('Analysis methods');
    expect(elementForCode('MIS-002')).toBe('Missing data');
    expect(elementForCode('POP-003')).toBe('Populations');
    expect(elementForCode('INT-001')).toBe('Interim analysis');
  });

  it('LOCF without sensitivity analyses is a high-risk missing-data row with the fix named', () => {
    const d = design();
    d.statisticalPlan.missingDataStrategy = 'LOCF';
    d.statisticalPlan.sensitivityAnalysesSpecified = false;
    const r = review(d);
    const row = r.rows.find((x) => x.element === 'Missing data')!;
    expect(row.risk).toBe('high');
    expect(row.codes).toContain('MIS-002');
    expect(row.action).toMatch(/MMRM|multiple imputation/);
    expect(r.verdict.challengeLikelihood).toBe('moderate');
    expect(r.verdict.recommendedActions.some((a) => a.startsWith('Missing data:'))).toBe(true);
  });

  it('interims with no spending function make the verdict high and name the element', () => {
    const d = design();
    d.statisticalPlan.interim = { informationFractions: [0.5, 1] };
    const r = review(d);
    const row = r.rows.find((x) => x.element === 'Interim analysis')!;
    expect(row.risk).toBe('critical');
    expect(row.codes).toEqual(expect.arrayContaining(['INT-001', 'INT-004']));
    expect(r.overallRisk).toBe('critical');
    expect(r.verdict.challengeLikelihood).toBe('high');
    expect(r.verdict.mostVulnerable).toBe('Interim analysis');
  });

  it('a design the engine cannot size is a high-risk sample-size row naming the blocking gap', () => {
    const d = design();
    d.statisticalPlan.powerAssumptions = { evidence: [{ kind: 'prior_data', source: 'Phase 2' }] };
    const r = review(d);
    const row = r.rows.find((x) => x.element === 'Sample size')!;
    expect(['high', 'critical']).toContain(row.risk);
    expect(row.finding).toMatch(/could not be sized/);
  });

  it('the engine judgment can only raise sample-size risk, never lower a gate finding', () => {
    const d = design();
    d.statisticalPlan.power = 0.7; // PWR-002 underpowered → high from the gate
    const r = review(d);
    const row = r.rows.find((x) => x.element === 'Sample size')!;
    expect(row.codes).toContain('PWR-002');
    expect(['high', 'critical']).toContain(row.risk);
  });
});
