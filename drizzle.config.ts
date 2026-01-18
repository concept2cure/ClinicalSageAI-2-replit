import { defineConfig } from 'drizzle-kit';

const databaseUrl =
  process.env.DATABASE_URL_ADMIN ??
  process.env.NEON_DATABASE_URL_ADMIN ??
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL_ADMIN, NEON_DATABASE_URL_ADMIN, or DATABASE_URL must be set to run migrations',
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
