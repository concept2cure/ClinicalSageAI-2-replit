// @vitest-environment jsdom
/**
 * QA 2026-10-08 (j9, finding 2): a wrong password showed "Session expired.
 * Please log in again." Every 401 was read as a session that might need a
 * refresh — including the sign-in's own refusal, which carries no session at
 * all — so the server's "Invalid credentials" never reached the page.
 *
 * A 401 is a session problem only when the request presented a session and the
 * server did not refuse the credential it was asked to check. A refusal of the
 * presented credential — a password (AUTH_001) or a verification code
 * (AUTH_004) — is returned as the server wrote it, with no refresh and no
 * sign-out. A real expiry still says expiry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService, AUTH_ERROR_CODES } from '../authService';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchSpy: ReturnType<typeof vi.spyOn>;
const urls = (): string[] => fetchSpy.mock.calls.map((c: unknown[]) => String(c[0]));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

/** A service holding a live session (access + refresh token), as after a sign-in. */
function signedIn(): AuthService {
  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  localStorage.setItem('trialsage_access_token', 'access-token-for-test');
  localStorage.setItem('trialsage_refresh_token', 'refresh-token-for-test');
  localStorage.setItem('trialsage_token_expiry', expiry);
  localStorage.setItem('trialsage_user', JSON.stringify({ id: '5', email: 'a@c2c.test', roles: ['member'] }));
  sessionStorage.setItem('trialsage_access_token', 'access-token-for-test');
  sessionStorage.setItem('trialsage_refresh_token', 'refresh-token-for-test');
  sessionStorage.setItem('trialsage_token_expiry', expiry);
  sessionStorage.setItem('trialsage_user', JSON.stringify({ id: '5', email: 'a@c2c.test', roles: ['member'] }));
  const svc = new AuthService('/api/v1/auth');
  expect(svc.isAuthenticated()).toBe(true);
  return svc;
}

describe('sign-in refusals are not session expiries', () => {
  it('a wrong password returns the server\'s refusal, and no refresh is attempted', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(401, { success: false, error: { code: 'AUTH_001', message: 'Invalid credentials' } }),
    );
    const svc = new AuthService('/api/v1/auth');
    const r = await svc.login({ email: 'someone@c2c.test', password: 'wrong-password' });

    expect(r.success).toBe(false);
    expect(r.error?.code).toBe('AUTH_001');
    expect(r.error?.message).toBe('Invalid credentials');
    expect(r.error?.message).not.toMatch(/Session expired/);
    expect(urls()).toEqual(['/api/v1/auth/login']);
  });

  it('a wrong password with a stale session in storage still says so, and does not end or refresh it', async () => {
    const svc = signedIn();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(401, { success: false, error: { code: 'AUTH_001', message: 'Invalid credentials' } }),
    );
    const r = await svc.login({ email: 'someone@c2c.test', password: 'wrong-password' });
    expect(r.error?.code).toBe('AUTH_001');
    expect(urls().some((u: string) => u.endsWith('/refresh'))).toBe(false);
  });
});

describe('a signed-in request whose credential check fails', () => {
  it('a wrong current password (401 AUTH_001) is the refusal, not an expiry, and the session stays', async () => {
    const svc = signedIn();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(401, { success: false, error: { code: 'AUTH_001', message: 'Current password is incorrect' } }),
    );
    const r = await svc.changePassword({ currentPassword: 'not-it', newPassword: 'Another-long-pass-1!' } as never);
    expect(r.error).toMatchObject({ code: 'AUTH_001', message: 'Current password is incorrect' });
    expect(urls().some((u: string) => u.endsWith('/refresh'))).toBe(false);
    expect(svc.isAuthenticated()).toBe(true);
  });

  it('a wrong verification code (401 AUTH_004) is the refusal, not an expiry', async () => {
    const svc = signedIn();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(401, { success: false, error: { code: 'AUTH_004', message: 'Invalid verification code' } }),
    );
    const r = await svc.api.post('/api/v1/auth/mfa/enable', { code: '000000' });
    expect(r.error).toMatchObject({ code: 'AUTH_004', message: 'Invalid verification code' });
    expect(urls().some((u: string) => u.endsWith('/refresh'))).toBe(false);
  });
});

describe('a real expiry still says expiry', () => {
  it('a signed-in request refused for its session, whose refresh also fails, is SESSION_EXPIRED', async () => {
    const svc = signedIn();
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(401, { error: { code: 'AUTH_006', message: 'Invalid or expired token' } }))
      .mockResolvedValueOnce(json(401, { error: { code: 'AUTH_006', message: 'Invalid refresh token' } }));
    const r = await svc.api.get('/api/concept2cure/projects');
    expect(r.error?.code).toBe(AUTH_ERROR_CODES.SESSION_EXPIRED);
    expect(r.error?.message).toBe('Session expired. Please log in again.');
    expect(urls()).toEqual(['/api/concept2cure/projects', '/api/v1/auth/refresh']);
  });
});
