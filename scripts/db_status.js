import { Client } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}
dotenv.config();

const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const normalizedUrl = databaseUrl.toLowerCase();
const ssl =
  normalizedUrl.includes('sslmode=require') ||
  normalizedUrl.includes('neon.tech') ||
  normalizedUrl.includes('neondb')
    ? {
        rejectUnauthorized: false,
      }
    : undefined;

const client = new Client({
  connectionString: databaseUrl,
  ssl,
});

const run = async () => {
  await client.connect();
  const tablesResult = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('drizzle_migrations', 'schema_migrations')"
  );

  if (tablesResult.rows.length === 0) {
    console.error('No migration tables found (drizzle_migrations or schema_migrations).');
    await client.end();
    process.exit(1);
  }

  console.log('Migration tables found:', tablesResult.rows.map(row => row.table_name).join(', '));

  if (tablesResult.rows.some(row => row.table_name === 'drizzle_migrations')) {
    const migrations = await client.query('SELECT * FROM drizzle_migrations ORDER BY id DESC LIMIT 5');
    console.log('Latest drizzle migrations:', migrations.rows);
  }

  if (tablesResult.rows.some(row => row.table_name === 'schema_migrations')) {
    const migrations = await client.query('SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 5');
    console.log('Latest schema migrations:', migrations.rows);
  }

  await client.end();
};

run().catch(error => {
  console.error('Database status check failed:', error);
  process.exit(1);
});
