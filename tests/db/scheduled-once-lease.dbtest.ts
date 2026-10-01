/**
 * runScheduledOnce — one run per tick across every server process.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Production runs THREE copies of the server (two API tasks and a "worker" task
 * running the same command), and server/index.ts + server/startup/services.ts
 * start every in-process scheduler on each of them. Without Redis there was no
 * cross-process coordination at all, so each nightly/periodic job ran three
 * times: AnA memory consolidation wrote each summary three times, the
 * schedule-of-events sweep tripled its health-review revisions, and the digest
 * heartbeat's check-then-insert guard could deliver duplicates.
 *
 * The lease is a SESSION-level Postgres advisory lock held on one dedicated
 * connection for the duration of the job. What this suite proves, against a
 * real server and the non-superuser runtime role under RLS_ENFORCE=on:
 *   - two concurrent calls on separate sessions → exactly one runs `fn`;
 *   - the lock is released after success AND after `fn` throws (the next tick
 *     runs);
 *   - `fn` runs under the audited system scope, so its pooled queries pass the
 *     fail-closed instrumentation;
 *   - different job names do not block each other.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl } from '../setup.db';
import { setupSchedulerDb, sleep, type SchedulerDb } from './scheduler-harness';

type Lease = typeof import('../../server/db/scheduledOnce');
type Runtime = typeof import('../../server/db/runtime');
type Store = typeof import('../../server/db/tenantStore');

let env: SchedulerDb;
let lease: Lease;
let runtime: Runtime;
let store: Store;

beforeAll(async () => {
  env = await setupSchedulerDb(databaseUrl, 'dblease', 'CREATE TABLE lease_probe (id int)', []);
  runtime = await import('../../server/db/runtime');
  store = await import('../../server/db/tenantStore');
  lease = await import('../../server/db/scheduledOnce');
}, 120_000);

afterAll(async () => {
  if (runtime) await runtime.getPool().end().catch(() => undefined);
  if (env) await env.destroy();
});

/** Advisory locks currently granted for the lease namespace, from the owner side. */
async function heldLeases(): Promise<number> {
  const { rows } = await env.owner.query(
    `SELECT count(*)::int AS n FROM pg_locks
      WHERE locktype = 'advisory' AND granted AND classid = $1`,
    [lease.SCHEDULED_ONCE_LOCK_NAMESPACE],
  );
  return rows[0].n;
}

describe('runScheduledOnce', () => {
  it('CONTROL: the runtime pool refuses unscoped access (RLS_ENFORCE=on is really on)', async () => {
    await expect(runtime.getPool().query('SELECT count(*) FROM lease_probe')).rejects.toThrow(/FAIL-CLOSED/);
  });

  it('two concurrent calls — separate sessions, as on separate ECS tasks — run fn exactly once', async () => {
    let runs = 0;
    const job = async () => {
      runs += 1;
      await sleep(300);
      return 'done';
    };

    const [a, b] = await Promise.all([
      lease.runScheduledOnce('dblease:concurrent', job),
      lease.runScheduledOnce('dblease:concurrent', job),
    ]);

    expect(runs).toBe(1);
    const ran = [a, b].filter(r => r.ran);
    const skipped = [a, b].filter(r => !r.ran);
    expect(ran).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(ran[0]).toMatchObject({ ran: true, value: 'done' });
    expect(skipped[0]).toMatchObject({ ran: false, reason: 'held_elsewhere' });
  });

  it('holds the lock while fn runs and releases it afterwards, so the next tick runs', async () => {
    let seenWhileRunning = -1;
    const first = await lease.runScheduledOnce('dblease:release', async () => {
      seenWhileRunning = await heldLeases();
    });
    expect(first.ran).toBe(true);
    expect(seenWhileRunning).toBe(1);
    expect(await heldLeases()).toBe(0);

    const second = await lease.runScheduledOnce('dblease:release', async () => 'again');
    expect(second).toMatchObject({ ran: true, value: 'again' });
  });

  it('releases the lock when fn throws, and rethrows', async () => {
    await expect(
      lease.runScheduledOnce('dblease:throws', async () => {
        throw new Error('job exploded');
      }),
    ).rejects.toThrow('job exploded');
    expect(await heldLeases()).toBe(0);

    const next = await lease.runScheduledOnce('dblease:throws', async () => 'recovered');
    expect(next).toMatchObject({ ran: true, value: 'recovered' });
  });

  it('runs fn under the audited system scope, so its pooled queries are admitted', async () => {
    const out = await lease.runScheduledOnce('dblease:scope', async () => {
      const scope = store.getTenantScope();
      const { rows } = await runtime.getPool().query('SELECT count(*)::int AS n FROM lease_probe');
      return { scope, n: rows[0].n };
    });
    expect(out.ran).toBe(true);
    if (!out.ran) return;
    expect(out.value.n).toBe(0);
    expect(out.value.scope).toMatchObject({ tenantId: '0', role: 'app_super_admin', source: 'job' });
    expect(out.value.scope?.caller).toContain('dblease:scope');
  });

  it('different job names do not exclude each other', async () => {
    const order: string[] = [];
    await Promise.all([
      lease.runScheduledOnce('dblease:job-a', async () => {
        order.push('a');
        await sleep(150);
      }),
      lease.runScheduledOnce('dblease:job-b', async () => {
        order.push('b');
        await sleep(150);
      }),
    ]);
    expect(order.sort()).toEqual(['a', 'b']);
  });
});
