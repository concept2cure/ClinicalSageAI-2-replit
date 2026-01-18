/**
 * Database Configuration for TrialSage
 *
 * Provides a centralized database connection with Drizzle ORM
 * integration for type-safe database operations.
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createScopedLogger } from './utils/logger';
import * as schema from '../shared/schema';
import path from 'path';

const logger = createScopedLogger('database');

// Database connection pool
let pool: Pool | null = null;

// Initialize database connection
try {
  // Check if DATABASE_URL is available
  const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

  if (connectionString) {
    logger.info('Initializing PostgreSQL connection pool');
    pool = new Pool({
      connectionString,
      ssl:
        connectionString.includes('postgresql://') ||
        connectionString.includes('neondb')
          ? { rejectUnauthorized: false }
          : false,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
      connectionTimeoutMillis: 5000, // How long to wait for a connection to become available
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

    // Start the connection test with retries
    testConnection();

    // Log database errors
    pool.on('error', err => {
      logger.error('Unexpected database error', { error: err.message });
    });
  } else {
    logger.warn('NEON_DATABASE_URL or DATABASE_URL not found, database features will be unavailable');
  }
} catch (error: any) {
  logger.error('Failed to initialize database', { error: error.message });
  pool = null;
}

// Initialize Drizzle ORM
export const db = pool ? drizzle(pool, { schema }) : null;

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

    // Log slow queries (>100ms)
    if (duration > 100) {
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
export { pool };
