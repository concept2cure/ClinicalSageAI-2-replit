import { Pool } from 'pg';
import { getSslConfig } from './ssl';

// Centralized database pool - single source of truth
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    pool = new Pool({
      connectionString,
      ssl: getSslConfig(connectionString),
      // Connection pool settings for stability
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000, // Increased from 2000ms to 30s to prevent timeouts
      statement_timeout: 30000, // Add statement timeout
      query_timeout: 30000, // Add query timeout
    });

    // Add error handling to prevent crashes
    pool.on('error', (err) => {
      console.error('Database pool error:', err);
      // Don't exit process - just log and continue
    });
  }
  return pool;
}

// Convenience query function
export const query = (text: string, params?: any[]) => {
  return getPool().query(text, params);
};

export default getPool;
