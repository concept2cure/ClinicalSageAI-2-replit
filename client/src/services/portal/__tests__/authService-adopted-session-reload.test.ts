// @vitest-environment jsdom
/**
 * QA 2026-10-08 (j9, finding 3): a session adopted from a hand-off — self-serve
 * sign-up's, or single sign-on's — carries no refresh token. It was stored, but
 * the next page load refused to read it back (loadStoredAuth demanded a refresh
 * token), so a reload signed the new user out. On load the stored session is
 * re-validated with the server (GET /session) before the app trusts it; a
 * missing refresh token only means it cannot be refreshed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../authService';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('a session adopted from a hand-off', () => {
  it('is read back on the next load (persistent adoption)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(200, { authenticated: true, user: { id: '29', email: 'new@c2c.test', roles: ['admin'] }, session: {} }),
    );
    const first = new AuthService('/api/v1/auth');
    expect(await first.adoptSession('handoff-access-token', true)).not.toBeNull();

    const afterReload = new AuthService('/api/v1/auth');
    expect(afterReload.isAuthenticated()).toBe(true);
    expect(await afterReload.getValidAccessToken()).toBe('handoff-access-token');
    // It cannot be refreshed, and no refresh is attempted.
    expect(await afterReload.refreshToken()).toBe(false);
  });

  it('an expired stored session is still not read back', () => {
    localStorage.setItem('trialsage_access_token', 'old');
    localStorage.setItem('trialsage_refresh_token', '');
    localStorage.setItem('trialsage_token_expiry', new Date(Date.now() - 1000).toISOString());
    localStorage.setItem('trialsage_user', JSON.stringify({ id: '1' }));
    expect(new AuthService('/api/v1/auth').isAuthenticated()).toBe(false);
  });
});
