/**
 * `runScheduledOnce` — run a scheduled job on at most ONE server process at a
 * time, coordinated through Postgres.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 * Production runs several copies of the same server command (two API tasks and
 * a "worker" task on ECS), and server/index.ts + server/startup/services.ts
 * start every in-process scheduler (node-cron / setInterval) on each. There is
 * no Redis in that deploy, so nothing coordinated them: every tick of every
 * job ran once per process. For a job that writes, that is N copies of each
 * write (memory-consolidation summaries, health-review revisions) or a
 * check-then-insert race (digest delivery).
 *
 * ── How ──────────────────────────────────────────────────────────────────────
 * One dedicated pooled connection takes a SESSION-level
 * `pg_try_advisory_lock(namespace, hashtext(jobName))`. Only the process that
 * gets it runs `fn`; the others return `{ ran: false }` immediately (no
 * waiting — their tick is simply not needed). The lock is held on that
 * connection for the duration of `fn` and released afterwards, on success and
 * on throw. If the process dies, Postgres drops the session and the lock with
 * it, so a crashed holder never wedges the job.
 *
 * `fn` does NOT receive the lock connection and must not assume one — it uses
 * the pool as usual. The lock connection runs no other SQL, so it is never in a
 * transaction and idle_in_transaction_session_timeout cannot end it mid-job.
 *
 * Advisory locks are re-entrant within a session. If the unlock does not
 * confirm, the connection is DESTROYED rather than returned to the pool, so a
 * later tick can never re-acquire a lock its own session still holds.
 *
 * ── Scope ────────────────────────────────────────────────────────────────────
 * Runs under runWithSystemTenantScope — the audited estate-wide scope every
 * scheduler in this repo already uses — because the lock checkout itself must
 * pass the fail-closed pool instrumentation (RLS_ENFORCE=on). `fn` inherits it;
 * per-org work inside `fn` must enter its own org scope (runWithOrgJobScope /
 * withTenantConnection) exactly as it did before.
 *
 * Not a replacement for idempotent writes: the lease stops CONCURRENT runs;
 * two processes whose timers fire hours apart both run. Jobs that must not
 * repeat within a window also need a durable guard (see scheduleOfEventsSweep's
 * per-plan claim, the digest heartbeat's per-day notification check).
 *
 * The one pre-existing lock helper (services/ai-actions/distributed-lock.ts) is
 * Redis-backed with an in-memory fallback — on a Redis-less deploy it
 * coordinates nothing across processes — and caps TTL at 120 s, so it is not
 * reusable for this.
 */

import { getPool } from './runtime';
import { runWithSystemTenantScope } from './tenantStore';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('scheduled-once');

/**
 * First key of the two-int4 advisory lock form. Keeps scheduler leases in
 * their own key space: the migration runner's lock uses the single-bigint form
 * and credit-ledger uses transaction-scoped single-key locks, and Postgres
 * never treats a two-key lock as equal to a one-key lock.
 */
export const SCHEDULED_ONCE_LOCK_NAMESPACE = 20_260_924;

export type ScheduledOnceResult<T> =
  | { ran: true; value: T }
  | { ran: false; reason: 'held_elsewhere' };

export async function runScheduledOnce<T>(
  jobName: string,
  fn: () => Promise<T>,
): Promise<ScheduledOnceResult<T>> {
  if (!jobName.trim()) throw new Error('runScheduledOnce: jobName is required');
  return runWithSystemTenantScope(`scheduled-once:${jobName}`, () => underLease(jobName, fn));
}

async function underLease<T>(jobName: string, fn: () => Promise<T>): Promise<ScheduledOnceResult<T>> {
  const client = await getPool().connect();
  let acquired = false;
  let evict: Error | undefined;
  try {
    const { rows } = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1::int4, hashtext($2)) AS acquired',
      [SCHEDULED_ONCE_LOCK_NAMESPACE, jobName],
    );
    acquired = rows[0]?.acquired === true;
    if (!acquired) return { ran: false, reason: 'held_elsewhere' };
    return { ran: true, value: await fn() };
  } finally {
    if (acquired) evict = await unlock(client, jobName);
    client.release(evict);
  }
}

/** Release the lease; returns an eviction error when the unlock cannot be confirmed. */
async function unlock(
  client: { query: (sql: string, params: unknown[]) => Promise<{ rows: Array<{ released?: boolean }> }> },
  jobName: string,
): Promise<Error | undefined> {
  try {
    const { rows } = await client.query(
      'SELECT pg_advisory_unlock($1::int4, hashtext($2)) AS released',
      [SCHEDULED_ONCE_LOCK_NAMESPACE, jobName],
    );
    if (rows[0]?.released === true) return undefined;
    logger.warn('advisory unlock did not confirm — evicting the connection', { jobName });
    return new Error(`scheduled-once: unlock of ${jobName} not confirmed`);
  } catch (err) {
    logger.warn('advisory unlock failed — evicting the connection', {
      jobName,
      error: err instanceof Error ? err.message : String(err),
    });
    return err instanceof Error ? err : new Error(String(err));
  }
}
