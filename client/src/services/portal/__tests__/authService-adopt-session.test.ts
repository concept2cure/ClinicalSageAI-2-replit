// @vitest-environment jsdom
/**
 * The sign-in page adopts a single sign-on session from the URL fragment
 * (IAM-18 item 6): the auth service checks the token against GET /session
 * before storing anything, keeps the session policy the probe reports, raises
 * `login`, and holds no refresh token for it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeEach(() => {
  calls.length = 0;
  sessionStorage.clear();
  localStorage.clear();
  vi.resetModules();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const auth = new Headers(init.headers as HeadersInit).get('Authorization');
      if (url.endsWith('/api/v1/auth/session')) {
        return auth === 'Bearer sso-1'
          ? jsonResponse(200, { authenticated: true, user: { id: '7', email: 'alice@acme.test', organizationId: '42', roles: ['manager'] }, session: { idleMinutes: 30, lifetimeHours: 12, expiresAt: '2026-09-26T21:00:00.000Z' } })
          : jsonResponse(401, { authenticated: false, error: { code: 'AUTH_006' } });
      }
      return jsonResponse(200, { success: true });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const load = async () => (await import('../authService')).authService;

describe('authService.adoptSession', () => {
  it('adopts a session the server confirms: stored, policy kept, login raised, no refresh token', async () => {
    const authService = await load();
    const logins: unknown[] = [];
    authService.on('login', e => logins.push(e.data));

    const user = await authService.adoptSession('sso-1', true);

    expect(user?.email).toBe('alice@acme.test');
    expect(authService.isAuthenticated()).toBe(true);
    expect(localStorage.getItem('trialsage_access_token')).toBe('sso-1');
    expect(localStorage.getItem('trialsage_refresh_token')).toBe('');
    expect(authService.getSessionPolicy()).toEqual({ idleMinutes: 30, lifetimeHours: 12, expiresAt: '2026-09-26T21:00:00.000Z', sessionId: null });
    expect(logins).toHaveLength(1);
    expect(calls.some(c => c.url.endsWith('/refresh'))).toBe(false);
  });

  it('adopts nothing the server refuses', async () => {
    const authService = await load();
    expect(await authService.adoptSession('forged', true)).toBeNull();
    expect(authService.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('trialsage_access_token')).toBeNull();
    expect(sessionStorage.getItem('trialsage_access_token')).toBeNull();
  });

  it('removes previous credentials from both storage tiers after a verified workspace adoption', async () => {
    const authService = await load();
    authService.setToken('old-organization-access', { id: '7', organizationId: '1' }, 'old-organization-refresh', 3600);
    sessionStorage.setItem('trialsage_access_token', 'older-tab-access');
    sessionStorage.setItem('trialsage_refresh_token', 'older-tab-refresh');
    for (const storage of [sessionStorage, localStorage]) {
      storage.setItem('token', 'old-legacy-access');
      storage.setItem('auth_token', 'older-legacy-access');
    }

    expect(await authService.adoptSession('sso-1', false, { userId: '7', organizationId: '42' })).toMatchObject({ id: '7', organizationId: '42' });
    expect(sessionStorage.getItem('trialsage_access_token')).toBe('sso-1');
    expect(sessionStorage.getItem('trialsage_refresh_token')).toBe('');
    expect(localStorage.getItem('trialsage_access_token')).toBeNull();
    expect(localStorage.getItem('trialsage_refresh_token')).toBeNull();
    for (const storage of [sessionStorage, localStorage]) {
      expect(storage.getItem('token')).toBeNull();
      expect(storage.getItem('auth_token')).toBeNull();
    }
    expect(localStorage.getItem('currentOrganizationId')).toBe('42');
    expect(await authService.refreshToken()).toBe(false);
  });

  it('does not adopt a confirmed token for the wrong selected organization or account', async () => {
    const authService = await load();
    authService.setToken('old-organization-access', { id: '7', organizationId: '1' }, 'old-organization-refresh', 3600);
    expect(await authService.adoptSession('sso-1', false, { userId: '7', organizationId: '43' })).toBeNull();
    expect(await authService.adoptSession('sso-1', false, { userId: '8', organizationId: '42' })).toBeNull();
    expect(authService.getUser()).toMatchObject({ id: '7', organizationId: '1' });
    expect(localStorage.getItem('trialsage_access_token')).toBe('old-organization-access');
  });

  it('an old workspace refresh completing after adoption cannot replace the newly verified session', async () => {
    const authService = await load();
    authService.setToken('old-organization-access', { id: '7', organizationId: '1' }, 'old-organization-refresh', 3600);
    let finish!: (response: ReturnType<typeof jsonResponse>) => void;
    const previousFetch = fetch;
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => url.endsWith('/refresh')
      ? new Promise(resolve => { finish = resolve; })
      : previousFetch(url, init)));
    const refreshing = authService.refreshToken();
    expect(await authService.adoptSession('sso-1', false, { userId: '7', organizationId: '42' })).toBeTruthy();
    finish(jsonResponse(200, { accessToken: 'late-old-access', refreshToken: 'late-old-refresh', expiresIn: 3600 }));
    expect(await refreshing).toBe(false);
    expect(await authService.getValidAccessToken()).toBe('sso-1');
    expect(sessionStorage.getItem('trialsage_access_token')).toBe('sso-1');
    expect(localStorage.getItem('trialsage_refresh_token')).toBeNull();
  });
});
