import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}
dotenv.config();

const databaseUrl =
  process.env.DATABASE_URL_ADMIN ??
  process.env.NEON_DATABASE_URL_ADMIN ??
  process.env.DATABASE_URL ??
  process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL_ADMIN, NEON_DATABASE_URL_ADMIN, DATABASE_URL, or NEON_DATABASE_URL must be set to run migrations',
  );
}

const adminUrl =
  process.env.DATABASE_URL_ADMIN ?? process.env.NEON_DATABASE_URL_ADMIN;

if (adminUrl?.includes('.pooler.')) {
  throw new Error(
    'Admin database URL must use the direct Neon host (ep-*.neon.tech), not the pooler host',
  );
}

export default defineConfig({
  out: './migrations',
  schema: './shared/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});
