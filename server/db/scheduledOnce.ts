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
 * two processes whose ticks do not overlap both run — a cron tick a few
 * milliseconds later on another task, or a boot-relative setInterval minutes
 * later. A job that must run once per window uses runScheduledOncePerWindow
 * below, which adds a durable claim (scheduled_job_claims) under the lease.
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

// ── Once per window ─────────────────────────────────────────────────────────

/**
 * The window a timestamp falls in, for a job that runs every `intervalMs`.
 * Aligned to the epoch, not to the process's boot, so the three processes'
 * setInterval timers (which start whenever each task booted) agree on it.
 */
export function windowKeyOf(intervalMs: number, now: number = Date.now()): string {
  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    throw new Error(`windowKeyOf: a positive integer interval is required (got ${intervalMs})`);
  }
  return `${intervalMs}:${Math.floor(now / intervalMs)}`;
}

/** Claims older than this are pruned when the same job claims again. */
const CLAIM_RETENTION_DAYS = 30;

export type ScheduledOncePerWindowResult<T> =
  | { ran: true; value: T }
  | { ran: false; reason: 'held_elsewhere' | 'already_ran_this_window' };

/**
 * Run `fn` at most once per (organization, job, window) across every server
 * process: under the lease (no overlap), the first process to INSERT the claim
 * row runs it, and every later tick in that window skips.
 *
 * A run that throws deletes its claim and rethrows, so a later tick in the
 * same window retries: a failed nightly sweep is not silently "done".
 *
 * Estate-wide jobs claim as organization 0; a per-organization job passes its
 * organization, so each organization's window is claimed independently.
 */
export async function runScheduledOncePerWindow<T>(
  jobName: string,
  windowKey: string,
  fn: () => Promise<T>,
  opts: { organizationId?: number; storeResult?: boolean } = {},
): Promise<ScheduledOncePerWindowResult<T>> {
  if (!windowKey.trim()) throw new Error('runScheduledOncePerWindow: windowKey is required');
  const organizationId = opts.organizationId ?? 0;
  if (!Number.isInteger(organizationId) || organizationId < 0) {
    throw new Error(`runScheduledOncePerWindow: organizationId must be a non-negative integer (got ${organizationId})`);
  }
  const leaseName = organizationId === 0 ? jobName : `${jobName}:org:${organizationId}`;
  const outcome = await runScheduledOnce(leaseName, async () => {
    const pool = getPool();
    const claimed = await pool.query(
      `INSERT INTO scheduled_job_claims (organization_id, job_name, window_key)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING 1`,
      [organizationId, jobName, windowKey],
    );
    if (claimed.rowCount === 0) return { claimed: false as const };
    await pool.query(
      `DELETE FROM scheduled_job_claims
        WHERE organization_id = $1 AND job_name = $2
          AND claimed_at < NOW() - make_interval(days => $3)`,
      [organizationId, jobName, CLAIM_RETENTION_DAYS],
    );
    let value: T;
    try {
      value = await fn();
    } catch (err) {
      await pool
        .query('DELETE FROM scheduled_job_claims WHERE organization_id = $1 AND job_name = $2 AND window_key = $3', [
          organizationId,
          jobName,
          windowKey,
        ])
        .catch((releaseErr: unknown) =>
          logger.warn('could not give back the claim of a failed run; the window stays claimed', {
            jobName,
            windowKey,
            error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
          }),
        );
      throw err;
    }
    await pool.query(
      `UPDATE scheduled_job_claims SET finished_at = NOW(), result = $4::jsonb
        WHERE organization_id = $1 AND job_name = $2 AND window_key = $3`,
      [organizationId, jobName, windowKey, opts.storeResult ? JSON.stringify(value ?? null) : null],
    );
    return { claimed: true as const, value };
  });
  if (!outcome.ran) return outcome;
  if (!outcome.value.claimed) return { ran: false, reason: 'already_ran_this_window' };
  return { ran: true, value: outcome.value.value };
}

/**
 * The most recent finished run of a job and what it recorded (null result
 * unless it ran with `storeResult`), or null when it has never finished. For a
 * status every process serves, read from the run that did the work rather
 * than from this process's memory. Throws when the claims cannot be read: a
 * status that could not be read is not "never ran".
 */
export async function readLatestWindowResult<T>(
  jobName: string,
  organizationId = 0,
): Promise<{ result: T | null; finishedAt: string } | null> {
  return runWithSystemTenantScope(`scheduled-once:read:${jobName}`, async () => {
    const { rows } = await getPool().query<{ result: T | null; finished_at: Date }>(
      `SELECT result, finished_at FROM scheduled_job_claims
        WHERE organization_id = $1 AND job_name = $2 AND finished_at IS NOT NULL
        ORDER BY finished_at DESC LIMIT 1`,
      [organizationId, jobName],
    );
    const row = rows[0];
    return row ? { result: row.result ?? null, finishedAt: new Date(row.finished_at).toISOString() } : null;
  });
}
