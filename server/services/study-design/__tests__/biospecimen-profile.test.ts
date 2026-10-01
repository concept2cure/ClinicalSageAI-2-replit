/**
 * Biospecimen profile.
 *
 * What the suite holds: per-visit, total and 8-week blood volumes are the sum
 * of recorded volumes over the SoA's cells, each intersection once, with
 * conditional, optional and unscheduled draws only in the upper bound; one
 * validity rule for a volume, so a string or a negative is never summed; the
 * twice-weekly frequency counts performed draws; windows run over consecutive
 * days with no day 0; a PK/PD/biomarker activity with no specimen is
 * unspecified; a draw with no volume turns the totals it enters into lower
 * bounds and an un-exceeded reference point into NOT KNOWN; the 50 mL / 3 mL/kg
 * reference point can only be shown exceeded; exceeding a reference point is a
 * note, never a gap; the one-collection-per-cell counting rule is stated.
 */
import { describe, expect, it } from 'vitest';

import type { ScheduleOfActivities, SoaCell, SoaVisit, StudyDesign } from '../study-design-types';
import { ADULT_EIGHT_WEEK_ML, BIOSPECIMEN_BASIS, COUNTING_RULE, MINOR_EIGHT_WEEK_CAP_ML, profileBiospecimens } from '../biospecimen-profile';

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

function design(schedule: ScheduleOfActivities = soa()): StudyDesign {
  return {
    title: 'A phase 1 study', phase: '1', indication: 'x', objectives: [], estimands: [], endpoints: [],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'single_arm', controlType: 'none' },
    population: { targetDescription: 'adults', analysisPopulations: [], eligibility: [] },
    arms: [], statisticalPlan: { plannedAnalyses: [] },
    scheduleOfActivities: schedule,
  } as StudyDesign;
}

/** One fully specified blood draw of `ml` at visits placed on the given study days. */
function labs(ml: unknown, visits: Array<Partial<SoaVisit> & { id: string }>, cells: Array<[string, SoaCell['state']]>): StudyDesign {
  return design({
    epochs: [{ id: 'e1', name: 'Treatment', kind: 'treatment', order: 0 }, { id: 'eu', name: 'Unscheduled', kind: 'unscheduled', order: 1 }],
    visits: visits.map((v, i) => ({ name: v.id, epochId: 'e1', order: i, ...v }) as SoaVisit),
    activities: [{ id: 'lab', name: 'Labs', category: 'safety', order: 0, specimen: { type: 'blood', volumeMl: ml as number, processing: 'kit', storage: 'ambient' } }],
    cells: cells.map(([visitId, state]) => ({ activityId: 'lab', visitId, state })),
  });
}

const blood = (d: StudyDesign) => profileBiospecimens(d).bloodVolume!;
const refs = (d: StudyDesign) => blood(d).referencePoints.map((r) => [r.exceededScheduled, r.exceededUpperBound]);

describe('profileBiospecimens — volumes', () => {
  it('sums recorded volumes per visit, in total, and over the worst 8-week window; conditional draws only in the upper bound', () => {
    const b = blood(design());
    expect(b.perVisit.map((v) => [v.visitId, v.scheduledMl, v.conditionalMl, v.scheduledDraws, v.conditionalDraws, v.unscheduled])).toEqual([
      ['V1', 14, 0, 2, 0, false], ['V2', 4, 0, 1, 0, false], ['V3', 0, 4, 0, 1, false], ['V4', 10, 0, 1, 0, false],
    ]);
    expect(b.totalScheduledMl).toBe(28);
    expect(b.totalUpperBoundMl).toBe(32);
    expect([b.totalsAreLowerBounds, b.scheduledIsLowerBound]).toEqual([false, false]);
    expect(b.maxEightWeekScheduledMl).toBe(18); // days 1–56: V1 + V2 (+ V3 conditional)
    expect(b.maxEightWeekUpperBoundMl).toBe(22);
  });

  it('an optional draw counts in the upper bound, not in the scheduled figures', () => {
    const d = design();
    d.scheduleOfActivities!.cells.push({ activityId: 'lab', visitId: 'V2', state: 'optional' });
    const b = blood(d);
    expect([b.totalScheduledMl, b.totalUpperBoundMl, b.maxEightWeekScheduledMl, b.maxEightWeekUpperBoundMl]).toEqual([28, 42, 18, 32]);
  });

  it('the twice-weekly frequency counts performed draws; conditional ones only in the upper-bound count', () => {
    const p = profileBiospecimens(design());
    expect([p.bloodVolume!.maxDrawVisitsInAnyWeek, p.bloodVolume!.maxDrawVisitsInAnyWeekUpperBound, p.bloodVolume!.moreThanTwiceWeekly]).toEqual([2, 3, false]);
    expect(p.notes).toContain('with conditional and optional draws, up to 3 draw visits could fall within one week, more than the twice-weekly reference');
    const q = profileBiospecimens(labs(5, [{ id: 'A', studyDay: 1 }, { id: 'B', studyDay: 2 }, { id: 'C', studyDay: 4 }], [['A', 'performed'], ['B', 'performed'], ['C', 'performed']]));
    expect([q.bloodVolume!.maxDrawVisitsInAnyWeek, q.bloodVolume!.moreThanTwiceWeekly]).toEqual([3, true]);
    expect(q.notes).toContain('3 visits with a scheduled draw fall within one week, more than the twice-weekly reference');
  });
});

describe('profileBiospecimens — windows over consecutive days, no day 0', () => {
  it('draws 55 index-days apart share an 8-week window; 56 apart do not', () => {
    const at = (day: number) => labs(300, [{ id: 'A', studyDay: 1 }, { id: 'B', studyDay: day }], [['A', 'performed'], ['B', 'performed']]);
    expect(blood(at(56)).maxEightWeekScheduledMl).toBe(600);
    expect(refs(at(56))[0]).toEqual([true, true]);
    expect(blood(at(57)).maxEightWeekScheduledMl).toBe(300);
    expect(refs(at(57))[0]).toEqual([false, false]);
  });

  it('a window straddling day 1 skips the day 0 the model does not have', () => {
    const across = (day: number) => labs(300, [{ id: 'S', studyDay: -28 }, { id: 'B', studyDay: day }], [['S', 'performed'], ['B', 'performed']]);
    expect(blood(across(28)).maxEightWeekScheduledMl).toBe(600); // −28..−1 and 1..28: 56 days
    expect(refs(across(28))[0]).toEqual([true, true]);
    expect(blood(across(29)).maxEightWeekScheduledMl).toBe(300);
    const week = labs(5, [{ id: 'S', studyDay: -3 }, { id: 'A', studyDay: 1 }, { id: 'B', studyDay: 4 }], [['S', 'performed'], ['A', 'performed'], ['B', 'performed']]);
    expect([blood(week).maxDrawVisitsInAnyWeek, blood(week).moreThanTwiceWeekly]).toEqual([3, true]); // −3..−1, 1..4: 7 days
  });

  it('a recorded day 0 is not a usable study day, with the gap', () => {
    const p = profileBiospecimens(labs(10, [{ id: 'Z', name: 'Day 0', studyDay: 0 }, { id: 'A', studyDay: 3 }], [['Z', 'performed'], ['A', 'performed']]));
    expect(p.bloodVolume!.maxEightWeekScheduledMl).toBeNull();
    expect(p.gaps).toContain("Day 0 records study day 0, which the design model's day-1 convention (no day 0) does not define: it is treated as having no study day");
  });

  it('a scheduled draw at a visit with no study day nulls the window figures, with the gap', () => {
    const d = design();
    delete d.scheduleOfActivities!.visits[1].studyDay;
    const p = profileBiospecimens(d);
    expect(p.bloodVolume!.maxEightWeekScheduledMl).toBeNull();
    expect(p.bloodVolume!.moreThanTwiceWeekly).toBeNull();
    expect(p.gaps).toContain('a visit with a scheduled blood draw has no usable study day (Day 2): the 8-week and weekly figures cannot be computed');
  });

  it('an undated visit with only a conditional draw nulls the upper-bound figures only', () => {
    const d = design();
    delete d.scheduleOfActivities!.visits[2].studyDay;
    const p = profileBiospecimens(d);
    expect([p.bloodVolume!.maxEightWeekScheduledMl, p.bloodVolume!.maxEightWeekUpperBoundMl, p.bloodVolume!.maxDrawVisitsInAnyWeek]).toEqual([18, null, 2]);
    expect(p.gaps).toContain('a visit with only conditional or optional blood draws has no usable study day (Day 4): the upper-bound 8-week and weekly figures cannot be computed');
  });
});

describe('profileBiospecimens — unscheduled visits', () => {
  it('a performed draw at an unscheduled visit is upper bound only and in no window', () => {
    const d = labs(300, [{ id: 'V1', studyDay: 1 }, { id: 'ET', studyDay: 20, unscheduled: true }], [['V1', 'performed'], ['ET', 'performed']]);
    const p = profileBiospecimens(d);
    const b = p.bloodVolume!;
    expect([b.totalScheduledMl, b.totalUpperBoundMl, b.unscheduledMl, b.maxEightWeekScheduledMl, b.maxEightWeekUpperBoundMl]).toEqual([300, 600, 300, 300, 300]);
    expect(b.perVisit[1]).toMatchObject({ visitId: 'ET', unscheduled: true, scheduledMl: 0, conditionalMl: 300 });
    expect(b.referencePoints[0]).toMatchObject({ exceededScheduled: false, exceededUpperBound: null });
    expect(p.notes.some((n) => n.startsWith('draws at unscheduled visits (ET) cannot be placed in time'))).toBe(true);
  });

  it('an undated column in an unscheduled epoch does not null the scheduled figures', () => {
    const d = labs(300, [{ id: 'V1', studyDay: 1 }, { id: 'V2', studyDay: 29 }, { id: 'U', epochId: 'eu' }], [['V1', 'performed'], ['V2', 'performed'], ['U', 'performed']]);
    const p = profileBiospecimens(d);
    expect([p.bloodVolume!.totalScheduledMl, p.bloodVolume!.maxEightWeekScheduledMl]).toEqual([600, 600]);
    expect(refs(d)[0]).toEqual([true, true]);
    expect(p.gaps).toEqual([]);
  });
});

describe('profileBiospecimens — reference points', () => {
  it('reports both OHRP reference points, labelled; the 50 mL / 3 mL/kg one can only be shown exceeded', () => {
    const p = profileBiospecimens(design());
    const [adult, other] = p.bloodVolume!.referencePoints;
    expect([adult.eightWeekLimitMl, adult.exceededScheduled, adult.exceededUpperBound, adult.withinUnknownBecause]).toEqual([ADULT_EIGHT_WEEK_ML, false, false, null]);
    expect(adult.appliesTo).toMatch(/at least 110 lb/);
    expect([other.eightWeekLimitMl, other.exceededScheduled, other.exceededUpperBound]).toEqual([MINOR_EIGHT_WEEK_CAP_ML, null, null]);
    expect(other.withinUnknownBecause).toMatch(/3 mL\/kg.*no minimum participant weight/);
    expect(p.bloodVolume!.meaning).toMatch(/not safety limits/);
    expect(p.basis).toBe(BIOSPECIMEN_BASIS);
  });

  it('an exceeded reference point with every specimen specified is a note, not a gap, and the profile is rendered', () => {
    const p = profileBiospecimens(labs(300, [{ id: 'V1', studyDay: 1 }, { id: 'V2', studyDay: 29 }], [['V1', 'performed'], ['V2', 'performed']]));
    expect(p.bloodVolume!.referencePoints.map((r) => r.exceededScheduled)).toEqual([true, true]);
    expect(p.gaps).toEqual([]);
    expect(p.status).toBe('rendered');
    expect(p.notes).toContain('scheduled draws reach 600 mL in an 8-week window, above the 550 mL reference for healthy, non-pregnant adults who weigh at least 110 lb (about 50 kg)');
  });

  it('a gap makes the profile partial', () => {
    expect(profileBiospecimens(design()).status).toBe('partial');
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

  it('a scheduled draw with no volume makes every figure a lower bound and an un-exceeded reference point not known', () => {
    const d = design();
    delete d.scheduleOfActivities!.activities[1].specimen!.volumeMl;
    const p = profileBiospecimens(d);
    expect([p.bloodVolume!.totalsAreLowerBounds, p.bloodVolume!.scheduledIsLowerBound]).toEqual([true, true]);
    expect(refs(d)).toEqual([[null, null], [null, null]]);
    expect(p.specimens.find((s) => s.activityId === 'lab')!.unspecified).toEqual(['volume']);
    expect(p.gaps).toContain('a scheduled blood draw records no volume: the scheduled and upper-bound figures are lower bounds, and a reference point they do not already exceed is not known');
  });

  it('a volume that is not a positive number is not specified and never summed', () => {
    for (const bad of ['10', -10, 0]) {
      const p = profileBiospecimens(labs(bad, [{ id: 'V1', studyDay: 1 }, { id: 'V2', studyDay: 2 }], [['V1', 'performed'], ['V2', 'performed']]));
      expect([p.bloodVolume!.totalScheduledMl, p.bloodVolume!.maxEightWeekScheduledMl, p.bloodVolume!.scheduledIsLowerBound]).toEqual([0, 0, true]);
      expect(p.bloodVolume!.referencePoints.map((r) => r.exceededScheduled)).toEqual([null, null]);
      expect(p.gaps).toContain('Labs: volume not specified');
    }
  });

  it('a lower bound that already exceeds a reference point is reported exceeded', () => {
    const d = design();
    d.scheduleOfActivities!.activities[0].specimen!.volumeMl = 30;
    delete d.scheduleOfActivities!.activities[1].specimen!.volumeMl;
    const b = blood(d);
    expect(b.referencePoints[1]).toMatchObject({ eightWeekLimitMl: 50, exceededScheduled: true });
    expect(b.referencePoints[0].exceededScheduled).toBeNull();
  });

  it('a conditional draw with no volume leaves the scheduled figures exact and the upper bound a lower bound', () => {
    const d = design();
    d.scheduleOfActivities!.activities.push({ id: 'x', name: 'Extra', category: 'safety', order: 9, specimen: { type: 'blood', processing: 'kit', storage: 'ambient' } });
    d.scheduleOfActivities!.cells.push({ activityId: 'x', visitId: 'V2', state: 'conditional' });
    const p = profileBiospecimens(d);
    expect([p.bloodVolume!.scheduledIsLowerBound, p.bloodVolume!.totalsAreLowerBounds]).toEqual([false, true]);
    expect(p.bloodVolume!.referencePoints[0]).toMatchObject({ exceededScheduled: false, exceededUpperBound: null });
    expect(p.gaps).toContain('a conditional, optional or unscheduled blood draw records no volume: the upper-bound figures are lower bounds');
  });

  it('a blood activity no cell schedules affects no total', () => {
    const d = design();
    d.scheduleOfActivities!.activities.push({ id: 'u', name: 'Unused', category: 'safety', order: 9, specimen: { type: 'blood', processing: 'kit', storage: 'ambient' } });
    const p = profileBiospecimens(d);
    expect(p.bloodVolume!.totalsAreLowerBounds).toBe(false);
    expect(p.bloodVolume!.referencePoints[0].exceededScheduled).toBe(false);
    expect(p.gaps.some((g) => /records no volume/.test(g))).toBe(false);
  });

  it('a repeated intersection counts once and a dangling blood cell makes the totals lower bounds, both named', () => {
    const d = labs(10, [{ id: 'V1', studyDay: 1 }], [['V1', 'performed'], ['V1', 'performed'], ['NOPE', 'performed']]);
    const p = profileBiospecimens(d);
    expect([p.bloodVolume!.totalScheduledMl, p.bloodVolume!.perVisit[0].scheduledDraws, p.bloodVolume!.totalsAreLowerBounds]).toEqual([10, 1, true]);
    expect(p.gaps).toEqual([
      'Labs at visit "NOPE": the activity or visit id is not defined exactly once, so this draw is not counted and the totals are lower bounds',
      "Labs at V1 is listed 2 times: counted once, in the first listing's state",
    ]);
    expect(p.status).toBe('partial');
  });

  it('states the one-collection-per-cell counting rule, and notes it on each sampling draw', () => {
    const p = profileBiospecimens(design());
    expect(p.bloodVolume!.countingRule).toBe(COUNTING_RULE);
    expect(COUNTING_RULE).toMatch(/serial samples within one visit/);
    expect(p.notes).toContain('PK plasma: counted as one collection per visit; serial samples within a visit are not in the totals');
    expect(p.notes.some((n) => n.startsWith('Safety labs'))).toBe(false);
  });

  it('missing processing or storage is named per specimen', () => {
    const d = design();
    delete d.scheduleOfActivities!.activities[0].specimen!.storage;
    expect(profileBiospecimens(d).gaps).toContain('PK plasma: storage not specified');
  });

  it('no SoA is missing; no blood draws means no blood profile; a malformed grid is not thrown on', () => {
    const d = design();
    delete d.scheduleOfActivities;
    expect(profileBiospecimens(d).status).toBe('missing');
    const e = design();
    e.scheduleOfActivities!.activities = e.scheduleOfActivities!.activities.filter((a) => a.id === 'ecg');
    expect(profileBiospecimens(e).bloodVolume).toBeNull();
    const f = design();
    (f.scheduleOfActivities as unknown as { cells: unknown; visits: unknown }).cells = undefined;
    (f.scheduleOfActivities as unknown as { visits: unknown }).visits = {};
    (f.scheduleOfActivities!.activities as unknown[]).push(null);
    expect(profileBiospecimens(f).bloodVolume!.totalUpperBoundMl).toBe(0);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(profileBiospecimens(design()))).toBe(JSON.stringify(profileBiospecimens(design())));
  });
});

