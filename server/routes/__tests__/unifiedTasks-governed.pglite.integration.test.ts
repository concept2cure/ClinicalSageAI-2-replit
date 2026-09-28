/**
 * /api/regulatory/tasks (unifiedTasks.routes.ts): every write is role-gated,
 * and every write, its ledger row and — for a completion — the dependents it
 * unblocks are ONE transaction. END-TO-END against in-process PGlite (real
 * Postgres, WASM), through the real router, the real unifiedTaskService SQL, the
 * real completion cascade (task-side-effects) and the real ledger primitive
 * (task-audit).
 *
 * WHAT WAS WRONG
 * The router wrote on the pool, then called auditTaskAction with no executor —
 * a separate, best-effort transaction whose failure was swallowed and whose
 * outcome all three call sites discarded (the sync wrote no row at all). It
 * then ran the completion cascade on the global db with no ledger rows. And no
 * write was role-gated, so an org viewer refused by /api/tasks could create,
 * link, sync and complete tasks here.
 *
 * Only recordGovernedAction is replaced: it writes its row into `ledger_rows`
 * on the connection it is handed, so a row that survives is a row that
 * committed on that transaction, and one it is told to fail throws AFTER its
 * insert — the rollback has to take the insert with it.
 *
 * The database, the app, the stand-ins and the readers are built by
 * _unified-tasks-pglite-harness.ts; the mocks, the migration list and the
 * fixture stay here.
 */
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { extractTableDdl, REPO_ROOT } from '../../../tests/golden-journeys/harness';

vi.mock('../../db', async () => (await import('./_unified-tasks-pglite-harness')).dbModule());
vi.mock('../../db/requestDb', async () => (await import('./_unified-tasks-pglite-harness')).requestDbModule());
vi.mock('../c2c/actions', async () => (await import('./_unified-tasks-pglite-harness')).ledgerModule());
vi.mock('../../services/tasking/task-signoff', async () =>
  (await import('./_unified-tasks-pglite-harness')).signoffModule(),
);
vi.mock('../../services/notifications/notification-service', async () =>
  (await import('./_unified-tasks-pglite-harness')).notificationModule(),
);

import {
  h,
  pg,
  app,
  ORG,
  OTHER_ORG,
  BASE,
  task,
  ledger,
  snapshot,
  setUpPgliteApp,
} from './_unified-tasks-pglite-harness';

/** The real schema: the baseline tables, their dependency FKs, then the
 *  migrations that extended them, run as they are. `ledger_rows` is the
 *  stand-in the mocked recordGovernedAction writes to. */
const BASELINE = 'migrations/0000_sweet_joseph.sql';
const DDL = [
  extractTableDdl(BASELINE, [
    'unified_tasks',
    'task_dependencies',
    'cross_module_task_links',
    'stability_studies',
  ]),
  ...fs
    .readFileSync(path.join(REPO_ROOT, BASELINE), 'utf8')
    .split('\n')
    .filter(l =>
      /^ALTER TABLE "task_dependencies" ADD CONSTRAINT .* REFERENCES "public"\."unified_tasks"/.test(
        l
      )
    )
    .map(l => l.replace('--> statement-breakpoint', '')),
  ...[
    'db/migrations/20260727_unified_tasks_mdx_metadata.sql',
    'db/migrations/20260807_task_graph_org_columns.sql',
    'db/migrations/20260807_unified_tasks_soft_delete.sql',
  ].map(f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')),
  // KNOWN SCHEMA GAP, not papered over: the Drizzle model declares
  // cross_module_task_links.updated_at and every insert names it, but the
  // baseline creates the table without it and no migration in the set adds it —
  // so on a database built from the migration set POST /:id/link fails at the
  // INSERT (now an honest 500 with nothing written). Added here so this file
  // tests the gate and the transaction; the column itself is schema work.
  'ALTER TABLE cross_module_task_links ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();',
  `CREATE TABLE ledger_rows (
     seq serial PRIMARY KEY,
     target text NOT NULL,
     command text NOT NULL,
     payload jsonb,
     reason text,
     user_id integer
   );`,
].join('\n');

/**
 * A (review) is the task being completed.
 *   B — blocked, blockedBy [A]            → in-progress when A completes
 *   C — blocked, a blocking DAG edge A→C  → pending when A completes
 *   D — blocked, blockedBy [A, X]         → blockedBy [X], still blocked
 *   X — in progress, D's other blocker
 *   Z — another organization's task
 * Two stability studies for the CMC sync (the first with a study director, who
 * becomes its task's assignee), and one in another organization.
 */
const FIXTURE = `
TRUNCATE ledger_rows, task_dependencies, cross_module_task_links, unified_tasks, stability_studies RESTART IDENTITY;
INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, blocked_by, assignee_id, created_by_id) VALUES
  ('TASK-A', ${ORG}, 'IND', 'Draft CSR shell', 'review', NULL, 9, 9),
  ('TASK-B', ${ORG}, 'IND', 'Write 2.7.3', 'blocked', ARRAY['TASK-A'], 42, 9),
  ('TASK-C', ${ORG}, 'IND', 'QC the shell', 'blocked', NULL, 43, 9),
  ('TASK-D', ${ORG}, 'IND', 'Assemble module 5', 'blocked', ARRAY['TASK-A','TASK-X'], 44, 9),
  ('TASK-X', ${ORG}, 'IND', 'Lock the tables', 'in-progress', NULL, 45, 9),
  ('TASK-Z', ${OTHER_ORG}, 'IND', 'Someone else''s task', 'review', NULL, 46, 46);
INSERT INTO task_dependencies (dependency_id, organization_id, predecessor_task_id, successor_task_id, dependency_type)
  VALUES ('DEP-AC', ${ORG}, 'TASK-A', 'TASK-C', 'finish-to-start');
INSERT INTO stability_studies (organization_id, study_title, product_name, batch_number, storage_conditions, test_parameters, start_date, study_director) VALUES
  (${ORG}, 'Stability 12M', 'Zanubrutinib', 'B-001', ARRAY['LT'], ARRAY['Assay'], now(), 45),
  (${ORG}, 'Stability 24M', 'Zanubrutinib', 'B-002', ARRAY['LT'], ARRAY['Assay'], now(), NULL),
  (${OTHER_ORG}, 'Their study', 'Other', 'O-001', ARRAY['LT'], ARRAY['Assay'], now(), NULL);
`;

const writes: Array<[string, () => request.Test]> = [
  [
    'POST /unified',
    () =>
      request(app)
        .post(`${BASE}/unified`)
        .send({ moduleType: 'IND', title: 'New work', organizationId: ORG }),
  ],
  [
    'POST /:id/link',
    () =>
      request(app)
        .post(`${BASE}/TASK-X/link`)
        .send({ targetTaskId: 'TASK-A', linkType: 'dependency', isBlocking: true }),
  ],
  ['POST /sync/:module', () => request(app).post(`${BASE}/sync/CMC`).send({})],
  [
    'PATCH /:id/status',
    () => request(app).patch(`${BASE}/TASK-A/status`).send({ status: 'completed' }),
  ],
];

setUpPgliteApp(DDL, FIXTURE);

describe('T2 — an org viewer is refused every write, and nothing changes', () => {
  it.each(writes)('%s: 403, no task, link or ledger row written', async (_name, send) => {
    h.role = 'viewer';
    const before = await snapshot();

    const res = await send();

    expect(res.status).toBe(403);
    expect(await snapshot()).toEqual(before);
    expect(h.log).toEqual([]);
  });
});

describe('T1 — each write commits with its ledger row, or neither commits', () => {
  it('POST /unified: the task and its task.create row, on one transaction, as the session actor', async () => {
    const res = await request(app)
      .post(`${BASE}/unified`)
      .send({ moduleType: 'IND', title: 'New work', organizationId: OTHER_ORG });

    expect(res.status).toBe(201);
    const { taskId } = res.body.task;
    const row = await pg.query<{ organization_id: number; created_by_id: number }>(
      'SELECT organization_id, created_by_id FROM unified_tasks WHERE task_id = $1',
      [taskId]
    );
    expect(row.rows[0]).toEqual({ organization_id: ORG, created_by_id: 7 });
    expect(await ledger()).toEqual([
      expect.objectContaining({ target: `task:${taskId}`, command: 'task.create', user_id: 7 }),
    ]);
    expect(h.log).toEqual(['BEGIN', 'insert:task', `ledger:${taskId}`, 'COMMIT']);
  });

  it('POST /unified: a failed ledger row takes the task with it — 500 AUDIT_WRITE_FAILED, no row', async () => {
    h.failLedgerCommand = 'task.create';
    const before = await snapshot();

    const res = await request(app)
      .post(`${BASE}/unified`)
      .send({ moduleType: 'IND', title: 'New work', organizationId: ORG });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(await snapshot()).toEqual(before);
    expect(h.log).toContain('ROLLBACK');
  });

  it('POST /:id/link: the link, both blocking arrays and the task.link row, on one transaction', async () => {
    const res = await request(app)
      .post(`${BASE}/TASK-X/link`)
      .send({ targetTaskId: 'TASK-A', linkType: 'dependency', isBlocking: true });

    expect(res.status).toBe(200);
    expect((await task('TASK-A')).blocked_by).toEqual(['TASK-X']);
    expect((await task('TASK-X')).blocks).toEqual(['TASK-A']);
    const links = await pg.query<{
      organization_id: number;
      source_task_id: string;
      target_task_id: string;
    }>('SELECT organization_id, source_task_id, target_task_id FROM cross_module_task_links');
    expect(links.rows).toEqual([
      { organization_id: ORG, source_task_id: 'TASK-X', target_task_id: 'TASK-A' },
    ]);
    expect(await ledger()).toEqual([
      expect.objectContaining({
        target: 'task:TASK-X',
        command: 'task.link',
        user_id: 7,
        payload: expect.objectContaining({
          targetTaskId: 'TASK-A',
          linkType: 'dependency',
          isBlocking: true,
        }),
      }),
    ]);
    // Both endpoints locked in one read, in task-id order, before the link or
    // either array is written; every row lock before the ledger row.
    expect(h.log).toEqual([
      'BEGIN',
      'lock:by-task-id',
      'insert:link',
      'update:TASK-A',
      'update:TASK-X',
      'ledger:TASK-X',
      'COMMIT',
    ]);
  });

  it('POST /:id/link: a failed ledger row leaves no link and both arrays as they were', async () => {
    h.failLedgerFor = 'TASK-X';
    const before = await snapshot();

    const res = await request(app)
      .post(`${BASE}/TASK-X/link`)
      .send({ targetTaskId: 'TASK-A', linkType: 'dependency', isBlocking: true });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(await snapshot()).toEqual(before);
  });

  it('POST /:id/link: another organization’s task cannot be linked (404, nothing written)', async () => {
    const before = await snapshot();

    const res = await request(app)
      .post(`${BASE}/TASK-A/link`)
      .send({ targetTaskId: 'TASK-Z', linkType: 'related' });

    expect(res.status).toBe(404);
    expect(await snapshot()).toEqual(before);
  });
});

// The same block, continued: the module sync. Split from the one above only to
// keep each under the function-length limit; the test names are unchanged.
describe('T1 — each write commits with its ledger row, or neither commits', () => {
  it('POST /sync/:module: every synced task and its task.create row, on one transaction — this org’s studies only', async () => {
    const res = await request(app).post(`${BASE}/sync/CMC`).send({});

    expect(res.status).toBe(200);
    expect(res.body.syncResult).toMatchObject({ synced: 2, created: 2 });
    const created = await pg.query<{
      task_id: string;
      organization_id: number;
      source_entity_id: string;
      created_by_id: number | null;
      assignee_id: number | null;
    }>(
      "SELECT task_id, organization_id, source_entity_id, created_by_id, assignee_id FROM unified_tasks WHERE module_type = 'CMC' ORDER BY source_entity_id"
    );
    // Attributed as POST /unified attributes: the session actor is the creator
    // on the row, not only in the ledger.
    expect(
      created.rows.map(r => [r.organization_id, r.source_entity_id, r.created_by_id, r.assignee_id])
    ).toEqual([
      [ORG, '1', 7, 45],
      [ORG, '2', 7, null],
    ]);
    const rows = await ledger();
    expect(rows.map(r => [r.target, r.command, r.user_id])).toEqual(
      created.rows.map(r => [`task:${r.task_id}`, 'task.create', 7])
    );
    expect(rows[0].payload).toMatchObject({
      moduleType: 'CMC',
      sourceEntityType: 'stability_study',
      sync: true,
    });
    // The creation record says who each task was assigned to.
    expect(rows.map(r => r.payload.assigneeId)).toEqual([45, null]);
    // Every insert before the first ledger row: row locks first, the chain lock last.
    expect(h.log).toEqual([
      'BEGIN',
      'insert:task',
      'insert:task',
      ...created.rows.map(r => `ledger:${r.task_id}`),
      'COMMIT',
    ]);

    // A second sync finds them and creates nothing.
    h.log = [];
    const again = await request(app).post(`${BASE}/sync/CMC`).send({});
    expect(again.body.syncResult).toMatchObject({ synced: 2, created: 0 });
    expect(await ledger()).toHaveLength(2);
  });

  it('POST /sync/:module: another organization’s task for the same source id does not hide this org’s', async () => {
    // Org 77 already has a CMC task whose source entity id is '1' — this org's study 1.
    await pg.exec(`INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, source_entity_id)
      VALUES ('TASK-Z-CMC', ${OTHER_ORG}, 'CMC', 'Theirs', 'pending', '1')`);

    const res = await request(app).post(`${BASE}/sync/CMC`).send({});

    expect(res.body.syncResult).toMatchObject({ synced: 2, created: 2 });
  });

  it('POST /sync/:module: one failed ledger row rolls back the whole sync', async () => {
    h.failLedgerCommand = 'task.create';
    const before = await snapshot();

    const res = await request(app).post(`${BASE}/sync/CMC`).send({});

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(await snapshot()).toEqual(before);
  });

  it('POST /sync/Vault is refused (501) without reading another tenant’s approvals — nothing written', async () => {
    // The legacy shape (sql/_legacy/document_versions.sql, FK dropped): no
    // organization column, and nothing on any applier creates it. Here it
    // holds another tenant's pending approval, which a sync must not import.
    await pg.exec(`
      CREATE TABLE IF NOT EXISTS document_approvals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        version_id uuid,
        approver_id uuid,
        status varchar(20) NOT NULL DEFAULT 'PENDING',
        approval_date timestamptz
      );
      TRUNCATE document_approvals;
      INSERT INTO document_approvals (approver_id, status) VALUES (gen_random_uuid(), 'PENDING');
    `);
    const before = await snapshot();

    const res = await request(app).post(`${BASE}/sync/Vault`).send({});

    expect(res.status).toBe(501);
    expect(res.body).toMatchObject({ success: false, error: 'SYNC_NOT_AVAILABLE' });
    expect(res.body.message).toMatch(/nothing was synced/);
    expect(await snapshot()).toEqual(before);
    expect(h.log).not.toContain('read:document_approvals');
    expect(h.log.some(l => l.startsWith('insert:') || l.startsWith('ledger:'))).toBe(false);
  });
});

describe('T1 — a completion unblocks its dependents in the SAME transaction, with their ledger rows', () => {
  it('moves B and C, leaves D blocked on X, and records A then B, C, D — all before COMMIT', async () => {
    const res = await request(app)
      .patch(`${BASE}/TASK-A/status`)
      .send({ status: 'completed', userId: 555 });

    expect(res.status).toBe(200);
    expect(await task('TASK-A')).toMatchObject({ status: 'completed', last_modified_by: 7 });
    expect(await task('TASK-B')).toMatchObject({ status: 'in-progress', blocked_by: [] });
    expect((await task('TASK-C')).status).toBe('pending');
    expect(await task('TASK-D')).toMatchObject({ status: 'blocked', blocked_by: ['TASK-X'] });

    const rows = await ledger();
    expect(rows.map(r => r.target)).toEqual([
      'task:TASK-A',
      'task:TASK-B',
      'task:TASK-C',
      'task:TASK-D',
    ]);
    expect(rows.every(r => r.user_id === 7)).toBe(true);
    expect(rows[1]).toMatchObject({
      command: 'task.transition',
      payload: {
        from: 'blocked',
        to: 'in-progress',
        cause: 'predecessor-completed',
        predecessor: 'TASK-A',
      },
    });

    const begin = h.log.indexOf('BEGIN');
    const commit = h.log.indexOf('COMMIT');
    const at = (p: string) => h.log.map((l, i) => (l.startsWith(p) ? i : -1)).filter(i => i >= 0);
    expect(h.log.filter(l => l === 'BEGIN')).toHaveLength(1);
    for (const i of [...at('lock:'), ...at('update:'), ...at('ledger:')]) {
      expect(i).toBeGreaterThan(begin);
      expect(i).toBeLessThan(commit);
    }
    // Row locks first (A's UPDATE, then its dependents in task-id order), the
    // audit-chain lock last.
    expect(at('lock:').map(i => h.log[i])).toEqual(['lock:by-task-id']);
    expect(Math.max(...at('lock:'), ...at('update:'))).toBeLessThan(Math.min(...at('ledger:')));
    // Notifications only after COMMIT.
    for (const i of at('notify:')) expect(i).toBeGreaterThan(commit);
    expect(h.log.filter(l => l.startsWith('notify:')).sort()).toEqual([
      'notify:TASK-A',
      'notify:TASK-B',
      'notify:TASK-C',
    ]);
  });

  it('a failed ledger row for B rolls back A’s completion and every unblocking: 500, nothing changed, nobody notified', async () => {
    h.failLedgerFor = 'TASK-B';
    const before = await snapshot();

    const res = await request(app).patch(`${BASE}/TASK-A/status`).send({ status: 'completed' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(await snapshot()).toEqual(before);
    expect(h.log.some(l => l.startsWith('notify:'))).toBe(false);
  });

  it('a failed ledger row for A itself rolls A back too', async () => {
    h.failLedgerFor = 'TASK-A';
    const before = await snapshot();

    const res = await request(app).patch(`${BASE}/TASK-A/status`).send({ status: 'in-progress' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(await snapshot()).toEqual(before);
  });

  it('addressed by its numeric id, the write and its row are keyed on the business key', async () => {
    const { rows } = await pg.query<{ id: number }>(
      "SELECT id FROM unified_tasks WHERE task_id = 'TASK-A'"
    );

    const res = await request(app)
      .patch(`${BASE}/${rows[0].id}/status`)
      .send({ status: 'in-progress' });

    expect(res.status).toBe(200);
    expect((await task('TASK-A')).status).toBe('in-progress');
    expect((await ledger()).map(r => r.target)).toEqual(['task:TASK-A']);
  });

  it('another organization’s task is 404 and untouched', async () => {
    const before = await snapshot();

    const res = await request(app).patch(`${BASE}/TASK-Z/status`).send({ status: 'completed' });

    expect(res.status).toBe(404);
    expect(await snapshot()).toEqual(before);
  });
});

describe('the transition write itself: archived rows, and one signature per gate', () => {
  const manifestation = {
    signedById: 7,
    signedByName: 'Maya Lin',
    meaning: 'APPROVED',
    reason: 'Reviewed',
    signedAt: '2026-09-23T00:00:00.000Z',
    method: 'password',
  };
  const completedUnsigned = `UPDATE unified_tasks
    SET status = 'completed', completed_at = '2026-01-02 03:04:05', approval_required = true, approval_status = 'pending'
    WHERE task_id = 'TASK-A'`;
  async function approval(taskId: string) {
    const r = await pg.query<{
      approval_status: string | null;
      approval_history: unknown;
      completed_at: Date | null;
    }>(
      'SELECT approval_status, approval_history, completed_at FROM unified_tasks WHERE task_id = $1',
      [taskId]
    );
    return r.rows[0];
  }

  it('a task archived after PATCH read it is not moved: nothing written, no ledger row', async () => {
    h.beforeWrite = () =>
      pg.exec("UPDATE unified_tasks SET deleted_at = now() WHERE task_id = 'TASK-A'");

    const res = await request(app).patch(`${BASE}/TASK-A/status`).send({ status: 'completed' });

    expect(res.status).toBe(404);
    expect(await task('TASK-A')).toMatchObject({ status: 'review', completed_at: null });
    expect((await task('TASK-B')).status).toBe('blocked');
    expect(await ledger()).toEqual([]);
    expect(h.log.some(l => l.startsWith('notify:'))).toBe(false);
  });

  it('a late signature on a completed task approves it with its ledger row, and keeps its completion time', async () => {
    await pg.exec(completedUnsigned);
    const before = await approval('TASK-A');
    h.signoff = { required: true, ok: true, manifestation };

    const res = await request(app)
      .patch(`${BASE}/TASK-A/status`)
      .send({
        status: 'completed',
        reason: 'Late sign-off',
        signature: { password: 'x', meaning: 'APPROVED' },
      });

    expect(res.status).toBe(200);
    const after = await approval('TASK-A');
    expect(after.approval_status).toBe('approved');
    expect(after.completed_at).toEqual(before.completed_at);
    expect(after.approval_history).toEqual([manifestation]);
    expect(await ledger()).toEqual([
      expect.objectContaining({
        target: 'task:TASK-A',
        command: 'task.transition',
        reason: 'Late sign-off',
        payload: expect.objectContaining({
          from: 'completed',
          to: 'completed',
          signature: expect.objectContaining({ meaning: 'APPROVED' }),
        }),
      }),
    ]);
    // Not a new completion: nothing is unblocked again.
    expect((await ledger()).map(r => r.target)).toEqual(['task:TASK-A']);
  });

  it('a second signature on a gate another signer cleared meanwhile does not stack: 409, nothing written', async () => {
    await pg.exec(completedUnsigned);
    h.signoff = { required: true, ok: true, manifestation };
    // The other signer's approval lands between this request's read and its write.
    h.beforeWrite = () =>
      pg.exec(
        `UPDATE unified_tasks SET approval_status = 'approved', approval_history = '[{"signedByName":"Other"}]' WHERE task_id = 'TASK-A'`
      );

    const res = await request(app)
      .patch(`${BASE}/TASK-A/status`)
      .send({
        status: 'completed',
        reason: 'Late sign-off',
        signature: { password: 'x', meaning: 'APPROVED' },
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT_STALE');
    expect((await approval('TASK-A')).approval_history).toEqual([{ signedByName: 'Other' }]);
    expect(await ledger()).toEqual([]);
  });
});
