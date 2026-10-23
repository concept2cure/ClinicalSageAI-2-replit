/**
 * The boot security self-test has no production opt-out (MR-08).
 *
 * startup/env.ts refuses SECURITY_SELF_TEST_NONBLOCKING=true at boot in
 * production (env-security-self-test-nonblocking-posture.test.ts). This pins
 * the gate itself: should anything reach runBootSecuritySelfTest in production
 * with the variable set, a critical failure still exits, and the message no
 * longer advertises the variable as an override.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/securityHealth', () => ({
  runSecuritySelfTest: async () => ({
    overall: 'failing',
    checks: [
      {
        name: 'clamav_connectivity',
        status: 'fail',
        critical: true,
        reason: 'CLAMAV_HOST not set: production refuses every upload (server/middleware/uploadSafety.ts)',
      },
    ],
  }),
}));

import { runBootSecuritySelfTest } from '../security-self-test';

const KEYS = ['NODE_ENV', 'SECURITY_SELF_TEST_NONBLOCKING'] as const;
let saved: Record<string, string | undefined> = {};
let exitSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]));
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as never);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('runBootSecuritySelfTest in production', () => {
  it('exits on a critical failure even with SECURITY_SELF_TEST_NONBLOCKING=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SECURITY_SELF_TEST_NONBLOCKING = 'true';
    await expect(runBootSecuritySelfTest({} as never)).rejects.toThrow(/process\.exit\(1\)/);
    expect(exitSpy).toHaveBeenCalledWith(1);
    const printed = errorSpy.mock.calls.flat().join('\n');
    expect(printed).toMatch(/clamav_connectivity/);
    expect(printed).not.toMatch(/SECURITY_SELF_TEST_NONBLOCKING/);
  });

  it('does not exit outside production', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SECURITY_SELF_TEST_NONBLOCKING;
    await expect(runBootSecuritySelfTest({} as never)).resolves.toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
