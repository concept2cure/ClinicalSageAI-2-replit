// server/utils/database.js
// Explicit .ts extension to avoid resolution to server/db/index.ts (which only exports drizzle db)
import { pool as dbPool, query as baseQuery, transaction as baseTransaction } from '../db.ts';

const pool = dbPool;
const shouldSkipDbBootstrap = process.env.SKIP_DB_STARTUP_TEST === 'true';

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
 * Initialize database tables if they don't exist
 */
export async function initializeTables() {
  if (shouldSkipDbBootstrap) {
    console.warn('[database] SKIP_DB_STARTUP_TEST=true, skipping table initialization at startup');
    return;
  }

  try {
    // Create IND Projects table
    await query(`
      CREATE TABLE IF NOT EXISTS ind_projects (
        id SERIAL PRIMARY KEY,
        project_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        drug_name VARCHAR(255) NOT NULL,
        indication VARCHAR(255) NOT NULL,
        sponsor VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'not_started',
        progress INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        target_date TIMESTAMP,
        data JSONB
      )
    `);

    // Create IND Sections table
    await query(`
      CREATE TABLE IF NOT EXISTS ind_sections (
        id SERIAL PRIMARY KEY,
        project_id VARCHAR(50) REFERENCES ind_projects(project_id) ON DELETE CASCADE,
        section_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'not_started',
        progress INTEGER NOT NULL DEFAULT 0,
        data JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(project_id, section_type)
      )
    `);

    // Create IND Timeline table
    await query(`
      CREATE TABLE IF NOT EXISTS ind_timelines (
        id SERIAL PRIMARY KEY,
        project_id VARCHAR(50) REFERENCES ind_projects(project_id) ON DELETE CASCADE,
        target_date TIMESTAMP,
        data JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database tables:', error);
    throw error;
  }
}

// Initialize database tables on module load
if (!shouldSkipDbBootstrap) {
  initializeTables().catch(console.error);
}

export default {
  pool,
  query,
  getClient,
  transaction,
  initializeTables,
};

export { pool };
