/**
 * Tests for the CRF shell projection. The blank CRF is built from the Schedule of Activities:
 * each scheduled assessment becomes a form at the visits the SoA places it at, and each endpoint
 * an activity collects becomes its data items. Standard CDASH domains (demographics, concomitant
 * medications) are clearly-marked scaffolds; an activity with no endpoint link yields placeholder
 * items, never invented ones. Deterministic.
 */

import { describe, it, expect } from 'vitest';
import { projectCrfShell, type CrfForm } from '../crf-shell';
import { type StudyDesign, type ScheduleOfActivities } from '../study-design-types';

function soa(): ScheduleOfActivities {
  return {
    epochs: [
      { id: 'e_scr', name: 'Screening', kind: 'screening', order: 0 },
      { id: 'e_trt', name: 'Treatment', kind: 'treatment', order: 1 },
      { id: 'e_fu', name: 'Follow-up', kind: 'follow_up', order: 2 },
    ],
    visits: [
      { id: 'V1', name: 'Screening', epochId: 'e_scr', studyDay: -14, order: 0 },
      { id: 'V2', name: 'Baseline', epochId: 'e_trt', studyDay: 1, isBaseline: true, order: 1 },
      { id: 'V3', name: 'Week 12', epochId: 'e_trt', studyDay: 84, order: 2 },
      { id: 'V4', name: 'Week 24', epochId: 'e_trt', studyDay: 168, order: 3 },
      { id: 'V5', name: 'Follow-up', epochId: 'e_fu', studyDay: 196, order: 4 },
    ],
    activities: [
      { id: 'a_consent', name: 'Informed consent', category: 'administrative', order: 0 },
      { id: 'a_elig', name: 'Eligibility review', category: 'eligibility', order: 1 },
      { id: 'a_dose', name: 'Dispense study drug', category: 'drug_administration', order: 2 },
      { id: 'a_hba1c', name: 'HbA1c', category: 'efficacy', endpointNames: ['HbA1c change'], order: 3 },
      { id: 'a_ae', name: 'Adverse-event review', category: 'safety', order: 4 },
    ],
    cells: [
      { activityId: 'a_consent', visitId: 'V1', state: 'performed' },
      { activityId: 'a_elig', visitId: 'V1', state: 'performed' },
      { activityId: 'a_dose', visitId: 'V2', state: 'performed' },
      { activityId: 'a_dose', visitId: 'V3', state: 'performed' },
      { activityId: 'a_hba1c', visitId: 'V2', state: 'performed' },
      { activityId: 'a_hba1c', visitId: 'V3', state: 'performed' },
      { activityId: 'a_hba1c', visitId: 'V4', state: 'performed' },
      { activityId: 'a_ae', visitId: 'V2', state: 'performed' },
      { activityId: 'a_ae', visitId: 'V3', state: 'performed' },
      { activityId: 'a_ae', visitId: 'V4', state: 'performed' },
      { activityId: 'a_ae', visitId: 'V5', state: 'performed' },
    ],
  };
}

function crfDesign(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    objectives: [{ level: 'primary', order: 1, text: 'Superiority on HbA1c', endpointName: 'HbA1c change' }],
    estimands: [],
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c', measurementMethod: 'central laboratory', timepoint: 'week 24' },
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
    safety: { aeDefinitions: 'graded per MedDRA', dmcCharter: { present: true } },
    scheduleOfActivities: soa(),
  };
}

function clone(d: StudyDesign): StudyDesign {
  return JSON.parse(JSON.stringify(d));
}

function byActivity(forms: CrfForm[], id: string): CrfForm | undefined {
  return forms.find(f => f.sourceActivityId === id);
}

function byDomain(forms: CrfForm[], domain: string): CrfForm | undefined {
  return forms.find(f => f.cdashDomain === domain);
}

describe('projectCrfShell', () => {
  it('is deterministic', () => {
    const d = crfDesign();
    expect(projectCrfShell(d)).toEqual(projectCrfShell(d));
  });

  it('emits demographics and concomitant medications as marked standard scaffolds', () => {
    const shell = projectCrfShell(crfDesign());
    const dm = byDomain(shell.forms, 'DM')!;
    const cm = byDomain(shell.forms, 'CM')!;
    expect(dm.origin).toBe('standard');
    expect(cm.origin).toBe('standard');
    expect(dm.note).toMatch(/standard/i);
  });

  it('builds the eligibility CRF from the design criteria, scheduled at screening', () => {
    const ie = byDomain(projectCrfShell(crfDesign()).forms, 'IE')!;
    expect(ie.origin).toBe('design');
    expect(ie.items).toHaveLength(3); // two criteria + overall eligibility
    expect(ie.visitIds).toEqual(['V1']);
  });

  it('makes a form per assessment activity, with endpoint-derived items at the scheduled visits', () => {
    const shell = projectCrfShell(crfDesign());
    const hba1c = byActivity(shell.forms, 'a_hba1c')!;
    expect(hba1c.origin).toBe('design');
    expect(hba1c.visitIds).toEqual(['V2', 'V3', 'V4']);
    expect(hba1c.items).toHaveLength(1);
    expect(hba1c.items[0].type).toBe('number');
    expect(hba1c.items[0].derivedFrom).toBe('endpoint:HbA1c change');
    expect(hba1c.sourceEndpointNames).toEqual(['HbA1c change']);
  });

  it('does not give safety, eligibility or administrative activities their own forms', () => {
    const shell = projectCrfShell(crfDesign());
    expect(byActivity(shell.forms, 'a_ae')).toBeUndefined();
    expect(byActivity(shell.forms, 'a_elig')).toBeUndefined();
    expect(byActivity(shell.forms, 'a_consent')).toBeUndefined();
  });

  it('does not duplicate exposure when a drug-administration activity exists', () => {
    const shell = projectCrfShell(crfDesign());
    expect(shell.forms.find(f => f.name === 'Study treatment exposure')).toBeUndefined();
    const dose = byActivity(shell.forms, 'a_dose')!;
    expect(dose.items.some(i => i.cdashVar === 'EXTRT')).toBe(true);
    expect(dose.visitIds).toEqual(['V2', 'V3']);
  });

  it('grounds the adverse-events form in the safety design and schedules it at the safety visits', () => {
    const ae = byDomain(projectCrfShell(crfDesign()).forms, 'AE')!;
    expect(ae.origin).toBe('design');
    expect(ae.visitIds).toEqual(['V2', 'V3', 'V4', 'V5']);
    expect(ae.note).toMatch(/MedDRA/);
  });

  it('counts forms and scores grounding completeness', () => {
    const shell = projectCrfShell(crfDesign());
    expect(shell.counts.forms).toBe(6);
    expect(shell.counts.designDerivedForms).toBe(4);
    expect(shell.counts.standardScaffoldForms).toBe(2);
    expect(shell.counts.visitScheduledForms).toBe(5);
    expect(shell.completeness).toEqual({ satisfied: 5, total: 5, percent: 100 });
  });
});

describe('endpoint item typing', () => {
  function hba1cItems(mutate: (d: StudyDesign) => void) {
    const d = clone(crfDesign());
    mutate(d);
    return byActivity(projectCrfShell(d).forms, 'a_hba1c')!.items;
  }

  it('maps a binary endpoint to a boolean item', () => {
    const items = hba1cItems(d => { d.endpoints[0].type = 'binary'; });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('boolean');
  });

  it('maps a time-to-event endpoint to an occurred flag and an event date', () => {
    const items = hba1cItems(d => {
      d.endpoints[0].type = 'time_to_event';
      d.endpoints[0].eventDefinition = 'cardiovascular death';
    });
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe('boolean');
    expect(items[0].prompt).toMatch(/cardiovascular death/);
    expect(items[1].type).toBe('date');
  });

  it('maps a composite endpoint to one item per component', () => {
    const items = hba1cItems(d => {
      d.endpoints[0].type = 'composite';
      d.endpoints[0].compositeComponents = ['death', 'myocardial infarction'];
    });
    expect(items).toHaveLength(2);
    expect(items.every(i => i.type === 'boolean')).toBe(true);
  });

  it('flags a patient-reported endpoint with no validated instrument as a placeholder', () => {
    const items = hba1cItems(d => { d.endpoints[0].type = 'patient_reported'; });
    expect(items[0].placeholder).toBe(true);
  });
});

describe('honest gaps', () => {
  it('flags an activity with no endpoint link as a placeholder, with a gap', () => {
    const d = clone(crfDesign());
    d.scheduleOfActivities!.activities.push({ id: 'a_ecg', name: '12-lead ECG', category: 'efficacy', order: 5 });
    d.scheduleOfActivities!.cells.push({ activityId: 'a_ecg', visitId: 'V3', state: 'performed' });
    const shell = projectCrfShell(d);
    const ecg = byActivity(shell.forms, 'a_ecg')!;
    expect(ecg.items.some(i => i.placeholder)).toBe(true);
    expect(ecg.note).toMatch(/placeholder/i);
    expect(shell.gaps.join(' ')).toMatch(/12-lead ECG/);
  });

  it('falls back to one form per endpoint and emits exposure when no SoA is attached', () => {
    const d = clone(crfDesign());
    delete d.scheduleOfActivities;
    const shell = projectCrfShell(d);
    expect(shell.forms.find(f => f.name === 'HbA1c change assessment')).toBeDefined();
    expect(shell.forms.find(f => f.name === 'Study treatment exposure')).toBeDefined();
    expect(shell.gaps.join(' ')).toMatch(/not visit-scheduled/);
    expect(shell.completeness.satisfied).toBe(4); // grounding loses the SoA point
  });
});
