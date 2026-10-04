/**
 * The audit-chain monitor checks once per window across every server process,
 * and every process reports the same, current result (U19 follow-up).
 *
 * The monitor ran its full scan of audit_events every five minutes on each of
 * the three processes (two API tasks and the worker), and wrote a failure
 * event from each when a link was broken. Its status — §11.10(e) evidence a
 * platform administrator reads at /api/audit/chain-monitor/status — lived in
 * each process's memory, so a per-window claim alone would have left two tasks
 * serving a stale answer. The run that does the work now records its status
 * in its claim, and the status every process serves is read from there.
 *
 * Three fresh module graphs stand for the three processes; they share one
 * claim store, as the processes share scheduled_job_claims (the store itself:
 * tests/db/scheduled-once-window.dbtest.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({
  claims: new Map<string, { result: unknown; finishedAt: string }>(),
  readFails: false,
  heartbeats: [] as Array<{ ok: boolean }>,
}));

vi.mock('../../../db/scheduledOnce', async (orig) => {
  const real = await orig<typeof import('../../../db/scheduledOnce')>();
  return {
    ...real,
    runScheduledOncePerWindow: async (job: string, window: string, fn: () => Promise<unknown>, opts: { storeResult?: boolean } = {}) => {
      const key = `${job}|${window}`;
      if (shared.claims.has(key)) return { ran: false, reason: 'already_ran_this_window' };
      shared.claims.set(key, { result: null, finishedAt: '' });
      const value = await fn();
      shared.claims.set(key, { result: opts.storeResult ? value : null, finishedAt: new Date().toISOString() });
      return { ran: true, value };
    },
    readLatestWindowResult: async (job: string) => {
      if (shared.readFails) throw new Error('connection refused');
      const rows = [...shared.claims.entries()].filter(([k, v]) => k.startsWith(`${job}|`) && v.finishedAt);
      const last = rows[rows.length - 1];
      return last ? { result: last[1].result, finishedAt: last[1].finishedAt } : null;
    },
  };
});
vi.mock('../../background-jobs-metrics', () => ({
  recordBackgroundJobRun: (_n: string, o: { ok: boolean }) => { shared.heartbeats.push(o); },
  registerBackgroundJob: () => undefined,
  BACKGROUND_JOB: { AUDIT_CHAIN_MONITOR: 'audit-chain-monitor' },
}));

type Monitor = typeof import('../chainIntegrityMonitor');

function fakePool() {
  const scans = { n: 0 };
  const pool = {
    query: vi.fn(async (sql: string) => {
      if (/FROM audit_events/i.test(sql)) {
        scans.n += 1;
        return { rows: [
          { id: 1, organization_id: 1, sequence_number: 1, record_hash: 'h1', previous_hash: null },
          { id: 2, organization_id: 1, sequence_number: 2, record_hash: 'h2', previous_hash: 'h1' },
        ] };
      }
      return { rows: [] };
    }),
  };
  return { pool, scans };
}

async function process_(): Promise<{ monitor: Monitor; scans: { n: number } }> {
  vi.resetModules();
  const monitor = await import('../chainIntegrityMonitor');
  const { pool, scans } = fakePool();
  monitor.startChainMonitor(pool as never, 60_000);
  monitor.stopChainMonitor();
  return { monitor, scans };
}

beforeEach(() => {
  shared.claims.clear();
  shared.readFails = false;
  shared.heartbeats.length = 0;
});

describe('audit-chain monitor across three processes', () => {
  it('one scan per window, and every process records a live heartbeat', async () => {
    const procs = [await process_(), await process_(), await process_()];
    for (const p of procs) await p.monitor.runScheduledCheck();
    expect(procs.map((p) => p.scans.n).reduce((a, b) => a + b, 0)).toBe(1);
    expect(shared.heartbeats).toHaveLength(3);
    expect(shared.heartbeats.every((h) => h.ok)).toBe(true);
  });

  it('a process that did not run the check serves the result of the one that did', async () => {
    const [ran, other] = [await process_(), await process_()];
    await ran.monitor.runScheduledCheck();
    const status = await other.monitor.getSharedChainMonitorStatus();
    expect(other.scans.n).toBe(0);
    expect(status).toMatchObject({ status: 'healthy', totalEntries: 2 });
  });

  it('a shared status that cannot be read is an error, not the idle local one', async () => {
    const p = await process_();
    shared.readFails = true;
    const status = await p.monitor.getSharedChainMonitorStatus();
    expect(status.status).toBe('error');
    expect(status.reason).toMatch(/could not read the shared monitor status/);
  });
});
