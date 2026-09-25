// @vitest-environment jsdom
/**
 * authService.logout() must name the refresh token it is ending.
 *
 * Security audit 2026-09-24, IAM-04: the client posted `{ terminateAllSessions }`
 * alone, and the server revokes the bearer plus `body.refreshToken`; the refresh
 * token (7 days) therefore survived every logout and could mint new sessions
 * from the same browser profile. The body now carries it, from memory when the
 * session is loaded and from storage when only the refresh token remains (an
 * access token past its expiry is never loaded into memory).
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

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => body,
});

function seedSession(expiresAt: Date) {
  localStorage.setItem(KEYS.accessToken, 'access-1');
  localStorage.setItem(KEYS.refreshToken, 'refresh-1');
  localStorage.setItem(KEYS.tokenExpiry, expiresAt.toISOString());
  localStorage.setItem(KEYS.user, JSON.stringify({ id: '1', email: 'u@example.com', organizationId: '2' }));
}

const logoutCall = () => calls.find(c => c.url.endsWith('/logout'));
const bodyOf = (c: Call | undefined) => JSON.parse(String(c?.init.body ?? '{}'));

beforeEach(() => {
  calls.length = 0;
  sessionStorage.clear();
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return okJson({ success: true });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authService.logout', () => {
  it('posts the refresh token of the loaded session with the bearer', async () => {
    seedSession(new Date(Date.now() + 60 * 60 * 1000));
    const { AuthService } = await import('../authService');
    const svc = new AuthService('/api/v1/auth');

    await svc.logout();

    const call = logoutCall();
    expect(call, 'no logout request was sent').toBeDefined();
    expect(call!.url).toBe('/api/v1/auth/logout');
    expect((call!.init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
    expect(bodyOf(call)).toEqual({ terminateAllSessions: false, refreshToken: 'refresh-1' });
    // The local session is gone either way.
    expect(localStorage.getItem(KEYS.refreshToken)).toBeNull();
    expect(localStorage.getItem(KEYS.accessToken)).toBeNull();
  });

  it('still posts the stored refresh token when the access token has lapsed and nothing is loaded in memory', async () => {
    // loadStoredAuth skips a session whose expiry has passed; the refresh token
    // in storage is nevertheless live for days.
    seedSession(new Date(Date.now() - 60 * 1000));
    const { AuthService } = await import('../authService');
    const svc = new AuthService('/api/v1/auth');

    await svc.logout(true);

    const call = logoutCall();
    expect(call, 'no logout request was sent').toBeDefined();
    expect(bodyOf(call)).toEqual({ terminateAllSessions: true, refreshToken: 'refresh-1' });
    expect(localStorage.getItem(KEYS.refreshToken)).toBeNull();
  });
});
