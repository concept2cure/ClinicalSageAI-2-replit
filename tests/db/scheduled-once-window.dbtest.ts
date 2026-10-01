/**
 * runScheduledOncePerWindow — one run per WINDOW across every server process.
 *
 * runScheduledOnce is an advisory lease: it stops two runs overlapping. It
 * does not stop the same window running again on the process whose timer fires
 * after the first run released the lease — a cron tick a few milliseconds
 * later on another task, or a boot-relative setInterval minutes later. So a
 * nightly retention run could archive and audit each disposition three times,
 * and the hourly sentinel notified each organisation three times.
 *
 * Against a real server, as the non-superuser runtime role under
 * RLS_ENFORCE=on, with the migration's own DDL and the tenant policy:
 *   - SEQUENTIAL calls in one window (the case the lease alone misses) → one run;
 *   - the next window runs again;
 *   - per-organisation claims are independent;
 *   - a run that throws gives its window back, so a later tick retries it;
 *   - concurrent calls still run once.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl } from '../setup.db';
import { setupSchedulerDb, sleep, type SchedulerDb } from './scheduler-harness';

type Lease = typeof import('../../server/db/scheduledOnce');
type Runtime = typeof import('../../server/db/runtime');

const DDL = fs.readFileSync(path.resolve(__dirname, '../../migrations/20261001d_scheduled_job_claims.sql'), 'utf8');

let env: SchedulerDb;
let lease: Lease;
let runtime: Runtime;

beforeAll(async () => {
  env = await setupSchedulerDb(databaseUrl, 'dbwin', DDL, ['scheduled_job_claims']);
  runtime = await import('../../server/db/runtime');
  lease = await import('../../server/db/scheduledOnce');
}, 120_000);

afterAll(async () => {
  if (runtime) await runtime.getPool().end().catch(() => undefined);
  if (env) await env.destroy();
});

describe('runScheduledOncePerWindow', () => {
  it('CONTROL: the lease alone runs the same window twice when the ticks do not overlap', async () => {
    let runs = 0;
    await lease.runScheduledOnce('dbwin:control', async () => { runs += 1; });
    await lease.runScheduledOnce('dbwin:control', async () => { runs += 1; });
    expect(runs).toBe(2);
  });

  it('a second process ticking later in the same window does not run the job again', async () => {
    let runs = 0;
    const job = async () => { runs += 1; return 'done'; };
    const first = await lease.runScheduledOncePerWindow('dbwin:nightly', '2026-10-01', job);
    const second = await lease.runScheduledOncePerWindow('dbwin:nightly', '2026-10-01', job);
    expect(runs).toBe(1);
    expect(first).toMatchObject({ ran: true, value: 'done' });
    expect(second).toMatchObject({ ran: false, reason: 'already_ran_this_window' });
  });

  it('the next window runs', async () => {
    let runs = 0;
    const job = async () => { runs += 1; };
    await lease.runScheduledOncePerWindow('dbwin:roll', 'w1', job);
    await lease.runScheduledOncePerWindow('dbwin:roll', 'w2', job);
    expect(runs).toBe(2);
  });

  it('claims are per organisation', async () => {
    const ran: number[] = [];
    for (const org of [5, 6, 5]) {
      await lease.runScheduledOncePerWindow('dbwin:per-org', 'h1', async () => { ran.push(org); }, { organizationId: org });
    }
    expect(ran).toEqual([5, 6]);
  });

  it('a run that throws gives the window back, so a later tick retries', async () => {
    await expect(
      lease.runScheduledOncePerWindow('dbwin:retry', 'w', async () => { throw new Error('agency down'); }),
    ).rejects.toThrow('agency down');
    const retry = await lease.runScheduledOncePerWindow('dbwin:retry', 'w', async () => 'ok');
    expect(retry).toMatchObject({ ran: true, value: 'ok' });
  });

  it('concurrent calls run once', async () => {
    let runs = 0;
    const job = async () => { runs += 1; await sleep(200); };
    await Promise.all([1, 2, 3].map(() => lease.runScheduledOncePerWindow('dbwin:concurrent', 'w', job)));
    expect(runs).toBe(1);
  });

  it('records the claim as finished', async () => {
    await lease.runScheduledOncePerWindow('dbwin:finished', 'w', async () => undefined);
    const { rows } = await env.owner.query(
      `SELECT organization_id, finished_at IS NOT NULL AS finished FROM ${env.t('scheduled_job_claims')} WHERE job_name = 'dbwin:finished'`,
    );
    expect(rows).toEqual([{ organization_id: 0, finished: true }]);
  });

  it('windowKeyOf aligns boot-relative timers to the same wall-clock window', () => {
    const hour = 3_600_000;
    expect(lease.windowKeyOf(hour, Date.UTC(2026, 9, 1, 3, 1))).toBe(lease.windowKeyOf(hour, Date.UTC(2026, 9, 1, 3, 59)));
    expect(lease.windowKeyOf(hour, Date.UTC(2026, 9, 1, 3, 59))).not.toBe(lease.windowKeyOf(hour, Date.UTC(2026, 9, 1, 4, 0)));
  });
});
