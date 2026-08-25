/**
 * POST /api/task-management/tasks/dependencies — creating a blocking edge must
 * actually put the successor into `blocked`.
 *
 * WHY THIS FILE EXISTS
 * `cascadeUnblockOnCompletion` only wakes a successor whose status is literally
 * 'blocked'. Nothing ever set it: this route recorded the edge and left the
 * successor 'pending', `linkTasks` only appended to `blockedBy[]`, and the board
 * had no Blocked column to set it from. So the cascade — the whole point of the
 * dependency graph — was correct code that never fired on any real user path:
 * completing a predecessor notified the task's creator and nobody downstream.
 *
 * These tests pin the missing half. They also pin what must NOT happen: a
 * non-blocking edge, an already-finished predecessor, or a terminal successor
 * must all leave the successor's status alone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const state = vi.hoisted(() => ({
  selects: [] as any[][],
  updated: [] as any[],
  lastUpdateSet: null as any,
  cycle: false,
}));

const spies = vi.hoisted(() => ({
  auditTaskAction: vi.fn(),
  notifyTaskEvent: vi.fn(),
  wouldCreateDependencyCycle: vi.fn(),
  cascadeUnblockOnCompletion: vi.fn(),
}));

vi.mock('../../db', () => {
  const selectChain: any = {
    select: () => selectChain,
    from: () => selectChain,
    where: () => selectChain,
    orderBy: () => selectChain,
    limit: () => selectChain,
    then: (r: (v: any) => unknown) => Promise.resolve(state.selects.shift() ?? []).then(r),
  };
  const insertChain: any = {
    values: () => insertChain,
    returning: () => Promise.resolve([{ dependencyId: 'DEP-1' }]),
  };
  const updateChain: any = {
    set: (v: any) => {
      state.lastUpdateSet = v;
      return updateChain;
    },
    where: () => updateChain,
    returning: () => Promise.resolve(state.updated),
  };
  const db: any = {
    select: () => selectChain,
    insert: () => insertChain,
    update: () => updateChain,
  };
  return { db, pool: {} };
});
vi.mock('../../services/tasking/task-audit', () => ({ auditTaskAction: spies.auditTaskAction }));
vi.mock('../../services/notifications/notification-service', () => ({ createNotification: vi.fn() }));
vi.mock('../../services/tasking/task-side-effects', () => ({
  notifyTaskEvent: spies.notifyTaskEvent,
  cascadeUnblockOnCompletion: spies.cascadeUnblockOnCompletion,
  wouldCreateDependencyCycle: spies.wouldCreateDependencyCycle,
}));

import taskManagementRoutes from '../taskManagement.routes';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { organizationId: 2, id: 7 };
    next();
  });
  app.use('/api/task-management', taskManagementRoutes);
  return app;
}

/** Queue the predecessor then successor rows the handler reads, in that order. */
function given(pred: any, succ: any) {
  state.selects = [[pred], [succ]];
}

beforeEach(() => {
  state.selects = [];
  state.updated = [];
  state.lastUpdateSet = null;
  vi.clearAllMocks();
  spies.wouldCreateDependencyCycle.mockResolvedValue(false);
});

const link = (extra: Record<string, unknown> = {}) =>
  request(makeApp())
    .post('/api/task-management/tasks/dependencies')
    .send({ predecessorTaskId: 'TASK-A', successorTaskId: 'TASK-B', dependencyType: 'finish-to-start', ...extra });

describe('dependency creation blocks the successor', () => {
  it('moves a pending successor to blocked when the predecessor is unfinished', async () => {
    given(
      { taskId: 'TASK-A', status: 'in-progress' },
      { taskId: 'TASK-B', status: 'pending', title: 'Downstream', assigneeId: 42 },
    );
    state.updated = [{ taskId: 'TASK-B' }];

    const res = await link();

    expect(res.status).toBe(200);
    expect(res.body.successorBlocked).toBe(true);
    expect(state.lastUpdateSet).toMatchObject({ status: 'blocked' });
    // The transition is a governed change like any other.
    expect(spies.auditTaskAction).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'task.transition',
        taskId: 'TASK-B',
        payload: { from: 'pending', to: 'blocked' },
      }),
    );
    // And the person who has to wait is told.
    expect(spies.notifyTaskEvent).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'task_blocked', recipientUserId: 42, taskId: 'TASK-B' }),
    );
  });

  it('leaves the successor alone when the predecessor is already complete', async () => {
    given(
      { taskId: 'TASK-A', status: 'completed' },
      { taskId: 'TASK-B', status: 'pending', title: 'Downstream', assigneeId: 42 },
    );

    const res = await link();

    expect(res.status).toBe(200);
    expect(res.body.successorBlocked).toBe(false);
    expect(state.lastUpdateSet).toBeNull();
    expect(spies.notifyTaskEvent).not.toHaveBeenCalled();
  });

  it('leaves the successor alone for a NON-blocking edge', async () => {
    given(
      { taskId: 'TASK-A', status: 'in-progress' },
      { taskId: 'TASK-B', status: 'pending', title: 'Downstream', assigneeId: 42 },
    );

    const res = await link({ isBlocking: false });

    expect(res.status).toBe(200);
    expect(res.body.successorBlocked).toBe(false);
    expect(state.lastUpdateSet).toBeNull();
  });

  it('never drags a completed successor backwards into blocked', async () => {
    // completed -> blocked is not a legal transition; the guard must hold here
    // as it does on the PATCH route.
    given(
      { taskId: 'TASK-A', status: 'in-progress' },
      { taskId: 'TASK-B', status: 'completed', title: 'Already done', assigneeId: 42 },
    );

    const res = await link();

    expect(res.status).toBe(200);
    expect(res.body.successorBlocked).toBe(false);
    expect(state.lastUpdateSet).toBeNull();
  });

  it('reports not-blocked when the compare-and-set loses the race', async () => {
    given(
      { taskId: 'TASK-A', status: 'in-progress' },
      { taskId: 'TASK-B', status: 'pending', title: 'Downstream', assigneeId: 42 },
    );
    state.updated = []; // status moved under us

    const res = await link();

    expect(res.status).toBe(200);
    expect(res.body.successorBlocked).toBe(false);
    // Nothing may be asserted about a transition that did not commit.
    expect(spies.auditTaskAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ command: 'task.transition' }),
    );
    expect(spies.notifyTaskEvent).not.toHaveBeenCalled();
  });
});
