import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// We test the module by re-importing after mutating process.env
// Use dynamic import to avoid module caching issues
describe('getDatabaseUrl', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.NEON_DATABASE_URL;
    delete process.env.DATABASE_NEON_NEW_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // Import the functions fresh (they read process.env at call time)
  async function loadModule() {
    // Dynamic import to get fresh references
    const mod = await import('../getDatabaseUrl');
    return mod;
  }

  it('returns undefined when no env vars are set', async () => {
    const { getDatabaseUrl } = await loadModule();
    expect(getDatabaseUrl()).toBeUndefined();
  });

  it('prefers DATABASE_URL over others', async () => {
    process.env.DATABASE_URL = 'postgresql://a@host/db';
    process.env.NEON_DATABASE_URL = 'postgresql://b@host/db';
    const { getDatabaseUrl } = await loadModule();
    expect(getDatabaseUrl()).toBe('postgresql://a@host/db');
  });

  it('falls back to NEON_DATABASE_URL', async () => {
    process.env.NEON_DATABASE_URL = 'postgresql://neon@host/db';
    const { getDatabaseUrl } = await loadModule();
    expect(getDatabaseUrl()).toBe('postgresql://neon@host/db');
  });

  it('falls back to DATABASE_NEON_NEW_SECRET', async () => {
    process.env.DATABASE_NEON_NEW_SECRET = 'postgresql://secret@host/db';
    const { getDatabaseUrl } = await loadModule();
    expect(getDatabaseUrl()).toBe('postgresql://secret@host/db');
  });

  it('strips psql wrapper and quotes', async () => {
    process.env.DATABASE_URL =
      "psql 'postgresql://user:pass@host/db?sslmode=require'";
    const { getDatabaseUrl } = await loadModule();
    expect(getDatabaseUrl()).toBe(
      'postgresql://user:pass@host/db?sslmode=require',
    );
  });

  it('strips psql wrapper with channel_binding param', async () => {
    process.env.DATABASE_URL =
      "psql 'postgresql://neondb_owner:pw@ep-wild-forest-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'";
    const { getDatabaseUrl } = await loadModule();
    expect(getDatabaseUrl()).toBe(
      'postgresql://neondb_owner:pw@ep-wild-forest-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    );
  });

  it('requireDatabaseUrl throws when no env var is set', async () => {
    const { requireDatabaseUrl } = await loadModule();
    expect(() => requireDatabaseUrl()).toThrow(
      'DATABASE_URL, NEON_DATABASE_URL, or DATABASE_NEON_NEW_SECRET',
    );
  });
});
