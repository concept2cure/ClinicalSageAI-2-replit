/**
 * Database Connection
 *
 * This file sets up the database connection using the DATABASE_URL from environment variables.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createScopedLogger } from '../utils/logger';
import { getSslConfig } from './ssl';

const logger = createScopedLogger('database');

// Initialize the database connection
const connectionString = process.env.DATABASE_URL || '';

let db: any;

if (!connectionString) {
  logger.warn('DATABASE_URL not set; database features will be disabled for this run');
  const noDbError = () => {
    const err: any = new Error('DATABASE_URL environment variable not set');
    err.code = 'NO_DB';
    return err;
  };

  const throwNoDb = () => {
    throw noDbError();
  };

  // Many routes/services expect a Drizzle-like API (select/insert/update/delete).
  // Provide a permissive stub that fails consistently instead of throwing TypeError.
  db = new Proxy(
    {
      execute: async () => {
        throw noDbError();
      },
    },
    {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        return throwNoDb;
      },
    }
  );
} else {
  // Create the postgres client
  const client = postgres(connectionString, {
    ssl:
      connectionString?.includes('neon.tech') || process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
  });

  // Create the drizzle database instance
  db = drizzle(client);
}

<<<<<<< HEAD
export { db };
=======
// Create the postgres client
const client = postgres(connectionString, {
  ssl: getSslConfig(connectionString),
});

// Create the drizzle database instance
export const db = drizzle(client);

>>>>>>> codex/implement-liquid-csr-ingestion-pipeline
export default db;
