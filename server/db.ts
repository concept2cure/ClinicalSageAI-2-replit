/**
 * Database Configuration for Concept2Cure
 *
 * Provides a centralized database connection with Drizzle ORM
 * integration for type-safe database operations.
 *
 * IMPORTANT: dotenv must be loaded BEFORE any env var reads.
 * ESM hoists imports above runtime code, so `server/index.ts`'s
 * `dotenvConfig({ override: true })` runs AFTER this module initializes.
 * We load dotenv here to guarantee .env values are available.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: true });

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createScopedLogger } from './utils/logger';
import * as schema from '../shared/schema';
import path from 'path';
import { getSslConfig } from './db/ssl';
import { getDatabaseUrl } from './db/getDatabaseUrl';

const logger = createScopedLogger('database');

// Database connection pool
let pool: Pool | null = null;
// Re-export with non-null type for consumers that run after init
// (guarded by getPool()/getDb() at runtime)

// Get cleaned database URL
const databaseUrl = getDatabaseUrl();
const skipDbStartupTest = process.env.SKIP_DB_STARTUP_TEST === 'true';

// Initialize database connection
try {
  // Check if database URL is available
  if (databaseUrl) {
    logger.info('Initializing PostgreSQL connection pool');
    const isProduction = process.env.NODE_ENV === 'production';
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: getSslConfig(databaseUrl),
      max: isProduction ? 40 : 20, // Scale pool for production concurrency
      idleTimeoutMillis: 15000, // Release idle connections faster (was 30s)
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000, // Kill queries running longer than 30s
      idle_in_transaction_session_timeout: 60000, // Kill idle-in-transaction after 60s
    });

    // Test connection with retry mechanism
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

    // Start the connection test with retries unless explicitly skipped
    if (skipDbStartupTest) {
      logger.warn('Skipping database startup connectivity test (SKIP_DB_STARTUP_TEST=true)');
    } else {
      testConnection();
    }

    // Log database errors
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

// Initialize Drizzle ORM – cast away null for downstream consumers;
// at runtime the server exits (process.exit) or logs a warning if DB is unavailable.
const _db = pool ? drizzle(pool, { schema }) : null;
export const db = _db as NonNullable<typeof _db>;

/**
 * Get the database pool, throwing an error if not available.
 * Use this for direct pg access when needed.
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database connection not available');
  }
  return pool;
}

/**
 * Get the database connection, throwing an error if not available.
 * Use this in routes/services that require database access.
 */
export function getDb() {
  if (!db) {
    throw new Error('Database connection not available');
  }
  return db;
}

/**
 * Run database migrations
 */
export async function runMigrations(): Promise<void> {
  if (!db || !pool) {
    logger.warn('Cannot run migrations: database connection not available');
    return;
  }

  try {
    logger.info('Running database migrations...');
    // Check if migrations folder exists
    const migrationsFolder = path.resolve(__dirname, '../migrations');

    // Run migrations
    await migrate(db, { migrationsFolder });
    logger.info('Database migrations completed successfully');
  } catch (error: any) {
    logger.error('Failed to run migrations', error);
    throw error;
  }
}

/**
 * Idempotent auth-schema bootstrap.
 * Ensures the users, organizations, and organization_users tables have every
 * column the auth routes expect.  Runs on every server start — all statements
 * are IF NOT EXISTS / ON CONFLICT so they are safe to re-run.
 */
export async function ensureAuthTables(): Promise<void> {
  if (!pool) {
    logger.warn('ensureAuthTables: no DB pool — skipping');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── organizations: add columns the schema expects ──────────────────
    await client.query(`
      ALTER TABLE organizations
        ADD COLUMN IF NOT EXISTS uuid          UUID DEFAULT gen_random_uuid() NOT NULL,
        ADD COLUMN IF NOT EXISTS slug          TEXT,
        ADD COLUMN IF NOT EXISTS domain        TEXT,
        ADD COLUMN IF NOT EXISTS logo          TEXT,
        ADD COLUMN IF NOT EXISTS industry_mode TEXT,
        ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
        ADD COLUMN IF NOT EXISTS settings      JSONB,
        ADD COLUMN IF NOT EXISTS api_key       TEXT,
        ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
        ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly',
        ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'incomplete',
        ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP,
        ADD COLUMN IF NOT EXISTS seats_purchased INTEGER DEFAULT 5,
        ADD COLUMN IF NOT EXISTS tier          TEXT DEFAULT 'standard' NOT NULL,
        ADD COLUMN IF NOT EXISTS status        TEXT DEFAULT 'active'   NOT NULL,
        ADD COLUMN IF NOT EXISTS max_users     INTEGER DEFAULT 5,
        ADD COLUMN IF NOT EXISTS max_projects  INTEGER DEFAULT 10,
        ADD COLUMN IF NOT EXISTS max_storage   INTEGER DEFAULT 5,
        ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP DEFAULT NOW() NOT NULL
    `);
    // back-fill slug for any rows that lack one
    await client.query(`
      UPDATE organizations SET slug = lower(replace(name, ' ', '-'))
      WHERE slug IS NULL
    `);
    // only make NOT NULL if every row now has a value
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM organizations WHERE slug IS NULL) THEN
          EXECUTE 'ALTER TABLE organizations ALTER COLUMN slug SET NOT NULL';
        END IF;
      END $$
    `);

    // ── users: add columns the auth routes expect ──────────────────────
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS password_hash            TEXT,
        ADD COLUMN IF NOT EXISTS title                    TEXT,
        ADD COLUMN IF NOT EXISTS department               TEXT,
        ADD COLUMN IF NOT EXISTS avatar                   TEXT,
        ADD COLUMN IF NOT EXISTS bio                      TEXT,
        ADD COLUMN IF NOT EXISTS status                   TEXT DEFAULT 'active' NOT NULL,
        ADD COLUMN IF NOT EXISTS last_login               TIMESTAMP,
        ADD COLUMN IF NOT EXISTS default_organization_id  INTEGER REFERENCES organizations(id),
        ADD COLUMN IF NOT EXISTS preferences              JSONB,
        ADD COLUMN IF NOT EXISTS updated_at               TIMESTAMP DEFAULT NOW() NOT NULL,
        ADD COLUMN IF NOT EXISTS mfa_enabled              BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS mfa_secret               TEXT,
        ADD COLUMN IF NOT EXISTS mfa_backup_codes         JSONB,
        ADD COLUMN IF NOT EXISTS mfa_method               TEXT DEFAULT 'totp',
        ADD COLUMN IF NOT EXISTS mfa_verified_at          TIMESTAMP,
        ADD COLUMN IF NOT EXISTS failed_login_attempts    INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS locked_until             TIMESTAMP,
        ADD COLUMN IF NOT EXISTS last_failed_login        TIMESTAMP,
        ADD COLUMN IF NOT EXISTS password_changed_at      TIMESTAMP,
        ADD COLUMN IF NOT EXISTS password_history         JSONB,
        ADD COLUMN IF NOT EXISTS must_change_password     BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS reset_token              TEXT,
        ADD COLUMN IF NOT EXISTS reset_token_expires_at   TIMESTAMP
    `);
    // unique constraint on email (needed for ON CONFLICT)
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique'
        ) THEN
          ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
        END IF;
      END $$
    `);

    // ── organization_users junction table ───────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS organization_users (
        id              SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        user_id         INTEGER NOT NULL REFERENCES users(id),
        role            TEXT DEFAULT 'member' NOT NULL,
        permissions     JSONB,
        created_at      TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at      TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(organization_id, user_id)
      )
    `);
    // Add permissions column if missing (for tables created before this migration)
    await client.query(`
      ALTER TABLE organization_users
        ADD COLUMN IF NOT EXISTS permissions JSONB
    `);

    // ── Guarantee at least one org exists ───────────────────────────────
    await client.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('Default', 'default')
      ON CONFLICT DO NOTHING
    `);

    // ── Ensure Concept2Cure Therapeutics org exists ─────────────────────
    await client.query(`
      INSERT INTO organizations (name, slug, industry_mode, tier, status, max_users, max_projects, max_storage)
      VALUES ('Concept2Cure Therapeutics', 'concept2cure', 'biotech', 'enterprise', 'active', 25, 50, 100)
      ON CONFLICT (slug) DO UPDATE SET
        industry_mode = COALESCE(NULLIF(organizations.industry_mode, ''), 'biotech'),
        tier = 'enterprise'
    `);

    // ── Seed GA demo admin user (jm.smith@concept2cure.pro) ─────────
    // bcrypt hash of "pass-word" with 12 rounds (pre-computed for startup speed)
    const demoHash = '$2b$12$ZE1acJqmLIAbDLl2h2eUiOeXLXCunsidscRZDA7Wt4.kiYBiNgFnu';
    const demoEmail = 'jm.smith@concept2cure.pro';
    const demoName = 'JM Smith';

    // Get the Concept2Cure org id
    const c2cOrg = await client.query(`SELECT id FROM organizations WHERE slug = 'concept2cure' LIMIT 1`);
    const c2cOrgId = c2cOrg.rows[0]?.id;

    if (c2cOrgId) {
      // Upsert demo user
      await client.query(`
        INSERT INTO users (email, name, password_hash, title, department, status, default_organization_id, password_changed_at)
        VALUES ($1, $2, $3, 'Chief Science Officer', 'Executive Leadership', 'active', $4, NOW())
        ON CONFLICT (email) DO UPDATE SET
          password_hash = CASE WHEN users.password_hash IS NULL OR users.password_hash = '' THEN $3 ELSE users.password_hash END,
          default_organization_id = COALESCE(users.default_organization_id, $4),
          status = 'active'
      `, [demoEmail, demoName, demoHash, c2cOrgId]);

      // Ensure admin membership
      const demoUser = await client.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [demoEmail]);
      if (demoUser.rows[0]) {
        await client.query(`
          INSERT INTO organization_users (organization_id, user_id, role)
          VALUES ($1, $2, 'admin')
          ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin'
        `, [c2cOrgId, demoUser.rows[0].id]);
      }
      logger.info(`ensureAuthTables: GA demo user verified (${demoEmail})`);
    }

    // ── available_modules catalog ──────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS available_modules (
        id          SERIAL PRIMARY KEY,
        module_id   TEXT NOT NULL UNIQUE,
        name        TEXT NOT NULL,
        description TEXT,
        category    TEXT,
        icon        TEXT,
        path        TEXT,
        sort_order  INTEGER DEFAULT 0,
        metadata    JSONB DEFAULT '{}'
      )
    `);

    // ── module_subscriptions per-org ────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS module_subscriptions (
        id              SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        module_id       TEXT NOT NULL,
        enabled         BOOLEAN DEFAULT true,
        created_at      TIMESTAMP DEFAULT NOW(),
        UNIQUE(organization_id, module_id)
      )
    `);

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

/**
 * Execute a raw database query with error handling
 */
export async function query(text: string, params: any[] = []): Promise<any> {
  if (!pool) {
    throw new Error('Database connection not available');
  }

  try {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries (configurable, default 250ms prod / 100ms dev)
    const slowThreshold = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '', 10)
      || (process.env.NODE_ENV === 'production' ? 250 : 100);
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
 * Execute a transaction with error handling
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
 * Check database health
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

// Export the pool for direct access if needed
// Cast away null – the process exits or logs when DB is unavailable.
const poolExport = pool as Pool;
export { poolExport as pool };
