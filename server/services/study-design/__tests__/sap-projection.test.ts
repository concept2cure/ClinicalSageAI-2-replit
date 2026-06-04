/**
 * Tests for the SAP skeleton projection (ICH E9 / E9(R1)). The SAP is a deterministic projection
 * of the design object in conventional section order: a complete design renders every section, an
 * incomplete one is marked partial/missing with explicit gaps (never fabricated analysis), and the
 * objectives-and-estimands section reuses the exact renderer the protocol uses so the two agree.
 */

import { describe, it, expect } from 'vitest';
import { projectSap } from '../sap-projection';
import { renderEstimandSection } from '../../estimand-sap-section';
import { type StudyDesign } from '../study-design-types';

function sapDesign(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
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
      multiplicity: { method: 'none' },
      missingDataStrategy: 'multiple imputation under missing-at-random',
      sensitivityAnalysesSpecified: true,
      powerAssumptions: { effectSize: 0.4, variance: 0.25, evidence: [{ kind: 'prior_data', source: 'Phase 2 NCT01234567' }] },
    },
    safety: { aeDefinitions: 'MedDRA coding', dmcCharter: { present: true, meetingCadence: 'quarterly' } },
  };
}

function clone(d: StudyDesign): StudyDesign {
  return JSON.parse(JSON.stringify(d));
}

function section(doc: ReturnType<typeof projectSap>, number: string) {
  return doc.sections.find(s => s.number === number)!;
}

describe('projectSap', () => {
  it('is deterministic', () => {
    const d = sapDesign();
    expect(projectSap(d)).toEqual(projectSap(d));
  });

  it('projects a SAP in ICH E9 section order', () => {
    const doc = projectSap(sapDesign());
    expect(doc.standard).toBe('ICH E9 / E9(R1)');
    expect(doc.projectedFromObject).toBe(true);
    expect(doc.sections.map(s => s.number)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
    expect(doc.title).toMatch(/Statistical analysis plan/i);
  });

  it('reuses the protocol estimand renderer verbatim', () => {
    const d = sapDesign();
    const doc = projectSap(d);
    const expected = renderEstimandSection(d.estimands).text;
    expect(section(doc, '2').content).toContain(expected);
  });

  it('scores a complete design as fully complete', () => {
    const doc = projectSap(sapDesign());
    expect(doc.completeness.total).toBe(12);
    expect(doc.completeness.percent).toBe(100);
  });

  it('defers the sample size honestly when the assumptions are absent, never fabricating them', () => {
    const d = clone(sapDesign());
    delete d.statisticalPlan.powerAssumptions;
    const sec = section(projectSap(d), '6');
    expect(sec.status).toBe('partial');
    expect(sec.content).toMatch(/not specified|must state/i);
    expect(sec.gaps.join(' ')).toMatch(/assumptions/i);
  });

  it('flags a missing missing-data strategy and ties it to the estimand', () => {
    const d = clone(sapDesign());
    delete d.statisticalPlan.missingDataStrategy;
    const sec = section(projectSap(d), '10');
    expect(sec.status).toBe('missing');
    expect(sec.gaps.join(' ')).toMatch(/estimand/i);
  });

  it('states no adjustment for a single confirmatory endpoint', () => {
    expect(section(projectSap(sapDesign()), '8').content).toMatch(/no multiplicity adjustment/i);
  });

  it('flags an uncontrolled testing hierarchy', () => {
    const d = clone(sapDesign());
    d.endpoints.push({ name: 'body weight change', role: 'key_secondary', type: 'continuous', definition: 'change from baseline in body weight' });
    const sec = section(projectSap(d), '8');
    expect(sec.status).toBe('partial');
    expect(sec.gaps.join(' ')).toMatch(/family-wise/i);
  });

  it('flags non-inferiority without a per-protocol primary set', () => {
    const d = clone(sapDesign());
    d.framework = { inferentialFrame: 'non_inferiority', structuralDesign: 'parallel_group', controlType: 'active', margin: 0.1 };
    const sec = section(projectSap(d), '4');
    expect(sec.gaps.join(' ')).toMatch(/per-protocol/i);
  });

  it('marks safety missing rather than inventing it', () => {
    const d = clone(sapDesign());
    delete d.safety;
    expect(section(projectSap(d), '12').status).toBe('missing');
  });
});
