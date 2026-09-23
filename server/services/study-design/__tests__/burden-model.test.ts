/**
 * Tests for the participant-burden / protocol-complexity engine.
 *
 * Two properties are under test and the second matters more than the first:
 *
 *  1. The counts are right — visits, procedures, peak visit load, per-visit
 *     breakdown, the complexity indicators, and the delta between two designs.
 *  2. A measure the Schedule of Activities cannot support is ABSENT and says so.
 *     It never degrades to zero, because a zero reads as "no burden" when what is
 *     true is "not known". The honesty proof at the bottom of this file removes one
 *     activity's duration from a fixture that otherwise computes a total and shows
 *     the total go `not_computable` with a null value rather than shrink.
 */

import { describe, it, expect } from 'vitest';
import {
  computeBurdenProfile,
  type BurdenMatrix,
  type BurdenActivityInput,
} from '../burden-model';
import {
  burdenMatrixFromDesign,
  burdenMatrixFromProtocolSoaMatrix,
  burdenProfileForDesign,
} from '../burden-adapters';
import { compareBurden } from '../burden-delta';
import { buildSoaMatrix } from '../../protocol-soa/protocol-soa-logic';
import { type StudyDesign, type ScheduleOfActivities } from '../study-design-types';

// ─── fixtures ────────────────────────────────────────────────────────────────

/** Five visits, five activities, eleven scheduled cells. Mirrors the §7 test fixture. */
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
      { activityId: 'a_ae', visitId: 'V5', state: 'conditional' },
    ],
  };
}

/** `null` means the design carries no schedule at all (a default parameter would not). */
function design(schedule: ScheduleOfActivities | null = soa()): StudyDesign {
  return {
    title: 'A 24-week trial',
    phase: '3',
    indication: 'Type 2 diabetes',
    objectives: [],
    estimands: [],
    endpoints: [
      { name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'Change from baseline in HbA1c' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: 'Adults', analysisPopulations: [], eligibility: [] },
    arms: [
      { name: 'Treatment', interventions: [] },
      { name: 'Placebo', interventions: [] },
    ],
    statisticalPlan: { plannedAnalyses: [] },
    scheduleOfActivities: schedule ?? undefined,
  };
}

/** A bare matrix builder for the cases that do not need a whole design. */
function matrix(over: Partial<BurdenMatrix> = {}): BurdenMatrix {
  return {
    source: 'test',
    visits: [
      { id: 'V1', name: 'Visit 1', studyDay: 1, unscheduled: false },
      { id: 'V2', name: 'Visit 2', studyDay: 8, unscheduled: false },
    ],
    activities: [
      { id: 'A1', name: 'Vitals', category: 'safety' },
      { id: 'A2', name: 'ECG', category: 'safety' },
    ],
    cells: [
      { activityId: 'A1', visitId: 'V1', state: 'performed' },
      { activityId: 'A2', visitId: 'V1', state: 'performed' },
      { activityId: 'A1', visitId: 'V2', state: 'performed' },
    ],
    armCount: 2,
    ...over,
  };
}

/** The same two activities, each carrying a participant duration. */
function timedActivities(): BurdenActivityInput[] {
  return [
    { id: 'A1', name: 'Vitals', category: 'safety', participantMinutes: 10 },
    { id: 'A2', name: 'ECG', category: 'safety', participantMinutes: 20 },
  ];
}

// ─── counts ──────────────────────────────────────────────────────────────────

describe('computeBurdenProfile — a realistic multi-visit design', () => {
  const profile = burdenProfileForDesign(design());

  it('counts visits and scheduled procedures from the SoA grid', () => {
    expect(profile.present).toBe(true);
    expect(profile.visitCount.status).toBe('computed');
    expect(profile.visitCount.value).toBe(5);
    expect(profile.procedureCount.value).toBe(11);
    expect(profile.activityCount.value).toBe(5);
  });

  it('reports the study-day span when every scheduled visit carries a study day', () => {
    expect(profile.durationDays.status).toBe('computed');
    expect(profile.durationDays.value).toBe(210);
  });

  it('identifies the heaviest single visit and the median load', () => {
    expect(profile.peakVisitLoad.status).toBe('computed');
    expect(profile.peakVisitLoad.value).toEqual({ visitId: 'V2', visitName: 'Baseline', procedureCount: 3 });
    expect(profile.medianVisitLoad.value).toBe(2);
  });

  it('breaks the load down per visit, preserving column order and cell state', () => {
    expect(profile.visits.map(v => v.procedureCount)).toEqual([2, 3, 3, 2, 1]);
    expect(profile.visits[4].byState).toEqual({ performed: 0, conditional: 1, optional: 0, unstated: 0 });
    expect(profile.visits[1].studyDay).toBe(1);
  });

  it('counts how many visits each assessment is scheduled at', () => {
    const ae = profile.assessments.find(a => a.activityId === 'a_ae');
    expect(ae?.scheduledVisitCount).toBe(4);
  });

  it('reports the complexity indicators with their basis', () => {
    expect(profile.complexity.distinctAssessmentCategories.value).toBe(5);
    expect(profile.complexity.armCount.value).toBe(2);
    expect(profile.complexity.hasUnscheduledVisits.value).toBe(false);
    expect(profile.complexity.hasConditionalActivities.value).toBe(true);
    expect(profile.complexity.proceduresPerVisit.value).toBe(2.2);
    expect(profile.complexity.proceduresPerVisit.basis).toMatch(/scheduled cells/i);
  });

  it('emits no burden findings for a schedule with no outlier and no empty visit', () => {
    expect(profile.findings.map(f => f.code)).toEqual([]);
  });
});

// ─── honesty ─────────────────────────────────────────────────────────────────

describe('honesty — a measure the SoA cannot support is absent, never zero', () => {
  const profile = burdenProfileForDesign(design());

  it('refuses participant time when the activities carry no duration', () => {
    expect(profile.participantTimeMinutes.status).toBe('not_computable');
    expect(profile.participantTimeMinutes.value).toBeNull();
    expect(profile.participantTimeMinutes.absentReason).toMatch(/5 of 5 scheduled activities/);
    expect(profile.activitiesMissingParticipantMinutes).toContain('HbA1c');
  });

  it('refuses the invasive-procedure count and says it will not guess from names', () => {
    expect(profile.invasiveProcedureCount.status).toBe('not_computable');
    expect(profile.invasiveProcedureCount.value).toBeNull();
    expect(profile.invasiveProcedureCount.absentReason).toMatch(/does not infer/i);
  });

  it('lists every refused measure, with a reason, on the profile', () => {
    const refused = Object.fromEntries(profile.notComputed.map(n => [n.measure, n.reason]));
    expect(Object.keys(refused)).toEqual(
      expect.arrayContaining(['participantTimeMinutes', 'invasiveProcedureCount', 'siteStaffTime', 'compositeBurdenScore']),
    );
    expect(refused.compositeBurdenScore).toMatch(/weights/i);
  });

  it('publishes no composite index', () => {
    expect('compositeBurdenScore' in profile).toBe(false);
    expect('burdenScore' in profile).toBe(false);
  });

  it('refuses the study-day span when any scheduled visit has no study day', () => {
    const s = soa();
    delete s.visits[3].studyDay;
    const p = burdenProfileForDesign(design(s));
    expect(p.durationDays.status).toBe('not_computable');
    expect(p.durationDays.value).toBeNull();
    expect(p.durationDays.absentReason).toMatch(/Week 24/);
  });

  it('reports the absent profile for a design with no Schedule of Activities', () => {
    const p = burdenProfileForDesign(design(null));
    expect(p.present).toBe(false);
    expect(p.visitCount.status).toBe('not_computable');
    expect(p.visitCount.value).toBeNull();
    expect(p.procedureCount.value).toBeNull();
    expect(burdenMatrixFromDesign(design(null))).toBeNull();
  });
});

describe('honesty proof — removing one duration makes the total absent, not smaller', () => {
  const timed = matrix({ activities: timedActivities() });

  it('computes the participant total when every scheduled activity carries a duration', () => {
    const p = computeBurdenProfile(timed);
    expect(p.participantTimeMinutes.status).toBe('computed');
    // V1: vitals 10 + ECG 20; V2: vitals 10.
    expect(p.participantTimeMinutes.value).toBe(40);
    expect(p.visits[0].participantMinutes.value).toBe(30);
  });

  it('goes absent — not to 30, not to 0 — when one activity loses its duration', () => {
    const stripped = timedActivities();
    delete stripped[1].participantMinutes;
    const p = computeBurdenProfile(matrix({ activities: stripped }));

    expect(p.participantTimeMinutes.status).toBe('not_computable');
    expect(p.participantTimeMinutes.value).toBeNull();
    expect(p.participantTimeMinutes.value).not.toBe(0);
    expect(p.participantTimeMinutes.absentReason).toMatch(/1 of 2 scheduled activities/);
    expect(p.activitiesMissingParticipantMinutes).toEqual(['ECG']);
    // The visit that still has complete data keeps its per-visit total; the one
    // that does not goes absent too, rather than under-reporting.
    expect(p.visits[0].participantMinutes.status).toBe('not_computable');
    expect(p.visits[1].participantMinutes.value).toBe(10);
  });

  it('counts invasive procedures only when the activities carry invasiveness', () => {
    const p = computeBurdenProfile(
      matrix({
        activities: [
          { id: 'A1', name: 'Vitals', category: 'safety', invasiveness: 'non_invasive' },
          { id: 'A2', name: 'Biopsy', category: 'safety', invasiveness: 'invasive' },
        ],
      }),
    );
    expect(p.invasiveProcedureCount.status).toBe('computed');
    // A2 is scheduled once (V1); A1 twice and is non-invasive.
    expect(p.invasiveProcedureCount.value).toBe(1);
  });
});

// ─── findings ────────────────────────────────────────────────────────────────

describe('findings — what a reviewer should see', () => {
  it('flags a visit far heavier than the rest (BRD-010)', () => {
    const activities = Array.from({ length: 8 }, (_, i) => ({ id: `A${i}`, name: `Assessment ${i}`, category: 'safety' }));
    const visits = [
      { id: 'V1', name: 'Screening', studyDay: -7, unscheduled: false },
      { id: 'V2', name: 'Baseline', studyDay: 1, unscheduled: false },
      { id: 'V3', name: 'Week 4', studyDay: 28, unscheduled: false },
    ];
    const cells = [
      ...activities.map(a => ({ activityId: a.id, visitId: 'V2', state: 'performed' as const })),
      { activityId: 'A0', visitId: 'V1', state: 'performed' as const },
      { activityId: 'A1', visitId: 'V1', state: 'performed' as const },
      { activityId: 'A0', visitId: 'V3', state: 'performed' as const },
      { activityId: 'A1', visitId: 'V3', state: 'performed' as const },
    ];
    const p = computeBurdenProfile(matrix({ visits, activities, cells }));
    const outlier = p.findings.find(f => f.code === 'BRD-010');
    expect(outlier).toBeDefined();
    expect(outlier?.severity).toBe('minor');
    expect(outlier?.detail).toMatch(/Baseline/);
    expect(outlier?.detail).toMatch(/8 scheduled activities/);
  });

  it('flags a visit with nothing scheduled (BRD-011)', () => {
    const visits = [
      { id: 'V1', name: 'Visit 1', studyDay: 1, unscheduled: false },
      { id: 'V2', name: 'Visit 2', studyDay: 8, unscheduled: false },
      { id: 'V3', name: 'Empty visit', studyDay: 15, unscheduled: false },
    ];
    const p = computeBurdenProfile(matrix({ visits }));
    const empty = p.findings.filter(f => f.code === 'BRD-011');
    expect(empty).toHaveLength(1);
    expect(empty[0].severity).toBe('major');
    expect(empty[0].detail).toMatch(/Empty visit/);
  });

  it('asks about an assessment scheduled at every single visit (BRD-012)', () => {
    const visits = [1, 2, 3, 4].map(i => ({ id: `V${i}`, name: `Visit ${i}`, studyDay: i * 7, unscheduled: false }));
    const activities = [
      { id: 'A1', name: 'PK sampling', category: 'pk' },
      { id: 'A2', name: 'Adverse events', category: 'safety' },
    ];
    const cells = visits.flatMap(v => activities.map(a => ({ activityId: a.id, visitId: v.id, state: 'performed' as const })));
    const p = computeBurdenProfile(matrix({ visits, activities, cells }));
    const every = p.findings.filter(f => f.code === 'BRD-012');
    // Safety review at every visit is expected; PK sampling at every visit is a question.
    expect(every).toHaveLength(1);
    expect(every[0].severity).toBe('info');
    expect(every[0].detail).toMatch(/PK sampling/);
  });

  it('emits findings in the repo DesignFinding shape', () => {
    const visits = [
      { id: 'V1', name: 'Visit 1', studyDay: 1, unscheduled: false },
      { id: 'V2', name: 'Visit 2', studyDay: 8, unscheduled: false },
      { id: 'V3', name: 'Empty visit', studyDay: 15, unscheduled: false },
    ];
    const f = computeBurdenProfile(matrix({ visits })).findings[0];
    expect(Object.keys(f).sort()).toEqual(['code', 'detail', 'section', 'severity', 'standard', 'suggestedFix', 'title'].sort());
    expect(f.section).toBe('§7 Participant burden');
    expect(f.standard).toBe('ICH M11');
  });
});

// ─── degenerate shapes ───────────────────────────────────────────────────────

describe('single-visit design', () => {
  const p = computeBurdenProfile(
    matrix({
      visits: [{ id: 'V1', name: 'Single visit', studyDay: 1, unscheduled: false }],
      cells: [
        { activityId: 'A1', visitId: 'V1', state: 'performed' },
        { activityId: 'A2', visitId: 'V1', state: 'performed' },
      ],
    }),
  );

  it('counts one visit and its load', () => {
    expect(p.visitCount.value).toBe(1);
    expect(p.procedureCount.value).toBe(2);
    expect(p.peakVisitLoad.value?.procedureCount).toBe(2);
    expect(p.complexity.proceduresPerVisit.value).toBe(2);
  });

  it('reports a zero-day span, which is a real zero and says so', () => {
    expect(p.durationDays.status).toBe('computed');
    expect(p.durationDays.value).toBe(0);
    expect(p.durationDays.basis).toMatch(/span/i);
  });

  it('runs no outlier check with too few visits to have a distribution', () => {
    expect(p.findings.map(f => f.code)).not.toContain('BRD-010');
  });
});

// ─── delta ───────────────────────────────────────────────────────────────────

describe('compareBurden — what an amendment did to the participant', () => {
  const before = burdenProfileForDesign(design());

  /** The amendment adds a week-36 visit (HbA1c + AE) and drops the eligibility review. */
  function amended(): ScheduleOfActivities {
    const s = soa();
    s.visits.push({ id: 'V6', name: 'Week 36', epochId: 'e_trt', studyDay: 252, order: 5 });
    s.activities = s.activities.filter(a => a.id !== 'a_elig');
    s.cells = s.cells.filter(c => c.activityId !== 'a_elig');
    s.cells.push({ activityId: 'a_hba1c', visitId: 'V6', state: 'performed' });
    s.cells.push({ activityId: 'a_ae', visitId: 'V6', state: 'performed' });
    return s;
  }

  const after = burdenProfileForDesign(design(amended()));
  const delta = compareBurden(before, after);

  it('reports the net change in visits, procedures and span', () => {
    expect(delta.comparable).toBe(true);
    const by = Object.fromEntries(delta.deltas.map(d => [d.measure, d]));
    expect(by.visitCount.delta).toBe(1);
    expect(by.procedureCount.delta).toBe(1); // +2 at the new visit, −1 eligibility review
    expect(by.durationDays.delta).toBe(56);
    expect(delta.direction).toBe('increased');
  });

  it('names the visit the amendment added and the assessment it dropped', () => {
    expect(delta.addedVisits.map(v => v.visitName)).toEqual(['Week 36']);
    expect(delta.removedVisits).toEqual([]);
    expect(delta.removedAssessments.map(a => a.name)).toEqual(['Eligibility review']);
    expect(delta.addedAssessments).toEqual([]);
  });

  it('reports which retained visits changed load', () => {
    const changed = delta.changedVisits.find(v => v.visitId === 'V1');
    expect(changed).toEqual({ visitId: 'V1', visitName: 'Screening', before: 2, after: 1, delta: -1 });
  });

  it('raises the amendment finding on an increase (BRD-030)', () => {
    expect(delta.findings.map(f => f.code)).toContain('BRD-030');
  });

  it('carries a delta as absent when either side could not compute the measure', () => {
    const s = soa();
    delete s.visits[2].studyDay;
    const d = compareBurden(before, burdenProfileForDesign(design(s)));
    const span = d.deltas.find(x => x.measure === 'durationDays');
    expect(span?.status).toBe('not_computable');
    expect(span?.delta).toBeNull();
    expect(span?.absentReason).toMatch(/after/i);
  });

  it('is not comparable when a side has no Schedule of Activities', () => {
    const d = compareBurden(before, burdenProfileForDesign(design(null)));
    expect(d.comparable).toBe(false);
    expect(d.direction).toBe('unknown');
  });
});

// ─── one engine, two callers ─────────────────────────────────────────────────

describe('adapters — one engine reached from both SoA models', () => {
  it('takes the study-design SoA', () => {
    const m = burdenMatrixFromDesign(design());
    expect(m?.source).toMatch(/study-design/);
    expect(m?.visits).toHaveLength(5);
    expect(m?.armCount).toBe(2);
  });

  it('takes the protocol read model SoA matrix through the same engine', () => {
    const built = buildSoaMatrix(
      [
        { id: 1, name: 'Vitals', category: 'safety', orderIndex: 0 },
        { id: 2, name: 'ECG', orderIndex: 1 },
      ],
      [
        { id: 10, visitName: 'Visit 1', timepoint: 'Day 1', orderIndex: 0 },
        { id: 11, visitName: 'Visit 2', timepoint: 'Day 8', orderIndex: 1 },
      ],
      [
        { assessmentId: 1, visitId: 10, required: true },
        { assessmentId: 2, visitId: 10, required: false },
        { assessmentId: 1, visitId: 11, required: true },
      ],
    );
    const p = computeBurdenProfile(burdenMatrixFromProtocolSoaMatrix(built));
    expect(p.visitCount.value).toBe(2);
    expect(p.procedureCount.value).toBe(3);
    expect(p.visits[0].byState).toEqual({ performed: 1, conditional: 0, optional: 1, unstated: 0 });
  });

  it('refuses the study-day and arm measures the protocol read model does not carry', () => {
    const built = buildSoaMatrix(
      [{ id: 1, name: 'Vitals', category: 'safety', orderIndex: 0 }],
      [{ id: 10, visitName: 'Visit 1', timepoint: 'Day 1', orderIndex: 0 }],
      [{ assessmentId: 1, visitId: 10, required: true }],
    );
    const p = computeBurdenProfile(burdenMatrixFromProtocolSoaMatrix(built));
    expect(p.durationDays.status).toBe('not_computable');
    expect(p.durationDays.absentReason).toMatch(/study day/i);
    expect(p.complexity.armCount.status).toBe('not_computable');
  });

  it('refuses the category count when the activities carry no category', () => {
    const p = computeBurdenProfile(
      matrix({ activities: [{ id: 'A1', name: 'Vitals' }, { id: 'A2', name: 'ECG' }] }),
    );
    expect(p.complexity.distinctAssessmentCategories.status).toBe('not_computable');
    expect(p.complexity.distinctAssessmentCategories.value).toBeNull();
  });
});
