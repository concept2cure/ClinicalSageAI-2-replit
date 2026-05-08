/**
 * Database runtime — pool, Drizzle, query/transaction helpers, health check.
 *
 * Extracted from server/db.ts as part of Phase 3 (runtime / bootstrap split).
 * This module is responsible for the runtime surface only:
 *   - pool creation and configuration
 *   - Drizzle ORM initialization
 *   - getPool() / getDb() accessors
 *   - query() and transaction() helpers
 *   - healthCheck() and runMigrations()
 *
 * Bootstrap/install behavior (schema repair, org seeding, module catalog
 * creation) lives in server/db/bootstrap/*.
 *
 * IMPORTANT: dotenv is loaded at the top of this module because ESM hoists
 * imports above runtime code — if db.ts / this file initializes before
 * server/index.ts has a chance to call dotenvConfig(), we would miss .env
 * values. `override: false` so shell-exported DATABASE_URL still wins.
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: false, quiet: true });

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import { createScopedLogger } from '../utils/logger';
import * as schema from '../../shared/schema';
import { getSslConfig } from './ssl';
import { getDatabaseUrl } from './getDatabaseUrl';
import { instrumentPool } from './poolInstrumentation';
import { installRlsEnforcement } from './rlsEnforcement';

const logger = createScopedLogger('database');

// ── Pool initialization ────────────────────────────────────────────────────
let pool: Pool | null = null;

const databaseUrl = getDatabaseUrl();
const skipDbStartupTest = process.env.SKIP_DB_STARTUP_TEST === 'true';

try {
  if (databaseUrl) {
    logger.info('Initializing PostgreSQL connection pool');
    const isProduction = process.env.NODE_ENV === 'production';
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: getSslConfig(databaseUrl),
      max: isProduction ? 40 : 20, // Scale pool for production concurrency
      idleTimeoutMillis: 30000, // Release idle connections after 30s (balanced for bursty traffic)
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000, // Kill queries running longer than 30s
      idle_in_transaction_session_timeout: 60000, // Kill idle-in-transaction after 60s
      allowExitOnIdle: !isProduction, // Dev: let process exit; Prod: keep pool alive
    });

    // Observability hook for the RLS rollout (PR A): every pool.query /
    // pool.connect emits a counter labelled by tenant-scope presence and
    // caller. No DB behavior change — just measurement.
    instrumentPool(pool);

    // Apply the RLS enforcement mode to every new connection. Default is
    // off/shadow; the policy installed by 0021 has a leading
    // `current_setting('app.rls_enforce') IS DISTINCT FROM 'on'` clause,
    // so unless RLS_ENFORCE=on is explicitly set, every row passes.
    installRlsEnforcement(pool);

    const testConnection = (retries = 3, delay = 3000) => {
      pool!.query('SELECT NOW()', (err, res) => {
        if (err) {
          logger.error('Database connection test failed', {
            error: err.message,
            retriesLeft: retries,
          });
          if (retries > 0) {
            logger.info(`Retrying database connection in ${delay / 1000} seconds...`);
            setTimeout(() => testConnection(retries - 1, delay), delay);
          } else {
            logger.error('All database connection attempts failed');
          }
        } else {
          logger.info('Database connection successful', {
            timestamp: res.rows[0].now,
            poolSize: pool?.totalCount || 0,
          });
        }
      });
    };

    if (skipDbStartupTest) {
      logger.warn('Skipping database startup connectivity test (SKIP_DB_STARTUP_TEST=true)');
    } else {
      testConnection();
    }

    pool.on('error', err => {
      logger.error('Unexpected database error', { error: err.message });
    });
  } else {
    logger.warn(
      'DATABASE_NEON_NEW_SECRET or DATABASE_URL not found, database features will be unavailable'
    );
  }
} catch (error: any) {
  logger.error('Failed to initialize database', { error: error.message });
  pool = null;
}

// ── Drizzle ORM instance ───────────────────────────────────────────────────
// Cast away null for downstream consumers; at runtime the server exits or
// logs a warning if the pool is unavailable.
const _db = pool ? drizzle(pool, { schema }) : null;
export const db = _db as NonNullable<typeof _db>;

// ── Runtime accessors ──────────────────────────────────────────────────────

/**
 * Get the database pool, throwing if it was not initialized.
 * Prefer this over reading the `pool` export when you want the failure to
 * be loud at the call site.
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database connection not available');
  }
  return pool;
}

/**
 * Get the Drizzle database instance, throwing if it was not initialized.
 * Use in routes/services that require the ORM.
 */
export function getDb() {
  if (!db) {
    throw new Error('Database connection not available');
  }
  return db;
}

// ── Query / transaction helpers ────────────────────────────────────────────

/**
 * Execute a raw SQL query with slow-query logging.
 * Threshold defaults to 250ms in production and 100ms in dev; override with
 * SLOW_QUERY_THRESHOLD_MS.
 */
export async function query(text: string, params: any[] = []): Promise<any> {
  if (!pool) {
    throw new Error('Database connection not available');
  }

  try {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    const slowThreshold =
      parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '', 10) ||
      (process.env.NODE_ENV === 'production' ? 250 : 100);
    if (duration > slowThreshold) {
      logger.warn('Slow query detected', {
        duration,
        query: text,
        params,
        rows: result.rowCount,
      });
    }

    return result;
  } catch (error: any) {
    logger.error('Database query error', {
      error: error.message,
      query: text,
      params,
    });
    throw error;
  }
}

/**
 * Run a callback inside a BEGIN/COMMIT transaction. Rolls back on throw.
 */
export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  if (!pool) {
    throw new Error('Database connection not available');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Minimal liveness probe. Returns false if the pool is missing or a trivial
 * query throws.
 */
export async function healthCheck(): Promise<boolean> {
  if (!pool) {
    return false;
  }

  try {
    const result = await pool.query('SELECT 1');
    return result.rows.length > 0;
  } catch (error: any) {
    logger.error('Database health check failed', { error: error.message || error });
    return false;
  }
}

/**
 * Run Drizzle migrations against the configured pool. No-op if DB is
 * unavailable (logs a warning).
 */
export async function runMigrations(): Promise<void> {
  if (!db || !pool) {
    logger.warn('Cannot run migrations: database connection not available');
    return;
  }

  try {
    logger.info('Running database migrations...');
    const migrationsFolder = path.resolve(__dirname, '../../migrations');
    await migrate(db, { migrationsFolder });
    logger.info('Database migrations completed successfully');
  } catch (error: any) {
    logger.error('Failed to run migrations', error);
    throw error;
  }
}

// ── Pool export ────────────────────────────────────────────────────────────
// Cast away null for consumers that import `pool` directly; the server exits
// or logs a warning upstream when DB is unavailable.
const poolExport = pool as Pool;
export { poolExport as pool };
