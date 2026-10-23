/**
 * What the boot still does for the auth tables: outside production, the GA
 * demo admin. Nothing else.
 *
 * This was `ensureAuthTables()`: every boot ran the auth-schema DDL, seeded two
 * organisations and the demo admin, and created the module catalog tables, in
 * one transaction on the OWNER connection (DATABASE_URL). Since 2026-10-22
 * (MR-03 Stage 3, OPS-16) the DDL and the organisation seeds are
 * migrations/20261022_auth_schema_and_seeded_organizations.sql, which
 * deploy-migrate applies; the boot checks the result through
 * `missingAuthSchema` (./auth-schema.ts, called from
 * server/startup/services.ts) and needs no owner credential.
 *
 * The demo admin stays here because it is a development convenience, not
 * schema: an operator's DEMO_USER_EMAIL, never seeded in production
 * (seedGaDemoUser refuses there). Outside production it still runs on the owner
 * connection when one is configured, as before, because the runtime role may
 * not upsert users and memberships unscoped.
 */

import { Pool } from 'pg';
import { getPool } from '../runtime';
import { getDatabaseUrl } from '../getDatabaseUrl';
import { getSslConfig } from '../ssl';
import { createScopedLogger } from '../../utils/logger';
import { seedGaDemoUser } from './seed-default-org';

const logger = createScopedLogger('database');

export async function seedDemoAdminOutsideProduction(): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  const appDbUrl = process.env.APP_DATABASE_URL;
  const runtimeSplit = !!(appDbUrl && appDbUrl.trim() !== '');
  const ownerUrl = getDatabaseUrl();

  let pool: Pool;
  let ownerPool: Pool | null = null;
  if (runtimeSplit && ownerUrl) {
    ownerPool = new Pool({
      connectionString: ownerUrl,
      ssl: getSslConfig(ownerUrl),
      max: 1,
    });
    pool = ownerPool;
  } else {
    try {
      pool = getPool();
    } catch {
      logger.warn('demo admin: no DB pool — skipping');
      return;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedGaDemoUser(client);
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('demo admin seed failed', { error: err.message });
    throw err;
  } finally {
    client.release();
    if (ownerPool) await ownerPool.end().catch(() => {});
  }
}
