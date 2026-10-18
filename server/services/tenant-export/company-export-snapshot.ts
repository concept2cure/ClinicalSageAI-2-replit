import type { Pool, PoolClient } from 'pg';

/** The organization lock is shared with every canonical company writer. One
 * checked-out repeatable snapshot binds profile, registry and retained proofs;
 * a failed export never leaves an open transaction or lease behind. */
export async function companyExportSnapshot<T>(pool: Pool, organizationId: number,
  read: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query('SELECT id FROM organizations WHERE id=$1 FOR SHARE', [organizationId]);
    const result = await read(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
