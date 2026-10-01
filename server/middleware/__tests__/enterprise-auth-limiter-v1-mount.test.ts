/**
 * The failures-only sign-in limit covers both paths the auth router is mounted
 * on (security audit 2026-09-24, IAM-09; plan P1-3).
 *
 * register-platform-routes.ts mounts the same authRouter at /api/auth and at
 * /api/v1/auth. applySecurityMiddleware mounted rateLimiters.auth on /api/auth
 * only, so POST /api/v1/auth/login was the same sign-in with no edge limit:
 * the per-address budget of five failures per fifteen minutes did not apply
 * to a client that added "/v1" to the path.
 */
import { describe, expect, it, vi } from 'vitest';
import { applySecurityMiddleware, rateLimiters } from '../enterprise-security';

function mountsRecordedBy(use: ReturnType<typeof vi.fn>): Array<[string, unknown]> {
  return use.mock.calls
    .filter((call) => typeof call[0] === 'string')
    .map((call) => [call[0] as string, call[1]]);
}

describe('applySecurityMiddleware: the sign-in limit', () => {
  it('is mounted on /api/auth and on /api/v1/auth, the two mounts of the auth router', () => {
    const use = vi.fn();
    const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      applySecurityMiddleware({ use });
    } finally {
      quiet.mockRestore();
    }
    const mounts = mountsRecordedBy(use);
    expect(mounts).toContainEqual(['/api/auth', rateLimiters.auth]);
    expect(mounts, 'the v1 mount of the auth router has no sign-in limit').toContainEqual(['/api/v1/auth', rateLimiters.auth]);
  });
});
