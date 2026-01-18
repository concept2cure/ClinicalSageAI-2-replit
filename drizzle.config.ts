import { defineConfig } from 'drizzle-kit';

const adminUrl = process.env.NEON_DATABASE_URL_ADMIN || process.env.DATABASE_URL_ADMIN;
const runtimeUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
const databaseUrl = adminUrl || runtimeUrl;

if (!databaseUrl) {
  throw new Error('DATABASE_URL/NEON_DATABASE_URL not set (admin URL preferred for migrations)');
}

export default defineConfig({
  out: './migrations',
  schema: './shared/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});
