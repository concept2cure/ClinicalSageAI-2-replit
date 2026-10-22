/**
 * A production process starts with the runtime role's URL alone (MR-03 Stage 3,
 * OPS-16; MR-05 Stage 2, DATA-03).
 *
 * Production required DATABASE_URL, the RDS master credential: the boot ran
 * schema DDL and seeds on it, so the API task carried the role that owns every
 * table and bypasses RLS. The schema is now the deploy's, and the boot only
 * verifies it on the runtime role, so production requires APP_DATABASE_URL
 * (NOSUPERUSER NOBYPASSRLS) and nothing else. Outside production any one
 * database URL still does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The requirement is checked against the environment the test sets, not a
// developer's `.env`, which server/config/load-env-files would otherwise read
// into every key this test removes.
vi.mock('../../config/load-env-files', () => ({ ENV_FILES: [] }));

const ORIGINAL = { ...process.env };

function bootWith(env: Record<string, string>) {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL, {
    NODE_ENV: 'production',
    JWT_SECRET: 'test-jwt-secret-for-unit-tests-min-32-chars-long',
  });
  // Deleted, not assigned undefined: process.env stores that as the string "undefined".
  for (const k of ['DATABASE_URL', 'DATABASE_NEON_NEW_SECRET', 'APP_DATABASE_URL']) delete process.env[k];
  Object.assign(process.env, env);
}

describe('validateEnvironment — the database URL a process needs', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, ORIGINAL);
  });

  it('production starts with APP_DATABASE_URL and no owner URL', async () => {
    bootWith({ APP_DATABASE_URL: 'postgresql://app_service:pw@db:5432/app?sslmode=verify-full' });
    const { validateEnvironment } = await import('../env');
    expect(() => validateEnvironment()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('production refuses to start without APP_DATABASE_URL, even with the owner URL', async () => {
    bootWith({ DATABASE_URL: 'postgresql://owner:pw@db:5432/app?sslmode=verify-full' });
    const { validateEnvironment } = await import('../env');
    expect(() => validateEnvironment()).toThrow(/process\.exit\(1\)/);
    expect(errorSpy.mock.calls.flat().join('\n')).toMatch(/APP_DATABASE_URL/);
  });

  it.each([
    ['DATABASE_URL', 'postgresql://dev:pw@localhost:5432/dev'],
    ['APP_DATABASE_URL', 'postgresql://app_service:pw@localhost:5432/dev'],
  ])('outside production, %s alone is enough', async (name, url) => {
    bootWith({ NODE_ENV: 'development', [name]: url });
    const { validateEnvironment } = await import('../env');
    expect(() => validateEnvironment()).not.toThrow();
  });

  it('outside production, no database URL at all is still refused', async () => {
    bootWith({ NODE_ENV: 'development' });
    const { validateEnvironment } = await import('../env');
    expect(() => validateEnvironment()).toThrow(/process\.exit\(1\)/);
  });
});
