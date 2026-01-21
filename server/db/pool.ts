import { Pool } from 'pg';
import dns from 'dns';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getSslConfig } from './ssl';

// Prefer IPv4 DNS results to avoid IPv6 connection issues in some environments
dns.setDefaultResultOrder('ipv4first');

// Load .env.local first (if present), then .env
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}
dotenv.config();

// Centralized database pool - single source of truth
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

    if (!rawConnectionString) {
      throw new Error('Missing NEON_DATABASE_URL or DATABASE_URL');
    }

    const normalizeConnectionString = (value: string) => {
      try {
        const url = new URL(value);
        const hostaddr = url.searchParams.get('hostaddr');
        const hostOverride = url.searchParams.get('host');
        if (hostOverride) {
          url.hostname = hostOverride;
        }
        url.searchParams.delete('host');
        url.searchParams.delete('hostaddr');
        return { connectionString: url.toString(), hostaddr };
      } catch (_err) {
        return { connectionString: value, hostaddr: null };
      }
    };

    const normalized = normalizeConnectionString(rawConnectionString);
    const connectionString = normalized.connectionString;

    pool = new Pool({
      connectionString,
      ssl: getSslConfig(connectionString),
      family: 4,
      ...(normalized.hostaddr ? { hostaddr: normalized.hostaddr } : {}),
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
