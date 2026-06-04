/**
 * Tests for the Schedule of Activities (module spec §7). The SoA is a design node:
 * the projection renders the time-and-events grid deterministically and honestly (only
 * what the object holds, with gaps for what is missing), and the analysis runs the §7
 * checks — structural integrity, a baseline anchor, and whether the schedule actually
 * collects every confirmatory endpoint. The gate feeds those into validateDesign.
 */

import { describe, it, expect } from 'vitest';
import {
  projectScheduleOfActivities,
  analyzeScheduleOfActivities,
  summarizeSoaForProtocol,
} from '../schedule-of-activities';
import { projectProtocol } from '../protocol-projection';
import { validateDesign } from '../design-validation';
import { type StudyDesign, type ScheduleOfActivities } from '../study-design-types';

/** A structurally sound SoA that collects the HbA1c primary endpoint. */
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
      { id: 'V3', name: 'Week 12', epochId: 'e_trt', studyDay: 84, windowDays: 3, order: 2 },
      { id: 'V4', name: 'Week 24', epochId: 'e_trt', studyDay: 168, windowDays: 3, order: 3 },
      { id: 'V5', name: 'Follow-up', epochId: 'e_fu', studyDay: 196, order: 4 },
    ],
    activities: [
      { id: 'a_consent', name: 'Informed consent', category: 'administrative', order: 0 },
      { id: 'a_elig', name: 'Eligibility review', category: 'eligibility', order: 1 },
      { id: 'a_dose', name: 'Dispense study drug', category: 'drug_administration', order: 2 },
      { id: 'a_hba1c', name: 'HbA1c', category: 'efficacy', endpointNames: ['HbA1c change'], footnoteIds: ['a'], order: 3 },
      { id: 'a_ae', name: 'Adverse-event review', category: 'safety', order: 4 },
    ],
    cells: [
      { activityId: 'a_consent', visitId: 'V1', state: 'performed' },
      { activityId: 'a_elig', visitId: 'V1', state: 'performed' },
      { activityId: 'a_dose', visitId: 'V2', state: 'performed' },
      { activityId: 'a_dose', visitId: 'V3', state: 'performed' },
      { activityId: 'a_hba1c', visitId: 'V2', state: 'performed' },
      { activityId: 'a_hba1c', visitId: 'V3', state: 'performed' },
      { activityId: 'a_hba1c', visitId: 'V4', state: 'performed', footnoteIds: ['a'] },
      { activityId: 'a_ae', visitId: 'V2', state: 'performed' },
      { activityId: 'a_ae', visitId: 'V3', state: 'performed' },
      { activityId: 'a_ae', visitId: 'V4', state: 'performed' },
      { activityId: 'a_ae', visitId: 'V5', state: 'conditional' },
    ],
    footnotes: [
      { id: 'a', text: 'Central laboratory assessment.' },
      { id: 'z', text: 'Unreferenced footnote.' },
    ],
  };
}

/** A fully defensible design (clears every other gate) carrying the covering SoA. */
function defensibleDesign(): StudyDesign {
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
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c at week 24', isSurrogate: false, regulatoryAcceptance: 'accepted_precedent' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with type 2 diabetes inadequately controlled on metformin',
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
      power: 0.9,
      plannedSampleSize: 400,
      dropoutRate: 0.2,
      plannedAnalyses: [{ endpointName: 'HbA1c change', method: 'MMRM' }],
      multiplicity: { method: 'none' },
      sensitivityAnalysesSpecified: true,
      powerAssumptions: { effectSize: 0.4, priorPhaseObservedEffect: 0.5, historicalDropoutRate: 0.18, evidence: [{ kind: 'prior_data', source: 'Phase 2 NCT01234567' }] },
    },
    scheduleOfActivities: soa(),
  };
}

function clone(d: StudyDesign): StudyDesign {
  return JSON.parse(JSON.stringify(d));
}

function codes(design: StudyDesign): string[] {
  return analyzeScheduleOfActivities(design).map(i => i.code);
}

describe('projectScheduleOfActivities', () => {
  it('is deterministic', () => {
    const d = defensibleDesign();
    expect(projectScheduleOfActivities(d)).toEqual(projectScheduleOfActivities(d));
  });

  it('renders visits in column order, grouped into epoch spans', () => {
    const proj = projectScheduleOfActivities(defensibleDesign());
    expect(proj.present).toBe(true);
    expect(proj.visits.map(v => v.id)).toEqual(['V1', 'V2', 'V3', 'V4', 'V5']);
    expect(proj.epochs).toHaveLength(3);
    expect(proj.epochs[0].visitIds).toEqual(['V1']);
    expect(proj.epochs[1].visitIds).toEqual(['V2', 'V3', 'V4']);
  });

  it('orders rows by category then row order', () => {
    const proj = projectScheduleOfActivities(defensibleDesign());
    expect(proj.rows.map(r => r.activity.id)).toEqual(['a_consent', 'a_elig', 'a_dose', 'a_hba1c', 'a_ae']);
  });

  it('renders the sparse grid with marks and per-row scheduled counts', () => {
    const proj = projectScheduleOfActivities(defensibleDesign());
    const hba1c = proj.rows.find(r => r.activity.id === 'a_hba1c')!;
    expect(hba1c.cells).toHaveLength(5);
    expect(hba1c.cells[0]).toBeNull(); // V1 screening — not collected
    expect(hba1c.cells[1]?.mark).toBe('X'); // V2 baseline
    expect(hba1c.scheduledCount).toBe(3);
    const ae = proj.rows.find(r => r.activity.id === 'a_ae')!;
    expect(ae.cells[4]?.mark).toBe('C'); // V5 follow-up is conditional
    expect(proj.counts.scheduledCells).toBe(11);
  });

  it('resolves only the referenced footnotes, in definition order', () => {
    const proj = projectScheduleOfActivities(defensibleDesign());
    expect(proj.footnotes.map(f => f.id)).toEqual(['a']); // 'z' is defined but unreferenced
  });

  it('scores a sound, covering SoA as fully complete', () => {
    const proj = projectScheduleOfActivities(defensibleDesign());
    expect(proj.completeness).toEqual({ satisfied: 5, total: 5, percent: 100 });
    expect(proj.gaps).toHaveLength(0);
  });

  it('is empty with an explicit gap when no SoA is attached', () => {
    const d = clone(defensibleDesign());
    delete d.scheduleOfActivities;
    const proj = projectScheduleOfActivities(d);
    expect(proj.present).toBe(false);
    expect(proj.counts.visits).toBe(0);
    expect(proj.completeness.percent).toBe(0);
    expect(proj.gaps).toContain('No Schedule of Activities is attached.');
  });
});

describe('analyzeScheduleOfActivities — §7 checks', () => {
  it('returns no issues for a sound, covering SoA', () => {
    expect(analyzeScheduleOfActivities(defensibleDesign())).toEqual([]);
  });

  it('does not treat a missing SoA as a gate finding', () => {
    const d = clone(defensibleDesign());
    delete d.scheduleOfActivities;
    expect(analyzeScheduleOfActivities(d)).toEqual([]);
  });

  it('flags a visit that references an undefined epoch', () => {
    const d = clone(defensibleDesign());
    d.scheduleOfActivities!.visits[2].epochId = 'nope';
    expect(codes(d)).toContain('SOA-013');
  });

  it('flags cells that reference an undefined activity or visit', () => {
    const d = clone(defensibleDesign());
    d.scheduleOfActivities!.cells.push({ activityId: 'ghost', visitId: 'V2', state: 'performed' });
    expect(codes(d)).toContain('SOA-014');
  });

  it('flags duplicate ids', () => {
    const d = clone(defensibleDesign());
    d.scheduleOfActivities!.visits.push({ id: 'V2', name: 'dup', epochId: 'e_trt', order: 9 });
    expect(codes(d)).toContain('SOA-016');
  });

  it('flags an undefined footnote reference', () => {
    const d = clone(defensibleDesign());
    d.scheduleOfActivities!.activities[3].footnoteIds = ['q'];
    expect(codes(d)).toContain('SOA-015');
  });

  it('flags the absence of a baseline anchor visit as major', () => {
    const d = clone(defensibleDesign());
    for (const v of d.scheduleOfActivities!.visits) delete v.isBaseline;
    const issue = analyzeScheduleOfActivities(d).find(i => i.code === 'SOA-020');
    expect(issue?.severity).toBe('major');
  });

  it('flags a primary endpoint the schedule does not collect as major', () => {
    const d = clone(defensibleDesign());
    d.scheduleOfActivities!.activities[3].endpointNames = []; // HbA1c no longer collected
    const issue = analyzeScheduleOfActivities(d).find(i => i.code === 'SOA-030');
    expect(issue?.severity).toBe('major');
    expect(issue?.endpointName).toBe('HbA1c change');
  });

  it('flags an uncollected key-secondary endpoint as minor', () => {
    const d = clone(defensibleDesign());
    d.endpoints.push({ name: 'body weight change', role: 'key_secondary', type: 'continuous', definition: 'change from baseline in body weight' });
    const issue = analyzeScheduleOfActivities(d).find(i => i.code === 'SOA-031');
    expect(issue?.severity).toBe('minor');
  });

  it('flags an activity that names an endpoint the design does not declare', () => {
    const d = clone(defensibleDesign());
    d.scheduleOfActivities!.activities[3].endpointNames = ['Nonexistent endpoint'];
    expect(codes(d)).toContain('SOA-032');
  });

  it('flags an activity scheduled at no visit', () => {
    const d = clone(defensibleDesign());
    d.scheduleOfActivities!.activities.push({ id: 'a_orphan', name: 'Orphan procedure', category: 'safety', order: 9 });
    expect(codes(d)).toContain('SOA-040');
  });
});

describe('integration with validateDesign and the protocol projection', () => {
  it('a defensible design with a covering SoA stays low risk', () => {
    const report = validateDesign(defensibleDesign());
    expect(report.riskLevel).toBe('low');
    expect(report.canAdvance).toBe(true);
  });

  it('surfaces an uncovered primary endpoint in validateDesign', () => {
    const d = clone(defensibleDesign());
    d.scheduleOfActivities!.activities[3].endpointNames = [];
    const report = validateDesign(d);
    const finding = report.findings.find(f => f.code === 'SOA-030');
    expect(finding?.section).toBe('§7 Schedule of Activities');
    expect(report.riskLevel).toBe('high'); // major finding
  });

  it('renders protocol §7 from the SoA, listing where the primary is collected', () => {
    const summary = summarizeSoaForProtocol(defensibleDesign());
    expect(summary.content).toMatch(/5 visits/);
    expect(summary.content).toMatch(/HbA1c change/);
    expect(summary.content).toMatch(/Baseline, Week 12, Week 24/);
    expect(summary.gaps).toHaveLength(0);
  });

  it('marks protocol §7 rendered with an SoA and partial without one', () => {
    const withSoa = projectProtocol(defensibleDesign());
    expect(withSoa.sections.find(s => s.number === '7')!.status).toBe('rendered');

    const without = clone(defensibleDesign());
    delete without.scheduleOfActivities;
    const sec = projectProtocol(without).sections.find(s => s.number === '7')!;
    expect(sec.status).toBe('partial');
    expect(sec.gaps.join(' ')).toMatch(/No Schedule of Activities is attached/);
  });
});
