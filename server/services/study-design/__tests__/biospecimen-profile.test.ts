/**
 * Biospecimen profile.
 *
 * What the suite holds: per-visit, total and 8-week blood volumes are the sum
 * of recorded volumes over the SoA's cells (conditional draws only in the upper
 * bound); a PK/PD/biomarker activity with no specimen is unspecified, never an
 * assumed draw; a draw with no volume turns totals into lower bounds and an
 * un-exceeded reference point into NOT KNOWN; the OHRP reference points are
 * reported for both populations and never raised as a gap; a missing study day
 * makes the window figures null.
 */
import { describe, expect, it } from 'vitest';

import type { ScheduleOfActivities, StudyDesign } from '../study-design-types';
import { ADULT_EIGHT_WEEK_ML, BIOSPECIMEN_BASIS, MINOR_EIGHT_WEEK_CAP_ML, profileBiospecimens } from '../biospecimen-profile';

function soa(): ScheduleOfActivities {
  return {
    epochs: [{ id: 'e1', name: 'Treatment', kind: 'treatment', order: 0 }],
    visits: [
      { id: 'V1', name: 'Day 1', epochId: 'e1', studyDay: 1, isBaseline: true, order: 0 },
      { id: 'V2', name: 'Day 2', epochId: 'e1', studyDay: 2, order: 1 },
      { id: 'V3', name: 'Day 4', epochId: 'e1', studyDay: 4, order: 2 },
      { id: 'V4', name: 'Week 12', epochId: 'e1', studyDay: 85, order: 3 },
    ],
    activities: [
      { id: 'pk', name: 'PK plasma', category: 'pk', order: 0, specimen: { type: 'blood', volumeMl: 4, processing: 'centrifuge, aliquot plasma', storage: '−80 °C' } },
      { id: 'lab', name: 'Safety labs', category: 'safety', order: 1, specimen: { type: 'blood', volumeMl: 10, processing: 'central lab kit', storage: 'ambient, ship same day' } },
      { id: 'bm', name: 'Biomarker', category: 'biomarker', order: 2 },
      { id: 'ecg', name: 'ECG', category: 'safety', order: 3 },
    ],
    cells: [
      { activityId: 'pk', visitId: 'V1', state: 'performed' },
      { activityId: 'pk', visitId: 'V2', state: 'performed' },
      { activityId: 'pk', visitId: 'V3', state: 'conditional' },
      { activityId: 'lab', visitId: 'V1', state: 'performed' },
      { activityId: 'lab', visitId: 'V4', state: 'performed' },
      { activityId: 'ecg', visitId: 'V1', state: 'performed' },
    ],
  };
}

function design(): StudyDesign {
  return {
    title: 'A phase 1 study', phase: '1', indication: 'x', objectives: [], estimands: [], endpoints: [],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'single_arm', controlType: 'none' },
    population: { targetDescription: 'adults', analysisPopulations: [], eligibility: [] },
    arms: [], statisticalPlan: { plannedAnalyses: [] },
    scheduleOfActivities: soa(),
  } as StudyDesign;
}

describe('profileBiospecimens — volumes', () => {
  it('sums recorded volumes per visit, in total, and over the worst 8-week window; conditional draws only in the upper bound', () => {
    const b = profileBiospecimens(design()).bloodVolume!;
    expect(b.perVisit.map((v) => [v.visitId, v.scheduledMl, v.conditionalMl, v.draws])).toEqual([
      ['V1', 14, 0, 2], ['V2', 4, 0, 1], ['V3', 0, 4, 1], ['V4', 10, 0, 1],
    ]);
    expect(b.totalScheduledMl).toBe(28);
    expect(b.totalUpperBoundMl).toBe(32);
    expect(b.totalsAreLowerBounds).toBe(false);
    expect(b.maxEightWeekScheduledMl).toBe(18); // days 1–56: V1 + V2 (+ V3 conditional)
    expect(b.maxEightWeekUpperBoundMl).toBe(22);
    expect(b.maxDrawVisitsInAnyWeek).toBe(3);
    expect(b.moreThanTwiceWeekly).toBe(true);
  });

  it('reports both OHRP reference points, labelled, and raises no gap for either', () => {
    const p = profileBiospecimens(design());
    expect(p.bloodVolume!.referencePoints.map((r) => [r.eightWeekLimitMl, r.exceededScheduled])).toEqual([[ADULT_EIGHT_WEEK_ML, false], [MINOR_EIGHT_WEEK_CAP_ML, false]]);
    expect(p.bloodVolume!.meaning).toMatch(/not safety limits/);
    expect(p.gaps.some((g) => /reference|threshold/.test(g))).toBe(false);
    expect(p.notes).toContain('3 draw visits fall within one week, more than the twice-weekly reference');
    expect(p.basis).toBe(BIOSPECIMEN_BASIS);
  });
});

describe('profileBiospecimens — nothing assumed', () => {
  it('a biomarker activity with no specimen is unspecified, not an assumed draw', () => {
    const p = profileBiospecimens(design());
    const bm = p.specimens.find((s) => s.activityId === 'bm')!;
    expect(bm.specimen).toBeNull();
    expect(bm.unspecified).toEqual(['specimen type, volume, processing and storage']);
    expect(p.gaps).toContain('Biomarker: specimen type, volume, processing and storage not specified');
    expect(p.specimens.some((s) => s.activityId === 'ecg')).toBe(false);
  });

  it('a draw with no volume makes totals lower bounds and an un-exceeded reference point not known', () => {
    const d = design();
    delete d.scheduleOfActivities!.activities[1].specimen!.volumeMl;
    const b = profileBiospecimens(d).bloodVolume!;
    expect(b.totalsAreLowerBounds).toBe(true);
    expect(b.referencePoints.map((r) => r.exceededScheduled)).toEqual([null, null]);
  });

  it('a lower bound that already exceeds a reference point is reported exceeded', () => {
    const d = design();
    d.scheduleOfActivities!.activities[0].specimen!.volumeMl = 30;
    delete d.scheduleOfActivities!.activities[1].specimen!.volumeMl;
    const b = profileBiospecimens(d).bloodVolume!;
    expect(b.referencePoints[1]).toMatchObject({ eightWeekLimitMl: 50, exceededScheduled: true });
    expect(b.referencePoints[0].exceededScheduled).toBeNull();
  });

  it('a draw visit with no study day makes the window figures null, with the gap', () => {
    const d = design();
    delete d.scheduleOfActivities!.visits[1].studyDay;
    const p = profileBiospecimens(d);
    expect(p.bloodVolume!.maxEightWeekScheduledMl).toBeNull();
    expect(p.bloodVolume!.moreThanTwiceWeekly).toBeNull();
    expect(p.gaps).toContain('a visit with a blood draw has no study day: the 8-week and weekly figures cannot be computed');
  });

  it('missing processing or storage is named per specimen', () => {
    const d = design();
    delete d.scheduleOfActivities!.activities[0].specimen!.storage;
    expect(profileBiospecimens(d).gaps).toContain('PK plasma: storage not specified');
  });

  it('no SoA is missing; no blood draws means no blood profile', () => {
    const d = design();
    delete d.scheduleOfActivities;
    expect(profileBiospecimens(d).status).toBe('missing');
    const e = design();
    e.scheduleOfActivities!.activities = e.scheduleOfActivities!.activities.filter((a) => a.id === 'ecg');
    expect(profileBiospecimens(e).bloodVolume).toBeNull();
  });

  it('is deterministic', () => {
    expect(JSON.stringify(profileBiospecimens(design()))).toBe(JSON.stringify(profileBiospecimens(design())));
  });
});
