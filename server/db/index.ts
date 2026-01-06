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

let client: any = null;
let db: any = null;

if (!connectionString) {
  logger.warn('DATABASE_URL not found, database features will be unavailable');
  // Create a mock database that returns empty results
  db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([]),
        limit: () => Promise.resolve([]),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve({ rows: [] }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve({ rows: [] }),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve({ rows: [] }),
    }),
  };
} else {
  // Create the postgres client
  client = postgres(connectionString, {
    ssl:
      connectionString?.includes('neon.tech') || process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
  });

  // Create the drizzle database instance
  db = drizzle(client);
}

export { db };

export default db;
