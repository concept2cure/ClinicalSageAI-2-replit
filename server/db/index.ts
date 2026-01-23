/**
 * Database Connection
 *
 * This file sets up the database connection using DATABASE_NEON_NEW_SECRET or DATABASE_URL from environment variables.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createScopedLogger } from '../utils/logger';
import { getSslConfig } from './ssl';

const logger = createScopedLogger('database');

// Initialize the database connection - prefer DATABASE_NEON_NEW_SECRET
const connectionString = process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL || '';
const demoMode = process.env.DEMO_MODE === 'true';

if (!connectionString) {
  if (demoMode) {
    logger.warn('DATABASE_NEON_NEW_SECRET/DATABASE_URL not set; running in DEMO_MODE with mocked data');
  } else {
    logger.error('DATABASE_NEON_NEW_SECRET or DATABASE_URL environment variable not set');
    process.exit(1);
  }
}

let client = null;
let db = null;

if (connectionString) {
  client = postgres(connectionString, {
    ssl: getSslConfig(connectionString),
  });
  db = drizzle(client);
}

export { db };
export default db;
