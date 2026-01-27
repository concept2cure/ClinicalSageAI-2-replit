import pkg from 'pg';
const { Pool } = pkg;

// Clean database URL helper
function cleanDatabaseUrl(url) {
  if (!url) return url;
  let cleaned = url;
  if (cleaned.startsWith('psql ')) {
    cleaned = cleaned.substring(5);
  }
  if (
    (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
    (cleaned.startsWith('"') && cleaned.endsWith('"'))
  ) {
    cleaned = cleaned.slice(1, -1);
  }
  return cleaned.trim();
}

const connectionString = cleanDatabaseUrl(
  process.env.DATABASE_URL || process.env.DATABASE_NEON_NEW_SECRET
);

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export default pool;
