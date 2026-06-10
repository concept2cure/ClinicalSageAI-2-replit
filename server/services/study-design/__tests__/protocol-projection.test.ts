/**
 * Tests for the ICH M11 protocol projection. The protocol is a deterministic projection
 * of the design object: a complete design renders most sections, an incomplete one is
 * marked partial/missing with explicit gaps (never filled with invented prose), and the
 * estimands match the SAP renderer.
 */

import { describe, it, expect } from 'vitest';
import { projectProtocol } from '../protocol-projection';
import { type StudyDesign } from '../study-design-types';

function completeDesign(overrides: Partial<StudyDesign> = {}): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
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
    endpoints: [{ name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c at week 24', timepoint: 'week 24' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with type 2 diabetes inadequately controlled on metformin',
      analysisPopulations: [{ kind: 'ITT', definition: 'all randomized patients', isPrimaryAnalysisSet: true }],
      eligibility: [
        { type: 'inclusion', text: 'HbA1c 7.0–10.0% at screening' },
        { type: 'exclusion', text: 'eGFR < 30' },
      ],
    },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg', route: 'oral' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double', stratificationFactors: ['baseline HbA1c'] },
    statisticalPlan: {
      alpha: 0.05,
      oneSided: false,
      power: 0.9,
      plannedSampleSize: 400,
      dropoutRate: 0.2,
      plannedAnalyses: [{ endpointName: 'HbA1c change', method: 'MMRM' }],
      multiplicity: { method: 'none' },
      missingDataStrategy: 'multiple imputation under MAR',
      sensitivityAnalysesSpecified: true,
    },
    safety: { aeDefinitions: 'per MedDRA', dmcCharter: { present: true, composition: '3 members', meetingCadence: 'quarterly' } },
    ...overrides,
  };
}

describe('projectProtocol', () => {
  it('projects an ICH M11-ordered protocol with a synopsis', () => {
    const doc = projectProtocol(completeDesign());
    expect(doc.standard).toBe('ICH M11');
    expect(doc.projectedFromObject).toBe(true);
    expect(doc.sections.map(s => s.number)).toEqual(['2', '3', '4', '5', '6', '7', '8', '9']);
    expect(doc.synopsis).toMatch(/phase 3/i);
    expect(doc.synopsis).toMatch(/type 2 diabetes/i);
    expect(doc.synopsis).toMatch(/HbA1c/);
  });

  it('renders trial design from the framework', () => {
    const doc = projectProtocol(completeDesign());
    const design = doc.sections.find(s => s.number === '4')!;
    expect(design.content).toMatch(/superiority/i);
    expect(design.content).toMatch(/parallel group/i);
    expect(design.content).toMatch(/placebo/i);
    expect(design.status).toBe('rendered');
  });

  it('reuses the SAP estimand renderer for objectives and estimands', () => {
    const doc = projectProtocol(completeDesign());
    const sec = doc.sections.find(s => s.number === '3')!;
    expect(sec.content).toMatch(/treatment-policy|treatment policy/i);
    expect(sec.content).toMatch(/difference in means/i);
    expect(sec.gaps).toHaveLength(0);
  });

  it('scores a complete design as highly complete', () => {
    const doc = projectProtocol(completeDesign());
    expect(doc.completeness.total).toBe(8);
    expect(doc.completeness.percent).toBeGreaterThanOrEqual(85);
  });

  it('flags a missing safety section rather than inventing one', () => {
    const d = completeDesign();
    delete d.safety;
    const doc = projectProtocol(d);
    const safety = doc.sections.find(s => s.number === '9')!;
    expect(safety.status).toBe('missing');
    expect(safety.content).toMatch(/not specified/i);
    expect(safety.gaps.length).toBeGreaterThan(0);
  });

  it('flags a non-inferiority frame with no margin as a gap', () => {
    const d = completeDesign();
    d.framework = { inferentialFrame: 'non_inferiority', structuralDesign: 'parallel_group', controlType: 'active' };
    const doc = projectProtocol(d);
    const design = doc.sections.find(s => s.number === '4')!;
    expect(design.status).toBe('partial');
    expect(design.gaps.join(' ')).toMatch(/margin/i);
  });

  it('lowers completeness when sections are missing', () => {
    const sparse: StudyDesign = {
      title: 'Sparse design',
      phase: '2',
      indication: 'x',
      objectives: [],
      estimands: [],
      endpoints: [{ name: 'E', role: 'primary', type: 'continuous', definition: 'd' }],
      framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
      population: { targetDescription: '', analysisPopulations: [], eligibility: [] },
      arms: [],
      statisticalPlan: { plannedAnalyses: [] },
    };
    const doc = projectProtocol(sparse);
    expect(doc.completeness.percent).toBeLessThan(60);
    expect(doc.completeness.missing).toBeGreaterThan(0);
  });
});
