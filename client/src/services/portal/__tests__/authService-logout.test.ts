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

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;
type Call = { url: string; init: FetchInit };
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
    vi.fn(async (url: string, init: FetchInit) => {
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

  /*
   * Plan P0-4b residual R7 (2026-10-01): the server ends every session only for
   * a live access token (signOutEverywhere answers 401 otherwise), and the
   * client discarded its answer, so a sign-out everywhere that ended nothing
   * looked like one that ended everything. This browser's session ends either
   * way; the answer now says whether the others did.
   */
  it('logout(true) says when the server did not end every session: a refusal is not swallowed', async () => {
    seedSession(new Date(Date.now() - 60 * 1000));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: FetchInit) => {
        calls.push({ url, init });
        return { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({ success: false }) };
      }),
    );
    const { AuthService } = await import('../authService');
    const svc = new AuthService('/api/v1/auth');

    const result = await svc.logout(true);

    expect(result).toEqual({ everySessionEnded: false });
    expect(localStorage.getItem(KEYS.refreshToken), 'this browser is signed out either way').toBeNull();
  });

  it('logout(true) says every session was ended when the server did', async () => {
    seedSession(new Date(Date.now() + 60 * 60 * 1000));
    const { AuthService } = await import('../authService');
    const svc = new AuthService('/api/v1/auth');

    expect(await svc.logout(true)).toEqual({ everySessionEnded: true });
  });

  it('logout() asks nothing of the other sessions', async () => {
    seedSession(new Date(Date.now() + 60 * 60 * 1000));
    const { AuthService } = await import('../authService');
    const svc = new AuthService('/api/v1/auth');

    expect(await svc.logout()).toEqual({ everySessionEnded: null });
  });
});

describe('logout keeps revocation bound to the session that requested it', () => {
  it('does not clear a replacement login after the original revocation response arrives', async () => {
    seedSession(new Date(Date.now() + 60 * 60 * 1000));
    let finish!: (response: ReturnType<typeof okJson>) => void;
    vi.stubGlobal('fetch', vi.fn((url: string, init: FetchInit) => {
      calls.push({ url, init });
      return new Promise(resolve => { finish = resolve; });
    }));
    const { AuthService } = await import('../authService');
    const svc = new AuthService('/api/v1/auth');
    const ended = vi.fn();
    svc.on('logout', ended);
    const signingOut = svc.logout();
    await vi.waitFor(() => expect(logoutCall()).toBeDefined());
    svc.setToken('replacement-access', { id: '9', organizationId: '7' }, 'replacement-refresh', 3600);
    finish(okJson({ success: true }));
    expect(await signingOut).toEqual({ everySessionEnded: null });
    expect((logoutCall()!.init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
    expect(bodyOf(logoutCall())).toEqual({ terminateAllSessions: false, refreshToken: 'refresh-1' });
    expect(localStorage.getItem(KEYS.accessToken)).toBe('replacement-access');
    expect(localStorage.getItem(KEYS.refreshToken)).toBe('replacement-refresh');
    expect(svc.getUser()).toMatchObject({ id: '9', organizationId: '7' });
    expect(ended).not.toHaveBeenCalled();
  });

  it('revokes the original pair if another login replaces it while its refresh is being settled', async () => {
    seedSession(new Date(Date.now() + 60 * 1000));
    let finish!: (response: ReturnType<typeof okJson>) => void;
    vi.stubGlobal('fetch', vi.fn((url: string, init: FetchInit) => {
      calls.push({ url, init });
      return url.endsWith('/refresh') ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(okJson({ success: true }));
    }));
    const { AuthService } = await import('../authService');
    const svc = new AuthService('/api/v1/auth');
    const signingOut = svc.logout();
    await vi.waitFor(() => expect(calls.some(call => call.url.endsWith('/refresh'))).toBe(true));
    svc.setToken('replacement-access', { id: '9', organizationId: '7' }, 'replacement-refresh', 3600);
    finish(okJson({ accessToken: 'late-old-access', refreshToken: 'late-old-refresh', expiresIn: 3600 }));
    await signingOut;
    expect((logoutCall()!.init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
    expect(bodyOf(logoutCall())).toEqual({ terminateAllSessions: false, refreshToken: 'refresh-1' });
    expect(localStorage.getItem(KEYS.accessToken)).toBe('replacement-access');
    expect(localStorage.getItem(KEYS.refreshToken)).toBe('replacement-refresh');
  });

  it('still revokes the settled rotated pair when the original session remains current', async () => {
    seedSession(new Date(Date.now() + 60 * 1000));
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: FetchInit) => {
      calls.push({ url, init });
      return url.endsWith('/refresh')
        ? okJson({ accessToken: 'settled-access', refreshToken: 'settled-refresh', expiresIn: 3600 })
        : okJson({ success: true });
    }));
    const { AuthService } = await import('../authService');
    const svc = new AuthService('/api/v1/auth');
    await svc.logout();
    expect((logoutCall()!.init.headers as Record<string, string>).Authorization).toBe('Bearer settled-access');
    expect(bodyOf(logoutCall())).toEqual({ terminateAllSessions: false, refreshToken: 'settled-refresh' });
    expect(localStorage.getItem(KEYS.accessToken)).toBeNull();
    expect(localStorage.getItem(KEYS.refreshToken)).toBeNull();
  });
});

describe('logout settles existing refresh and cancels an older pending adoption', () => {
  it('revokes the rotated pair returned by a refresh that began before logout', async () => {
    seedSession(new Date(Date.now() + 60 * 60 * 1000));
    let finish!: (response: ReturnType<typeof okJson>) => void;
    vi.stubGlobal('fetch', vi.fn((url: string, init: FetchInit) => {
      calls.push({ url, init });
      return url.endsWith('/refresh') ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(okJson({ success: true }));
    }));
    const { AuthService } = await import('../authService');
    const svc = new AuthService('/api/v1/auth');
    const refreshing = svc.refreshToken();
    await vi.waitFor(() => expect(calls.some(call => call.url.endsWith('/refresh'))).toBe(true));
    const signingOut = svc.logout();
    finish(okJson({ accessToken: 'settled-access', refreshToken: 'settled-refresh', expiresIn: 3600 }));
    await Promise.all([refreshing, signingOut]);
    expect((logoutCall()!.init.headers as Record<string, string>).Authorization).toBe('Bearer settled-access');
    expect(bodyOf(logoutCall())).toEqual({ terminateAllSessions: false, refreshToken: 'settled-refresh' });
    expect(svc.isAuthenticated()).toBe(false);
  });

  it('does not finish an earlier pending adoption while logout awaits its server answer', async () => {
    seedSession(new Date(Date.now() + 60 * 60 * 1000));
    let finishProbe!: (response: ReturnType<typeof okJson>) => void;
    let finishLogout!: (response: ReturnType<typeof okJson>) => void;
    vi.stubGlobal('fetch', vi.fn((url: string, init: FetchInit) => {
      calls.push({ url, init });
      return new Promise(resolve => { if (url.endsWith('/session')) finishProbe = resolve; else finishLogout = resolve; });
    }));
    const { AuthService } = await import('../authService');
    const svc = new AuthService('/api/v1/auth');
    const adopting = svc.adoptSession('earlier-handoff');
    const signingOut = svc.logout();
    await vi.waitFor(() => expect(logoutCall()).toBeDefined());
    finishProbe(okJson({ authenticated: true, user: { id: '1', organizationId: '55' }, session: {} }));
    expect(await adopting).toBeNull();
    finishLogout(okJson({ success: true }));
    await signingOut;
    expect(svc.isAuthenticated()).toBe(false);
    expect((logoutCall()!.init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
    expect(bodyOf(logoutCall()).refreshToken).toBe('refresh-1');
  });
});

describe('logout clears its credential session after same-session account metadata changes', () => {
  it('ends the same bearer after a newer role read replaces the user object while logout waits', async () => {
    seedSession(new Date(Date.now() + 60 * 60 * 1000));
    let finish!: (response: ReturnType<typeof okJson>) => void;
    vi.stubGlobal('fetch', vi.fn((url: string, init: FetchInit) => {
      calls.push({ url, init });
      if (url.endsWith('/logout')) return new Promise(resolve => { finish = resolve; });
      return Promise.resolve(okJson({ authenticated: true, user: {
        id: '1', email: 'u@example.com', organizationId: '2', roles: ['manager'], permissions: ['review'],
      }, session: { idleMinutes: 30, lifetimeHours: 12 } }));
    }));
    const { AuthService } = await import('../authService');
    const svc = new AuthService('/api/v1/auth');
    const ended = vi.fn();
    svc.on('logout', ended);
    const signingOut = svc.logout();
    await vi.waitFor(() => expect(logoutCall()).toBeDefined());
    const originalUser = svc.getUser();
    expect((await svc.refreshUser()).success).toBe(true);
    expect(svc.getUser()).not.toBe(originalUser);
    expect(svc.getUser()).toMatchObject({ id: '1', organizationId: '2', roles: ['manager'] });
    expect(localStorage.getItem(KEYS.accessToken)).toBe('access-1');
    expect(localStorage.getItem(KEYS.refreshToken)).toBe('refresh-1');
    finish(okJson({ success: true }));
    expect(await signingOut).toEqual({ everySessionEnded: null });
    expect((logoutCall()!.init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
    expect(bodyOf(logoutCall())).toEqual({ terminateAllSessions: false, refreshToken: 'refresh-1' });
    expect(svc.isAuthenticated()).toBe(false);
    expect(svc.getUser()).toBeNull();
    expect(localStorage.getItem(KEYS.accessToken)).toBeNull();
    expect(localStorage.getItem(KEYS.refreshToken)).toBeNull();
    expect(ended).toHaveBeenCalledOnce();
  });
});
