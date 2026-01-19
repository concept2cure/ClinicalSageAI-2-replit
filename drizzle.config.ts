import { defineConfig } from 'drizzle-kit';

const adminUrl = process.env.NEON_DATABASE_URL_ADMIN || process.env.DATABASE_URL_ADMIN;
const runtimeUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
const baseUrl = adminUrl || runtimeUrl;

const addHostAddr = (url: string, hostaddr?: string) => {
  if (!hostaddr) return url;
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get('hostaddr')) {
      return url;
    }
    parsed.searchParams.set('hostaddr', hostaddr);
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}hostaddr=${encodeURIComponent(hostaddr)}`;
  }
};

const hostaddr = process.env.NEON_DB_HOSTADDR || process.env.PGHOSTADDR;
const databaseUrl = baseUrl ? addHostAddr(baseUrl, hostaddr) : baseUrl;

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
