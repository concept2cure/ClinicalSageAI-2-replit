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
  const result = await client.query('SELECT 1 as ok');
  console.log('Database check result:', result.rows[0]);
  await client.end();
};

run().catch(error => {
  console.error('Database check failed:', error);
  process.exit(1);
});
