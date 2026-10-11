/**
 * Background run-control queries open their own tenant scope.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Pool access in this codebase is scoped by AsyncLocalStorage, not by the
 * connection: `poolInstrumentation.runQueryScoped` reads `getTenantScope()` at
 * QUERY time and pins `app.current_tenant_id` from it, and once RLS_ENFORCE=on —
 * which production is the only permitted setting for — an unscoped query is
 * rejected fail-closed. So a query's correctness depends on the context it RUNS
 * in, not the one it was written in.
 *
 * Three of this module's paths have no ambient request scope, or worse, the
 * wrong one:
 *
 *   the poll fallback   `setInterval` carries the context the TIMER was created
 *                       in. It is armed from inside the first turn after boot
 *                       that fails to open a listener, so every later firing
 *                       stayed pinned to that first tenant — asking about every
 *                       run this process owns while able to see only one org's.
 *   the NOTIFY handler  runs in the LISTEN socket's creation context, not the
 *                       notifying request's.
 *   reapOrphanedRuns    is estate-wide by design (the runs that most need
 *                       reaping belong to an instance that is gone) but is
 *                       called from inside a request, whose scope would narrow
 *                       it to one org and return a reassuring small number.
 *
 * In every case RLS returns ZERO ROWS rather than an error, so nothing reports
 * it and cross-instance control silently stops working — the one capability the
 * durable record exists to deliver.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 * Not that a scope helper was called, but that `getTenantScope()` observed from
 * INSIDE the query — where the instrumentation reads it — is the right one. A
 * wrapper around the wrong statement would pass the first check and fail this.
 */
import type { Pool } from 'pg';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { getTenantScope, runWithTenantScope, type TenantScope } from '../../../db/tenantStore.js';
import {
  beginRun,
  releaseLocalRun,
  reapOrphanedRuns,
  stopRunInternally,
  readRun,
  _resetLocalRunsForTest,
} from '../run-control.js';

/** A pool that records the tenant scope in force when each query runs. */
function recordingPool() {
  const scopes: Array<TenantScope | undefined> = [];
  return {
    scopes,
    pool: {
      query: vi.fn(async () => {
        scopes.push(getTenantScope());
        return { rows: [], rowCount: 0 };
      }),
    } as any,
  };
}

const REQUEST_SCOPE: TenantScope = {
  tenantId: '7',
  role: 'member',
  source: 'request',
  caller: 'test',
} as TenantScope;

beforeEach(() => _resetLocalRunsForTest());

describe('the estate-wide sweep is estate-wide', () => {
  it('reaps under the system scope even when called from inside a tenant request', async () => {
    // This is the real call site: stream.ts sweeps opportunistically from inside
    // a turn. Inheriting that turn's scope is what reduced the sweep to one org.
    const { pool, scopes } = recordingPool();
    await runWithTenantScope(REQUEST_SCOPE, () => reapOrphanedRuns(pool));
    // The reap, and (AnA detach DT1) the mirror sweep's two finding queries:
    // every one of them estate-wide, none in the caller's tenant.
    expect(scopes.length).toBeGreaterThanOrEqual(1);
    for (const scope of scopes) {
      expect(scope?.tenantId).toBe('0');
      expect(scope?.role).toBe('app_super_admin');
    }
  });

  it('does not inherit the caller tenant — the bug this replaces', async () => {
    const { pool, scopes } = recordingPool();
    await runWithTenantScope(REQUEST_SCOPE, () => reapOrphanedRuns(pool));
    expect(scopes[0]?.tenantId).not.toBe('7');
  });
});

describe('a write about one run takes that run tenant, not a super-admin bypass', () => {
  it('scopes the disconnect write to the run own organization', async () => {
    // Reached from a socket 'close', which runs in the context of whoever called
    // emit rather than the context it was registered in — so it cannot rely on
    // inheriting the request scope, and is given the run's tenant explicitly.
    const { pool, scopes } = recordingPool();
    await stopRunInternally(pool, 'run_1', 'client_disconnected', 42);
    expect(scopes[0]?.tenantId).toBe('42');
    // Deliberately NOT app_super_admin: settling one known run needs no policy
    // bypass, and taking one for convenience is how a bypass becomes the norm.
    expect(scopes[0]?.role).not.toBe('app_super_admin');
  });

  it('aborts the local run even when the row write cannot be made', async () => {
    // A dropped socket should stop the work whether or not the database is
    // reachable; the abort is local and needs no query.
    const pool = { query: vi.fn(async () => { throw new Error('unreachable'); }) } as any;
    await expect(stopRunInternally(pool, 'run_missing', 'client_disconnected', 42)).resolves
      .toBeUndefined();
  });
});

describe('request-time reads inherit the caller scope rather than widening it', () => {
  it('reads a run under the request own tenant', async () => {
    // The counterpart assertion. If these opened a system scope too, the module
    // would be handing every ordinary read a policy bypass.
    const { pool, scopes } = recordingPool();
    await runWithTenantScope(REQUEST_SCOPE, () => readRun(pool, 'run_1', 7));
    expect(scopes[0]?.tenantId).toBe('7');
    expect(scopes[0]?.role).not.toBe('app_super_admin');
  });
});


const heartbeatLogs = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('../../../utils/logger', () => ({ createScopedLogger: () => heartbeatLogs }));
afterEach(() => _resetLocalRunsForTest());

function deferredBeat() {
  let resolve!: (value: { rows: never[] }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ rows: never[] }>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve: () => resolve({ rows: [] }), reject };
}
function heartbeatPool() {
  const writes: Array<ReturnType<typeof deferredBeat>> = [];
  const rounds: number[] = [];
  const scopes: Array<TenantScope | undefined> = [];
  const query = vi.fn((sql: string, params: unknown[]) => {
    if (!sql.includes('SET heartbeat_at')) return Promise.resolve({ rows: [], rowCount: 1 });
    const write = deferredBeat();
    writes.push(write); rounds.push(params[1] as number); scopes.push(getTenantScope());
    return write.promise;
  });
  // No LISTEN connection; beginRun's locking transaction (AnA detach DT1) gets a
  // plain client that commits, told apart by the scope the listener opens under.
  const connect = vi.fn(async () => {
    if (getTenantScope()?.caller === 'ana-run-control:listen') throw new Error('no listener');
    return { query: async () => ({ rows: [] }), release: () => undefined };
  });
  const pool = { query, connect } as unknown as Pool;
  return { pool, query, writes, rounds, scopes };
}
async function beatFlush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
async function beatRun(fake: ReturnType<typeof heartbeatPool>, organizationId = 7) {
  return beginRun({ pool: fake.pool, organizationId, userId: 3, surface: 'chat' });
}
async function drainBeats(fake: ReturnType<typeof heartbeatPool>) {
  for (let i = 0; i < 40; i++) { fake.writes.forEach(write => write.resolve()); await beatFlush(); }
}

describe('heartbeat pending-write admission', () => {
  it('bounds a twenty-call burst and drains the newest round before any caller completes', async () => {
    const fake = heartbeatPool(); const run = await beatRun(fake);
    let firstDone = false;
    const first = run.handle.heartbeat(1).then(() => { firstDone = true; });
    await beatFlush();
    const calls = [first, ...Array.from({ length: 19 }, (_, i) => run.handle.heartbeat(i + 2))];
    await beatFlush(); const burstWrites = fake.writes.length;
    fake.writes[0].resolve(); await beatFlush();
    const earlyDone = firstDone; const firstSuccessor = [...fake.rounds];
    const later = run.handle.heartbeat(30); await beatFlush();
    const pendingSuccessorWrites = fake.writes.length;
    await drainBeats(fake); await Promise.all([...calls, later]);
    expect(burstWrites).toBe(1); expect(earlyDone).toBe(false);
    expect(firstSuccessor).toEqual([1, 20]); expect(pendingSuccessorWrites).toBe(2);
    expect(fake.rounds).toEqual([1, 20, 30]); expect(firstDone).toBe(true);
  });

  it('refreshes timestamps for overlapping requests even when their rounds are identical', async () => {
    const fake = heartbeatPool(); const run = await beatRun(fake);
    const first = run.handle.heartbeat(4); await beatFlush();
    const second = run.handle.heartbeat(4); const third = run.handle.heartbeat(4);
    await beatFlush(); const pendingWrites = fake.writes.length;
    await drainBeats(fake); await Promise.all([first, second, third]);
    expect(pendingWrites).toBe(1); expect(fake.rounds).toEqual([4, 4]);
  });

  it('keeps run handles independent within one pool and across pools', async () => {
    const fake = heartbeatPool(); const other = heartbeatPool();
    const a = await beatRun(fake); const b = await beatRun(fake, 42); const c = await beatRun(other, 99);
    const calls = [a.handle.heartbeat(1), b.handle.heartbeat(2), c.handle.heartbeat(3)];
    await beatFlush(); const counts = [fake.writes.length, other.writes.length];
    await drainBeats(fake); await drainBeats(other); await Promise.all(calls);
    expect(counts).toEqual([2, 1]); expect(fake.rounds).toEqual([1, 2]); expect(other.rounds).toEqual([3]);
  });

  it('uses actual request tenant scope on admitted and successor writes without system bypass', async () => {
    const fake = heartbeatPool(); const run = await beatRun(fake);
    const scope = { ...REQUEST_SCOPE, caller: 'heartbeat-request' };
    const first = runWithTenantScope(scope, () => run.handle.heartbeat(1)); await beatFlush();
    const second = runWithTenantScope(scope, () => run.handle.heartbeat(2)); await beatFlush();
    await drainBeats(fake); await Promise.all([first, second]);
    expect(fake.scopes).toHaveLength(2);
    for (const observed of fake.scopes) expect(observed).toEqual(scope);
  });

  it('discards queued and future writes after local release while the issued write settles', async () => {
    const fake = heartbeatPool(); const run = await beatRun(fake);
    const first = run.handle.heartbeat(1); await beatFlush();
    const queued = run.handle.heartbeat(2); releaseLocalRun(run.runId);
    const released = run.handle.heartbeat(3); await beatFlush();
    await drainBeats(fake); await Promise.all([first, queued, released]);
    expect(fake.rounds).toEqual([1]);
  });

  it('does no database work after release before admission or before a scheduled first query', async () => {
    const fake = heartbeatPool(); const scheduled = await beatRun(fake); const released = await beatRun(fake);
    const beforeRelease = scheduled.handle.heartbeat(1); releaseLocalRun(scheduled.runId);
    releaseLocalRun(released.runId); const afterRelease = released.handle.heartbeat(2);
    await drainBeats(fake); await Promise.all([beforeRelease, afterRelease]); expect(fake.writes).toHaveLength(0);
  });

});

describe('heartbeat failures and microtask admission', () => {
  it('warns on asynchronous failure, drains the newest request and admits a later retry', async () => {
    const fake = heartbeatPool(); const run = await beatRun(fake);
    heartbeatLogs.warn.mockClear();
    const first = run.handle.heartbeat(1); await beatFlush();
    const calls = [first, run.handle.heartbeat(2), run.handle.heartbeat(3)];
    await beatFlush(); const pendingWrites = fake.writes.length;
    fake.writes[0].reject(new Error('heartbeat database unavailable')); await beatFlush();
    await drainBeats(fake); await Promise.all(calls);
    const retry = run.handle.heartbeat(4); await drainBeats(fake); await retry;
    expect(pendingWrites).toBe(1); expect(fake.rounds).toEqual([1, 3, 4]);
    expect(heartbeatLogs.warn).toHaveBeenCalledWith(`[ana-run-control] heartbeat failed for ${run.runId}: heartbeat database unavailable`);
  });

  it('warns on a synchronous throw, writes the pending newest round and remains retryable', async () => {
    const fake = heartbeatPool(); const run = await beatRun(fake);
    const original = fake.query.getMockImplementation()!; let fail = true;
    fake.query.mockImplementation((sql, params) => {
      if (sql.includes('SET heartbeat_at') && fail) { fail = false; throw new Error('sync heartbeat failure'); }
      return original(sql, params);
    });
    heartbeatLogs.warn.mockClear();
    const settled = Promise.allSettled([run.handle.heartbeat(1), run.handle.heartbeat(2), run.handle.heartbeat(3)]);
    await drainBeats(fake); const results = await settled;
    const retry = run.handle.heartbeat(4); await drainBeats(fake); await retry;
    expect(results.every(result => result.status === 'fulfilled')).toBe(true);
    expect(fake.rounds).toEqual([3, 4]);
    expect(heartbeatLogs.warn).toHaveBeenCalledWith(`[ana-run-control] heartbeat failed for ${run.runId}: sync heartbeat failure`);
  });

  it('registers admission before the query callback can reenter heartbeat', async () => {
    const fake = heartbeatPool(); const run = await beatRun(fake);
    const original = fake.query.getMockImplementation()!; let nested: Promise<void> | undefined; let entered = false;
    fake.query.mockImplementation((sql, params) => {
      if (sql.includes('SET heartbeat_at') && !entered) { entered = true; nested = run.handle.heartbeat(9); }
      return original(sql, params);
    });
    const outer = run.handle.heartbeat(1); await beatFlush(); const pendingWrites = fake.writes.length;
    await drainBeats(fake); await Promise.all([outer, nested]);
    expect(pendingWrites).toBe(1); expect(fake.rounds).toEqual([1, 9]);
  });

  it('does not lose a request between the final await and promise settlement', async () => {
    const fake = heartbeatPool(); const run = await beatRun(fake);
    const first = run.handle.heartbeat(1); await beatFlush();
    const late = fake.writes[0].promise.then(() => run.handle.heartbeat(8));
    await drainBeats(fake); await Promise.all([first, late]); expect(fake.rounds).toEqual([1, 8]);
  });
});
