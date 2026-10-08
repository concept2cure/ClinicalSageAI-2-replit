import type { Pool, PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTenantScope, runWithTenantScope, type TenantScope } from '../../../db/tenantStore.js';
import {
  _resetLocalRunsForTest,
  beginRun,
  POLL_FALLBACK_MS,
  releaseLocalRun,
  reapOrphanedRuns,
  RUN_CONTROL_CHANNEL,
  startRunControlListener,
  stopRunControlListener,
} from '../run-control.js';

const logs = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }));
vi.mock('../../../utils/logger', () => ({ createScopedLogger: () => logs }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

type QueryResult = { rows: Array<{ id: string; status: string }>; rowCount?: number };
function fakeClient() {
  const callbacks = new Map<string, (...args: any[]) => void>();
  const client = {
    on: vi.fn((event: string, callback: (...args: any[]) => void) => callbacks.set(event, callback)),
    query: vi.fn(async () => ({ rows: [] })),
    release: vi.fn(),
  };
  return { client: client as unknown as PoolClient, raw: client, callbacks };
}
function fakePool(connect = vi.fn(async (): Promise<PoolClient> => { throw new Error('listen unavailable'); })) {
  const reads: Array<ReturnType<typeof deferred<QueryResult>>> = [];
  const scopes: Array<ReturnType<typeof getTenantScope>> = [];
  let throwNextSelect: Error | undefined;
  const query = vi.fn((sql: string) => {
    if (sql.startsWith('SELECT') && throwNextSelect) {
      const error = throwNextSelect;
      throwNextSelect = undefined;
      throw error;
    }
    if (sql.startsWith('SELECT')) {
      scopes.push(getTenantScope());
      const read = deferred<QueryResult>();
      reads.push(read);
      return read.promise;
    }
    return Promise.resolve({ rows: [], rowCount: 1 });
  });
  return { pool: { connect, query } as unknown as Pool, connect, query, reads, scopes, failNextSelect: (error: Error) => { throwNextSelect = error; } };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
async function open(pool: Pool, organizationId = 7) {
  const run = await beginRun({ pool, organizationId, userId: 3, surface: 'chat' });
  await flush();
  return run;
}
async function tick(count = 1) { await vi.advanceTimersByTimeAsync(POLL_FALLBACK_MS * count); }

beforeEach(() => { _resetLocalRunsForTest(); vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { _resetLocalRunsForTest(); vi.useRealTimers(); });

describe('run-control fallback backpressure', () => {
  it('keeps one pending SELECT across slow ticks, then polls again and delivers cancellation', async () => {
    const fake = fakePool();
    const run = await open(fake.pool);
    await tick(5);
    expect(fake.reads).toHaveLength(1);
    fake.reads[0].resolve({ rows: [{ id: run.runId, status: 'paused' }] });
    await flush();
    await tick();
    expect(fake.reads).toHaveLength(2);
    fake.reads[1].resolve({ rows: [{ id: run.runId, status: 'cancelled' }] });
    await flush();
    expect(run.handle.cancelSignal.aborted).toBe(true);
  });

  it('logs a genuine failed read and releases admission for the next tick', async () => {
    const fake = fakePool();
    await open(fake.pool);
    await tick(3);
    expect(fake.reads).toHaveLength(1);
    fake.reads[0].reject(new Error('poll database unavailable'));
    await flush();
    expect(logs.error).toHaveBeenCalledWith(expect.stringContaining('poll fallback query failed: poll database unavailable'));
    await tick();
    expect(fake.reads).toHaveLength(2);
    fake.reads[1].resolve({ rows: [] });
    await flush();
  });

  it('logs a synchronous query failure without stranding poll admission', async () => {
    const fake = fakePool();
    await open(fake.pool);
    fake.failNextSelect(new Error('synchronous poll failure'));
    await tick();
    expect(logs.error).toHaveBeenCalledWith(expect.stringContaining('poll fallback query failed: synchronous poll failure'));
    await tick();
    expect(fake.reads).toHaveLength(1);
    fake.reads[0].resolve({ rows: [] });
    await flush();
  });

  it('does not query with no local runs or after the last local run is released', async () => {
    const fake = fakePool();
    await startRunControlListener(fake.pool);
    await tick(3);
    expect(fake.reads).toHaveLength(0);
    const run = await open(fake.pool);
    releaseLocalRun(run.runId);
    await tick(3);
    expect(fake.reads).toHaveLength(0);
  });

  it('executes each admitted poll under actual system scope across tenant requests', async () => {
    const fake = fakePool();
    const scope = { tenantId: '7', role: 'member', source: 'request', caller: 'poll-test' } as TenantScope;
    const first = await runWithTenantScope(scope, () => open(fake.pool));
    const second = await open(fake.pool, 42);
    await tick();
    expect(fake.query.mock.calls.find(([sql]) => sql.startsWith('SELECT'))).toBeDefined();
    expect(fake.scopes[0]?.tenantId).toBe('0');
    expect(fake.scopes[0]?.role).toBe('app_super_admin');
    fake.reads[0].resolve({ rows: [{ id: first.runId, status: 'cancelled' }, { id: second.runId, status: 'cancelled' }] });
    await flush();
    expect(first.handle.cancelSignal.aborted).toBe(true);
    expect(second.handle.cancelSignal.aborted).toBe(true);
  });
});

describe('obsolete listener lifecycle', () => {
  it('ignores an old pending poll result after stop/restart while the new poll remains pending', async () => {
    const old = fakePool();
    const run = await open(old.pool);
    await tick();
    stopRunControlListener();
    const current = fakePool();
    await startRunControlListener(current.pool);
    await tick();
    expect(current.reads).toHaveLength(1);
    old.reads[0].resolve({ rows: [{ id: run.runId, status: 'cancelled' }] });
    await flush();
    expect(run.handle.cancelSignal.aborted).toBe(false);
    await tick(2);
    expect(current.reads).toHaveLength(1);
    current.reads[0].resolve({ rows: [{ id: run.runId, status: 'cancelled' }] });
    await flush();
    expect(run.handle.cancelSignal.aborted).toBe(true);
  });

  it('returns a late old connection without replacing or leaking the restarted client', async () => {
    const pending = deferred<PoolClient>();
    const old = fakePool(vi.fn(() => pending.promise));
    const oldStart = startRunControlListener(old.pool);
    stopRunControlListener();
    const currentClient = fakeClient();
    const current = fakePool(vi.fn(async () => currentClient.client));
    await startRunControlListener(current.pool);
    const oldClient = fakeClient();
    pending.resolve(oldClient.client);
    await oldStart;
    expect(oldClient.raw.release).toHaveBeenCalledTimes(1);
    expect(oldClient.raw.query).not.toHaveBeenCalled();
    expect(currentClient.raw.release).not.toHaveBeenCalled();
    stopRunControlListener();
    expect(currentClient.raw.release).toHaveBeenCalledTimes(1);
  });

  it('ignores late old connection failure without releasing the restarted client or arming old polling', async () => {
    const pending = deferred<PoolClient>();
    const old = fakePool(vi.fn(() => pending.promise));
    const oldStart = startRunControlListener(old.pool);
    stopRunControlListener();
    const active = fakeClient();
    const current = fakePool(vi.fn(async () => active.client));
    await startRunControlListener(current.pool);
    await open(current.pool);
    pending.reject(new Error('obsolete connect failure'));
    await oldStart;
    await tick(3);
    expect(active.raw.release).not.toHaveBeenCalled();
    expect(old.reads).toHaveLength(0);
    expect(current.reads).toHaveLength(0);
  });

  it('does not let a released client error rearm the obsolete pool after restart', async () => {
    const oldClient = fakeClient();
    const old = fakePool(vi.fn(async () => oldClient.client));
    await startRunControlListener(old.pool);
    stopRunControlListener();
    const active = fakeClient();
    const current = fakePool(vi.fn(async () => active.client));
    await startRunControlListener(current.pool);
    await open(current.pool);
    oldClient.callbacks.get('error')!(new Error('late old socket error'));
    await tick(3);
    expect(old.reads).toHaveLength(0);
    expect(active.raw.release).not.toHaveBeenCalled();
    expect(oldClient.raw.release).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch notifications from an obsolete released client into a restarted lifecycle', async () => {
    const oldClient = fakeClient();
    const old = fakePool(vi.fn(async () => oldClient.client));
    await startRunControlListener(old.pool);
    stopRunControlListener();
    const active = fakeClient();
    const current = fakePool(vi.fn(async () => active.client));
    await startRunControlListener(current.pool);
    const run = await open(current.pool);
    oldClient.callbacks.get('notification')!({ channel: RUN_CONTROL_CHANNEL, payload: run.runId });
    await flush();
    expect(old.reads).toHaveLength(0);
    expect(run.handle.cancelSignal.aborted).toBe(false);
  });
});

async function listening() {
    const active = fakeClient();
    const fake = fakePool(vi.fn(async () => active.client));
    await startRunControlListener(fake.pool);
    const run = await open(fake.pool);
    const notify = (runId = run.runId, channel = RUN_CONTROL_CHANNEL) => {
      active.callbacks.get('notification')!({ channel, payload: runId });
    };
    return { active, fake, run, notify };
}

describe('notification backpressure', () => {
  it('coalesces notification bursts while each admitted read is pending', async () => {
    const { fake, run, notify } = await listening();
    for (let i = 0; i < 100; i++) notify();
    expect(fake.reads).toHaveLength(1);
    fake.reads[0].resolve({ rows: [{ id: run.runId, status: 'running' }] });
    await flush();
    expect(fake.reads).toHaveLength(2);
    for (let i = 0; i < 100; i++) notify();
    expect(fake.reads).toHaveLength(2);
    fake.reads[1].resolve({ rows: [{ id: run.runId, status: 'running' }] });
    await flush();
    expect(fake.reads).toHaveLength(3);
    fake.reads[2].resolve({ rows: [{ id: run.runId, status: 'cancelled' }] });
    await flush();
    expect(run.handle.cancelSignal.aborted).toBe(true);
    expect(fake.reads).toHaveLength(3);
  });

  it('does not lose Stop notified while an older running snapshot is pending', async () => {
    const { fake, run, notify } = await listening();
    notify();
    notify();
    expect(fake.reads).toHaveLength(1);
    fake.reads[0].resolve({ rows: [{ id: run.runId, status: 'running' }] });
    await flush();
    expect(fake.reads).toHaveLength(2);
    expect(run.handle.cancelSignal.aborted).toBe(false);
    fake.reads[1].resolve({ rows: [{ id: run.runId, status: 'cancelled' }] });
    await flush();
    expect(run.handle.cancelSignal.aborted).toBe(true);
  });

  it('lets another run deliver cancellation while the first run read stays pending', async () => {
    const { fake, notify } = await listening();
    const second = await open(fake.pool, 42);
    notify();
    notify();
    notify(second.runId);
    expect(fake.reads).toHaveLength(2);
    fake.reads[1].resolve({ rows: [{ id: second.runId, status: 'cancelled' }] });
    await flush();
    expect(second.handle.cancelSignal.aborted).toBe(true);
    expect(fake.reads).toHaveLength(2);
  });

  it('logs rejection and drains the pending successor without stranding admission', async () => {
    const { fake, run, notify } = await listening();
    notify();
    notify();
    expect(fake.reads).toHaveLength(1);
    fake.reads[0].reject(new Error('notification database unavailable'));
    await flush();
    expect(logs.error).toHaveBeenCalledWith(expect.stringContaining('notify refresh failed for'));
    expect(logs.error).toHaveBeenCalledWith(expect.stringContaining('notification database unavailable'));
    expect(fake.reads).toHaveLength(2);
    fake.reads[1].resolve({ rows: [{ id: run.runId, status: 'cancelled' }] });
    await flush();
    expect(run.handle.cancelSignal.aborted).toBe(true);
  });

});

describe('notification backpressure', () => {
  it('discards a queued successor after its local run has been released', async () => {
    const { fake, run, notify } = await listening();
    notify();
    notify();
    releaseLocalRun(run.runId);
    fake.reads[0].resolve({ rows: [{ id: run.runId, status: 'cancelled' }] });
    await flush();
    expect(fake.reads).toHaveLength(1);
    expect(run.handle.cancelSignal.aborted).toBe(false);
  });

  it('isolates pending results and queued work across listener stop and restart', async () => {
    const old = await listening();
    old.notify();
    old.notify();
    stopRunControlListener();
    const active = fakeClient();
    const current = fakePool(vi.fn(async () => active.client));
    await startRunControlListener(current.pool);
    active.callbacks.get('notification')!({ channel: RUN_CONTROL_CHANNEL, payload: old.run.runId });
    expect(current.reads).toHaveLength(1);
    old.fake.reads[0].resolve({ rows: [{ id: old.run.runId, status: 'cancelled' }] });
    await flush();
    expect(old.fake.reads).toHaveLength(1);
    expect(old.run.handle.cancelSignal.aborted).toBe(false);
    current.reads[0].resolve({ rows: [{ id: old.run.runId, status: 'cancelled' }] });
    await flush();
    expect(old.run.handle.cancelSignal.aborted).toBe(true);
  });

  it('runs admitted and successor reads in actual system scope across tenant requests', async () => {
    const { fake, run, notify } = await listening();
    const second = await open(fake.pool, 42);
    const scope = { tenantId: '7', role: 'member', source: 'request', caller: 'notify-test' } as TenantScope;
    runWithTenantScope(scope, () => { notify(); notify(); notify(second.runId); });
    expect(fake.reads).toHaveLength(2);
    fake.reads[0].resolve({ rows: [{ id: run.runId, status: 'running' }] });
    await flush();
    expect(fake.reads).toHaveLength(3);
    expect(fake.scopes).toHaveLength(3);
    for (const observed of fake.scopes) {
      expect(observed?.tenantId).toBe('0');
      expect(observed?.role).toBe('app_super_admin');
    }
    fake.reads[1].resolve({ rows: [{ id: second.runId, status: 'cancelled' }] });
    fake.reads[2].resolve({ rows: [{ id: run.runId, status: 'cancelled' }] });
    await flush();
    expect(run.handle.cancelSignal.aborted).toBe(true);
    expect(second.handle.cancelSignal.aborted).toBe(true);
  });

  it('ignores unrelated channels, missing payloads and runs owned elsewhere', async () => {
    const { active, fake, notify } = await listening();
    notify('run_elsewhere');
    notify(undefined, 'another_channel');
    active.callbacks.get('notification')!({ channel: RUN_CONTROL_CHANNEL });
    expect(fake.reads).toHaveLength(0);
  });

  it('logs synchronous query failure and admits the next notification', async () => {
    const { fake, run, notify } = await listening();
    fake.failNextSelect(new Error('synchronous notification failure'));
    notify();
    await flush();
    expect(logs.error).toHaveBeenCalledWith(expect.stringContaining('synchronous notification failure'));
    notify();
    expect(fake.reads).toHaveLength(1);
    fake.reads[0].resolve({ rows: [{ id: run.runId, status: 'cancelled' }] });
    await flush();
    expect(run.handle.cancelSignal.aborted).toBe(true);
  });
});

const REQUEST_SCOPE: TenantScope = {
  tenantId: '7',
  role: 'member',
  source: 'request',
  caller: 'test',
} as TenantScope;

type SweepResult = { rows: never[]; rowCount: number | null };

function pendingSweep() {
  let resolve!: (result: SweepResult) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<SweepResult>((yes, no) => { resolve = yes; reject = no; });
  const scopes: Array<TenantScope | undefined> = [];
  const query = vi.fn((_sql: string, _params: unknown[]) => {
    scopes.push(getTenantScope());
    return pending;
  });
  return { pool: { query } as unknown as Pool, query, scopes, resolve, reject };
}

async function flushSweep() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('overlapping estate-wide sweeps share pending work', () => {
  it('bounds twenty overlapping calls to one query, shares its count, then sweeps afresh', async () => {
    const fake = pendingSweep();
    const calls = Array.from({ length: 20 }, () => reapOrphanedRuns(fake.pool));
    await flushSweep();
    const pendingQueries = fake.query.mock.calls.length;
    fake.resolve({ rows: [], rowCount: 6 });
    expect(await Promise.all(calls)).toEqual(Array(20).fill(6));
    expect(pendingQueries).toBe(1);
    fake.query.mockResolvedValueOnce({ rows: [], rowCount: 2 });
    expect(await reapOrphanedRuns(fake.pool)).toBe(2);
    expect(fake.query).toHaveBeenCalledTimes(2);
  });

  it('shares across tenant callers while the actual query carries system scope', async () => {
    const fake = pendingSweep();
    const calls = ['7', '42', '99'].map(tenantId =>
      runWithTenantScope({ ...REQUEST_SCOPE, tenantId }, () => reapOrphanedRuns(fake.pool)),
    );
    await flushSweep();
    fake.resolve({ rows: [], rowCount: 3 });
    expect(await Promise.all(calls)).toEqual([3, 3, 3]);
    expect(fake.scopes).toHaveLength(1);
    expect(fake.scopes[0]?.tenantId).toBe('0');
    expect(fake.scopes[0]?.role).toBe('app_super_admin');
    expect(fake.scopes[0]?.caller).toBe('ana-run-control:reap');
  });

  it('propagates a shared asynchronous rejection and admits a retry', async () => {
    const fake = pendingSweep();
    const settled = Promise.allSettled([
      reapOrphanedRuns(fake.pool), reapOrphanedRuns(fake.pool), reapOrphanedRuns(fake.pool),
    ]);
    await flushSweep();
    const pendingQueries = fake.query.mock.calls.length;
    const failure = new Error('sweep database unavailable');
    fake.reject(failure);
    const results = await settled;
    expect(results).toEqual(Array(3).fill({ status: 'rejected', reason: failure }));
    expect(pendingQueries).toBe(1);
    fake.query.mockResolvedValueOnce({ rows: [], rowCount: 4 });
    expect(await reapOrphanedRuns(fake.pool)).toBe(4);
    expect(fake.query).toHaveBeenCalledTimes(2);
  });

  it('shares a synchronous query throw and clears admission for retry', async () => {
    const failure = new Error('synchronous sweep failure');
    const query = vi.fn((_sql: string, _params: unknown[]): Promise<SweepResult> => { throw failure; });
    const pool = { query } as unknown as Pool;
    const results = await Promise.allSettled([reapOrphanedRuns(pool), reapOrphanedRuns(pool)]);
    expect(results).toEqual(Array(2).fill({ status: 'rejected', reason: failure }));
    expect(query).toHaveBeenCalledTimes(1);
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    expect(await reapOrphanedRuns(pool)).toBe(1);
    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe('sweep admission preserves the existing query contract', () => {
  it('keeps separate database pools independent', async () => {
    const first = pendingSweep();
    const second = pendingSweep();
    const calls = [reapOrphanedRuns(first.pool), reapOrphanedRuns(second.pool)];
    await flushSweep();
    first.resolve({ rows: [], rowCount: 2 });
    second.resolve({ rows: [], rowCount: 7 });
    expect(await Promise.all(calls)).toEqual([2, 7]);
    expect(first.query).toHaveBeenCalledTimes(1);
    expect(second.query).toHaveBeenCalledTimes(1);
  });

  it('keeps distinct effective stale thresholds independent', async () => {
    const fake = pendingSweep();
    const calls = [reapOrphanedRuns(fake.pool, 1_000), reapOrphanedRuns(fake.pool, 2_000)];
    await flushSweep();
    fake.resolve({ rows: [], rowCount: 1 });
    await Promise.all(calls);
    expect(fake.query).toHaveBeenCalledTimes(2);
    expect(fake.query.mock.calls.map(([, params]) => params)).toEqual([[1], [2]]);
  });

  it('shares thresholds that round to the same existing SQL parameter', async () => {
    const fake = pendingSweep();
    const calls = [reapOrphanedRuns(fake.pool, 1_001), reapOrphanedRuns(fake.pool, 1_499)];
    await flushSweep();
    fake.resolve({ rows: [], rowCount: 2 });
    expect(await Promise.all(calls)).toEqual([2, 2]);
    expect(fake.query).toHaveBeenCalledTimes(1);
    expect(fake.query.mock.calls[0][1]).toEqual([1]);
  });

  it('shares a null row count as zero without retaining a settled result', async () => {
    const fake = pendingSweep();
    const calls = [reapOrphanedRuns(fake.pool), reapOrphanedRuns(fake.pool)];
    await flushSweep();
    fake.resolve({ rows: [], rowCount: null });
    expect(await Promise.all(calls)).toEqual([0, 0]);
    expect(fake.query).toHaveBeenCalledTimes(1);
    fake.query.mockResolvedValueOnce({ rows: [], rowCount: 5 });
    expect(await reapOrphanedRuns(fake.pool)).toBe(5);
  });

  it('registers admission before a query callback can reenter the sweep', async () => {
    const fake = pendingSweep();
    const originalQuery = fake.query.getMockImplementation()!;
    let reentered: Promise<number> | undefined;
    let entered = false;
    fake.query.mockImplementation((sql, params) => {
      if (!entered) {
        entered = true;
        reentered = reapOrphanedRuns(fake.pool);
      }
      return originalQuery(sql, params);
    });
    const outer = reapOrphanedRuns(fake.pool);
    await flushSweep();
    fake.resolve({ rows: [], rowCount: 8 });
    expect(await outer).toBe(8);
    expect(await reentered).toBe(8);
    expect(fake.query).toHaveBeenCalledTimes(1);
  });
});
