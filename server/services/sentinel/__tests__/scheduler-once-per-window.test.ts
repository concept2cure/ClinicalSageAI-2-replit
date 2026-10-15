/**
 * The sentinel scans each organisation once per interval, not once per process
 * (U19).
 *
 * Production starts the scheduler on two API tasks and the worker. Each
 * scheduled every active organisation on its own boot-relative setInterval and
 * scanned immediately at boot, and each scan feeds every high/critical finding
 * to the rules engine — which notifies and escalates. So an organisation's
 * users got each sentinel notification three times an hour, and again from
 * every task a deploy started.
 *
 * Three SentinelScheduler instances stand for the three processes. They share
 * one claim store, as the processes share scheduled_job_claims (the claim's own
 * behaviour against Postgres: tests/db/scheduled-once-window.dbtest.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  claims: new Set<string>(),
  scans: [] as number[],
  emitted: [] as number[],
  claimCalls: [] as Array<{ job: string; window: string; org?: number }>,
  heartbeats: [] as Array<{ ok: boolean; processed?: number }>,
}));

vi.mock('../../../db/scheduledOnce', async (orig) => {
  const real = await orig<typeof import('../../../db/scheduledOnce')>();
  return {
    ...real,
    runScheduledOncePerWindow: async (job: string, window: string, fn: () => Promise<unknown>, opts: { organizationId?: number } = {}) => {
      m.claimCalls.push({ job, window, org: opts.organizationId });
      const key = `${opts.organizationId ?? 0}|${job}|${window}`;
      if (m.claims.has(key)) return { ran: false, reason: 'already_ran_this_window' };
      m.claims.add(key);
      return { ran: true, value: await fn() };
    },
  };
});
vi.mock('../sentinel', () => ({
  AISentinel: class {
    async getConfig() { return { enabled: true, intervalMinutes: 60 }; }
    async scan(org: number) {
      m.scans.push(org);
      return [{ findings: [{ severity: 'high', findingId: 'f1', analyzerType: 'a', title: 't', summary: 's', projectId: 1 }] }];
    }
  },
}));
vi.mock('../../rules-engine', () => ({ emitRuleEvent: vi.fn(async (_t: string, org: number) => { m.emitted.push(org); }) }));
vi.mock('../../background-jobs-metrics', () => ({
  recordBackgroundJobRun: vi.fn((_n: string, o: { ok: boolean; processed?: number }) => { m.heartbeats.push(o); }),
  registerBackgroundJob: vi.fn(),
  BACKGROUND_JOB: { SENTINEL_SCAN: 'sentinel_scan' },
}));

import { SentinelScheduler } from '../scheduler';
import { windowKeyOf } from '../../../db/scheduledOnce';

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  m.claims.clear();
  m.scans.length = 0;
  m.emitted.length = 0;
  m.claimCalls.length = 0;
  m.heartbeats.length = 0;
});

describe('sentinel across three server processes', () => {
  it('one boot scan per organisation, one set of rule events', async () => {
    const processes = [1, 2, 3].map(() => new SentinelScheduler({} as never));
    for (const p of processes) await p.scheduleOrg(42);
    await flush();
    for (const p of processes) p.stop();
    expect(m.scans).toEqual([42]);
    expect(m.emitted).toEqual([42]);
  });

  it('claims per organisation, on the organisation\'s own interval window', async () => {
    const p = new SentinelScheduler({} as never);
    await p.scheduleOrg(42);
    await p.scheduleOrg(43);
    await flush();
    p.stop();
    expect(m.scans.sort()).toEqual([42, 43]);
    const hour = windowKeyOf(60 * 60 * 1000);
    expect(m.claimCalls).toEqual([
      { job: 'sentinel-scan', window: hour, org: 42 },
      { job: 'sentinel-scan', window: hour, org: 43 },
    ]);
  });

  it('a process whose tick finds the window already scanned still reports a live scanner', async () => {
    // /api/health/jobs is per process: a task that only ever skips would read
    // 'stale' after 90 minutes and report the deployment degraded, though the
    // scan ran on another task. The digest heartbeat already records a skip as
    // a successful tick with nothing processed; the sentinel does the same.
    const processes = [1, 2, 3].map(() => new SentinelScheduler({} as never));
    for (const p of processes) await p.scheduleOrg(42);
    await flush();
    for (const p of processes) p.stop();
    expect(m.heartbeats).toHaveLength(3);
    expect(m.heartbeats.every((h) => h.ok)).toBe(true);
  });
});
