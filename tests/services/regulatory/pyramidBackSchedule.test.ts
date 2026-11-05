/**
 * Back-scheduling the work breakdown from the target submission date (S11 step 3; THE_PROGRAM §3.3, §7.2).
 * The dates are arithmetic over the engine's dependencies and durations, never a model's (RULE 2).
 */
import { describe, it, expect } from 'vitest';
import {
  backSchedule, taskWorkingDays, ScheduleError, getAllSupportedTypes, getPyramidForProject,
  taskStanding, phaseGate, scheduleSummary,
  type SubmissionPyramid, type PyramidTask,
} from '../../../services/regulatory/SubmissionPyramidEngine';

const task = (id: string, deps: string[], hours: number, weeks?: number): PyramidTask => ({
  id, phaseId: 'p1', name: id, estimatedHours: hours, dependencies: deps,
  ...(weeks ? { timeline: { typicalDurationWeeks: weeks } } : {}),
} as unknown as PyramidTask);
const pyramid = (tasks: PyramidTask[], type = 'IND'): SubmissionPyramid =>
  ({ type, name: 't', phases: [{ id: 'p1', name: 'P', order: 1, tasks }], tasks } as unknown as SubmissionPyramid);

describe('taskWorkingDays', () => {
  it("uses the engine's typical duration, five working days a week", () => {
    expect(taskWorkingDays({ estimatedHours: 2, timeline: { typicalDurationWeeks: 2 } })).toEqual({ days: 10, basis: 'typical-duration' });
  });
  it('else the estimated hours at an eight-hour day, at least one day', () => {
    expect(taskWorkingDays({ estimatedHours: 20 })).toEqual({ days: 3, basis: 'estimated-hours' });
    expect(taskWorkingDays({ estimatedHours: 0 })).toEqual({ days: 1, basis: 'estimated-hours' });
  });
});

// a (16 h) → b (8 h) → done (8 h), with c (40 h) beside b.
const chain = pyramid([task('a', [], 16), task('b', ['a'], 8), task('c', ['a'], 40), task('done', ['b', 'c'], 8)]);

describe('backSchedule', () => {

  it('makes the task that completes the submission due on the target date', () => {
    // Friday 2027-06-04.
    const s = backSchedule(chain, '2027-06-04');
    expect(s.anchorTaskId).toBe('done');
    expect(s.tasks.done).toMatchObject({ start: '2027-06-04', due: '2027-06-04', workingDays: 1 });
  });

  it('makes each task due the working day before the earliest start of what depends on it', () => {
    const s = backSchedule(chain, '2027-06-04');
    expect(s.tasks.b).toMatchObject({ start: '2027-06-03', due: '2027-06-03' });
    // c is five working days ending Thursday 3 June: it starts Friday 28 May.
    expect(s.tasks.c).toMatchObject({ start: '2027-05-28', due: '2027-06-03', workingDays: 5 });
    // a feeds b and c: due the day before c, the earlier start, skipping the weekend.
    expect(s.tasks.a).toMatchObject({ start: '2027-05-26', due: '2027-05-27', workingDays: 2 });
    expect(s.start).toBe('2027-05-26');
  });

  it('moves a weekend target back to the Friday before it', () => {
    expect(backSchedule(chain, '2027-06-06').tasks.done.due).toBe('2027-06-04');
  });

  it("lays the tasks after the submission forward from it (the PMA's post-submission readiness)", () => {
    const s = backSchedule(getPyramidForProject('PMA'), '2027-06-04');
    expect(s.anchorTaskId).toBe('phase9.complete');
    expect(s.tasks['phase9.complete'].due).toBe('2027-06-04');
    expect(s.tasks['phase10.inspection_readiness']).toMatchObject({ start: '2027-06-07', afterSubmission: true });
    expect(s.tasks['phase10.complete'].due > '2027-06-04').toBe(true);
    expect(s.start < '2027-06-04').toBe(true);
  });

  it('schedules every task of every pyramid, each due no later than what depends on it starts', () => {
    for (const type of getAllSupportedTypes()) {
      const p = getPyramidForProject(type);
      const s = backSchedule(p, '2027-06-04');
      expect(Object.keys(s.tasks).sort()).toEqual(p.tasks.map(t => t.id).sort());
      for (const t of p.tasks) {
        for (const d of t.dependencies ?? []) expect(s.tasks[d].due < s.tasks[t.id].start, `${type} ${d} → ${t.id}`).toBe(true);
        expect(s.tasks[t.id].start <= s.tasks[t.id].due).toBe(true);
      }
    }
  });

  it("uses the IND's typical durations", () => {
    const s = backSchedule(getPyramidForProject('IND'), '2027-06-04');
    expect(s.tasks['phase8.submit']).toMatchObject({ workingDays: 5, basis: 'typical-duration' });
  });

  it('refuses a target that is not a calendar date', () => {
    expect(() => backSchedule(chain, '2027-02-30')).toThrow(ScheduleError);
    expect(() => backSchedule(chain, 'soon')).toThrow(/not a calendar date/);
  });

  it('refuses a cycle rather than giving dates', () => {
    const loop = pyramid([task('a', ['b'], 8), task('b', ['a'], 8), task('done', ['b'], 8)]);
    expect(() => backSchedule(loop, '2027-06-04')).toThrow(/cycle/);
  });

  it('refuses a work breakdown with no single task that completes it', () => {
    const two = pyramid([task('a', [], 8), task('b', [], 8)]);
    expect(() => backSchedule(two, '2027-06-04')).toThrow(/no single task/);
  });
});

// Where the work stands (S11: the Plan step's workstreams and the portfolio line).
describe('taskStanding', () => {
  const slot = { start: '2026-11-02', due: '2026-11-10' };
  it('is overdue past its due date, late to start past its start and not started, else nothing', () => {
    expect(taskStanding('in-progress', slot, '2026-11-11')).toBe('overdue');
    expect(taskStanding('todo', slot, '2026-11-05')).toBe('late-to-start');
    expect(taskStanding('in-progress', slot, '2026-11-05')).toBeNull();
    expect(taskStanding('todo', slot, '2026-11-02')).toBeNull();
  });
  it('a done task, or one with no dates, stands nowhere', () => {
    expect(taskStanding('done', slot, '2027-01-01')).toBeNull();
    expect(taskStanding('todo', undefined, '2027-01-01')).toBeNull();
  });
});

describe('phaseGate', () => {
  it("is each phase's completing task, in every pyramid", () => {
    for (const type of getAllSupportedTypes()) {
      const p = getPyramidForProject(type);
      for (const ph of p.phases) expect(phaseGate(p, ph.id), `${type} ${ph.id}`).toBe(`${ph.id}.complete`);
    }
  });
  it("else the phase's one task nothing in the phase depends on, else none", () => {
    expect(phaseGate(chain, 'p1')).toBe('done');
    const two = pyramid([task('a', [], 8), task('b', [], 8)]);
    expect(phaseGate(two, 'p1')).toBeNull();
  });
});

describe('scheduleSummary', () => {
  const ind = getPyramidForProject('IND');
  const s = backSchedule(ind, '2027-06-04');
  const first = ind.tasks[0].id;

  it('is on track when nothing is behind, and names the next phase to complete', () => {
    const sum = scheduleSummary(ind, s, {}, s.start);
    expect(sum).toMatchObject({ total: 58, done: 0, overdue: 0, lateToStart: 0, status: 'on-track' });
    expect(sum.next).toMatchObject({ phaseId: 'phase1', taskId: 'phase1.complete' });
    expect(sum.next!.due).toBe(s.tasks['phase1.complete'].due);
  });

  it('is at risk when an unfinished task is past its dates, and counts them', () => {
    const sum = scheduleSummary(ind, s, { [first]: 'done' }, '2027-03-01');
    expect(sum.status).toBe('at-risk');
    expect(sum.overdue).toBeGreaterThan(0);
    expect(sum.done).toBe(1);
  });

  it('is blocked when a task is recorded blocked, before anything else', () => {
    expect(scheduleSummary(ind, s, { [first]: 'blocked' }, '2027-03-01').status).toBe('blocked');
  });

  it('is unscheduled without a schedule, with no dates', () => {
    const sum = scheduleSummary(ind, null, {}, '2026-11-05');
    expect(sum.status).toBe('unscheduled');
    expect(sum.next).toMatchObject({ phaseId: 'phase1', due: null });
  });

  it('is complete when every task is done, with no next milestone', () => {
    const all = Object.fromEntries(ind.tasks.map((t) => [t.id, 'done']));
    expect(scheduleSummary(ind, s, all, '2028-01-01')).toMatchObject({ status: 'complete', next: null, overdue: 0 });
  });

  it('skips a phase already complete for the next milestone', () => {
    const sum = scheduleSummary(ind, s, { 'phase1.complete': 'done' }, s.start);
    expect(sum.next?.phaseId).not.toBe('phase1');
  });
});
