/**
 * Production refuses to boot with AUTH_BOUNDARY_MODE=warn.
 *
 * `warn` mode logs an unauthenticated request and lets it through; it exists
 * for the staging soak. In production the /api boundary is default-deny, and a
 * single environment variable must not be able to turn that off with an info
 * log (security audit 2026-09-24, IAM-16). The forbidden dev-route flags are
 * refused at boot in the same function; this test pins the same treatment for
 * the boundary mode.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL = { ...process.env };

function bootWith(env: Record<string, string | undefined>) {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL, {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
    JWT_SECRET: 'test-jwt-secret-for-unit-tests-min-32-chars-long',
    ...env,
  });
}

describe('validateEnvironment — auth boundary posture in production', () => {
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

  it('refuses AUTH_BOUNDARY_MODE=warn', async () => {
    bootWith({ AUTH_BOUNDARY_MODE: 'warn' });
    const { validateEnvironment } = await import('../env');
    expect(() => validateEnvironment()).toThrow(/process\.exit\(1\)/);
    expect(errorSpy.mock.calls.flat().join('\n')).toMatch(/AUTH_BOUNDARY_MODE/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('boots with AUTH_BOUNDARY_MODE=enforce and when the variable is unset', async () => {
    bootWith({ AUTH_BOUNDARY_MODE: 'enforce' });
    const mod = await import('../env');
    expect(() => mod.validateEnvironment()).not.toThrow();
    bootWith({ AUTH_BOUNDARY_MODE: undefined });
    delete process.env.AUTH_BOUNDARY_MODE;
    vi.resetModules();
    const mod2 = await import('../env');
    expect(() => mod2.validateEnvironment()).not.toThrow();
  });
});
