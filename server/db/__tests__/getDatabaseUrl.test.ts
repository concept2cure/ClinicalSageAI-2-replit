import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// We test the module by re-importing after mutating process.env
// Use dynamic import to avoid module caching issues
describe('getDatabaseUrl', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.NEON_DATABASE_URL;
    delete process.env.DATABASE_NEON_NEW_SECRET;
    delete process.env.APP_DATABASE_URL;
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
    // The wrapper-strip pass also drops `channel_binding=...` because
    // node-pg's libpq doesn't accept it and Neon's pooler refuses
    // connections that supply it. The test now matches the documented
    // behavior of cleanDatabaseUrl (see getDatabaseUrl.ts:32-33).
    process.env.DATABASE_URL =
      "psql 'postgresql://neondb_owner:pw@ep-wild-forest-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'";
    const { getDatabaseUrl } = await loadModule();
    expect(getDatabaseUrl()).toBe(
      'postgresql://neondb_owner:pw@ep-wild-forest-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
    );
  });

  it('requireDatabaseUrl throws when no env var is set', async () => {
    const { requireDatabaseUrl } = await loadModule();
    expect(() => requireDatabaseUrl()).toThrow(
      'DATABASE_URL, NEON_DATABASE_URL, or DATABASE_NEON_NEW_SECRET',
    );
  });

  describe('getRuntimeDatabaseUrl', () => {
    it('prefers APP_DATABASE_URL (the non-superuser runtime role) over DATABASE_URL', async () => {
      process.env.APP_DATABASE_URL = 'postgresql://app_service:pw@host/db';
      process.env.DATABASE_URL = 'postgresql://owner:pw@host/db';
      const { getRuntimeDatabaseUrl } = await loadModule();
      expect(getRuntimeDatabaseUrl()).toBe('postgresql://app_service:pw@host/db');
    });

    it('falls back to DATABASE_URL when APP_DATABASE_URL is unset (single-role compat)', async () => {
      process.env.DATABASE_URL = 'postgresql://owner:pw@host/db';
      const { getRuntimeDatabaseUrl } = await loadModule();
      expect(getRuntimeDatabaseUrl()).toBe('postgresql://owner:pw@host/db');
    });

    it('treats a blank APP_DATABASE_URL as unset and falls back', async () => {
      process.env.APP_DATABASE_URL = '   ';
      process.env.DATABASE_URL = 'postgresql://owner:pw@host/db';
      const { getRuntimeDatabaseUrl } = await loadModule();
      expect(getRuntimeDatabaseUrl()).toBe('postgresql://owner:pw@host/db');
    });

    it('cleans the APP_DATABASE_URL (strips psql wrapper / channel_binding) like the owner url', async () => {
      process.env.APP_DATABASE_URL =
        "psql 'postgresql://app_service:pw@host/db?sslmode=require&channel_binding=require'";
      const { getRuntimeDatabaseUrl } = await loadModule();
      expect(getRuntimeDatabaseUrl()).toBe(
        'postgresql://app_service:pw@host/db?sslmode=require',
      );
    });

    it('returns undefined when neither runtime nor owner url is set', async () => {
      const { getRuntimeDatabaseUrl } = await loadModule();
      expect(getRuntimeDatabaseUrl()).toBeUndefined();
    });
  });
});
