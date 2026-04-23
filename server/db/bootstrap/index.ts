/**
 * Bootstrap orchestrator for the auth + module-catalog schema.
 *
 * Previously inlined as `ensureAuthTables()` in server/db.ts. The transaction
 * boundary is preserved exactly: schema migrations, organization seeds, GA
 * demo user seed, and module catalog schema all run inside a single
 * BEGIN/COMMIT. A failure anywhere rolls the whole thing back.
 *
 * Called from startup via `server/startup/services.ts`. Safe to re-run.
 */

import { getPool } from '../runtime';
import { createScopedLogger } from '../../utils/logger';
import { applyAuthSchemaMigrations, applyModuleCatalogSchema } from './auth-schema';
import { seedOrganizations, seedGaDemoUser } from './seed-default-org';

const logger = createScopedLogger('database');

export async function ensureAuthTables(): Promise<void> {
  let pool;
  try {
    pool = getPool();
  } catch {
    logger.warn('ensureAuthTables: no DB pool — skipping');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await applyAuthSchemaMigrations(client);
    await seedOrganizations(client);
    await seedGaDemoUser(client);
    await applyModuleCatalogSchema(client);

    await client.query('COMMIT');
    logger.info('ensureAuthTables: auth schema verified / updated');
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('ensureAuthTables failed', { error: err.message });
    throw err;
  } finally {
    client.release();
  }
}
