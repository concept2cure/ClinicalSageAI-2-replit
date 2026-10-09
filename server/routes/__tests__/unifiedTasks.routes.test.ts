/**
 * /api/regulatory/tasks and /api/unified-tasks (unifiedTasks.routes.ts) write
 * the same unified_tasks table as /api/tasks, and are held to the same rules.
 *
 * T2 — no authority gate. POST /unified, POST /:id/link, POST /sync/:module and
 *      PATCH /:id/status ran for any org member, so a `viewer` refused by
 *      /api/tasks could create, link, sync and transition tasks one URL over.
 *      Every write now runs requireEditorAccess; reads stay open.
 *
 * T1 — the ledger row was a second, best-effort fact. Each write committed on
 *      the pool and then called auditTaskAction with no executor, whose failure
 *      was caught and returned as `{ recorded: false }` — and all three sites
 *      threw it away (the sync wrote no row at all). A status change, a signed
 *      completion included, could commit with no ledger row and answer 200.
 *      Each write and its ledger row now share ONE transaction
 *      (auditTaskActionInTx): a failed row rolls the write back and the request
 *      answers 500 AUDIT_WRITE_FAILED. A completion unblocks its dependents on
 *      that same transaction, their rows after its own, their notifications
 *      after COMMIT.
 *
 * The service is mocked (its SQL runs against real Postgres in
 * unifiedTasks-governed.pglite.integration.test.ts); what is pinned here is which
 * transaction each write and each ledger row lands on. Failure is injected at
 * the ledger primitive (recordGovernedAction), so the real task-audit code runs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const h = vi.hoisted(() => ({
  /** Ordered trace: transaction boundaries, service writes (and the runner
   *  each was handed), ledger statements, cascade calls, notifications. */
  log: [] as string[],
  audits: [] as any[],
  /** Fail the ledger row: every row, or those the predicate picks. */
  auditFails: false as boolean | ((row: any) => boolean),
  /** The Nth transaction (1-based) whose COMMIT is lost — its outcome unknown. */
  failCommit: 0,
  transactions: 0,
  realSignoff: null as null | ((...a: any[]) => Promise<any>),
}));

const svc = vi.hoisted(() => ({
  getAllUnifiedTasks: vi.fn(),
  getOrgTaskById: vi.fn(),
  getTasksByModule: vi.fn(),
  getUnifiedDashboardMetrics: vi.fn(),
  createUnifiedTask: vi.fn(),
  linkTasks: vi.fn(),
  syncTasksFromModule: vi.fn(),
  updateTaskStatus: vi.fn(),
}));

const spies = vi.hoisted(() => ({
  notifyTaskEvent: vi.fn(),
  cascadeUnblockOnCompletionInTx: vi.fn(),
  requireTaskSignoff: vi.fn(),
}));

/** Which runner a service write was handed: the transaction, the db, or none. */
const runnerTag = (r: unknown) => (r as { __tag?: string } | undefined)?.__tag ?? 'none';

vi.mock('../../db', () => {
  const runner = (tag: string) => ({
    __tag: tag,
    execute: async () => {
      h.log.push(`${tag}:execute`);
      return { rows: [] };
    },
  });
  const db: any = {
    ...runner('db'),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      h.log.push('BEGIN');
      const n = ++h.transactions;
      let out: unknown;
      try {
        out = await cb(runner('tx'));
      } catch (err) {
        h.log.push('ROLLBACK');
        throw err;
      }
      if (n === h.failCommit) {
        // The COMMIT was sent and the connection dropped: it may or may not have landed.
        h.log.push('COMMIT-LOST');
        throw new Error('Connection terminated unexpectedly');
      }
      h.log.push('COMMIT');
      return out;
    },
  };
  const pool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({
      query: async (sql: string) => {
        h.log.push(`pool:${sql.split(' ')[0]}`);
        return { rows: [] };
      },
      release: () => undefined,
    }),
  };
  return { db, pool };
});
// The routes open their transactions on requestDb(req), the request's
// tenant-scoped connection; here that is the same recording db.
vi.mock('../../db/requestDb', async () => {
  const m = (await import('../../db')) as unknown as { db: unknown };
  return { requestDb: () => m.db };
});

vi.mock('../c2c/actions', () => ({
  recordGovernedAction: async (client: { query: (s: string) => Promise<unknown> }, row: any) => {
    h.audits.push(row);
    await client.query('INSERT INTO audit_logs');
    const fail = typeof h.auditFails === 'function' ? h.auditFails(row) : h.auditFails;
    if (fail) throw new Error('audit_logs: connection reset');
    return { actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'c' };
  },
}));

vi.mock('../../services/unifiedTaskService', async (importOriginal) => {
  // The real refusal type, so the route's mapping is tested against it.
  const { ModuleSyncUnavailableError } =
    await importOriginal<typeof import('../../services/unifiedTaskService')>();
  const write =
    (name: 'createUnifiedTask' | 'linkTasks' | 'syncTasksFromModule' | 'updateTaskStatus') =>
    (...a: unknown[]) => {
      h.log.push(`svc:${name}@${runnerTag(a[a.length - 1])}`);
      return (svc[name] as (...x: unknown[]) => unknown)(...a);
    };
  return {
    ModuleSyncUnavailableError,
    default: {
      getAllUnifiedTasks: svc.getAllUnifiedTasks,
      getOrgTaskById: svc.getOrgTaskById,
      getTasksByModule: svc.getTasksByModule,
      getUnifiedDashboardMetrics: svc.getUnifiedDashboardMetrics,
      createUnifiedTask: write('createUnifiedTask'),
      linkTasks: write('linkTasks'),
      syncTasksFromModule: write('syncTasksFromModule'),
      updateTaskStatus: write('updateTaskStatus'),
    },
    MODULE_CONFIG: {},
  };
});

vi.mock('../../services/tasking/task-side-effects', () => ({
  cascadeUnblockOnCompletionInTx: (...a: unknown[]) => {
    h.log.push(`cascade@${runnerTag((a[2] as { tx?: unknown } | undefined)?.tx)}`);
    return spies.cascadeUnblockOnCompletionInTx(...a);
  },
  notifyTaskEvent: (n: { taskId?: string }) => {
    h.log.push(`notify:${n.taskId}`);
    return spies.notifyTaskEvent(n);
  },
  wouldCreateDependencyCycle: vi.fn(async () => false),
}));

// The real sign-off decision runs unless a test says otherwise (the 428 case
// below is the real gate); a signed completion is stubbed per test.
vi.mock('../../services/tasking/task-signoff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/tasking/task-signoff')>();
  h.realSignoff = actual.requireTaskSignoff as (...a: any[]) => Promise<any>;
  return { ...actual, requireTaskSignoff: spies.requireTaskSignoff };
});

import unifiedTaskRoutes from '../unifiedTasks.routes';
import { ModuleSyncUnavailableError } from '../../services/unifiedTaskService';

const BASE = '/api/regulatory/tasks';

/** The two mounts of this one router (register-core-routes /
 *  register-advanced-platform-routes). `role` is the org role the auth
 *  middleware resolves; `org`, when null, simulates no org context. */
function makeApp(role: string | null = 'member', userId: number | null = 7, org: number | null = 2) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = {
      ...(org != null ? { organizationId: org } : {}),
      ...(userId ? { id: userId } : {}),
      ...(role ? { role } : {}),
    };
    if (role) (req as any).userRole = role;
    next();
  });
  app.use('/api/regulatory/tasks', unifiedTaskRoutes);
  app.use('/api/unified-tasks', unifiedTaskRoutes);
  return app;
}

const TASK_A = {
  id: 1, taskId: 'TASK-A', organizationId: 2, status: 'review', title: 'Freeze gate',
  approvalRequired: false, approvalStatus: null, createdById: 9,
};
const TASK_B = { id: 2, taskId: 'TASK-B', organizationId: 2, status: 'pending', title: 'Draft 2.7.3' };

const writes = (base: string): Array<[string, (a: express.Express) => request.Test]> => [
  ['POST /unified', (a) => request(a).post(`${base}/unified`).send({ moduleType: 'IND', title: 'Draft', organizationId: 2 })],
  [
    'POST /:id/link',
    (a) => request(a).post(`${base}/TASK-A/link`).send({ targetTaskId: 'TASK-B', linkType: 'dependency', isBlocking: true }),
  ],
  ['POST /sync/:module', (a) => request(a).post(`${base}/sync/CMC`).send({})],
  ['PATCH /:id/status', (a) => request(a).patch(`${base}/TASK-A/status`).send({ status: 'completed' })],
];

beforeEach(() => {
  h.log = [];
  h.audits = [];
  h.auditFails = false;
  h.failCommit = 0;
  h.transactions = 0;
  vi.clearAllMocks();
  spies.requireTaskSignoff.mockImplementation((...a: any[]) => h.realSignoff!(...a));
  spies.cascadeUnblockOnCompletionInTx.mockResolvedValue({ ledger: [], notices: [] });
  svc.getOrgTaskById.mockImplementation(async (_org: number, id: string) =>
    ({ 'TASK-A': TASK_A, '1': TASK_A, 'TASK-B': TASK_B, '2': TASK_B } as Record<string, unknown>)[id] ?? null,
  );
  svc.createUnifiedTask.mockImplementation(async (data: any) => ({ id: 5, taskId: 'TASK-N', ...data }));
  svc.linkTasks.mockResolvedValue({ linkId: 'LINK-1' });
  svc.syncTasksFromModule.mockResolvedValue({ synced: 0, created: 0, updated: 0, createdTasks: [] });
  svc.updateTaskStatus.mockImplementation(async (taskId: string, status: string) => ({ taskId, status }));
});

describe.each([BASE, '/api/unified-tasks'])('T2 — %s: a viewer reads, but does not write', (base) => {
  it.each(writes(base))('%s is 403 for an org viewer and writes nothing', async (_name, send) => {
    const res = await send(makeApp('viewer'));

    expect(res.status).toBe(403);
    expect(h.log).toEqual([]);
    expect(h.audits).toEqual([]);
    for (const fn of [svc.createUnifiedTask, svc.linkTasks, svc.syncTasksFromModule, svc.updateTaskStatus]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it.each(writes(base))('%s is 403 with no org role at all', async (_name, send) => {
    const res = await send(makeApp(null));

    expect(res.status).toBe(403);
    expect(h.log).toEqual([]);
  });

  it.each(writes(base))('%s is 401 and writes nothing when the session names no actor', async (_name, send) => {
    const res = await send(makeApp('member', null));

    expect(res.status).toBe(401);
    expect(h.log).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  it('reads stay open to a viewer', async () => {
    svc.getAllUnifiedTasks.mockResolvedValue([]);
    const app = makeApp('viewer');

    expect((await request(app).get(`${base}/all`)).status).toBe(200);
    expect((await request(app).get(`${base}/TASK-A`)).status).toBe(200);
  });
});

describe('T1 — each write and its ledger row commit or roll back together', () => {
  it('POST /unified creates on ONE transaction with its task.create row, as the session actor', async () => {
    const res = await request(makeApp())
      .post(`${BASE}/unified`)
      .send({ moduleType: 'IND', title: 'Draft', organizationId: 9, reason: 'Raised from the IND checklist' });

    expect(res.status).toBe(201);
    expect(h.log).toEqual(['BEGIN', 'svc:createUnifiedTask@tx', 'tx:execute', 'COMMIT']);
    // Body said org 9; the verified org 2 wins, and the creator is the session.
    expect(svc.createUnifiedTask.mock.calls[0][0]).toMatchObject({ organizationId: 2, createdById: 7, title: 'Draft' });
    expect(h.audits).toEqual([
      expect.objectContaining({
        command: 'task.create', userId: 7, orgId: 2, target: 'task:TASK-N', reason: 'Raised from the IND checklist',
      }),
    ]);
  });

  it('POST /:id/link links the resolved business keys on ONE transaction with its task.link row', async () => {
    // Addressed by numeric primary keys: the write is keyed on task_id.
    const res = await request(makeApp())
      .post(`${BASE}/1/link`)
      .send({ targetTaskId: '2', linkType: 'dependency', isBlocking: true });

    expect(res.status).toBe(200);
    expect(h.log).toEqual(['BEGIN', 'svc:linkTasks@tx', 'tx:execute', 'COMMIT']);
    expect(svc.linkTasks.mock.calls[0][0]).toMatchObject({
      sourceTaskId: 'TASK-A', targetTaskId: 'TASK-B', organizationId: 2, linkType: 'dependency', isBlocking: true,
    });
    expect(h.audits).toEqual([
      expect.objectContaining({
        command: 'task.link', userId: 7, target: 'task:TASK-A',
        payload: expect.objectContaining({ targetTaskId: 'TASK-B', linkType: 'dependency', isBlocking: true }),
      }),
    ]);
  });

  it('POST /:id/link is 404 and records nothing when an endpoint is gone by the time it writes', async () => {
    svc.linkTasks.mockResolvedValue(null);
    const res = await request(makeApp())
      .post(`${BASE}/TASK-A/link`)
      .send({ targetTaskId: 'TASK-B', linkType: 'reference' });

    expect(res.status).toBe(404);
    expect(h.audits).toEqual([]);
  });

  it('POST /sync/:module creates every synced task, then writes one task.create row each, on ONE transaction', async () => {
    svc.syncTasksFromModule.mockResolvedValue({
      synced: 3, created: 2, updated: 0,
      createdTasks: [
        { taskId: 'TASK-S1', moduleType: 'CMC', title: 'Stability 12M', priority: 'medium', status: 'pending', assigneeId: 31, sourceEntityType: 'stability_study', sourceEntityId: '11' },
        { taskId: 'TASK-S2', moduleType: 'CMC', title: 'Stability 24M', priority: 'medium', status: 'pending', assigneeId: null, sourceEntityType: 'stability_study', sourceEntityId: '12' },
      ],
    });

    const res = await request(makeApp()).post(`${BASE}/sync/CMC`).send({});

    expect(res.status).toBe(200);
    // The verified org scopes every read; the session actor is each task's creator.
    expect(svc.syncTasksFromModule.mock.calls[0].slice(0, 2)).toEqual(['CMC', { organizationId: 2, createdById: 7 }]);
    // Every insert precedes the first ledger row: row locks first, the chain lock last.
    expect(h.log).toEqual(['BEGIN', 'svc:syncTasksFromModule@tx', 'tx:execute', 'tx:execute', 'COMMIT']);
    expect(h.audits.map((a) => [a.command, a.target, a.userId])).toEqual([
      ['task.create', 'task:TASK-S1', 7],
      ['task.create', 'task:TASK-S2', 7],
    ]);
    expect(h.audits[0].payload).toMatchObject({ moduleType: 'CMC', sourceEntityType: 'stability_study', sourceEntityId: '11', sync: true });
    // The creation record names the assignee, as POST /unified's does.
    expect(h.audits.map((a) => a.payload.assigneeId)).toEqual([31, null]);
  });

  it('POST /sync/Vault is refused as unavailable (501) — not a failure, not an empty sync — and records nothing', async () => {
    svc.syncTasksFromModule.mockRejectedValue(new ModuleSyncUnavailableError('Vault'));

    const res = await request(makeApp()).post(`${BASE}/sync/Vault`).send({});

    expect(res.status).toBe(501);
    expect(res.body).toMatchObject({ success: false, error: 'SYNC_NOT_AVAILABLE' });
    expect(res.body.message).toMatch(/Vault.*nothing was synced/);
    expect(h.log).toEqual(['BEGIN', 'svc:syncTasksFromModule@tx', 'ROLLBACK']);
    expect(h.audits).toEqual([]);
  });

  it('PATCH /:id/status transitions on ONE transaction with its row, attributed to the session — never the body', async () => {
    const res = await request(makeApp())
      .patch(`${BASE}/TASK-A/status`)
      .send({ status: 'in-progress', userId: 555, reason: 'Back for rework' });

    expect(res.status).toBe(200);
    expect(h.log).toEqual(['BEGIN', 'svc:updateTaskStatus@tx', 'tx:execute', 'COMMIT']);
    const [taskId, status, lastModifiedBy, opts] = svc.updateTaskStatus.mock.calls[0];
    expect([taskId, status, lastModifiedBy]).toEqual(['TASK-A', 'in-progress', 7]);
    expect(opts).toMatchObject({ manifestation: null, organizationId: 2, expectedStatus: 'review' });
    expect(h.audits).toEqual([
      expect.objectContaining({
        command: 'task.transition', userId: 7, target: 'task:TASK-A', reason: 'Back for rework',
        payload: expect.objectContaining({ from: 'review', to: 'in-progress' }),
      }),
    ]);
  });

  it.each(writes(BASE))(
    '%s rolls back and answers 500 AUDIT_WRITE_FAILED when its ledger row fails',
    async (_name, send) => {
      svc.syncTasksFromModule.mockResolvedValue({
        synced: 1, created: 1, updated: 0,
        createdTasks: [{ taskId: 'TASK-S1', moduleType: 'CMC', title: 'Stability', priority: 'medium', status: 'pending' }],
      });
      h.auditFails = true;

      const res = await send(makeApp());

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
      expect(res.body.message).toMatch(/could not be recorded in the audit trail, so nothing was changed/);
      expect(h.log).toContain('ROLLBACK');
      expect(h.log).not.toContain('COMMIT');
      // The row was attempted on the write's own transaction, never on a
      // separate pool connection after the write had committed.
      expect(h.log.some((l) => l.startsWith('pool:'))).toBe(false);
      expect(spies.notifyTaskEvent).not.toHaveBeenCalled();
    },
  );

  it('a store failure is an honest 500 that does not carry the store text, with the write rolled back', async () => {
    svc.createUnifiedTask.mockRejectedValue(new Error('relation "unified_tasks" does not exist'));

    const res = await request(makeApp()).post(`${BASE}/unified`).send({ moduleType: 'IND', title: 'Draft', organizationId: 2 });

    // The canonical sanitized envelope (serverError): a code and a sentence.
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.success).not.toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|unified_tasks/);
    expect(h.log).toEqual(['BEGIN', 'svc:createUnifiedTask@tx', 'ROLLBACK']);
  });

  it('a malformed body is a 400 that writes nothing', async () => {
    const res = await request(makeApp()).post(`${BASE}/unified`).send({ moduleType: 'Nope', title: '' });

    expect(res.status).toBe(400);
    expect(h.log).toEqual([]);
  });

  it.each([
    ['POST /unified', (a: express.Express) => request(a).post(`${BASE}/unified`).send({ moduleType: 'IND', title: 'Draft', organizationId: 2 })],
    ['POST /:id/link', (a: express.Express) => request(a).post(`${BASE}/TASK-A/link`).send({ targetTaskId: 'TASK-B', linkType: 'related' })],
    ['POST /sync/:module', (a: express.Express) => request(a).post(`${BASE}/sync/CMC`).send({})],
    ['PATCH /:id/status', (a: express.Express) => request(a).patch(`${BASE}/TASK-A/status`).send({ status: 'completed' })],
  ])('%s whose COMMIT was lost answers OUTCOME_UNKNOWN — never a failure, never a success', async (_name, send) => {
    h.failCommit = 1;

    const res = await send(makeApp());

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('OUTCOME_UNKNOWN');
    expect(res.body.message).toMatch(/unknown/);
    expect(h.log).toContain('COMMIT-LOST');
    expect(spies.notifyTaskEvent).not.toHaveBeenCalled();
  });
});

describe('T1 — a completion, the dependents it unblocks and all their ledger rows are one transaction', () => {
  const unblockB = {
    ledger: [{
      orgId: 2, userId: 7, command: 'task.transition', taskId: 'TASK-B',
      payload: { from: 'blocked', to: 'in-progress', cause: 'predecessor-completed', predecessor: 'TASK-A' },
      reason: 'Unblocked: predecessor TASK-A completed',
    }],
    notices: [{ organizationId: 2, recipientUserId: 42, category: 'task_update', title: 'Unblocked: B', taskId: 'TASK-B' }],
  };

  it('runs the cascade on the completion’s transaction and records A, then B, before COMMIT; notifies after', async () => {
    spies.cascadeUnblockOnCompletionInTx.mockResolvedValue(unblockB);

    const res = await request(makeApp()).patch(`${BASE}/TASK-A/status`).send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(spies.cascadeUnblockOnCompletionInTx).toHaveBeenCalledWith(
      2, 'TASK-A', expect.objectContaining({ actorUserId: 7, tx: expect.objectContaining({ __tag: 'tx' }) }),
    );
    // The task UPDATE and the cascade's row locks, then the ledger rows (A's
    // first — the cause before its effects), then COMMIT, then the notices.
    expect(h.log).toEqual([
      'BEGIN', 'svc:updateTaskStatus@tx', 'cascade@tx', 'tx:execute', 'tx:execute', 'COMMIT',
      'notify:TASK-B', 'notify:TASK-A',
    ]);
    expect(h.audits.map((a) => a.target)).toEqual(['task:TASK-A', 'task:TASK-B']);
    expect(h.audits[1]).toMatchObject({ command: 'task.transition', userId: 7, reason: 'Unblocked: predecessor TASK-A completed' });
  });

  it('a dependent’s ledger row that fails rolls back the completion and the unblocking; nobody is notified', async () => {
    spies.cascadeUnblockOnCompletionInTx.mockResolvedValue(unblockB);
    h.auditFails = (row) => row.target === 'task:TASK-B';

    const res = await request(makeApp()).patch(`${BASE}/TASK-A/status`).send({ status: 'completed' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(h.log).toEqual(['BEGIN', 'svc:updateTaskStatus@tx', 'cascade@tx', 'tx:execute', 'tx:execute', 'ROLLBACK']);
    expect(spies.notifyTaskEvent).not.toHaveBeenCalled();
  });

  it('a cascade failure rolls the completion back and is an honest 500', async () => {
    spies.cascadeUnblockOnCompletionInTx.mockRejectedValue(new Error('relation "task_dependencies" does not exist'));

    const res = await request(makeApp()).patch(`${BASE}/TASK-A/status`).send({ status: 'completed' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/relation|task_dependencies/);
    expect(h.log).toEqual(['BEGIN', 'svc:updateTaskStatus@tx', 'cascade@tx', 'ROLLBACK']);
    expect(h.audits).toEqual([]);
  });

  it('commits a signed completion with its manifestation in the ledger payload', async () => {
    const manifestation = { signedById: 7, signedByName: 'Maya Lin', meaning: 'APPROVED', reason: 'Reviewed', signedAt: '2026-09-23T00:00:00Z', method: 'password' };
    svc.getOrgTaskById.mockResolvedValue({ ...TASK_A, approvalRequired: true, approvalStatus: 'pending' });
    spies.requireTaskSignoff.mockResolvedValue({ required: true, ok: true, manifestation });

    const res = await request(makeApp())
      .patch(`${BASE}/TASK-A/status`)
      .send({ status: 'completed', reason: 'Reviewed', signature: { password: 'correct-horse', meaning: 'APPROVED' } });

    expect(res.status).toBe(200);
    expect(svc.updateTaskStatus.mock.calls[0][3]).toMatchObject({ manifestation });
    expect(h.audits[0]).toMatchObject({
      command: 'task.transition',
      payload: expect.objectContaining({ from: 'review', to: 'completed', signature: expect.objectContaining({ meaning: 'APPROVED', signedByName: 'Maya Lin' }) }),
    });
  });

  it('never commits a signed completion whose ledger row did not land', async () => {
    const manifestation = { signedById: 7, signedByName: 'Maya Lin', meaning: 'APPROVED', reason: 'Reviewed', signedAt: '2026-09-23T00:00:00Z', method: 'password' };
    svc.getOrgTaskById.mockResolvedValue({ ...TASK_A, approvalRequired: true, approvalStatus: 'pending' });
    spies.requireTaskSignoff.mockResolvedValue({ required: true, ok: true, manifestation });
    h.auditFails = true;

    const res = await request(makeApp())
      .patch(`${BASE}/TASK-A/status`)
      .send({ status: 'completed', reason: 'Reviewed', signature: { password: 'correct-horse', meaning: 'APPROVED' } });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(h.log).toContain('ROLLBACK');
    expect(h.log).not.toContain('COMMIT');
  });
});

describe('tenant isolation and the state machine (unchanged, now behind the gate)', () => {
  it('GET /all returns 401 when there is no org context', async () => {
    const res = await request(makeApp('member', 7, null)).get(`${BASE}/all`);
    expect(res.status).toBe(401);
    expect(svc.getAllUnifiedTasks).not.toHaveBeenCalled();
  });

  it('GET /all scopes to the JWT org and ignores a client organizationId param', async () => {
    svc.getAllUnifiedTasks.mockResolvedValue([]);
    const res = await request(makeApp()).get(`${BASE}/all?organizationId=9`);
    expect(res.status).toBe(200);
    expect(svc.getAllUnifiedTasks.mock.calls[0][0]).toMatchObject({ organizationId: 2 });
  });

  it("PATCH /:id/status 404s on another org's task and writes nothing", async () => {
    const res = await request(makeApp()).patch(`${BASE}/TASK-OTHER/status`).send({ status: 'completed' });
    expect(res.status).toBe(404);
    expect(svc.getOrgTaskById).toHaveBeenCalledWith(2, 'TASK-OTHER');
    expect(h.log).toEqual([]);
  });

  it('POST /:id/link 404s when either endpoint is outside the caller org, and writes nothing', async () => {
    const res = await request(makeApp()).post(`${BASE}/TASK-A/link`).send({ targetTaskId: 'TASK-OTHER', linkType: 'related' });
    expect(res.status).toBe(404);
    expect(h.log).toEqual([]);
  });

  it('PATCH /:id/status addressed by numeric id writes with the resolved business key', async () => {
    const res = await request(makeApp()).patch(`${BASE}/1/status`).send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(svc.updateTaskStatus.mock.calls[0][0]).toBe('TASK-A');
    expect(h.audits[0]).toMatchObject({ command: 'task.transition', target: 'task:TASK-A' });
  });

  it('PATCH /:id/status 409s CONFLICT_STALE without a ledger row when the compare-and-set loses', async () => {
    svc.updateTaskStatus.mockResolvedValue(undefined);
    const res = await request(makeApp()).patch(`${BASE}/TASK-A/status`).send({ status: 'completed' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT_STALE');
    expect(h.audits).toEqual([]);
    expect(spies.cascadeUnblockOnCompletionInTx).not.toHaveBeenCalled();
  });

  it('PATCH /:id/status to the status the task already has is refused as stale, not re-written', async () => {
    const res = await request(makeApp()).patch(`${BASE}/TASK-A/status`).send({ status: 'review' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT_STALE');
    expect(h.log).toEqual([]);
  });

  it('PATCH /:id/status runs the state machine — an illegal move 409s without writing', async () => {
    svc.getOrgTaskById.mockResolvedValue({ ...TASK_A, status: 'pending' });
    const res = await request(makeApp()).patch(`${BASE}/TASK-A/status`).send({ status: 'completed' });
    expect(res.status).toBe(409);
    expect(h.log).toEqual([]);
  });

  it('PATCH /:id/status demands the e-sign ceremony on approval-gated completion (428)', async () => {
    svc.getOrgTaskById.mockResolvedValue({ ...TASK_A, approvalRequired: true, approvalStatus: 'pending' });
    const res = await request(makeApp()).patch(`${BASE}/TASK-A/status`).send({ status: 'completed' });
    expect(res.status).toBe(428);
    expect(res.body.code).toBe('ESIGN_REQUIRED');
    expect(h.log).toEqual([]);
  });
});
