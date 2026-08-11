import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// TLS posture. This read:
//
//   ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
//
// — certificate verification disabled SPECIFICALLY IN PRODUCTION, and TLS not
// used at all everywhere else. Exactly inverted: the one environment where a
// connection can be intercepted is the one that accepted any certificate. This
// script executes arbitrary SQL files against that connection.
//
// Now: TLS with verification wherever TLS is used, and the insecure mode only
// when an operator sets DB_SSL_ALLOW_UNVERIFIED=1 deliberately. Never inferred
// from NODE_ENV — inferring it is what produced the inversion above.
//
// The predicate is duplicated rather than imported from
// server/db/ensureCoreTables.ts on purpose: this is a plain .js CLI script, and
// server/middleware/auth.js vs auth.ts is a live lesson in what happens when a
// .js and a .ts file end up sharing a name and a meaning. Two lines of
// duplication beat another shadowing pair; the test pins them equal.
const allowUnverifiedDbTls = process.env.DB_SSL_ALLOW_UNVERIFIED === '1';
const useSsl = process.env.PGSSLMODE !== 'disable' && process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: !allowUnverifiedDbTls } : false,
});

async function runSqlFile(filePath) {
  const client = await pool.connect();
  try {
    const sqlContent = fs.readFileSync(filePath, 'utf8');
    console.log(`Executing SQL file: ${filePath}`);

    await client.query(sqlContent);
    console.log('✅ SQL file executed successfully');
  } catch (error) {
    console.error('❌ Error executing SQL file:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Usage: node run-sql.js <path-to-sql-file>');
  process.exit(1);
}

const fullPath = path.resolve(__dirname, '../../', sqlFile);
runSqlFile(fullPath).catch(error => {
  console.error('Failed to run SQL file:', error);
  process.exit(1);
});
