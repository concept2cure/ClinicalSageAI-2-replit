/**
 * A CAPA's target close and its action items' due dates become one open task
 * each, for the person who owes them, and the task ends with the record.
 */
import { describe, it, expect, vi } from 'vitest';

const H = vi.hoisted(() => ({ replace: vi.fn(async () => 'scheduled') }));
vi.mock('../../tasking/source-task', () => ({ replaceSourceTask: H.replace }));

import { capaActionTaskPlan, capaTaskPlan, scheduleCapaTask, CAPA_REMIND_DAYS } from '../capa-tasks';

const CAPA = {
  id: 'c0ffee00-0000-4000-8000-000000000007', capaCode: 'CAPA-007', title: 'Assay OOS recurrence', state: 'investigation',
  riskLevel: 'high', targetCloseDate: new Date('2026-11-30T00:00:00Z'), assignedTo: null, createdBy: '42',
};
const ACTION = {
  id: 'a1', capaId: CAPA.id, n: 2, description: 'Replace the HPLC column and requalify', state: 'in_progress',
  dueDate: new Date('2026-11-15T00:00:00Z'), owner: 'Dana (QC lead)',
};

describe('CAPA tasks', () => {
  it('owes an open CAPA by its target close date, to the person who raised it, with 14 days notice', () => {
    const plan = capaTaskPlan(CAPA);
    expect(plan.sourceEntityId).toBe(`capa:${CAPA.id}`);
    expect(plan.next).toMatchObject({
      moduleType: 'Quality', title: 'Close CAPA-007: Assay OOS recurrence', assigneeId: 42, priority: 'high',
      dueDate: new Date('2026-11-30T00:00:00Z'),
      metadata: { capaCode: 'CAPA-007', targetClose: '2026-11-30', remindDaysBefore: CAPA_REMIND_DAYS },
    });
    expect(plan.same({ targetClose: '2026-11-30' })).toBe(true);
    expect(plan.same({ targetClose: '2026-12-31' })).toBe(false);
  });

  it('completes the task when the CAPA closes, and owes nothing without a target date', () => {
    for (const state of ['closed_effective', 'closed_not_effective']) {
      const plan = capaTaskPlan({ ...CAPA, state });
      expect(plan.next).toBeNull();
      expect(plan.closeAs).toBe('completed');
    }
    expect(capaTaskPlan({ ...CAPA, targetCloseDate: null }).next).toBeNull();
    expect(capaTaskPlan({ ...CAPA, assignedTo: '7' }).next?.assigneeId).toBe(7);
  });

  it('owes an action by its due date, names an owner who is not a user, and ends with the action', () => {
    const plan = capaActionTaskPlan(ACTION, 'CAPA-007', 42);
    expect(plan.sourceEntityId).toBe('capa-action:a1');
    expect(plan.next).toMatchObject({ title: 'CAPA-007 action 2: Replace the HPLC column and requalify', assigneeId: 42 });
    expect(plan.next?.description).toContain('Owner: Dana (QC lead).');
    expect(capaActionTaskPlan({ ...ACTION, owner: '9' }, 'CAPA-007', 42).next?.assigneeId).toBe(9);

    const done = capaActionTaskPlan({ ...ACTION, state: 'done' }, 'CAPA-007', 42);
    expect([done.next, done.closeAs]).toEqual([null, 'completed']);
    const cancelled = capaActionTaskPlan({ ...ACTION, state: 'cancelled' }, 'CAPA-007', 42);
    expect([cancelled.next, cancelled.closeAs]).toEqual([null, 'cancelled']);
  });

  it('writes through the one task store, under the organisation and the actor', async () => {
    await scheduleCapaTask(3, CAPA, 42);
    expect(H.replace).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 3, actorId: 42, sourceEntityType: 'capa_record', sourceEntityId: `capa:${CAPA.id}`,
    }));
  });
});
