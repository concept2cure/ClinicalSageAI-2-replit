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

  return cleaned;
}

/**
 * Get the cleaned database URL from environment variables.
 * Prefers DATABASE_URL over DATABASE_NEON_NEW_SECRET.
 */
export function getDatabaseUrl(): string | undefined {
  const rawUrl = process.env.DATABASE_URL || process.env.DATABASE_NEON_NEW_SECRET;
  return cleanDatabaseUrl(rawUrl);
}

/**
 * Get the cleaned database URL, throwing if not set.
 */
export function requireDatabaseUrl(): string {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error('DATABASE_URL or DATABASE_NEON_NEW_SECRET environment variable is required');
  }
  return url;
}

export default getDatabaseUrl;
