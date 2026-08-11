/**
 * Database URL Utility
 *
 * Centralized utility to get a clean, properly formatted database URL.
 * Handles common issues like `psql '...'` wrapper from copy-paste mistakes.
 */

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

  // Remove channel_binding param (not supported by node-pg and causes auth failures)
  cleaned = cleaned.replace(/[&?]channel_binding=[^&]*/g, '');

  return cleaned;
}

/**
 * Get the cleaned database URL from environment variables.
 * Prefers DATABASE_URL, then NEON_DATABASE_URL, then DATABASE_NEON_NEW_SECRET.
 */
export function getDatabaseUrl(): string | undefined {
  const rawUrl =
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.DATABASE_NEON_NEW_SECRET;
  return cleanDatabaseUrl(rawUrl);
}

/**
 * Get the cleaned database URL, throwing if not set.
 */
export function requireDatabaseUrl(): string {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error('DATABASE_URL, NEON_DATABASE_URL, or DATABASE_NEON_NEW_SECRET environment variable is required');
  }
  return url;
}

/**
 * Get the cleaned RUNTIME database URL — the connection the request-serving
 * application pool uses.
 *
 * The runtime should connect as the NON-SUPERUSER `app_service` role so
 * PostgreSQL Row-Level Security actually filters rows: a superuser (or a role
 * with BYPASSRLS) bypasses RLS entirely, and connecting as the table owner
 * sidesteps it unless FORCE ROW LEVEL SECURITY is set. The migration/admin
 * tooling keeps using DATABASE_URL (the owner), which is what CREATE ROLE, DDL,
 * and GRANT require; only the runtime pool downgrades to the least-privilege
 * role via APP_DATABASE_URL.
 *
 * Falls back to getDatabaseUrl() (DATABASE_URL) when APP_DATABASE_URL is unset,
 * preserving today's single-role behavior for deployments that have not split
 * the roles yet. The split is provisioned by scripts/db/provision-app-role.mjs.
 */
export function getRuntimeDatabaseUrl(): string | undefined {
  const runtimeUrl = process.env.APP_DATABASE_URL;
  if (runtimeUrl && runtimeUrl.trim() !== '') {
    return cleanDatabaseUrl(runtimeUrl);
  }
  return getDatabaseUrl();
}

export default getDatabaseUrl;
