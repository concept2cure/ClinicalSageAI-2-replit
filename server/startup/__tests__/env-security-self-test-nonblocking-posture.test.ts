/**
 * Production refuses to boot with SECURITY_SELF_TEST_NONBLOCKING=true (MR-08).
 *
 * The boot security self-test (startup/security-self-test.ts) exits a
 * production process when a critical check fails: no virus scanner, a weak JWT
 * secret, a broken audit chain. SECURITY_SELF_TEST_NONBLOCKING=true skipped
 * that exit, so one environment line let production boot with every critical
 * self-test failure at once. Nothing in the repository sets it for production
 * (docs/evidence/MR-08/2026-10-18/stage-1/fix-round/nonblocking-grep.txt). It
 * is refused at boot like the other production-forbidden flags
 * (env.ts refuseForbiddenProductionPosture). Outside production it stays
 * accepted: there the self-test never blocks boot anyway.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL = { ...process.env };

function bootWith(env: Record<string, string | undefined>) {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL, {
    NODE_ENV: 'production',
    APP_DATABASE_URL: 'postgresql://app_service:y@localhost:5432/z',
    JWT_SECRET: 'test-jwt-secret-for-unit-tests-min-32-chars-long',
    ...env,
  });
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
}

describe('validateEnvironment — SECURITY_SELF_TEST_NONBLOCKING', () => {
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

  it.each(['true', 'TRUE', ' true '])('refuses it in production (%j), naming it', async value => {
    bootWith({ SECURITY_SELF_TEST_NONBLOCKING: value });
    const { validateEnvironment } = await import('../env');
    expect(() => validateEnvironment()).toThrow(/process\.exit\(1\)/);
    expect(errorSpy.mock.calls.flat().join('\n')).toMatch(/SECURITY_SELF_TEST_NONBLOCKING/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('boots in production when it is unset', async () => {
    bootWith({ SECURITY_SELF_TEST_NONBLOCKING: undefined });
    const { validateEnvironment } = await import('../env');
    expect(() => validateEnvironment()).not.toThrow();
  });

  it.each(['development', 'test', 'staging'])('is still accepted outside production (%s)', async nodeEnv => {
    bootWith({ NODE_ENV: nodeEnv, SECURITY_SELF_TEST_NONBLOCKING: 'true' });
    const { validateEnvironment } = await import('../env');
    expect(() => validateEnvironment()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
