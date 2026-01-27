import { Pool } from 'pg';
import dns from 'dns';

// Force IPv4 to prevent ENETUNREACH errors in environments without IPv6
dns.setDefaultResultOrder('ipv4first');

// Centralized database pool - single source of truth
let pool: Pool | null = null;

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

export function getPool(): Pool {
  if (!pool) {
    const rawUrl = process.env.DATABASE_URL || process.env.DATABASE_NEON_NEW_SECRET;
    const dbUrl = cleanDatabaseUrl(rawUrl);

    // Detect SSL requirements from URL
    const requiresSSL =
      dbUrl?.includes('supabase.co') ||
      dbUrl?.includes('neon.tech') ||
      dbUrl?.includes('sslmode=require');

    pool = new Pool({
      connectionString: dbUrl,
      ssl: requiresSSL ? { rejectUnauthorized: false } : false,
      // Connection pool settings for stability
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000, // Increased from 2000ms to 30s to prevent timeouts
      statement_timeout: 30000, // Add statement timeout
      query_timeout: 30000, // Add query timeout
    });

    // Add error handling to prevent crashes
    pool.on('error', err => {
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
