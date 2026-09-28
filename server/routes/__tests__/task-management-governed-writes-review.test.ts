/**
 * Task writes on /api/tasks and /api/task-management — the reviews of the
 * governed-write change (T1, T2 and T4, in task-management-governed-writes.test.ts),
 * each pinned against the real router over HTTP on the same harness
 * (_task-management-governed-harness.ts):
 *
 * C2–C7 — the review of that change: lock order (row locks before the first
 *      ledger write), partial batches that name what committed whatever the
 *      failure, a delivered-but-unrecorded notification, archived tasks out of
 *      auto-assign's reach, the canonical actor/org pair, and ledgered batch
 *      edges. (C8, an archive reason told which bound it broke, sits with T4.)
 *      The completion cascade itself (C1) runs against real Postgres in
 *      task-completion-cascade.pglite.integration.test.ts.
 *
 * C9–C11 — the review of the cascade change: a PATCH whose COMMIT was lost is
 *      reported as unknown, never as a failure; PATCH's compare-and-set skips
 *      an archived row; and the completion's own ledger row precedes the rows
 *      of the dependents it unblocked.
 *
 * Failure is injected at the ledger primitive (recordGovernedAction), so the
 * real task-audit code runs and decides which transaction the row lands on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Each stand-in is built by the shared harness (state, spies, the drizzle-shaped
// db and the ledger primitive); the mocks stay here, in the file they apply to.
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

import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import taskManagementRoutes from '../taskManagement.routes';
import { BUILTIN_WORKFLOW_TEMPLATES } from '../../services/tasking/workflow-templates';
import { h, spies, appFactory, BASE, TEMPLATE_ID, wrote, resetHarness } from './_task-management-governed-harness';

/** A captured WHERE condition as the SQL text Postgres would receive. */
const sqlOf = (cond: unknown) => new PgDialect().sqlToQuery(cond as SQL).sql;

const makeApp = appFactory(taskManagementRoutes);

beforeEach(resetHarness);

describe('C2 — lock order: every task-row UPDATE precedes the first ledger write', () => {
  it('POST /tasks/dependencies blocks the successor before writing either ledger row', async () => {
    h.selects = [[{ taskId: 'TASK-A', status: 'in-progress' }], [{ taskId: 'TASK-B', status: 'pending', title: 'B', assigneeId: 4 }]];

    const res = await request(makeApp()).post(`${BASE}/tasks/dependencies`).send({
      predecessorTaskId: 'TASK-A', successorTaskId: 'TASK-B', dependencyType: 'finish-to-start',
    });

    expect(res.status).toBe(200);
    expect(res.body.successorBlocked).toBe(true);
    expect(h.log).toEqual(['db:select', 'db:select', 'BEGIN', 'tx:insert', 'tx:update', 'tx:execute', 'tx:execute', 'COMMIT']);
    expect(h.audits.map((a) => a.command)).toEqual(['task.link', 'task.transition']);
  });

  it('PATCH → completed runs the cascade on its own transaction, before any ledger row, and notifies after COMMIT', async () => {
    h.selects = [[{ taskId: 'TASK-1', title: 'Draft', status: 'review', progress: 50, createdById: 7, assigneeId: 7 }]];
    const notice = { organizationId: 2, recipientUserId: 42, category: 'task_update', title: 'Unblocked: B', taskId: 'TASK-B' };
    const unblockedB = {
      orgId: 2, userId: 7, command: 'task.transition', taskId: 'TASK-B',
      payload: { from: 'blocked', to: 'in-progress', cause: 'predecessor-completed', predecessor: 'TASK-1' },
      reason: 'Unblocked: predecessor TASK-1 completed',
    };
    spies.cascadeUnblockOnCompletionInTx.mockImplementation(async (...args: unknown[]) => {
      const { tx } = args[2] as { tx: { update: () => { set: () => { where: () => PromiseLike<unknown> } } } };
      await tx.update().set().where();
      return { ledger: [unblockedB], notices: [notice] };
    });
    spies.notifyTaskEvent.mockImplementation(() => void h.log.push('notify'));

    const res = await request(makeApp()).patch(`${BASE}/tasks/TASK-1`).send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(spies.cascadeUnblockOnCompletionInTx).toHaveBeenCalledWith(
      2, 'TASK-1', expect.objectContaining({ actorUserId: 7, tx: expect.anything() }),
    );
    expect(h.log).toEqual(['db:select', 'BEGIN', 'tx:update', 'tx:update', 'tx:execute', 'tx:execute', 'COMMIT', 'notify']);
    expect(spies.notifyTaskEvent).toHaveBeenCalledWith(notice);
    // C11 — the cause before its effect: TASK-1's completion, then B's unblocking.
    expect(h.audits.map((a) => a.target)).toEqual(['task:TASK-1', 'task:TASK-B']);
    expect(h.audits[1]).toMatchObject({ command: 'task.transition', reason: 'Unblocked: predecessor TASK-1 completed' });
  });
});

describe('C9 — a PATCH whose COMMIT was lost is reported as unknown, never as a failure', () => {
  const review = { taskId: 'TASK-1', title: 'Freeze gate', status: 'review', progress: 50, createdById: 9, assigneeId: 9 };

  it('answers 500 OUTCOME_UNKNOWN with a sentence that says so, and tells nobody it happened', async () => {
    h.selects = [[review]];
    h.failCommit = 1;
    const notice = { organizationId: 2, recipientUserId: 42, category: 'task_update', title: 'Unblocked: B', taskId: 'TASK-B' };
    spies.cascadeUnblockOnCompletionInTx.mockResolvedValue({ ledger: [], notices: [notice] });

    const res = await request(makeApp()).patch(`${BASE}/tasks/TASK-1`).send({ status: 'completed' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('OUTCOME_UNKNOWN');
    expect(res.body.message).toMatch(/whether .* saved is unknown/i);
    expect(res.body.message).toMatch(/reload/i);
    expect(JSON.stringify(res.body)).not.toMatch(/Failed to update|Connection terminated/);
    expect(h.log).toContain('COMMIT-LOST');
    expect(spies.notifyTaskEvent).not.toHaveBeenCalled();
  });

  it('a failure inside the transaction is still the rolled-back 500, not unknown', async () => {
    h.selects = [[review]];
    h.fail = (tag, kind) => (tag === 'tx' && kind === 'update' ? new Error('deadlock detected') : undefined);

    const res = await request(makeApp()).patch(`${BASE}/tasks/TASK-1`).send({ status: 'completed' });

    expect(res.status).toBe(500);
    expect(res.body.error).not.toBe('OUTCOME_UNKNOWN');
    expect(h.log).toContain('ROLLBACK');
    expect(JSON.stringify(res.body)).not.toMatch(/deadlock/);
  });
});

describe('C10 — PATCH never completes a task archived after it was read', () => {
  it('its compare-and-set UPDATE matches only a row that is not archived', async () => {
    h.selects = [[{ taskId: 'TASK-1', title: 'Draft', status: 'review', progress: 50, createdById: 9, assigneeId: 9 }]];

    await request(makeApp()).patch(`${BASE}/tasks/TASK-1`).send({ status: 'completed' });

    const update = h.wheres.filter((w) => w.tag === 'tx' && w.kind === 'update');
    expect(update).toHaveLength(1);
    expect(sqlOf(update[0].cond)).toMatch(/"deleted_at" is null/);
  });
});

describe('C3 — a batch that fails part-way names what it committed, whatever the failure', () => {
  const two = { tasks: [{ title: 'A', moduleType: 'IND' }, { title: 'B', moduleType: 'IND' }] };

  it('bulk-create: an insert failure after the first task committed reports that task', async () => {
    let inserts = 0;
    h.fail = (_tag, kind) => (kind === 'insert' && ++inserts === 2 ? new Error('deadlock detected') : undefined);

    const res = await request(makeApp()).post(`${BASE}/tasks/bulk-create`).send(two);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.message).toMatch(/^1 task\(s\) were created and recorded/);
    expect(res.body.message).toMatch(/were not created/);
    expect(JSON.stringify(res.body)).not.toMatch(/deadlock/);
  });

  it('bulk-create: an assignee lookup that throws after the first commit reports that task', async () => {
    spies.getOptimalAssignee.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('roster read failed'));

    const res = await request(makeApp()).post(`${BASE}/tasks/bulk-create`).send(two);

    expect(res.status).toBe(500);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.message).toMatch(/^1 task\(s\) were created and recorded/);
  });

  it('bulk-create: a dependency link that fails after every task committed says the tasks exist and the links do not', async () => {
    let inserts = 0;
    h.fail = (_tag, kind) => (kind === 'insert' && ++inserts === 3 ? new Error('fk violation') : undefined);

    const res = await request(makeApp()).post(`${BASE}/tasks/bulk-create`).send({
      tasks: [{ title: 'A', moduleType: 'IND' }, { title: 'B', moduleType: 'IND', dependencies: ['A'] }],
    });

    expect(res.status).toBe(500);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.message).toMatch(/^All 2 task\(s\) were created and recorded/);
    expect(res.body.message).toMatch(/dependenc/i);
  });

  it('bulk-create: a COMMIT whose outcome is unknown is reported as unknown, never as not created', async () => {
    h.failCommit = 2;

    const res = await request(makeApp()).post(`${BASE}/tasks/bulk-create`).send(two);

    expect(res.status).toBe(500);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.message).toMatch(/^1 task\(s\) were created and recorded/);
    expect(res.body.message).toMatch(/whether "B" was created is unknown/);
  });

  it('auto-assign: a failure after the first assignment committed reports that assignment', async () => {
    h.selects = [[{ taskId: 'TASK-1', title: 'T1' }], [{ taskId: 'TASK-2', title: 'T2' }]];
    spies.getOptimalAssignee
      .mockResolvedValueOnce({ id: 9, name: 'Ana' })
      .mockRejectedValueOnce(new Error('roster read failed'));

    const res = await request(makeApp()).post(`${BASE}/tasks/auto-assign`).send({ taskIds: ['TASK-1', 'TASK-2'] });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toEqual([{ taskId: 'TASK-1', assignedTo: 'Ana', assigneeId: 9 }]);
    expect(res.body.message).toMatch(/^1 task\(s\) were assigned and recorded/);
    expect(JSON.stringify(res.body)).not.toMatch(/roster read failed/);
  });
});

describe('C4 — a delivered notification whose ledger connection failed is reported as delivered and unrecorded', () => {
  it('answers AUDIT_WRITE_FAILED with the delivered sentence, not a generic send failure', async () => {
    h.selects = [[{ taskId: 'TASK-1', title: 'T', assigneeId: 42 }]];
    h.connectFails = true;

    const res = await request(makeApp()).post(`${BASE}/tasks/TASK-1/notify`).send({ message: 'Please review' });

    expect(spies.createNotification).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(res.body.message).toMatch(/was delivered/);
    expect(JSON.stringify(res.body)).not.toMatch(/ETIMEDOUT/);
  });
});

describe('C5 — auto-assign never reassigns an archived task, and never ledgers an assignment that did not happen', () => {
  it('reads and updates only rows that are not archived', async () => {
    h.selects = [[{ taskId: 'TASK-1', title: 'T' }]];
    spies.getOptimalAssignee.mockResolvedValue({ id: 9, name: 'Ana' });

    await request(makeApp()).post(`${BASE}/tasks/auto-assign`).send({ taskIds: ['TASK-1'] });

    const scoped = h.wheres.filter((w) => w.kind === 'select' || w.kind === 'update');
    expect(scoped.map((w) => w.kind)).toEqual(['select', 'update']);
    for (const w of scoped) expect(sqlOf(w.cond)).toMatch(/"deleted_at" is null/);
  });

  it('an UPDATE that matched no row writes no ledger row and is not reported as assigned', async () => {
    h.selects = [[{ taskId: 'TASK-1', title: 'T' }]];
    h.updated = []; // archived between the read and the write
    spies.getOptimalAssignee.mockResolvedValue({ id: 9, name: 'Ana' });

    const res = await request(makeApp()).post(`${BASE}/tasks/auto-assign`).send({ taskIds: ['TASK-1'] });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.data).toEqual([]);
    expect(h.audits).toEqual([]);
    expect(spies.notifyTaskEvent).not.toHaveBeenCalled();
  });
});

describe('C6 — the actor and organization are the ones requireEditorAccess resolved', () => {
  it('refuses a non-integer actor id with 401 before anything is written', async () => {
    const res = await request(makeApp('member', 7.5)).post(`${BASE}/tasks`).send({ title: 'T', moduleType: 'IND' });

    expect(res.status).toBe(401);
    expect(wrote()).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  it('writes the task and its ledger row under the organization the gate checked', async () => {
    const res = await request(makeApp('member', 7, { organizationId: 5 }))
      .post(`${BASE}/tasks`).send({ title: 'T', moduleType: 'IND' });

    expect(res.status).toBe(200);
    expect(h.values[0]).toMatchObject({ organizationId: 5 });
    expect(h.audits[0]).toMatchObject({ orgId: 5 });
  });
});

describe('C7 — every dependency edge a batch creates is ledgered with task.link on its own transaction', () => {
  it('bulk-create records each edge with the transaction that inserts it', async () => {
    const res = await request(makeApp()).post(`${BASE}/tasks/bulk-create`).send({
      tasks: [{ title: 'A', moduleType: 'IND' }, { title: 'B', moduleType: 'IND', dependencies: ['A'] }],
    });

    expect(res.status).toBe(200);
    const [a, b, edge] = h.values;
    expect(edge).toMatchObject({ predecessorTaskId: a.taskId, successorTaskId: b.taskId });
    const links = h.audits.filter((x) => x.command === 'task.link');
    expect(links).toEqual([
      expect.objectContaining({ target: `task:${a.taskId}`, payload: expect.objectContaining({ successorTaskId: b.taskId }) }),
    ]);
    // The edge and its ledger row are one transaction of their own.
    expect(h.log.slice(-4)).toEqual(['BEGIN', 'tx:insert', 'tx:execute', 'COMMIT']);
    expect(h.log.some((l) => l === 'db:insert')).toBe(false);
  });

  it('from-template records every template edge on the workflow’s transaction', async () => {
    const template = BUILTIN_WORKFLOW_TEMPLATES[0];

    const res = await request(makeApp()).post(`${BASE}/tasks/from-template/${TEMPLATE_ID}`).send({ projectId: 3 });

    expect(res.status).toBe(200);
    const links = h.audits.filter((x) => x.command === 'task.link');
    expect(links).toHaveLength(template.dependencies.length);
    const edges = h.values.filter((v) => 'predecessorTaskId' in v);
    expect(links.map((l) => l.target)).toEqual(edges.map((e) => `task:${e.predecessorTaskId}`));
    expect(h.log.filter((l) => l === 'BEGIN')).toHaveLength(1);
  });
});
