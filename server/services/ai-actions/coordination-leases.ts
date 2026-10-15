/**
 * Leases every server process shares: AnA write-action target locks and
 * per-organisation action slots (coordination_leases,
 * migrations/20261001f_coordination_leases.sql; U21).
 *
 * Production runs two API tasks and a worker with no Redis (decision B6,
 * 2026-10-01). The lock and the cap used to be Redis with an in-memory
 * fallback, so in production they held per process. A lease row is held for
 * every process, in the acting organisation's own scope, so one organisation's
 * lease never contends with another's and RLS keeps them apart.
 *
 * Every function answers null when the store cannot be reached; the caller
 * then decides with its in-memory fallback, as before.
 */
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('coordination-leases');

interface LeaseClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}
interface LeasePool extends LeaseClient {
  connect(): Promise<LeaseClient & { release(err?: Error): void }>;
}

async function inOrg<T>(organizationId: number | undefined, caller: string, fn: (pool: LeasePool) => Promise<T>): Promise<T | null> {
  if (!Number.isInteger(organizationId) || (organizationId as number) <= 0) return null;
  try {
    // Both from the same module graph the pool's scope check reads.
    const [{ getPool }, { runWithOrgJobScope }] = await Promise.all([
      import('../../db/runtime.js'),
      import('../../db/tenantStore.js'),
    ]);
    return await runWithOrgJobScope(organizationId as number, `ai-actions:${caller}`, () => fn(getPool() as unknown as LeasePool));
  } catch (err) {
    logger.warn('Coordination store could not be reached; this process decides alone', {
      caller,
      organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Take the lease if no live one is held; a lapsed lease is taken over. True when taken. */
export async function acquireLease(organizationId: number | undefined, key: string, owner: string, ttlMs: number): Promise<boolean | null> {
  return inOrg(organizationId, 'acquire', async pool => {
    const { rows } = await pool.query(
      `INSERT INTO coordination_leases (organization_id, lease_key, owner, expires_at)
       VALUES ($1, $2, $3, NOW() + make_interval(secs => $4))
       ON CONFLICT (organization_id, lease_key) DO UPDATE
         SET owner = EXCLUDED.owner, acquired_at = NOW(), expires_at = EXCLUDED.expires_at
         WHERE coordination_leases.expires_at <= NOW()
       RETURNING owner`,
      [organizationId, key, owner, ttlMs / 1000],
    );
    return rows.length === 1;
  });
}

/** Give the lease back; only its owner can. True when it was released. */
export async function releaseLease(organizationId: number | undefined, key: string, owner: string): Promise<boolean | null> {
  return inOrg(organizationId, 'release', async pool => {
    const { rows } = await pool.query(
      'DELETE FROM coordination_leases WHERE organization_id = $1 AND lease_key = $2 AND owner = $3 RETURNING 1',
      [organizationId, key, owner],
    );
    return rows.length === 1;
  });
}

/**
 * Take one of the organisation's `cap` slots, counting every process's live
 * slots, in one transaction under a per-organisation advisory lock. True when
 * a slot was taken; the slot is the lease `slot:<owner>`.
 */
export async function acquireSlot(organizationId: number | undefined, owner: string, cap: number, ttlMs: number): Promise<boolean | null> {
  return inOrg(organizationId, 'slot', async pool => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ai-action-slots:${organizationId}`]);
      await client.query(
        `DELETE FROM coordination_leases WHERE organization_id = $1 AND lease_key LIKE 'slot:%' AND expires_at <= NOW()`,
        [organizationId],
      );
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM coordination_leases WHERE organization_id = $1 AND lease_key LIKE 'slot:%'`,
        [organizationId],
      );
      if (Number(rows[0]?.n ?? 0) >= cap) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(
        `INSERT INTO coordination_leases (organization_id, lease_key, owner, expires_at)
         VALUES ($1, $2, $3, NOW() + make_interval(secs => $4))`,
        [organizationId, `slot:${owner}`, owner, ttlMs / 1000],
      );
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  });
}
