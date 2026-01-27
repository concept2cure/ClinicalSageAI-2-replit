/**
 * Database Initialization Module
 *
 * This module handles database initialization for all features,
 * including the enhanced literature discovery functionality.
 */

import { Pool } from 'pg';
import setupLiterature from './setupLiterature';
import setupLumenCortex from './setupLumenCortex';
import { getSslConfig } from './ssl';

/**
 * Clean a database URL by removing common wrapper artifacts
 * like `psql '...'` that can be accidentally copied from terminal commands
 */
function cleanDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  let cleaned = url;

  // Remove psql command wrapper if present: psql 'postgresql://...' or psql "postgresql://..."
  if (cleaned.startsWith('psql ')) {
    cleaned = cleaned.substring(5); // Remove 'psql '
  }

  // Remove surrounding quotes (single or double)
  if (
    (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
    (cleaned.startsWith('"') && cleaned.endsWith('"'))
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  // Remove any leading/trailing whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

// Initialize database connection pool with cleaned URL
const rawUrl = process.env.DATABASE_URL || process.env.DATABASE_NEON_NEW_SECRET;
const connectionString = cleanDatabaseUrl(rawUrl);

const pool = new Pool({
  connectionString,
  ssl: getSslConfig(connectionString),
});

/**
 * Initialize all database components and tables
 */
export async function initializeDatabase() {
  try {
    console.log('Initializing database...');

    // Check database connection
    const client = await pool.connect();
    try {
      await client.query('SELECT NOW()');
      console.log('Database connection successful');
    } finally {
      client.release();
    }

    // Initialize literature system if enabled
    if (process.env.ENABLE_LITERATURE_FEATURES !== 'false') {
      console.log('Initializing literature discovery system...');
      try {
        const literatureSetupSuccess = await setupLiterature.initializeLiteratureDatabase();

        if (literatureSetupSuccess) {
          console.log('Literature discovery system initialized successfully');
        } else {
          console.warn(
            'Literature tables could not be set up. Literature features may be limited.'
          );
        }
      } catch (error) {
        console.error('Error initializing literature system:', error);
        console.warn('Literature discovery features may be limited or unavailable');
      }
    } else {
      console.log('Literature discovery features are disabled');
    }

    // Initialize Lumen Cortex intelligence core tables
    console.log('Initializing Lumen Cortex intelligence core...');
    try {
      const lumenCortexSetup = await setupLumenCortex.initializeLumenCortexDatabase();
      if (lumenCortexSetup) {
        console.log('Lumen Cortex initialized successfully');
      } else {
        console.warn('Lumen Cortex tables could not be set up. Cortex features may be limited.');
      }
    } catch (error) {
      console.error('Error initializing Lumen Cortex:', error);
      console.warn('Lumen Cortex features may be limited or unavailable');
    }

    console.log('Database initialization complete');
    return true;
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

/**
 * Check if database is healthy and connected
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

/**
 * Close all database connections
 */
export async function closeDatabase(): Promise<void> {
  try {
    await pool.end();
    console.log('Database connections closed');
  } catch (error) {
    console.error('Error closing database connections:', error);
  }
}

// Export the pool for reuse in other modules
export { pool };
