/**
 * A task created for a named person records who it is assigned to, by whom and
 * when (QA 2026-10-08, browser walk j4-authoring,
 * docs/evidence/QA-2026-10-08/authoring/).
 *
 * The review task Assign review creates (POST /api/tasks/tasks with an
 * assigneeId) was stored with assigned_by, assigned_at and assignee_name all
 * NULL, so the task drawer said "ASSIGNED BY --" and the board had no name for
 * the assignee. The route also accepted any integer as the assignee: nothing
 * checked that the person belongs to the organization. Now a named assignee is
 * resolved among the organization's members (a non-member is refused before
 * anything is written) and the assignment is recorded with the task.
 *
 * Same harness as the governed-write tests (_task-management-governed-harness.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../db', async () => (await import('./_task-management-governed-harness')).dbModule());
vi.mock('../c2c/actions', async () => (await import('./_task-management-governed-harness')).ledgerModule());
vi.mock('../../services/tasking/task-side-effects', async () =>
  (await import('./_task-management-governed-harness')).sideEffectsModule(),
);
vi.mock('../../services/notifications/notification-service', async () =>
  (await import('./_task-management-governed-harness')).notificationModule(),
);
vi.mock('../../services/tasking/task-signoff', async () =>
  (await import('./_task-management-governed-harness')).signoffModule(),
);
vi.mock('../../services/tasking/task-planning', async () =>
  (await import('./_task-management-governed-harness')).planningModule(),
);

import taskManagementRoutes from '../taskManagement.routes';
import { h, spies, appFactory, BASE, wrote, resetHarness } from './_task-management-governed-harness';

const makeApp = appFactory(taskManagementRoutes);

beforeEach(() => resetHarness());

describe('POST /tasks records the assignment it makes', () => {
  it('a named assignee who is a member: their name, the assigner and the time are written with the task', async () => {
    h.selects = [[{ id: 42, name: 'Sarah Chen', email: 'sarah@example.test' }]];
    const before = Date.now();
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send({ title: 'Review: 2.5', moduleType: 'Authoring', assigneeId: 42 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const row = h.values[0] as Record<string, unknown>;
    expect(row.assigneeId).toBe(42);
    expect(row.assigneeName).toBe('Sarah Chen');
    expect(row.assignedBy).toBe(7);
    expect(row.assignedAt).toBeInstanceOf(Date);
    expect((row.assignedAt as Date).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('an assignee who is not a member of the organization is refused, and nothing is written', async () => {
    h.selects = [[]];
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send({ title: 'Review: 2.5', moduleType: 'Authoring', assigneeId: 999 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ASSIGNEE_NOT_MEMBER');
    expect(wrote()).toEqual([]);
    expect(spies.notifyTaskEvent).not.toHaveBeenCalled();
  });

  it('an unassigned task is unchanged: no assigner is recorded for an assignment nobody made', async () => {
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send({ title: 'T', moduleType: 'IND' });
    expect(res.status).toBe(200);
    const row = h.values[0] as Record<string, unknown>;
    expect(row.assignedBy ?? null).toBeNull();
    expect(row.assignedAt ?? null).toBeNull();
  });
});
