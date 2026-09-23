/**
 * Task writes on /api/tasks and /api/task-management are governed writes.
 *
 * Three defects, each pinned against the real router over HTTP:
 *
 * T1 — the ledger row was a second, best-effort fact. Every write called
 *      `auditTaskAction(params)` with no executor, so the lineage opened its own
 *      transaction AFTER the task write had already committed, and a failure
 *      there was caught, warned and returned as `{ recorded: false }` — which all
 *      nine call sites threw away. A PIN-signed completion could commit with no
 *      audit_logs / c2c_ana_actions entry and the caller was told 200. The write
 *      and its lineage now share ONE transaction: a failed ledger row rolls the
 *      write back and the request answers 500 AUDIT_WRITE_FAILED.
 *
 * T2 — no authority gate. An org `viewer` (the one role whose meaning is "does
 *      not write", server/middleware/orgMembership.ts) could create, move,
 *      archive, link and assign tasks. Writes now run `requireEditorAccess`;
 *      reads stay open.
 *
 * T4 — the archive reason was optional server-side while the UI required three
 *      characters and told the user it is written to the Part 11 trail. The
 *      server now refuses an absent or blank reason.
 *
 * C8 — from the review of that change: an archive reason is told which bound
 *      it broke. The rest of that review (C2–C7) and the review of the cascade
 *      change (C9–C11) are pinned in
 *      task-management-governed-writes-review.test.ts, on the same harness
 *      (_task-management-governed-harness.ts).
 *
 * Failure is injected at the ledger primitive (recordGovernedAction), so the
 * real task-audit code runs and decides which transaction the row lands on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

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

import taskManagementRoutes from '../taskManagement.routes';
import { h, spies, appFactory, BASE, TEMPLATE_ID, wrote, resetHarness } from './_task-management-governed-harness';

const makeApp = appFactory(taskManagementRoutes);

const writes = (): Array<{ name: string; send: (app: express.Express) => request.Test }> => [
  { name: 'POST /tasks', send: (a) => request(a).post(`${BASE}/tasks`).send({ title: 'T', moduleType: 'IND' }) },
  { name: 'PATCH /tasks/:id', send: (a) => request(a).patch(`${BASE}/tasks/TASK-1`).send({ status: 'in-progress' }) },
  { name: 'DELETE /tasks/:id', send: (a) => request(a).delete(`${BASE}/tasks/TASK-1`).send({ reason: 'Superseded by TASK-2' }) },
  {
    name: 'POST /tasks/dependencies',
    send: (a) =>
      request(a).post(`${BASE}/tasks/dependencies`).send({
        predecessorTaskId: 'TASK-A', successorTaskId: 'TASK-B', dependencyType: 'finish-to-start',
      }),
  },
  { name: 'POST /tasks/auto-assign', send: (a) => request(a).post(`${BASE}/tasks/auto-assign`).send({ taskIds: ['TASK-1'] }) },
  {
    name: 'POST /tasks/from-template/:id',
    send: (a) => request(a).post(`${BASE}/tasks/from-template/${TEMPLATE_ID}`).send({ projectId: 3 }),
  },
  {
    name: 'POST /tasks/bulk-create',
    send: (a) => request(a).post(`${BASE}/tasks/bulk-create`).send({ tasks: [{ title: 'T', moduleType: 'IND' }] }),
  },
  {
    name: 'POST /templates',
    send: (a) => request(a).post(`${BASE}/templates`).send({ name: 'N', category: 'c', tasks: [{ title: 'x' }] }),
  },
  {
    name: 'POST /automation',
    send: (a) =>
      request(a).post(`${BASE}/automation`).send({
        name: 'N', ruleType: 'event-based', triggerEvent: 'e', actionType: 'create',
      }),
  },
];

beforeEach(resetHarness);

describe('T1 — a task write and its ledger row commit or roll back together', () => {
  it('writes the create and its lineage on ONE transaction, then commits', async () => {
    const res = await request(makeApp()).post(`${BASE}/tasks`).send({ title: 'T', moduleType: 'IND' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(h.log).toEqual(['BEGIN', 'tx:insert', 'tx:execute', 'COMMIT']);
    expect(h.audits[0]).toMatchObject({ command: 'task.create', userId: 7, target: expect.stringMatching(/^task:TASK-/) });
  });

  it('rolls the create back and answers 500 AUDIT_WRITE_FAILED when the ledger row fails', async () => {
    h.auditFails = true;
    const res = await request(makeApp()).post(`${BASE}/tasks`).send({ title: 'T', moduleType: 'IND' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(typeof res.body.message).toBe('string');
    expect(h.log).toContain('ROLLBACK');
    expect(h.log).not.toContain('COMMIT');
    expect(spies.notifyTaskEvent).not.toHaveBeenCalled();
  });

  it('never commits a signed completion whose ledger row did not land', async () => {
    h.selects = [[{
      taskId: 'TASK-1', title: 'Freeze gate', status: 'review', approvalRequired: true,
      approvalStatus: 'pending', createdById: 9, assigneeId: 9,
    }]];
    spies.requireTaskSignoff.mockResolvedValue({
      required: true, ok: true,
      manifestation: { signedByName: 'Maya Lin', meaning: 'APPROVED', signedAt: '2026-09-23T00:00:00Z', method: 'password' },
    });
    h.auditFails = true;

    const res = await request(makeApp())
      .patch(`${BASE}/tasks/TASK-1`)
      .send({ status: 'completed', reason: 'Reviewed', signature: { password: 'correct-horse', meaning: 'APPROVED' } });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(h.log).toEqual(['db:select', 'BEGIN', 'tx:update', 'tx:execute', 'ROLLBACK']);
    // The cascade ran on the rolled-back transaction, so nothing it did
    // survives; and nobody is told about a completion that did not commit.
    expect(spies.cascadeUnblockOnCompletionInTx).toHaveBeenCalledWith(
      2, 'TASK-1', expect.objectContaining({ actorUserId: 7, tx: expect.anything() }),
    );
    expect(spies.notifyTaskEvent).not.toHaveBeenCalled();
  });

  it('commits the signed completion with its manifestation in the ledger payload', async () => {
    h.selects = [[{
      taskId: 'TASK-1', title: 'Freeze gate', status: 'review', approvalRequired: true,
      approvalStatus: 'pending', createdById: 9, assigneeId: 9,
    }]];
    spies.requireTaskSignoff.mockResolvedValue({
      required: true, ok: true,
      manifestation: { signedByName: 'Maya Lin', meaning: 'APPROVED', signedAt: '2026-09-23T00:00:00Z', method: 'password' },
    });

    const res = await request(makeApp())
      .patch(`${BASE}/tasks/TASK-1`)
      .send({ status: 'completed', reason: 'Reviewed', signature: { password: 'correct-horse', meaning: 'APPROVED' } });

    expect(res.status).toBe(200);
    expect(h.log).toEqual(['db:select', 'BEGIN', 'tx:update', 'tx:execute', 'COMMIT']);
    expect(h.audits[0]).toMatchObject({
      command: 'task.transition',
      reason: 'Reviewed',
      payload: expect.objectContaining({ from: 'review', to: 'completed', signature: expect.objectContaining({ meaning: 'APPROVED' }) }),
    });
    // On the completion's own transaction, as the actor who completed it.
    expect(spies.cascadeUnblockOnCompletionInTx).toHaveBeenCalledWith(
      2, 'TASK-1', expect.objectContaining({ actorUserId: 7, tx: expect.anything() }),
    );
  });
});

/*
 * isLegalTransition passes from === to, and the ledger row used to be written
 * only when the status CHANGED. So a PATCH to the status the task already had
 * ran its UPDATE, committed and answered 200 with no ledger row — including a
 * signed one on a completed-but-unapproved row, which appended a §11.50
 * manifestation and flipped approvalStatus to 'approved' unrecorded. A stale
 * board (or a second reviewer) clicking Advance on an already-completed task
 * sends exactly completed → completed.
 */
describe('T1 — a same-status PATCH is refused as stale or written with its ledger row, never unrecorded', () => {
  const signed = {
    required: true, ok: true,
    manifestation: { signedByName: 'Maya Lin', meaning: 'APPROVED', signedAt: '2026-09-23T00:00:00Z', method: 'password' },
  };

  it('a stale double-completion writes nothing and answers 409 CONFLICT_STALE', async () => {
    h.selects = [[{
      taskId: 'TASK-1', title: 'Freeze gate', status: 'completed', progress: 100,
      approvalRequired: true, approvalStatus: 'approved', createdById: 9, assigneeId: 9,
    }]];

    const res = await request(makeApp()).patch(`${BASE}/tasks/TASK-1`).send({ status: 'completed', progress: 100 });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('CONFLICT_STALE');
    expect(res.body.error).toMatch(/already "completed"/);
    // The signed record's completion time, progress and last editor are untouched.
    expect(h.log).toEqual(['db:select']);
    expect(h.audits).toEqual([]);
    expect(spies.cascadeUnblockOnCompletionInTx).not.toHaveBeenCalled();
    expect(spies.notifyTaskEvent).not.toHaveBeenCalled();
  });

  it('a late signature on a completed-but-unapproved task commits WITH its ledger row', async () => {
    h.selects = [[{
      taskId: 'TASK-1', title: 'Freeze gate', status: 'completed', progress: 100,
      approvalRequired: true, approvalStatus: null, createdById: 9, assigneeId: 9,
    }]];
    spies.requireTaskSignoff.mockResolvedValue(signed);

    const res = await request(makeApp())
      .patch(`${BASE}/tasks/TASK-1`)
      .send({ status: 'completed', progress: 100, reason: 'Late sign-off', signature: { password: 'correct-horse', meaning: 'APPROVED' } });

    expect(res.status).toBe(200);
    expect(h.log).toEqual(['db:select', 'BEGIN', 'tx:update', 'tx:execute', 'COMMIT']);
    expect(h.audits[0]).toMatchObject({
      command: 'task.transition',
      reason: 'Late sign-off',
      payload: expect.objectContaining({ from: 'completed', to: 'completed', signature: expect.objectContaining({ meaning: 'APPROVED' }) }),
    });
    expect(h.sets[0]).toMatchObject({ approvalStatus: 'approved' });
    // Signing an existing completion does not rewrite when it was completed —
    // the manifestation carries its own signedAt.
    expect(h.sets[0].completedAt).toBeUndefined();
    // The status did not change, so nothing downstream fires.
    expect(spies.cascadeUnblockOnCompletionInTx).not.toHaveBeenCalled();
    expect(spies.notifyTaskEvent).not.toHaveBeenCalled();
  });

  it('rolls back a late signature whose ledger row did not land', async () => {
    h.selects = [[{
      taskId: 'TASK-1', title: 'Freeze gate', status: 'completed', progress: 100,
      approvalRequired: true, approvalStatus: 'pending', createdById: 9, assigneeId: 9,
    }]];
    spies.requireTaskSignoff.mockResolvedValue(signed);
    h.auditFails = true;

    const res = await request(makeApp())
      .patch(`${BASE}/tasks/TASK-1`)
      .send({ status: 'completed', reason: 'Late sign-off', signature: { password: 'correct-horse', meaning: 'APPROVED' } });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(h.log).toEqual(['db:select', 'BEGIN', 'tx:update', 'tx:execute', 'ROLLBACK']);
  });

  it('a progress-only update in the same status is written with its ledger row', async () => {
    h.selects = [[{ taskId: 'TASK-1', title: 'Draft', status: 'in-progress', progress: 40, assigneeId: 9 }]];

    const res = await request(makeApp()).patch(`${BASE}/tasks/TASK-1`).send({ status: 'in-progress', progress: 60 });

    expect(res.status).toBe(200);
    expect(h.log).toEqual(['db:select', 'BEGIN', 'tx:update', 'tx:execute', 'COMMIT']);
    expect(h.audits[0]).toMatchObject({
      command: 'task.transition',
      payload: expect.objectContaining({ from: 'in-progress', to: 'in-progress', progress: 60 }),
    });
  });

  it('a same-status request that changes nothing is refused as stale, not re-written', async () => {
    h.selects = [[{ taskId: 'TASK-1', title: 'Draft', status: 'in-progress', progress: 40, assigneeId: 9 }]];

    const res = await request(makeApp()).patch(`${BASE}/tasks/TASK-1`).send({ status: 'in-progress', progress: 40 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT_STALE');
    expect(h.log).toEqual(['db:select']);
    expect(h.audits).toEqual([]);
  });
});

describe('T1 — every other task write rolls back with its ledger row', () => {
  it.each([
    ['DELETE /tasks/:id', (a: express.Express) => request(a).delete(`${BASE}/tasks/TASK-1`).send({ reason: 'Superseded by TASK-2' })],
    [
      'POST /tasks/dependencies',
      (a: express.Express) => {
        h.selects = [[{ taskId: 'TASK-A', status: 'in-progress' }], [{ taskId: 'TASK-B', status: 'pending', title: 'B', assigneeId: 4 }]];
        return request(a).post(`${BASE}/tasks/dependencies`).send({
          predecessorTaskId: 'TASK-A', successorTaskId: 'TASK-B', dependencyType: 'finish-to-start',
        });
      },
    ],
    [
      'POST /tasks/auto-assign',
      (a: express.Express) => {
        h.selects = [[{ taskId: 'TASK-1', title: 'T' }]];
        spies.getOptimalAssignee.mockResolvedValue({ id: 9, name: 'Ana' });
        return request(a).post(`${BASE}/tasks/auto-assign`).send({ taskIds: ['TASK-1'] });
      },
    ],
    ['POST /tasks/from-template/:id', (a: express.Express) => request(a).post(`${BASE}/tasks/from-template/${TEMPLATE_ID}`).send({ projectId: 3 })],
    ['POST /tasks/bulk-create', (a: express.Express) => request(a).post(`${BASE}/tasks/bulk-create`).send({ tasks: [{ title: 'T', moduleType: 'IND' }] })],
  ])('%s rolls back and answers 500 AUDIT_WRITE_FAILED when its ledger row fails', async (_name, send) => {
    h.auditFails = true;
    const res = await send(makeApp());

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(h.log).toContain('ROLLBACK');
    expect(h.log).not.toContain('COMMIT');
    // The ledger row was attempted on the write's own transaction, never on a
    // separate pool connection.
    expect(h.log.some((l) => l.startsWith('pool:'))).toBe(false);
    expect(spies.notifyTaskEvent).not.toHaveBeenCalled();
  });

  it('a notification that was sent but not recorded is reported as a failure, not a success', async () => {
    h.selects = [[{ taskId: 'TASK-1', title: 'T', assigneeId: 42 }]];
    h.auditFails = true;

    const res = await request(makeApp()).post(`${BASE}/tasks/TASK-1/notify`).send({ message: 'Please review' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
  });

  it('refuses a write with no attributable actor before anything is written', async () => {
    const res = await request(makeApp('member', null)).post(`${BASE}/tasks`).send({ title: 'T', moduleType: 'IND' });

    expect(res.status).toBe(401);
    expect(wrote()).toEqual([]);
  });
});

describe('T2 — an org viewer may read tasks but not write them', () => {
  it.each(writes().map((w) => [w.name, w.send] as const))('%s is 403 for a viewer, and nothing is written', async (_n, send) => {
    const res = await send(makeApp('viewer'));

    expect(res.status).toBe(403);
    expect(wrote()).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  it('a member still creates a task', async () => {
    const res = await request(makeApp('member')).post(`${BASE}/tasks`).send({ title: 'T', moduleType: 'IND' });
    expect(res.status).toBe(200);
  });

  it('a viewer still reads', async () => {
    h.selects = [[{ taskId: 'TASK-1' }]];
    const res = await request(makeApp('viewer')).get(`${BASE}/tasks/by-module/IND`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('T4 — archiving demands the reason the UI promises to record', () => {
  it.each([
    ['no body', undefined],
    ['no reason', {}],
    ['a blank reason', { reason: '   ' }],
    ['a reason shorter than three characters once trimmed', { reason: '  ok  ' }],
  ])('refuses %s with 400 and writes nothing', async (_n, body) => {
    const req = request(makeApp()).delete(`${BASE}/tasks/TASK-1`);
    const res = await (body === undefined ? req : req.send(body));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe('string');
    expect(wrote()).toEqual([]);
  });

  it('records the trimmed reason on the archive’s ledger row', async () => {
    const res = await request(makeApp()).delete(`${BASE}/tasks/TASK-1`).send({ reason: '  Superseded by TASK-2  ' });

    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(true);
    expect(h.log).toEqual(['BEGIN', 'tx:update', 'tx:execute', 'COMMIT']);
    expect(h.audits[0]).toMatchObject({ command: 'task.delete', reason: 'Superseded by TASK-2' });
  });
});

describe('C8 — an archive reason is refused for what is actually wrong with it', () => {
  it('a reason over 1000 characters is told the maximum, not the minimum', async () => {
    const res = await request(makeApp()).delete(`${BASE}/tasks/TASK-1`).send({ reason: 'x'.repeat(1001) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at most 1000 characters/);
    expect(res.body.message).not.toMatch(/at least 3/);
    expect(wrote()).toEqual([]);
  });

  it('a short reason is told the minimum', async () => {
    const res = await request(makeApp()).delete(`${BASE}/tasks/TASK-1`).send({ reason: ' ok ' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 3 characters/);
  });

  it('exactly 1000 characters is accepted', async () => {
    const res = await request(makeApp()).delete(`${BASE}/tasks/TASK-1`).send({ reason: 'x'.repeat(1000) });
    expect(res.status).toBe(200);
  });
});
