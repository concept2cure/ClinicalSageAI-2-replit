/**
 * PATCH /tasks/:taskId → completed: the completion, the dependents it unblocks
 * and every ledger row describing them are ONE transaction — END-TO-END against
 * in-process PGlite (real Postgres, WASM), through the real router, the real
 * cascade (task-side-effects) and the real ledger primitive (task-audit).
 *
 * WHAT WAS WRONG
 * The route committed the completion, THEN ran cascadeUnblockOnCompletion on the
 * global db. The cascade rewrote other tasks' blockedBy[] and moved them
 * blocked → in-progress / pending with no ledger row, so the ledger showed tasks
 * being blocked (POST /tasks/dependencies records that) and never unblocked. And
 * a cascade failure after the COMMIT answered 400 "Failed to update task" for a
 * completion that had in fact committed.
 *
 * Only recordGovernedAction is replaced: it writes its row into `ledger_rows`
 * on the connection it is handed, so a row that survives is a row that
 * committed on that transaction, and one it is told to fail throws AFTER its
 * insert — the rollback has to take the insert with it.
 *
 * The review of that change, pinned here too: the ledger lists the completion
 * before the unblocking it caused; a dependent whose blockedBy[] changed is
 * recorded even when its status did not; an archived dependent (or an archived
 * A) is never moved or ledgered; and the dependents are locked in one
 * statement, in task-id order, whichever linkage system names them.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from '../../../shared/schema';
import { extractTableDdl, REPO_ROOT } from '../../../tests/golden-journeys/harness';

const h = vi.hoisted(() => ({
  /** BEGIN / COMMIT / ROLLBACK, each task-row UPDATE, each ledger row, each notification — in order. */
  log: [] as string[],
  /** The task whose ledger row fails, when set. */
  failLedgerFor: null as string | null,
  /** Runs between PATCH's fetch-first read and its transaction (the sign-off step). */
  beforeWrite: null as null | (() => Promise<unknown>),
  /** Every statement drizzle sent, with its parameters. */
  sql: [] as Array<{ query: string; params: unknown[] }>,
}));

let pg: PGlite;
let drz: ReturnType<typeof drizzle>;
let app: express.Express;

vi.mock('../../db', () => ({
  get db() {
    return drz;
  },
  pool: {},
}));
vi.mock('../c2c/actions', () => ({
  recordGovernedAction: async (
    client: { query: (s: string, p?: unknown[]) => Promise<unknown> },
    row: { target: string; command: string; payload: unknown; reason: string },
  ) => {
    await client.query(
      'INSERT INTO ledger_rows (target, command, payload, reason) VALUES ($1, $2, $3, $4)',
      [row.target, row.command, JSON.stringify(row.payload), row.reason],
    );
    if (h.failLedgerFor && row.target === `task:${h.failLedgerFor}`) {
      throw new Error('audit_logs: connection reset');
    }
    return { actionId: 'act', auditId: 'aud', sha256Chain: 'c' };
  },
}));
vi.mock('../../services/notifications/notification-service', () => ({
  createNotification: vi.fn(async (n: { resourceId: string | null }) => {
    h.log.push(`notify:${n.resourceId}`);
    return 1;
  }),
}));
vi.mock('../../services/tasking/task-signoff', () => ({
  requireTaskSignoff: vi.fn(async () => {
    await h.beforeWrite?.();
    return { required: false };
  }),
}));

const ORG = 42;

/**
 * The REAL schema, not a hand-typed copy: the baseline tables and their two
 * dependency FKs from migrations/0000_sweet_joseph.sql, then the migrations
 * that extended them, run as they are. A model column the migrations lack
 * fails here, as it would in production. `ledger_rows` is the stand-in the
 * mocked recordGovernedAction writes to.
 */
const BASELINE = 'migrations/0000_sweet_joseph.sql';
const DDL = [
  extractTableDdl(BASELINE, ['unified_tasks', 'task_dependencies', 'cross_module_task_links']),
  ...fs
    .readFileSync(path.join(REPO_ROOT, BASELINE), 'utf8')
    .split('\n')
    .filter((l) => /^ALTER TABLE "task_dependencies" ADD CONSTRAINT .* REFERENCES "public"\."unified_tasks"/.test(l))
    .map((l) => l.replace('--> statement-breakpoint', '')),
  ...[
    'db/migrations/20260727_unified_tasks_mdx_metadata.sql',
    'db/migrations/20260807_task_graph_org_columns.sql',
    'db/migrations/20260807_unified_tasks_soft_delete.sql',
  ].map((f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')),
  `CREATE TABLE ledger_rows (
     seq serial PRIMARY KEY,
     target text NOT NULL,
     command text NOT NULL,
     payload jsonb,
     reason text
   );`,
].join('\n');

/**
 * A (review) is the task being completed.
 *   B — blocked, blockedBy [A]            → in-progress when A completes
 *   C — blocked, a blocking DAG edge A→C  → pending when A completes
 *   D — blocked, blockedBy [A, X]         → blockedBy [X], STILL blocked (no status move)
 *   X — in progress, D's other blocker
 */
const FIXTURE = `
TRUNCATE ledger_rows, task_dependencies, unified_tasks RESTART IDENTITY;
INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, blocked_by, assignee_id, created_by_id) VALUES
  ('TASK-A', ${ORG}, 'clinical', 'Draft CSR shell', 'review', NULL, 9, 9),
  ('TASK-B', ${ORG}, 'clinical', 'Write 2.7.3', 'blocked', ARRAY['TASK-A'], 42, 9),
  ('TASK-C', ${ORG}, 'clinical', 'QC the shell', 'blocked', NULL, 43, 9),
  ('TASK-D', ${ORG}, 'clinical', 'Assemble module 5', 'blocked', ARRAY['TASK-A','TASK-X'], 44, 9),
  ('TASK-X', ${ORG}, 'clinical', 'Lock the tables', 'in-progress', NULL, 45, 9);
INSERT INTO task_dependencies (dependency_id, organization_id, predecessor_task_id, successor_task_id, dependency_type)
  VALUES ('DEP-AC', ${ORG}, 'TASK-A', 'TASK-C', 'finish-to-start');
`;

async function task(taskId: string) {
  const r = await pg.query<{ status: string; blocked_by: string[] | null; completed_at: string | null }>(
    'SELECT status, blocked_by, completed_at FROM unified_tasks WHERE task_id = $1',
    [taskId],
  );
  return r.rows[0];
}
async function ledger() {
  const r = await pg.query<{ target: string; command: string; payload: any; reason: string }>(
    'SELECT target, command, payload, reason FROM ledger_rows ORDER BY seq',
  );
  return r.rows;
}
const complete = (taskId = 'TASK-A') =>
  request(app).patch(`/api/task-management/tasks/${taskId}`).send({ status: 'completed' });

beforeAll(async () => {
  pg = new PGlite();
  drz = drizzle(pg, {
    schema,
    logger: {
      logQuery(query: string, params: unknown[]) {
        h.sql.push({ query, params });
        const q = query.trim().toLowerCase();
        const id = params.find((p) => typeof p === 'string' && /^TASK-/.test(p));
        if (q.startsWith('update "unified_tasks"')) h.log.push(`update:${id}`);
        else if (q.startsWith('insert into ledger_rows')) h.log.push(`ledger:${String(params[0]).replace(/^task:/, '')}`);
      },
    },
  }) as unknown as ReturnType<typeof drizzle>;
  // Mark the transaction boundaries drizzle opens through PGlite.
  const transaction = pg.transaction.bind(pg);
  (pg as any).transaction = async (cb: (tx: unknown) => Promise<unknown>) => {
    h.log.push('BEGIN');
    try {
      const out = await transaction(cb as any);
      h.log.push('COMMIT');
      return out;
    } catch (err) {
      h.log.push('ROLLBACK');
      throw err;
    }
  };
  await pg.exec(DDL);

  // Imported only now: the router captures `db` when it loads.
  const { default: routes } = await import('../taskManagement.routes');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { organizationId: ORG, id: 7, role: 'member' };
    (req as any).userRole = 'member';
    next();
  });
  app.use('/api/task-management', routes);
}, 60_000);
afterAll(async () => {
  await pg?.close();
});
beforeEach(async () => {
  await pg.exec(FIXTURE);
  h.log = [];
  h.failLedgerFor = null;
  h.beforeWrite = null;
  h.sql = [];
});

describe('completing a task unblocks its dependents in the SAME transaction, with their ledger rows', () => {
  it('moves B and C, leaves D blocked, and records every dependent whose record changed', async () => {
    const res = await complete();

    expect(res.status).toBe(200);
    expect((await task('TASK-A')).status).toBe('completed');
    expect(await task('TASK-B')).toMatchObject({ status: 'in-progress', blocked_by: [] });
    expect((await task('TASK-C')).status).toBe('pending');
    // D lost A as a blocker but still waits on X: its row changed, its status did not.
    expect(await task('TASK-D')).toMatchObject({ status: 'blocked', blocked_by: ['TASK-X'] });

    const rows = await ledger();
    const byTarget = Object.fromEntries(rows.map((r) => [r.target, r]));
    expect(Object.keys(byTarget).sort()).toEqual(['task:TASK-A', 'task:TASK-B', 'task:TASK-C', 'task:TASK-D']);
    expect(byTarget['task:TASK-B']).toMatchObject({
      command: 'task.transition',
      payload: {
        from: 'blocked', to: 'in-progress', cause: 'predecessor-completed', predecessor: 'TASK-A',
        blockedBy: { from: ['TASK-A'], to: [] },
      },
      reason: 'Unblocked: predecessor TASK-A completed',
    });
    // A change to D's record is a change: it has its own row, status unchanged.
    expect(byTarget['task:TASK-D']).toMatchObject({
      command: 'task.transition',
      payload: {
        from: 'blocked', to: 'blocked', cause: 'predecessor-completed', predecessor: 'TASK-A',
        blockedBy: { from: ['TASK-A', 'TASK-X'], to: ['TASK-X'] },
      },
    });
    expect(byTarget['task:TASK-D'].reason).toMatch(/TASK-A completed/);
    expect(byTarget['task:TASK-C']).toMatchObject({
      command: 'task.transition',
      payload: { from: 'blocked', to: 'pending', cause: 'predecessor-completed', predecessor: 'TASK-A' },
      reason: 'Unblocked: predecessor TASK-A completed',
    });
    expect(byTarget['task:TASK-A']).toMatchObject({
      command: 'task.transition',
      payload: expect.objectContaining({ from: 'review', to: 'completed' }),
    });
  });

  it('writes every ledger row inside the completion’s transaction, after every task-row UPDATE (lock order)', async () => {
    await complete();

    const begin = h.log.indexOf('BEGIN');
    const commit = h.log.indexOf('COMMIT');
    const updates = h.log.map((l, i) => (l.startsWith('update:') ? i : -1)).filter((i) => i >= 0);
    const ledgerRows = h.log.map((l, i) => (l.startsWith('ledger:') ? i : -1)).filter((i) => i >= 0);

    expect(h.log.filter((l) => l.startsWith('update:')).sort()).toEqual(
      ['update:TASK-A', 'update:TASK-B', 'update:TASK-C', 'update:TASK-D'],
    );
    expect(ledgerRows).toHaveLength(4);
    // One transaction holds the completion, the cascade and all four ledger rows.
    expect(h.log.filter((l) => l === 'BEGIN')).toHaveLength(1);
    for (const i of [...updates, ...ledgerRows]) {
      expect(i).toBeGreaterThan(begin);
      expect(i).toBeLessThan(commit);
    }
    // Row locks first, the audit-chain lock last: no UPDATE after the first ledger row.
    expect(Math.max(...updates)).toBeLessThan(Math.min(...ledgerRows));
  });

  it('lists the completion before the unblocking it caused: A, then B, C, D', async () => {
    await complete();

    expect((await ledger()).map((r) => r.target)).toEqual(['task:TASK-A', 'task:TASK-B', 'task:TASK-C', 'task:TASK-D']);
  });

  it('locks every dependent in ONE statement, in task-id order, whichever linkage system names it', async () => {
    // E is named by both systems; it must be locked, moved and recorded once.
    await pg.exec(`
      INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, blocked_by)
        VALUES ('TASK-E', ${ORG}, 'clinical', 'Both links', 'blocked', ARRAY['TASK-A']);
      INSERT INTO task_dependencies (dependency_id, organization_id, predecessor_task_id, successor_task_id, dependency_type)
        VALUES ('DEP-AE', ${ORG}, 'TASK-A', 'TASK-E', 'finish-to-start');`);

    const res = await complete();

    expect(res.status).toBe(200);
    const locks = h.sql.filter((s) => /for no key update/i.test(s.query));
    expect(locks).toHaveLength(1);
    expect(locks[0].query).toMatch(/order by "unified_tasks"\."task_id"/i);
    const locked = locks[0].params.filter((p) => typeof p === 'string' && /^TASK-/.test(p));
    expect([...locked].sort()).toEqual(['TASK-B', 'TASK-C', 'TASK-D', 'TASK-E']);
    expect((await ledger()).filter((r) => r.target === 'task:TASK-E')).toHaveLength(1);
    expect((await task('TASK-E')).status).toBe('in-progress');
  });

  it('sends the unblock and completion notifications only after COMMIT', async () => {
    await complete();

    const commit = h.log.indexOf('COMMIT');
    const notes = h.log.filter((l) => l.startsWith('notify:'));
    expect(notes.sort()).toEqual(['notify:TASK-A', 'notify:TASK-B', 'notify:TASK-C']);
    for (const n of notes) expect(h.log.indexOf(n)).toBeGreaterThan(commit);
  });
});

describe('a cascade that cannot be recorded or completed rolls the completion back', () => {
  it('a failed ledger row for B rolls back A’s completion and B’s unblocking: 500, nothing changed, nobody notified', async () => {
    h.failLedgerFor = 'TASK-B';

    const res = await complete();

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(await task('TASK-A')).toMatchObject({ status: 'review', completed_at: null });
    expect(await task('TASK-B')).toMatchObject({ status: 'blocked', blocked_by: ['TASK-A'] });
    expect((await task('TASK-C')).status).toBe('blocked');
    expect(await task('TASK-D')).toMatchObject({ status: 'blocked', blocked_by: ['TASK-A', 'TASK-X'] });
    // B's row was inserted before it failed; the rollback took it too.
    expect(await ledger()).toEqual([]);
    expect(h.log).toContain('ROLLBACK');
    expect(h.log).not.toContain('COMMIT');
    expect(h.log.some((l) => l.startsWith('notify:'))).toBe(false);
  });

  it('a database failure inside the cascade is a rolled-back completion and an honest 500, not a 400 over a committed one', async () => {
    await pg.exec('ALTER TABLE task_dependencies RENAME TO task_dependencies_hidden');
    try {
      const res = await complete();

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/relation|task_dependencies/);
      expect((await task('TASK-A')).status).toBe('review');
      expect((await task('TASK-B')).status).toBe('blocked');
      expect(await ledger()).toEqual([]);
      expect(h.log.some((l) => l.startsWith('notify:'))).toBe(false);
    } finally {
      await pg.exec('ALTER TABLE task_dependencies_hidden RENAME TO task_dependencies');
    }
  });
});

describe('an archived task is out of the cascade’s reach, and out of PATCH’s', () => {
  it('leaves an archived blocked dependent as it was: no move, no ledger row, no notification', async () => {
    await pg.exec("UPDATE unified_tasks SET deleted_at = now() WHERE task_id IN ('TASK-B', 'TASK-C')");

    const res = await complete();

    expect(res.status).toBe(200);
    expect(await task('TASK-B')).toMatchObject({ status: 'blocked', blocked_by: ['TASK-A'] });
    expect((await task('TASK-C')).status).toBe('blocked');
    expect((await ledger()).map((r) => r.target)).toEqual(['task:TASK-A', 'task:TASK-D']);
    expect(h.log.filter((l) => l.startsWith('notify:'))).toEqual(['notify:TASK-A']);
  });

  it('a task archived after PATCH read it is not completed: 409 CONFLICT_STALE, nothing written', async () => {
    h.beforeWrite = () => pg.exec("UPDATE unified_tasks SET deleted_at = now() WHERE task_id = 'TASK-A'");

    const res = await complete();

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT_STALE');
    expect(await task('TASK-A')).toMatchObject({ status: 'review', completed_at: null });
    expect((await task('TASK-B')).status).toBe('blocked');
    expect(await ledger()).toEqual([]);
    expect(h.log.some((l) => l.startsWith('notify:'))).toBe(false);
  });
});

describe('the callers with no transaction of their own keep the old behaviour', () => {
  it('runs on db, notifies inline, and writes no ledger row', async () => {
    const { cascadeUnblockOnCompletion } = await import('../../services/tasking/task-side-effects');
    await pg.exec("UPDATE unified_tasks SET status = 'completed' WHERE task_id = 'TASK-A'");

    const out = await cascadeUnblockOnCompletion(ORG, 'TASK-A');

    expect(out).toBeUndefined();
    expect((await task('TASK-B')).status).toBe('in-progress');
    expect((await task('TASK-C')).status).toBe('pending');
    expect(await ledger()).toEqual([]);
    expect(h.log.filter((l) => l.startsWith('notify:')).sort()).toEqual(['notify:TASK-B', 'notify:TASK-C']);
  });

  it('never re-writes an archived dependent there either', async () => {
    const { cascadeUnblockOnCompletion } = await import('../../services/tasking/task-side-effects');
    await pg.exec("UPDATE unified_tasks SET status = 'completed' WHERE task_id = 'TASK-A'");
    await pg.exec("UPDATE unified_tasks SET deleted_at = now() WHERE task_id IN ('TASK-B', 'TASK-C')");

    await cascadeUnblockOnCompletion(ORG, 'TASK-A');

    expect(await task('TASK-B')).toMatchObject({ status: 'blocked', blocked_by: ['TASK-A'] });
    expect((await task('TASK-C')).status).toBe('blocked');
    expect(h.log.some((l) => l.startsWith('notify:'))).toBe(false);
  });
});
