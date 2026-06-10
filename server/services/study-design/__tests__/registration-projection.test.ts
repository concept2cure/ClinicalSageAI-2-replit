/**
 * Tests for the registration projection (module spec §8). A registry record is a projection
 * of the design object: the scientific content is mapped deterministically (phase, masking,
 * allocation, intervention model, arm type, outcome measures), and a field the object does not
 * carry (sponsor, sex/age, dates, recruitment status, EU member states) is reported as a gap,
 * never invented. The same design feeds both ClinicalTrials.gov and EU CTIS, so they agree.
 */

import { describe, it, expect } from 'vitest';
import {
  projectRegistration,
  projectAllRegistrations,
  type RegistrationRecord,
  type RegistrationField,
} from '../registration-projection';
import { type StudyDesign } from '../study-design-types';

function regDesign(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    targetRegions: ['United States', 'Germany', 'France'],
    objectives: [{ level: 'primary', order: 1, text: 'Demonstrate superiority on HbA1c', endpointName: 'HbA1c change' }],
    estimands: [],
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c', timepoint: 'week 24' },
      { name: 'body weight change', role: 'key_secondary', type: 'continuous', definition: 'change from baseline in body weight', timepoint: 'week 24' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with type 2 diabetes',
      analysisPopulations: [{ kind: 'ITT', definition: 'all randomized' }],
      eligibility: [
        { type: 'inclusion', text: 'HbA1c 7.0–10.0%' },
        { type: 'exclusion', text: 'eGFR below 30' },
      ],
    },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double' },
    statisticalPlan: { alpha: 0.05, power: 0.9, plannedSampleSize: 400, plannedAnalyses: [] },
  };
}

function clone(d: StudyDesign): StudyDesign {
  return JSON.parse(JSON.stringify(d));
}

function fieldOf(rec: RegistrationRecord, name: string): RegistrationField | undefined {
  return rec.modules.flatMap(m => m.fields).find(f => f.name === name);
}

describe('projectRegistration — ClinicalTrials.gov', () => {
  it('is deterministic', () => {
    const d = regDesign();
    expect(projectRegistration(d, 'ctgov')).toEqual(projectRegistration(d, 'ctgov'));
  });

  it('maps phase, masking, model, allocation and condition', () => {
    const rec = projectRegistration(regDesign(), 'ctgov');
    expect(rec.registry).toBe('ClinicalTrials.gov');
    expect(fieldOf(rec, 'Phase')?.value).toBe('Phase 3');
    expect(fieldOf(rec, 'Masking')?.value).toBe('Double');
    expect(fieldOf(rec, 'Interventional model')?.value).toBe('Parallel assignment');
    expect(fieldOf(rec, 'Allocation')?.value).toBe('Randomized');
    expect(fieldOf(rec, 'Condition')?.value).toBe('type 2 diabetes');
    expect(fieldOf(rec, 'Enrollment (anticipated)')?.value).toBe('400');
  });

  it('renders arms with registry arm types and typed interventions', () => {
    const rec = projectRegistration(regDesign(), 'ctgov');
    const arms = fieldOf(rec, 'Arms / groups')!;
    expect(arms.value).toMatch(/Drug X \(Experimental\)/);
    expect(arms.value).toMatch(/Placebo \(Placebo comparator\)/);
    const interventions = fieldOf(rec, 'Interventions')!;
    expect(interventions.status).toBe('rendered');
    expect(interventions.value).toMatch(/Drug X \(Drug, investigational\)/);
  });

  it('renders the primary outcome with its time frame', () => {
    const rec = projectRegistration(regDesign(), 'ctgov');
    const primary = fieldOf(rec, 'Primary outcome measure')!;
    expect(primary.status).toBe('rendered');
    expect(primary.value).toMatch(/HbA1c change/);
    expect(primary.value).toMatch(/time frame: week 24/);
  });

  it('reports fields the design object cannot carry as gaps, never invented', () => {
    const rec = projectRegistration(regDesign(), 'ctgov');
    for (const name of ['Primary purpose', 'Responsible party / sponsor', 'Sex / gender', 'Age limits', 'Accepts healthy volunteers', 'Overall recruitment status', 'Study start date']) {
      const f = fieldOf(rec, name)!;
      expect(f.status).toBe('missing');
      expect(f.value).toBeNull();
      expect(f.required).toBe(true);
      expect(f.gap).toBeTruthy();
    }
    expect(rec.registrable).toBe(false);
    expect(rec.gaps.length).toBeGreaterThan(0);
    expect(rec.completeness.requiredRendered).toBeLessThan(rec.completeness.requiredTotal);
  });

  it('marks a primary outcome with no time frame as partial', () => {
    const d = clone(regDesign());
    delete d.endpoints[0].timepoint;
    const primary = fieldOf(projectRegistration(d, 'ctgov'), 'Primary outcome measure')!;
    expect(primary.status).toBe('partial');
    expect(primary.gap).toMatch(/time frame is missing/i);
  });

  it('marks interventions partial when the product type is unknown', () => {
    const d = clone(regDesign());
    delete d.productType;
    const interventions = fieldOf(projectRegistration(d, 'ctgov'), 'Interventions')!;
    expect(interventions.status).toBe('partial');
    expect(interventions.gap).toMatch(/productType/);
  });

  it('reports allocation N/A for a single-group design', () => {
    const d = clone(regDesign());
    d.framework.structuralDesign = 'single_arm';
    expect(fieldOf(projectRegistration(d, 'ctgov'), 'Allocation')?.value).toMatch(/single group/i);
  });
});

describe('projectRegistration — EU CTIS', () => {
  it('maps the EU trial phase and the concerned member states', () => {
    const rec = projectRegistration(regDesign(), 'ctis');
    expect(rec.registry).toBe('EU CTIS');
    expect(fieldOf(rec, 'Trial phase')?.value).toBe('Therapeutic confirmatory (Phase III)');
    const states = fieldOf(rec, 'Member state(s) concerned')!;
    expect(states.status).toBe('rendered');
    expect(states.value).toBe('Germany, France'); // United States is filtered out
  });

  it('derives controlled, randomised and blinding', () => {
    const rec = projectRegistration(regDesign(), 'ctis');
    expect(fieldOf(rec, 'Controlled')?.value).toBe('Yes');
    expect(fieldOf(rec, 'Randomised')?.value).toBe('Yes');
    expect(fieldOf(rec, 'Blinding')?.value).toBe('Double');
    expect(fieldOf(rec, 'Planned subjects (overall)')?.value).toBe('400');
  });

  it('gaps the member states when no EU member state is targeted', () => {
    const d = clone(regDesign());
    d.targetRegions = ['United States', 'Japan'];
    const states = fieldOf(projectRegistration(d, 'ctis'), 'Member state(s) concerned')!;
    expect(states.status).toBe('missing');
    expect(states.gap).toMatch(/member state/i);
  });

  it('reports sponsor and EU-specific enrollment as gaps', () => {
    const rec = projectRegistration(regDesign(), 'ctis');
    expect(fieldOf(rec, 'Sponsor')?.status).toBe('missing');
    expect(fieldOf(rec, 'Planned subjects (in the EU)')?.status).toBe('missing');
    expect(rec.registrable).toBe(false);
  });
});

describe('SoA-derived outcome timing', () => {
  it('reads the outcome time frame from the schedule when the endpoint has no timepoint', () => {
    const d = clone(regDesign());
    delete d.endpoints[0].timepoint; // no free-text timepoint on the primary
    d.scheduleOfActivities = {
      epochs: [{ id: 'e_trt', name: 'Treatment', kind: 'treatment', order: 0 }],
      visits: [
        { id: 'V2', name: 'Baseline', epochId: 'e_trt', studyDay: 1, isBaseline: true, order: 0 },
        { id: 'V4', name: 'Week 24', epochId: 'e_trt', studyDay: 168, order: 1 },
      ],
      activities: [{ id: 'a_hba1c', name: 'HbA1c', category: 'efficacy', endpointNames: ['HbA1c change'], order: 0 }],
      cells: [
        { activityId: 'a_hba1c', visitId: 'V2', state: 'performed' },
        { activityId: 'a_hba1c', visitId: 'V4', state: 'performed' },
      ],
    };
    const primary = fieldOf(projectRegistration(d, 'ctgov'), 'Primary outcome measure')!;
    expect(primary.status).toBe('rendered'); // no longer partial — the schedule supplies the time frame
    expect(primary.value).toMatch(/Week 24 \(day 168\)/);
  });

  it('still reports a partial outcome when neither a timepoint nor a schedule supplies the time frame', () => {
    const d = clone(regDesign());
    delete d.endpoints[0].timepoint; // and no SoA on regDesign
    const primary = fieldOf(projectRegistration(d, 'ctgov'), 'Primary outcome measure')!;
    expect(primary.status).toBe('partial');
  });
});

describe('projectAllRegistrations', () => {
  it('projects both registries from one design', () => {
    const both = projectAllRegistrations(regDesign());
    expect(both.ctgov.registry).toBe('ClinicalTrials.gov');
    expect(both.ctis.registry).toBe('EU CTIS');
    // The condition is the same object in both — they cannot disagree.
    expect(fieldOf(both.ctgov, 'Condition')?.value).toBe('type 2 diabetes');
    expect(fieldOf(both.ctis, 'Medical condition')?.value).toBe('type 2 diabetes');
  });
});
