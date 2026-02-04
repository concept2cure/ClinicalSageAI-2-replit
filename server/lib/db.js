/**
 * Neon Database Connection Helper
 *
 * This module re-exports the canonical database pool.
 * All database operations should use this connection pool.
 */

import { getPool } from '../db.ts';

// Re-export canonical pool
const pool = getPool();

// Handle pool errors
pool.on('error', err => {
  console.error('Unexpected error on idle database client', err);
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection test failed:', err);
  } else {
    console.log('Database connected successfully at:', res.rows[0].now);
  }
});

/**
 * Execute a query with the connection pool
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries (> 1 second)
    if (duration > 1000) {
      console.warn('Slow query detected:', { text, duration, rows: result.rowCount });
    }

    return result;
  } catch (error) {
    console.error('Database query error:', { text, error: error.message });
    throw error;
  }
}

/**
 * Get a client from the pool for transaction support
 * @returns {Promise<Object>} Database client
 */
export async function getClient() {
  const client = await pool.connect();

  // Add a release wrapper to log transaction durations
  const originalRelease = client.release.bind(client);
  const startTime = Date.now();

  client.release = () => {
    const duration = Date.now() - startTime;
    if (duration > 5000) {
      console.warn('Long-running transaction:', { duration });
    }
    originalRelease();
  };

  return client;
}

/**
 * Execute a transaction with automatic rollback on error
 * @param {Function} callback - Async function that receives the client
 * @returns {Promise<any>} Result from callback
 */
export async function transaction(callback) {
  const client = await getClient();

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
 * Close the database pool (for graceful shutdown)
 */
export async function close() {
  await pool.end();
  console.log('Database pool closed');
}

// Export the pool for direct access if needed
export { pool };

export default {
  query,
  getClient,
  transaction,
  close,
  pool,
};
