// server/utils/database.js
// Explicit .ts extension to avoid resolution to server/db/index.ts (which only exports drizzle db)
import { pool as dbPool, query as baseQuery, transaction as baseTransaction } from '../db.ts';

const pool = dbPool;

/**
 * Execute a database query with parameters
 *
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<any>} Query result
 */
export async function query(text, params) {
  return baseQuery(text, params);
}

/**
 * Get a client from the connection pool for transaction operations
 *
 * @returns {Promise<pg.PoolClient>} Database client
 */
export async function getClient() {
  if (!pool) {
    throw new Error('Database connection not available');
  }

  const client = await pool.connect();
  const originalRelease = client.release;

  // Override the release method to log slow transactions
  client.release = () => {
    originalRelease.apply(client);
  };

  return client;
}

/**
 * Execute a transaction with multiple queries
 *
 * @param {Function} callback - Transaction callback function that receives a client
 * @returns {Promise<any>} Transaction result
 */
export async function transaction(callback) {
  return baseTransaction(callback);
}

/**
 * Schema creation deliberately does NOT live here.
 *
 * ── What used to be here, and why it is gone ─────────────────────────────────
 * This module exported `initializeTables()` — CREATE TABLE IF NOT EXISTS for
 * ind_projects / ind_sections / ind_timelines — and invoked it as a
 * fire-and-forget side effect of being IMPORTED:
 *
 *   if (!shouldSkipDbBootstrap) initializeTables().catch(console.error);
 *
 * Five modules import this file, so merely loading any of them issued DDL on
 * the shared request pool. That was wrong in four separate ways:
 *
 *  1. It cannot succeed in production. The runtime connects as the
 *     non-superuser `app_service` role (server/db/getDatabaseUrl.ts), which is
 *     deliberately not the schema owner and holds no CREATE. Confirmed against
 *     PostgreSQL 16: `CREATE TABLE IF NOT EXISTS` checks CREATE on the schema
 *     BEFORE the IF-NOT-EXISTS short-circuit, so it raises "permission denied
 *     for schema public" whether or not the table already exists.
 *  2. It is blocked before it gets that far. Under RLS_ENFORCE=on — the only
 *     value production accepts — pool instrumentation rejects any unscoped
 *     pool.query, which this was.
 *  3. Its schema contradicted the real one. The ind_projects it described has
 *     no organization_id at all, while the installers create a 30-column table
 *     WITH organization_id, RLS enabled and forced, and a tenant policy. Had
 *     this DDL ever won the race on a fresh database, it would have produced a
 *     tenant-isolation hole rather than a working table.
 *  4. The failure was invisible. `.catch(console.error)` swallowed it, so the
 *     only signal was a console line in a stream nobody reads.
 *
 * Schema belongs to the installers and migrations — scripts/db/install-fresh.mjs
 * and scripts/db/deploy-migrate.mjs — which run as the OWNER. Startup code
 * validates and never creates; server/db/ensureCoreTables.ts is the pattern
 * ("Instead of creating tables, it validates required tables exist").
 *
 * ind_sections and ind_timelines are not created by this removal's replacement,
 * deliberately: their only reader is server/services/indCopilot.js, which talks
 * to Supabase rather than this pool and is on the quarantined-legacy-dependency
 * list (scripts/ci/check-legacy-dep-quarantine.mjs). Adding tenant-keyed tables
 * to Postgres for a legacy path that never queries Postgres would be dead
 * schema. ind_projects — the one with real consumers — is already provisioned
 * correctly by the installers.
 */

export default {
  pool,
  query,
  getClient,
  transaction,
};

export { pool };
