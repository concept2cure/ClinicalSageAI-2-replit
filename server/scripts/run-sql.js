import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
