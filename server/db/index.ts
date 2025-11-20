/**
 * Database Connection
 *
 * This file sets up the database connection using the DATABASE_URL from environment variables.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('database');

// Initialize the database connection
const connectionString = process.env.DATABASE_URL || '';

if (!connectionString) {
  logger.error('DATABASE_URL environment variable not set');
  process.exit(1);
}

// Create the postgres client
const client = postgres(connectionString, {
  ssl:
    connectionString?.includes('neon.tech') || process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

// Create the drizzle database instance
export const db = drizzle(client);

export default db;
