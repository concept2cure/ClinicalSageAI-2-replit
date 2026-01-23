import { Pool } from 'pg';
import dns from 'dns';

// Force IPv4 to prevent ENETUNREACH errors in environments without IPv6
dns.setDefaultResultOrder('ipv4first');

// Centralized database pool - single source of truth
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL;
    
    // Detect SSL requirements from URL
    const requiresSSL = dbUrl?.includes('supabase.co') || 
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