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

/**
 * Clean a database URL by removing common wrapper artifacts
 * like `psql '...'` that can be accidentally copied from terminal commands
 */
function cleanDatabaseUrl(url: string): string {
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

// Initialize the database connection - prefer DATABASE_NEON_NEW_SECRET
const rawConnectionString = process.env.DATABASE_URL || process.env.DATABASE_NEON_NEW_SECRET || '';
const connectionString = cleanDatabaseUrl(rawConnectionString);
const demoMode = process.env.DEMO_MODE === 'true';

if (!connectionString) {
  if (demoMode) {
    logger.warn(
      'DATABASE_NEON_NEW_SECRET/DATABASE_URL not set; running in DEMO_MODE with mocked data'
    );
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
