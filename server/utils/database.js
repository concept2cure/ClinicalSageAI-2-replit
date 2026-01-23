// server/utils/database.js
import pg from 'pg';
const { Pool } = pg;

// Create a connection pool to the PostgreSQL database
const pool = new Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test the database connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('🚨 Database connection error:', err.message);
  } else {
    console.log('✅ Database connected successfully at', res.rows[0].now);
  }
});

/**
 * Execute a database query with parameters
 *
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<any>} Query result
 */
export async function query(text, params) {
  try {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      console.warn(`Slow query (${duration}ms): ${text}`);
    }

    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Get a client from the connection pool for transaction operations
 *
 * @returns {Promise<pg.PoolClient>} Database client
 */
export async function getClient() {
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
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Initialize database tables if they don't exist
 */
export async function initializeTables() {
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
initializeTables().catch(console.error);

export default {
  query,
  getClient,
  transaction,
  initializeTables,
};
