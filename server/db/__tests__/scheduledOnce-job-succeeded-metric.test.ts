/**
 * A windowed job that finishes says so to CloudWatch (MR-04 Stage 2 step 5, OPS-06).
 *
 * A nightly sweep that stops running is silent: no error is logged, because
 * nothing runs. So each run that finishes and records its claim writes one
 * CloudWatch embedded-metric-format line to stdout, which the awslogs driver
 * ships, and the stack alarms when a day passes without one
 * (terraform/stack/monitoring.tf). The line must mean "finished": not written
 * when the job throws, when another task holds the lease, when this window was
 * already claimed, or when the finish could not be recorded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  leaseFree: true,
  claimFree: true,
  finishFails: false,
  sql: [] as string[],
}));

vi.mock('../runtime', () => {
  const query = async (sql: string) => {
    db.sql.push(sql);
    if (/INSERT INTO scheduled_job_claims/.test(sql)) return { rowCount: db.claimFree ? 1 : 0, rows: [] };
    if (/UPDATE scheduled_job_claims SET finished_at/.test(sql)) {
      if (db.finishFails) throw new Error('connection terminated');
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  };
  const client = {
    query: async (sql: string) => {
      if (/pg_try_advisory_lock/.test(sql)) return { rows: [{ acquired: db.leaseFree }] };
      if (/pg_advisory_unlock/.test(sql)) return { rows: [{ released: true }] };
      return { rows: [] };
    },
    release: () => undefined,
  };
  return { getPool: () => ({ connect: async () => client, query }) };
});
vi.mock('../tenantStore', () => ({ runWithSystemTenantScope: (_caller: string, fn: () => unknown) => fn() }));

import { runScheduledOncePerWindow } from '../scheduledOnce';

let written: string[];

beforeEach(() => {
  Object.assign(db, { leaseFree: true, claimFree: true, finishFails: false, sql: [] });
  written = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
});
afterEach(() => vi.restoreAllMocks());

/** The EMF lines written, parsed; any other stdout line is ignored. */
const metricLines = () =>
  written
    .flatMap((w) => w.split('\n'))
    .filter((l) => l.includes('"CloudWatchMetrics"'))
    .map((l) => JSON.parse(l));

describe('runScheduledOncePerWindow reports a finished run to CloudWatch', () => {
  it('writes one JobSucceeded line, in embedded metric format, when the run finishes and is recorded', async () => {
    const out = await runScheduledOncePerWindow('retention-sweep', '86400000:1', async () => 'done');
    expect(out).toEqual({ ran: true, value: 'done' });
    expect(metricLines()).toEqual([
      {
        _aws: {
          Timestamp: expect.any(Number),
          CloudWatchMetrics: [{ Namespace: 'C2C/Jobs', Dimensions: [['JobName']], Metrics: [{ Name: 'JobSucceeded', Unit: 'Count' }] }],
        },
        JobName: 'retention-sweep',
        JobSucceeded: 1,
      },
    ]);
    // Written once the finish is recorded, and on a line of its own.
    expect(db.sql.some((s) => /UPDATE scheduled_job_claims SET finished_at/.test(s))).toBe(true);
    expect(written.filter((w) => w.includes('JobSucceeded')).every((w) => w.endsWith('\n'))).toBe(true);
  });

  it('writes nothing when the job throws', async () => {
    await expect(runScheduledOncePerWindow('retention-sweep', '86400000:2', async () => { throw new Error('policy broken'); })).rejects.toThrow('policy broken');
    expect(metricLines()).toEqual([]);
  });

  it('writes nothing when this window was already claimed', async () => {
    db.claimFree = false;
    expect(await runScheduledOncePerWindow('retention-sweep', '86400000:3', async () => 'done')).toEqual({ ran: false, reason: 'already_ran_this_window' });
    expect(metricLines()).toEqual([]);
  });

  it('writes nothing when another task holds the lease', async () => {
    db.leaseFree = false;
    expect(await runScheduledOncePerWindow('retention-sweep', '86400000:4', async () => 'done')).toEqual({ ran: false, reason: 'held_elsewhere' });
    expect(metricLines()).toEqual([]);
  });

  it('writes nothing when the finish could not be recorded', async () => {
    db.finishFails = true;
    await expect(runScheduledOncePerWindow('audit-chain-integrity-sweep', '86400000:5', async () => 'done')).rejects.toThrow('connection terminated');
    expect(metricLines()).toEqual([]);
  });
});
