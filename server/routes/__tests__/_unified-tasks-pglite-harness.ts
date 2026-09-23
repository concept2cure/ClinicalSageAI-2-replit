/**
 * Shared PGlite harness for unifiedTasks-governed.pglite.integration.test.ts:
 * the ordered trace (`h.log`), the stand-ins its mocks hand back, the readers
 * its assertions use, and the hooks that build the database and the app.
 *
 * The test file keeps its OWN vi.mock calls — a mock is registered by the file
 * that declares it — and its OWN migration list and fixture, which it passes to
 * setUpPgliteApp (a migration list hidden in a helper would dodge the
 * migration-list-closure contract, which scans test files). This file imports
 * nothing that file mocks: a builder runs while the module it stands in for is
 * being imported, so a mocked import here would be a cycle.
 *
 * Not a test file: nothing here runs on its own.
 */
import { beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../../../shared/schema';

export const h = {
  /** BEGIN / COMMIT / ROLLBACK, each task-row lock and write, each ledger row,
   *  each notification — in order. */
  log: [] as string[],
  /** Fail the ledger row for this target (`task:<id>`) or this command. */
  failLedgerFor: null as string | null,
  failLedgerCommand: null as string | null,
  /** The org role the auth middleware resolves for the next request. */
  role: 'member',
  /** Runs between PATCH's fetch-first read and its transaction (the sign-off step). */
  beforeWrite: null as null | (() => Promise<unknown>),
  /** What the sign-off step answers; `{ required: false }` when unset. */
  signoff: null as null | Record<string, unknown>,
};

export let pg: PGlite;
let drz: ReturnType<typeof drizzle>;
export let app: express.Express;

export const ORG = 42;
export const OTHER_ORG = 77;
export const BASE = '/api/regulatory/tasks';

/** Stands in for `server/db`: resolves to this file's PGlite once it exists. */
export function dbModule() {
  return {
    get db() {
      return drz;
    },
    pool: {},
  };
}

/** Stands in for `server/db/requestDb`: the routes transact on the request's
 *  connection, which here is the same PGlite-backed Drizzle instance. */
export function requestDbModule() {
  return { requestDb: () => drz };
}

/** Stands in for `server/routes/c2c/actions`. The ledger primitive writes its
 *  row into `ledger_rows` on the connection it is handed, so a row that
 *  survives is a row that committed on that transaction, and one it is told
 *  to fail throws AFTER its insert — the rollback has to take the insert with it. */
export function ledgerModule() {
  return {
    recordGovernedAction: async (
      client: { query: (s: string, p?: unknown[]) => Promise<unknown> },
      row: { target: string; command: string; payload: unknown; reason: string; userId: number }
    ) => {
      await client.query(
        'INSERT INTO ledger_rows (target, command, payload, reason, user_id) VALUES ($1, $2, $3, $4, $5)',
        [row.target, row.command, JSON.stringify(row.payload), row.reason, row.userId]
      );
      if (
        (h.failLedgerFor && row.target === `task:${h.failLedgerFor}`) ||
        (h.failLedgerCommand && row.command === h.failLedgerCommand)
      ) {
        throw new Error('audit_logs: connection reset');
      }
      return { actionId: 'act', auditId: 'aud', sha256Chain: 'c' };
    },
  };
}

/** Stands in for `services/tasking/task-signoff`. */
export function signoffModule() {
  return {
    requireTaskSignoff: vi.fn(async () => {
      await h.beforeWrite?.();
      return h.signoff ?? { required: false };
    }),
  };
}

/** Stands in for `services/notifications/notification-service`. */
export function notificationModule() {
  return {
    createNotification: vi.fn(async (n: { resourceId: string | null }) => {
      h.log.push(`notify:${n.resourceId}`);
      return 1;
    }),
  };
}

export async function task(taskId: string) {
  const r = await pg.query<{
    status: string;
    blocked_by: string[] | null;
    blocks: string[] | null;
    completed_at: string | null;
    last_modified_by: number | null;
  }>(
    'SELECT status, blocked_by, blocks, completed_at, last_modified_by FROM unified_tasks WHERE task_id = $1',
    [taskId]
  );
  return r.rows[0];
}
export async function ledger() {
  const r = await pg.query<{
    target: string;
    command: string;
    payload: any;
    reason: string;
    user_id: number;
  }>('SELECT target, command, payload, reason, user_id FROM ledger_rows ORDER BY seq');
  return r.rows;
}
export async function snapshot() {
  const tasks = await pg.query(
    'SELECT task_id, status, blocked_by, blocks, completed_at FROM unified_tasks ORDER BY task_id'
  );
  const links = await pg.query('SELECT link_id FROM cross_module_task_links');
  return { tasks: tasks.rows, links: links.rows, ledger: await ledger() };
}

/**
 * Register the file's hooks: build PGlite with `ddl` once, then the real router
 * over it; before each test, load `fixture` and reset `h`.
 */
export function setUpPgliteApp(ddl: string, fixture: string) {
  beforeAll(async () => {
    pg = new PGlite();
    drz = drizzle(pg, {
      schema,
      logger: {
        logQuery(query: string, params: unknown[]) {
          const q = query.trim().toLowerCase();
          // The WHERE's task id is the LAST one: an array_append SET binds the
          // other task's id first.
          const id = params.filter(p => typeof p === 'string' && /^TASK-/.test(p)).at(-1);
          // A locking read of task rows, and whether it takes them in task-id order.
          if (q.startsWith('select') && q.includes('from "unified_tasks"') && q.endsWith('for no key update'))
            h.log.push(q.includes('order by "unified_tasks"."task_id"') ? 'lock:by-task-id' : 'lock:unordered');
          else if (q.includes('from document_approvals')) h.log.push('read:document_approvals');
          else if (q.startsWith('update "unified_tasks"')) h.log.push(`update:${id}`);
          else if (q.startsWith('insert into "unified_tasks"')) h.log.push('insert:task');
          else if (q.startsWith('insert into "cross_module_task_links"')) h.log.push('insert:link');
          else if (q.startsWith('insert into ledger_rows'))
            h.log.push(`ledger:${String(params[0]).replace(/^task:/, '')}`);
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
    await pg.exec(ddl);

    // Imported only now, once `db` resolves to this PGlite.
    const { default: routes } = await import('../unifiedTasks.routes');
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { organizationId: ORG, id: 7, role: h.role };
      (req as any).userRole = h.role;
      next();
    });
    app.use(BASE, routes);
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });
  beforeEach(async () => {
    await pg.exec(fixture);
    h.log = [];
    h.failLedgerFor = null;
    h.failLedgerCommand = null;
    h.role = 'member';
    h.beforeWrite = null;
    h.signoff = null;
  });
}
