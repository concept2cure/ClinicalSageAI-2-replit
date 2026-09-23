/**
 * Shared harness for the /api/tasks governed-write tests
 * (task-management-governed-writes.test.ts and
 * task-management-governed-writes-review.test.ts): the drizzle-shaped database
 * whose ordered trace the assertions read, the ledger primitive failure is
 * injected at (recordGovernedAction, so the real task-audit code runs and
 * decides which transaction the row lands on), the spies, and the app.
 *
 * Each test file keeps its OWN vi.mock calls — a mock is registered by the file
 * that declares it — and its factories hand back the module builders below.
 * This file imports nothing those files mock: a builder runs while the module
 * it stands in for is being imported, so a mocked import here would be a cycle.
 *
 * Not a test file: nothing here runs on its own.
 */
import { vi } from 'vitest';
import express from 'express';
import { BUILTIN_WORKFLOW_TEMPLATES } from '../../services/tasking/workflow-templates';

export const h = {
  /** Ordered trace of what reached the database, and on which connection. */
  log: [] as string[],
  selects: [] as any[][],
  inserted: [{ taskId: 'TASK-NEW', title: 'New' }] as any[],
  updated: [{ taskId: 'TASK-1', title: 'Existing' }] as any[],
  auditFails: false,
  audits: [] as any[],
  /** What each UPDATE was asked to SET, in order. */
  sets: [] as any[],
  /** What each INSERT was asked to write, in order. */
  values: [] as any[],
  /** Each statement's WHERE condition, rendered to SQL by `sqlOf`. */
  wheres: [] as Array<{ tag: string; kind: string; cond: unknown }>,
  /** Fail a statement: return the error to throw from it. */
  fail: null as null | ((tag: string, kind: string) => Error | undefined),
  /** The Nth transaction (1-based) whose COMMIT is lost — its outcome unknown. */
  failCommit: 0,
  transactions: 0,
  /** The owned ledger branch cannot open its connection. */
  connectFails: false,
};

export const spies = {
  notifyTaskEvent: vi.fn(),
  cascadeUnblockOnCompletionInTx: vi.fn(async (..._args: unknown[]) => ({ ledger: [] as unknown[], notices: [] as unknown[] })),
  wouldCreateDependencyCycle: vi.fn(async () => false),
  createNotification: vi.fn(async () => 1),
  requireTaskSignoff: vi.fn(),
  getOptimalAssignee: vi.fn(async () => null as null | { id: number; name: string }),
};

/** Stands in for `server/db`. */
export function dbModule() {
  /** A drizzle-shaped builder: every method chains, awaiting it runs. */
  const chain = (tag: string, kind: string, result: () => unknown) => {
    const c: any = {};
    for (const m of ['from', 'where', 'orderBy', 'limit', 'values', 'set', 'returning', 'innerJoin', 'leftJoin', 'groupBy', 'for']) {
      c[m] = () => c;
    }
    c.set = (v: unknown) => {
      h.sets.push(v);
      return c;
    };
    c.values = (v: unknown) => {
      h.values.push(v);
      return c;
    };
    c.where = (cond: unknown) => {
      h.wheres.push({ tag, kind, cond });
      return c;
    };
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      h.log.push(`${tag}:${kind}`);
      const err = h.fail?.(tag, kind);
      return (err ? Promise.reject(err) : Promise.resolve().then(result)).then(res, rej);
    };
    return c;
  };
  const runner = (tag: string) => ({
    select: () => chain(tag, 'select', () => h.selects.shift() ?? []),
    insert: () => chain(tag, 'insert', () => h.inserted),
    update: () => chain(tag, 'update', () => h.updated),
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
    connect: async () => {
      if (h.connectFails) throw new Error('connect ETIMEDOUT 10.0.0.5:5432');
      return {
        query: async (sql: string) => {
          h.log.push(`pool:${sql.split(' ')[0]}`);
          return { rows: [] };
        },
        release: () => undefined,
      };
    },
  };
  return { db, pool };
}

/** Stands in for `server/routes/c2c/actions`: the ledger primitive. */
export function ledgerModule() {
  return {
    recordGovernedAction: async (client: { query: (s: string) => Promise<unknown> }, row: unknown) => {
      h.audits.push(row);
      // tenant-isolation-safe: a test double's marker statement on a recording mock client; no database, no table, no tenant data
      await client.query('INSERT INTO audit_logs');
      if (h.auditFails) throw new Error('audit_logs: connection reset');
      return { actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'c' };
    },
  };
}

/** Stands in for `services/tasking/task-side-effects`. */
export function sideEffectsModule() {
  return {
    notifyTaskEvent: spies.notifyTaskEvent,
    cascadeUnblockOnCompletionInTx: spies.cascadeUnblockOnCompletionInTx,
    wouldCreateDependencyCycle: spies.wouldCreateDependencyCycle,
  };
}

/** Stands in for `services/notifications/notification-service`. */
export function notificationModule() {
  return { createNotification: spies.createNotification };
}

/** Stands in for `services/tasking/task-signoff`. */
export function signoffModule() {
  return { requireTaskSignoff: spies.requireTaskSignoff };
}

/** Stands in for `services/tasking/task-planning`. */
export function planningModule() {
  return {
    getOptimalAssignee: spies.getOptimalAssignee,
    calculateCriticalPath: vi.fn(async () => []),
  };
}

/** `makeApp` for the router under test, mounted where production mounts it. */
export function appFactory(taskManagementRoutes: express.Router) {
  return function makeApp(
    role: string | null = 'member',
    userId: number | null = 7,
    tenantContext?: { organizationId: number },
  ) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { organizationId: 2, ...(userId ? { id: userId } : {}), ...(role ? { role } : {}) };
      if (role) (req as any).userRole = role;
      if (tenantContext) (req as any).tenantContext = tenantContext;
      next();
    });
    app.use('/api/task-management', taskManagementRoutes);
    return app;
  };
}

export const BASE = '/api/task-management';
export const TEMPLATE_ID = BUILTIN_WORKFLOW_TEMPLATES[0].templateId;

export const wrote = () => h.log.filter((l) => /:(insert|update|execute)$/.test(l) || l.startsWith('pool:'));

/** Every test starts from an empty trace and the default spy answers. */
export function resetHarness() {
  h.log = [];
  h.selects = [];
  h.inserted = [{ taskId: 'TASK-NEW', title: 'New' }];
  h.updated = [{ taskId: 'TASK-1', title: 'Existing' }];
  h.auditFails = false;
  h.audits = [];
  h.sets = [];
  h.values = [];
  h.wheres = [];
  h.fail = null;
  h.failCommit = 0;
  h.transactions = 0;
  h.connectFails = false;
  vi.clearAllMocks();
  spies.cascadeUnblockOnCompletionInTx.mockResolvedValue({ ledger: [], notices: [] });
  spies.wouldCreateDependencyCycle.mockResolvedValue(false);
  spies.createNotification.mockResolvedValue(1);
  spies.getOptimalAssignee.mockResolvedValue(null);
  spies.requireTaskSignoff.mockResolvedValue({ required: false });
}
