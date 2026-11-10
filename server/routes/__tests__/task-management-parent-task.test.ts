/**
 * POST /tasks with parentTaskId (P-111 item 4, slice 5): one level of subtasks. The route asks the one decider
 * (tasking/task-project.ts admitParentTask, pinned on native PostgreSQL under RLS in tests/db/work-projects.dbtest.ts)
 * on the request's transaction, with the admitted project. A refusal is 409 PARENT_TASK_REFUSED with nothing written.
 * A body with no parent never asks. Same harness as the governed-write tests; the decider is stood in here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../db', async () => (await import('./_task-management-governed-harness')).dbModule());
vi.mock('../c2c/actions', async () => (await import('./_task-management-governed-harness')).ledgerModule());
vi.mock('../../services/tasking/task-side-effects', async () => (await import('./_task-management-governed-harness')).sideEffectsModule());
vi.mock('../../services/notifications/notification-service', async () => (await import('./_task-management-governed-harness')).notificationModule());
vi.mock('../../services/tasking/task-signoff', async () => (await import('./_task-management-governed-harness')).signoffModule());
vi.mock('../../services/tasking/task-planning', async () => (await import('./_task-management-governed-harness')).planningModule());
const decider = vi.hoisted(() => ({ fn: vi.fn(async (..._a: unknown[]): Promise<number> => 501) }));
vi.mock('../../services/tasking/task-project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/tasking/task-project')>()),
  admitParentTask: decider.fn,
}));

import taskManagementRoutes from '../taskManagement.routes';
import { TaskProjectAdmissionError } from '../../services/tasking/task-project';
import { h, appFactory, BASE, wrote, resetHarness } from './_task-management-governed-harness';

const makeApp = appFactory(taskManagementRoutes);
const subtask = { title: 'Check the impurity limits', moduleType: 'CMC', projectId: 14, parentTaskId: 501 };

beforeEach(() => { resetHarness(); decider.fn.mockReset(); decider.fn.mockResolvedValue(501); });

describe('POST /tasks — a subtask under its parent (P-111 item 4)', () => {
  it('asks the one decider on the request\'s transaction, with the admitted project and the body\'s parent', async () => {
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send(subtask);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(decider.fn).toHaveBeenCalledOnce();
    const [, input] = decider.fn.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input).toEqual({ organizationId: 2, projectId: 14, parentTaskId: 501 });
    expect(h.log[0]).toBe('BEGIN');
    expect(h.log.at(-1)).toBe('COMMIT');
  });

  it('refuses a parent the decider refuses: 409 in its own words, nothing written', async () => {
    decider.fn.mockRejectedValue(new TaskProjectAdmissionError(409, 'PARENT_TASK_REFUSED',
      'A subtask goes under a task of the same project that is not itself a subtask. Nothing was created.'));
    const res = await request(makeApp('member', 7)).post(`${BASE}/tasks`).send(subtask);
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('PARENT_TASK_REFUSED');
    expect(wrote()).toEqual([]);
    expect(h.log).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('never asks for a task with no parent, and refuses a malformed parent before anything is read', async () => {
    const plain = { title: subtask.title, moduleType: subtask.moduleType, projectId: subtask.projectId };
    expect((await request(makeApp('member', 7)).post(`${BASE}/tasks`).send(plain)).status).toBe(200);
    expect(decider.fn).not.toHaveBeenCalled();
    expect((await request(makeApp('member', 7)).post(`${BASE}/tasks`).send({ ...subtask, parentTaskId: -3 })).status).toBe(400);
    expect(decider.fn).not.toHaveBeenCalled();
  });
});
