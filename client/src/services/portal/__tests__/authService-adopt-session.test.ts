// @vitest-environment jsdom
/**
 * The sign-in page adopts a single sign-on session from the URL fragment
 * (IAM-18 item 6): the auth service checks the token against GET /session
 * before storing anything, keeps the session policy the probe reports, raises
 * `login`, and holds no refresh token for it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;
type Call = { url: string; init: FetchInit };
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

describe('guarded workspace adoption preserves the account recovery boundary', () => {
  it('checks the synchronous adoption disposition before storing or purging anything', async () => {
    const service = await load();
    service.setToken('old', account('1'), 'old-refresh', 3600);
    localStorage.setItem('dc::7::section', 'Recoverable draft');
    const disposition = vi.fn(() => false);
    expect(await service.adoptSession('sso-1', false, { userId: '7', organizationId: '42' }, disposition)).toBeNull();
    expect(disposition).toHaveBeenCalledOnce();
    expect(service.getUser()?.organizationId).toBe('1');
    expect(localStorage.getItem('trialsage_access_token')).toBe('old');
    expect(localStorage.getItem('dc::7::section')).toBe('Recoverable draft');
  });

  it.each(['0', '-1', '33::34', '9007199254740992'])('does not preserve drafts for an invalid account id %s', async id => {
    const service = await load();
    service.setToken('old', account('1', id), 'old-refresh', 3600);
    localStorage.setItem(`dc::${id}::section`, 'Invalid owner namespace');
    localStorage.setItem('dc::7::section', 'Different account');
    service.endSession(null, true);
    expect(Object.keys(localStorage).filter(key => key.startsWith('dc::'))).toEqual([]);
    expect(service.isAuthenticated()).toBe(false);
  });
});

beforeEach(() => {
  calls.length = 0;
  sessionStorage.clear();
  localStorage.clear();
  vi.resetModules();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: FetchInit) => {
      calls.push({ url, init });
      const auth = new Headers(init.headers).get('Authorization');
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
function deferredResponse() {
  let resolve!: (response: ReturnType<typeof jsonResponse>) => void;
  const promise = new Promise<ReturnType<typeof jsonResponse>>(finish => { resolve = finish; });
  return { promise, resolve };
}
const account = (organizationId: string, id = '7') => ({ id, email: 'alice@acme.test', organizationId, roles: ['manager'] });
const session = (organizationId: string, id = '7') => jsonResponse(200, { authenticated: true, user: account(organizationId, id), session: { idleMinutes: 30, lifetimeHours: 12 } });

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
    vi.stubGlobal('fetch', vi.fn((url: string, init: FetchInit) => url.endsWith('/refresh')
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

describe('deferred session adoption and account refresh', () => {
  it('does not let an old account read replace the adopted organization', async () => {
    const service = await load();
    service.setToken('old', account('1'), 'old-refresh', 3600);
    const late = deferredResponse();
    const previousFetch = fetch;
    vi.stubGlobal('fetch', vi.fn((url: string, init: FetchInit) => new Headers(init.headers).get('Authorization') === 'Bearer old'
      ? late.promise : previousFetch(url, init)));
    const updated = vi.fn();
    service.on('user_updated', updated);
    const refreshing = service.refreshUser();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(await service.adoptSession('sso-1')).toBeTruthy();
    late.resolve(session('1'));
    expect((await refreshing).success).toBe(false);
    expect(service.getUser()?.organizationId).toBe('42');
    expect(JSON.parse(localStorage.getItem('trialsage_user')!).organizationId).toBe('42');
    expect(updated).not.toHaveBeenCalled();
  });

  it('refuses account and policy refreshes begun while adoption is awaiting verification', async () => {
    const service = await load();
    service.setToken('old', account('1'), 'old-refresh', 3600);
    const probe = deferredResponse();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: FetchInit) => new Headers(init.headers).get('Authorization') === 'Bearer sso-1'
      ? probe.promise : Promise.resolve(session('1'))));
    const adopting = service.adoptSession('sso-1');
    const updated = vi.fn();
    service.on('user_updated', updated);
    expect((await service.refreshUser()).success).toBe(false);
    expect(await service.refreshToken()).toBe(false);
    expect(await service.refreshSessionPolicy()).toMatchObject({ idleMinutes: 15 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(updated).not.toHaveBeenCalled();
    probe.resolve(session('42'));
    expect(await adopting).toMatchObject({ organizationId: '42' });
  });
});

describe('an ended or replaced session invalidates its pending adoption', () => {
  it('does not complete an adoption after the browser session has ended', async () => {
    const service = await load();
    const probe = deferredResponse();
    vi.stubGlobal('fetch', vi.fn(() => probe.promise));
    const adopting = service.adoptSession('sso-1');
    service.endSession(null);
    probe.resolve(session('42'));
    expect(await adopting).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('trialsage_access_token')).toBeNull();
    expect(sessionStorage.getItem('trialsage_access_token')).toBeNull();
  });

  it('does not complete an adoption after logout has completed', async () => {
    const service = await load();
    service.setToken('old', account('1'), 'old-refresh', 3600);
    const probe = deferredResponse();
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/session') ? probe.promise : Promise.resolve(jsonResponse(200, { success: true }))));
    const adopting = service.adoptSession('sso-1');
    await service.logout();
    probe.resolve(session('42'));
    expect(await adopting).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('trialsage_access_token')).toBeNull();
    expect(sessionStorage.getItem('trialsage_access_token')).toBeNull();
  });

  it('does not let a deferred idle refusal for the old account end the adopted session', async () => {
    const service = await load();
    service.setToken('old', account('1'), 'old-refresh', 3600);
    const late = deferredResponse();
    const previousFetch = fetch;
    vi.stubGlobal('fetch', vi.fn((url: string, init: FetchInit) => new Headers(init.headers).get('Authorization') === 'Bearer old'
      ? late.promise : previousFetch(url, init)));
    const refreshing = service.refreshUser();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await service.adoptSession('sso-1');
    late.resolve(jsonResponse(401, { error: { code: 'SESSION_IDLE', message: 'Old session ended.' } }));
    expect((await refreshing).success).toBe(false);
    expect(service.getUser()?.organizationId).toBe('42');
    expect(await service.getValidAccessToken()).toBe('sso-1');
  });

  it('does not replace the adopted policy with a deferred previous-session policy', async () => {
    const service = await load();
    service.setToken('old', account('1'), 'old-refresh', 3600);
    const late = deferredResponse();
    const previousFetch = fetch;
    vi.stubGlobal('fetch', vi.fn((url: string, init: FetchInit) => new Headers(init.headers).get('Authorization') === 'Bearer old'
      ? late.promise : previousFetch(url, init)));
    const refreshing = service.refreshSessionPolicy();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await service.adoptSession('sso-1');
    late.resolve(jsonResponse(200, { authenticated: true, user: account('1'), session: { idleMinutes: 90, lifetimeHours: 1 } }));
    expect(await refreshing).toMatchObject({ idleMinutes: 30, lifetimeHours: 12 });
    expect(service.getSessionPolicy()).toMatchObject({ idleMinutes: 30, lifetimeHours: 12 });
  });

  it('does not complete an adoption after a different account has signed in', async () => {
    const service = await load();
    const probe = deferredResponse();
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/session') ? probe.promise : Promise.resolve(jsonResponse(200, {
      mfaRequired: false, accessToken: 'new-login', refreshToken: 'new-refresh', expiresIn: 3600, user: account('9', '8'),
    }))));
    const adopting = service.adoptSession('sso-1');
    expect((await service.login({ email: 'bob@acme.test', password: 'test-fixture-password' })).success).toBe(true);
    probe.resolve(session('42'));
    expect(await adopting).toBeNull();
    expect(service.getUser()).toMatchObject({ id: '8', organizationId: '9' });
    expect(await service.getValidAccessToken()).toBe('new-login');
  });

  it('keeps the newest of overlapping session adoption attempts', async () => {
    const service = await load();
    const older = deferredResponse();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: FetchInit) => new Headers(init.headers).get('Authorization') === 'Bearer first'
      ? older.promise : Promise.resolve(session('9'))));
    const first = service.adoptSession('first');
    expect(await service.adoptSession('second')).toMatchObject({ organizationId: '9' });
    older.resolve(session('42'));
    expect(await first).toBeNull();
    expect(service.getUser()?.organizationId).toBe('9');
    expect(await service.getValidAccessToken()).toBe('second');
  });
});
