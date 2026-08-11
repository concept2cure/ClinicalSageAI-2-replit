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

import { Pool } from 'pg';
import { getPool } from '../runtime';
import { getDatabaseUrl } from '../getDatabaseUrl';
import { getSslConfig } from '../ssl';
import { createScopedLogger } from '../../utils/logger';
import { applyAuthSchemaMigrations, applyModuleCatalogSchema } from './auth-schema';
import { seedOrganizations, seedGaDemoUser } from './seed-default-org';

const logger = createScopedLogger('database');

export async function ensureAuthTables(): Promise<void> {
  // This bootstrap runs DDL (ALTER/CREATE) and system seeds — OWNER work. When
  // APP_DATABASE_URL splits the request-serving pool onto the non-superuser
  // app_service role, getPool() cannot run it: app_service has no CREATE/ALTER,
  // and the instrumented runtime pool fail-closes unscoped writes under
  // RLS_ENFORCE=on. So when the roles are split, run this on a standalone OWNER
  // connection (DATABASE_URL) — the same role migrations use, and exactly what
  // ensureCoreTables already does. When the roles are NOT split, getPool() IS
  // the owner, so behavior is unchanged.
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
    logger.info('ensureAuthTables: using owner connection (runtime role is split via APP_DATABASE_URL)');
  } else {
    try {
      pool = getPool();
    } catch {
      logger.warn('ensureAuthTables: no DB pool — skipping');
      return;
    }
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
    if (ownerPool) await ownerPool.end().catch(() => {});
  }
}
