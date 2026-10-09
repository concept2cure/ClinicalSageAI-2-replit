// @vitest-environment jsdom
/**
 * The auth service's fetch wrapper ends the session on the server's
 * SESSION_IDLE / SESSION_LIFETIME answers instead of refreshing (P1-1).
 *
 * Until 2026-09-26 every 401 was answered with a refresh and a retry. The
 * refresh now refuses an idle or out-of-time session with the same code, so a
 * retry could only fail again; the wrapper clears the session at once, keeps
 * the reason for the sign-in page, and tells the provider through
 * `session_expired`. Same scaffold as authService-logout.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEYS = {
  accessToken: 'trialsage_access_token',
  refreshToken: 'trialsage_refresh_token',
  tokenExpiry: 'trialsage_token_expiry',
  user: 'trialsage_user',
} as const;

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];

const jsonResponse = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  statusText: String(status),
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: async () => body,
  text: async () => JSON.stringify(body),
  clone() {
    return jsonResponse(status, body);
  },
});

function seedSession() {
  localStorage.setItem(KEYS.accessToken, 'access-1');
  localStorage.setItem(KEYS.refreshToken, 'refresh-1');
  localStorage.setItem(KEYS.tokenExpiry, new Date(Date.now() + 60 * 60 * 1000).toISOString());
  localStorage.setItem(KEYS.user, JSON.stringify({ id: '1', email: 'u@example.com', organizationId: '2' }));
}

let answers: Record<string, () => unknown> = {};

beforeEach(() => {
  calls.length = 0;
  sessionStorage.clear();
  localStorage.clear();
  answers = {};
  vi.resetModules();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const key = Object.keys(answers).find(k => url.endsWith(k));
      return key ? answers[key]() : jsonResponse(200, { success: true });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const load = async () => (await import('../authService')).authService;

describe('the auth service on a session the server ended', () => {
  it('a 401 SESSION_IDLE on an API call ends the session: no refresh, storage cleared, reason kept, session_expired with the reason', async () => {
    seedSession();
    const authService = await load();
    const expired: unknown[] = [];
    authService.on('session_expired', e => expired.push(e.data));
    answers['/api/v1/auth/me'] = () => jsonResponse(401, { error: { code: 'SESSION_IDLE', message: 'Signed out after a period of inactivity. Sign in again.' } });

    const result = await authService.api.get('/api/v1/auth/me');

    expect(result.success).toBe(false);
    expect(calls.some(c => c.url.endsWith('/refresh')), 'an idle session was refreshed').toBe(false);
    expect(authService.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(KEYS.refreshToken)).toBeNull();
    expect(sessionStorage.getItem('trialsage_signout_reason')).toBe('idle');
    expect(expired).toEqual([{ reason: 'idle' }]);
  });

  it('a refresh refused with SESSION_LIFETIME keeps that reason', async () => {
    seedSession();
    const authService = await load();
    answers['/api/v1/auth/refresh'] = () => jsonResponse(401, { success: false, error: { code: 'SESSION_LIFETIME', message: 'This session reached its time limit. Sign in again.' } });

    expect(await authService.refreshToken()).toBe(false);
    expect(sessionStorage.getItem('trialsage_signout_reason')).toBe('lifetime');
    expect(authService.isAuthenticated()).toBe(false);
  });

  it('any other 401 still refreshes and retries', async () => {
    seedSession();
    const authService = await load();
    let first = true;
    answers['/api/v1/auth/me'] = () => {
      if (first) {
        first = false;
        return jsonResponse(401, { error: { code: 'AUTH_002', message: 'Invalid or expired token' } });
      }
      return jsonResponse(200, { ok: true });
    };
    answers['/api/v1/auth/refresh'] = () => jsonResponse(200, { success: true, accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 3600 });

    const result = await authService.api.get('/api/v1/auth/me');
    expect(result.success).toBe(true);
    expect(calls.some(c => c.url.endsWith('/refresh'))).toBe(true);
    expect(sessionStorage.getItem('trialsage_signout_reason')).toBeNull();
  });

  it('remembers the session policy the probe reports and defaults to 15 minutes and 12 hours', async () => {
    seedSession();
    const authService = await load();
    expect(authService.getSessionPolicy()).toMatchObject({ idleMinutes: 15, lifetimeHours: 12 });
    answers['/api/v1/auth/session'] = () => jsonResponse(200, { authenticated: true, user: { id: '1' }, session: { id: 's', idleMinutes: 30, lifetimeHours: 12, expiresAt: '2026-09-26T21:00:00.000Z' } });
    const policy = await authService.refreshSessionPolicy();
    expect(policy).toEqual({ idleMinutes: 30, lifetimeHours: 12, expiresAt: '2026-09-26T21:00:00.000Z' });
    expect(authService.getSessionPolicy()).toEqual(policy);
  });
});
