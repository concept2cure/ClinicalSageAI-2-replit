/**
 * Each stability study says what is due: every pull point's planned date (the
 * recorded start plus its months), what is recorded at it, what is
 * outstanding, and whether its date has passed (P-122 inventory B2).
 *
 * Until 2026-11-14 the Stability register used a study's pull points only to
 * fill the result form, and never showed its start date, so a coordinator
 * could not see on the CMC screen which pulls were due or overdue.
 */
import { describe, expect, it } from 'vitest';
import { stabilityPullSchedule } from '../stability-source';

const TODAY = new Date(Date.UTC(2026, 10, 14)); // 2026-11-14
const study = (over: Record<string, unknown> = {}) => ({
  startDate: '2026-02-01',
  timePoints: ['0', '3', '6', '9', '12'],
  testParameters: ['Assay', 'Total impurities'],
  stabilityData: {
    results: [
      { timePoint: '0', parameter: 'Assay', result: '99.8' },
      { timePoint: '0', parameter: 'Total impurities', result: '0.10' },
      { timePoint: '3', parameter: 'Assay', result: '99.5' },
      { timePoint: '3', parameter: 'Total impurities', result: '0.12' },
      { timePoint: '6', parameter: 'Assay', result: '99.2' },
    ],
  },
  ...over,
});

describe('stabilityPullSchedule', () => {
  it('dates every pull from the start and says what each holds', () => {
    const s = stabilityPullSchedule(study(), TODAY);
    expect(s.points.map((p) => [p.label, p.plannedDate, p.state])).toEqual([
      ['0', '2026-02-01', 'recorded'],
      ['3', '2026-05-01', 'recorded'],
      ['6', '2026-08-01', 'incomplete'],
      ['9', '2026-11-01', 'overdue'],
      ['12', '2027-02-01', 'planned'],
    ]);
    expect(s.points[2].recorded).toEqual(['Assay']);
    expect(s.points[2].outstanding).toEqual(['Total impurities']);
    expect(s.overdue).toBe(1);
    expect(s.incomplete).toBe(1);
    expect(s.next?.label).toBe('12');
  });

  it('reads "Month 24" as 24 months, as the trend and the Q1E fit do', () => {
    const s = stabilityPullSchedule(study({ timePoints: ['Month 24'], stabilityData: null }), TODAY);
    expect(s.points[0]).toMatchObject({ months: 24, plannedDate: '2028-02-01', state: 'planned' });
  });

  it('holds a month-end start to the month’s last day', () => {
    const s = stabilityPullSchedule(study({ startDate: '2026-01-31', timePoints: ['1'], stabilityData: null }), TODAY);
    expect(s.points[0].plannedDate).toBe('2026-02-28');
  });

  it('says why a point has no date, and never drops it', () => {
    const s = stabilityPullSchedule(study({ timePoints: ['T0', '1.5', '3'], stabilityData: null }), TODAY);
    expect(s.points.map((p) => p.label)).toEqual(['T0', '1.5', '3']);
    expect(s.points[0]).toMatchObject({ plannedDate: null, state: 'not-scheduled' });
    expect(s.points[0].reason).toBe('"T0" is not a number of months.');
    expect(s.points[1].reason).toMatch(/not a whole number of months/);
    expect(s.points[2].plannedDate).toBe('2026-05-01');
  });

  it('draws no dates without a start date, and says so', () => {
    const s = stabilityPullSchedule(study({ startDate: null }), TODAY);
    expect(s.reason).toBe('No start date is recorded on this study, so no pull has a planned date.');
    expect(s.overdue).toBe(0);
    expect(s.points.every((p) => p.plannedDate === null)).toBe(true);
  });

  it('a study with no pull points has no schedule, in words', () => {
    expect(stabilityPullSchedule(study({ timePoints: null }), TODAY)).toEqual({
      points: [], next: null, overdue: 0, incomplete: 0, reason: 'No pull points are recorded on this study.',
    });
  });

  it('a pull due today is due, not overdue', () => {
    const s = stabilityPullSchedule(study({ startDate: '2026-08-14', timePoints: ['3'], stabilityData: null }), TODAY);
    expect(s.points[0].state).toBe('due-today');
    expect(s.overdue).toBe(0);
  });
});
