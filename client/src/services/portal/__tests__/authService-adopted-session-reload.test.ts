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
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { AuthService, AuthProvider, authService, useAuth } from '../authService';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  authService.endSession(null);
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  authService.endSession(null);
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

// The provider consumes the same auth service while a bootstrap response is still in flight.
const providerUser = (organizationId: string, id = '33') => ({ id, email: 'ada.rowe@c2c.test', firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', organizationId, organizationName: 'Fixture sponsor', roles: ['member'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false });
function SessionStatus() {
  const value = useAuth();
  return React.createElement('output', { 'data-testid': 'provider-session' }, `${value.user ? `${value.user.id}:${value.user.organizationId}:${value.user.roles.join(',')}` : 'signed-out'}|${value.isBootstrapping ? 'loading' : 'ready'}`);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const sessionResponse = (org: string, idleMinutes = 15) => json(200, { authenticated: true, user: providerUser(org), session: { idleMinutes, lifetimeHours: 12 } });
function mountProvider(fetcher: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>) {
  authService.setToken('bootstrap-old', providerUser('1'), 'bootstrap-old-refresh', 3600);
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(fetcher);
  const view = render(React.createElement(AuthProvider, { children: React.createElement(SessionStatus) }));
  return { request, view };
}
const providerState = () => screen.getByTestId('provider-session').textContent;
const authorization = (init?: Parameters<typeof fetch>[1]) => new Headers(init?.headers).get('Authorization');

describe('a deferred bootstrap cannot change a later verified session', () => {
  it('retains the adopted account and its session clocks after the old successful probe returns', async () => {
    const old = deferred<Response>();
    const { request } = mountProvider(async (_input, init) => authorization(init) === 'Bearer bootstrap-old' ? old.promise : sessionResponse('71', 30));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    await act(async () => { await authService.adoptSession('verified-new', false, { userId: '33', organizationId: '71' }); });
    await act(async () => { old.resolve(sessionResponse('1', 90)); });
    expect(providerState()).toBe('33:71:member|ready');
    expect(authService.getUser()?.organizationId).toBe('71');
    expect(authService.getSessionPolicy().idleMinutes).toBe(30);
    expect(request.mock.calls.some(([path]) => String(path).endsWith('/logout'))).toBe(false);
  });

  it.each([401, 403, 200])('ignores a stale %s refusal without revoking or ending the adopted session', async status => {
    const old = deferred<Response>();
    const { request } = mountProvider(async (_input, init) => authorization(init) === 'Bearer bootstrap-old' ? old.promise : sessionResponse('71', 30));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    await act(async () => { await authService.adoptSession('verified-new'); });
    await act(async () => { old.resolve(json(status, { authenticated: false, error: { code: 'SESSION_IDLE' } })); });
    expect(providerState()).toBe('33:71:member|ready');
    expect(authService.getUser()?.organizationId).toBe('71');
    expect(localStorage.getItem('trialsage_refresh_token')).toBeNull();
    expect(sessionStorage.getItem('trialsage_access_token')).toBe('verified-new');
    expect(request.mock.calls.some(([path]) => String(path).endsWith('/logout'))).toBe(false);
    expect(sessionStorage.getItem('trialsage_signout_reason')).toBeNull();
  });

  it.each(['server', 'network'])('does not restore the predecessor after a late %s failure', async outcome => {
    const old = deferred<Response>();
    const { request } = mountProvider(async () => old.promise);
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    act(() => { authService.setToken('replacement-login', providerUser('72', '34'), 'replacement-refresh', 3600); });
    await act(async () => { if (outcome === 'server') old.resolve(json(503, { error: 'Temporarily unavailable' })); else old.reject(new Error('Network failure')); });
    expect(providerState()).toBe('34:72:member|ready');
    expect(authService.getUser()).toMatchObject({ id: '34', organizationId: '72' });
    expect(localStorage.getItem('trialsage_access_token')).toBe('replacement-login');
  });

  it('ignores an expired probe after its provider has unmounted', async () => {
    const old = deferred<Response>();
    const { request, view } = mountProvider(async () => old.promise);
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => { old.resolve(json(401, { error: { code: 'SESSION_IDLE' } })); });
    expect(authService.getUser()?.organizationId).toBe('1');
    expect(localStorage.getItem('trialsage_access_token')).toBe('bootstrap-old');
    expect(request).toHaveBeenCalledOnce();
  });
});

describe('bootstrap checks ownership after response body decoding', () => {
  it('does not install old user data whose JSON decoding finishes after adoption', async () => {
    const body = deferred<unknown>();
    const old = sessionResponse('1');
    vi.spyOn(old, 'json').mockImplementation(() => body.promise);
    const { request } = mountProvider(async (_input, init) => authorization(init) === 'Bearer bootstrap-old' ? old : sessionResponse('71', 30));
    await waitFor(() => expect(old.json).toHaveBeenCalledOnce());
    await act(async () => { await authService.adoptSession('verified-new'); });
    await act(async () => { body.resolve({ authenticated: true, user: providerUser('1'), session: { idleMinutes: 90, lifetimeHours: 1 } }); });
    expect(providerState()).toBe('33:71:member|ready');
    expect(authService.getSessionPolicy().idleMinutes).toBe(30);
    expect(request.mock.calls.some(([path]) => String(path).endsWith('/logout'))).toBe(false);
  });

  it('does not expire a replacement login while an old refusal body is being decoded', async () => {
    const reason = deferred<unknown>();
    const old = json(401, { error: { code: 'SESSION_IDLE' } });
    const clone = json(401, { error: { code: 'SESSION_IDLE' } });
    vi.spyOn(clone, 'json').mockImplementation(() => reason.promise);
    vi.spyOn(old, 'clone').mockImplementation(() => clone);
    const { request } = mountProvider(async () => old);
    await waitFor(() => expect(old.clone).toHaveBeenCalledOnce());
    act(() => { authService.setToken('replacement-login', providerUser('72', '34'), 'replacement-refresh', 3600); });
    await act(async () => { reason.resolve({ error: { code: 'SESSION_IDLE' } }); });
    expect(providerState()).toBe('34:72:member|ready');
    expect(localStorage.getItem('trialsage_access_token')).toBe('replacement-login');
    expect(request).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem('trialsage_signout_reason')).toBeNull();
  });

  it('does not overwrite a newer account/role read for the same bearer', async () => {
    const old = deferred<Response>();
    let calls = 0;
    mountProvider(async () => ++calls === 1 ? old.promise : json(200, { authenticated: true, user: { ...providerUser('1'), roles: ['manager'] }, session: { idleMinutes: 30 } }));
    await waitFor(() => expect(calls).toBe(1));
    await act(async () => { await authService.refreshUser(); });
    await act(async () => { old.resolve(sessionResponse('1', 90)); });
    expect(providerState()).toBe('33:1:manager|ready');
    expect(authService.getSessionPolicy().idleMinutes).toBe(30);
  });
});

describe('current bootstrap outcomes retain the existing revocation and transient behavior', () => {
  it('revokes the current refused bearer and its stored refresh token', async () => {
    const { request } = mountProvider(async path => String(path).endsWith('/logout') ? json(200, { success: true }) : json(401, { error: { code: 'SESSION_IDLE' } }));
    await waitFor(() => expect(providerState()).toBe('signed-out|ready'));
    await waitFor(() => expect(authService.isAuthenticated()).toBe(false));
    const revoked = request.mock.calls.find(([path]) => String(path).endsWith('/logout'));
    expect(authorization(revoked?.[1])).toBe('Bearer bootstrap-old');
    expect(JSON.parse(String(revoked?.[1]?.body))).toEqual({ terminateAllSessions: false, refreshToken: 'bootstrap-old-refresh' });
    expect(sessionStorage.getItem('trialsage_signout_reason')).toBe('idle');
  });

  it.each(['server', 'network'])('keeps the original account on a current %s failure', async outcome => {
    mountProvider(async () => { if (outcome === 'network') throw new Error('Network failure'); return json(503, { error: 'Temporarily unavailable' }); });
    await waitFor(() => expect(providerState()).toBe('33:1:member|ready'));
    expect(authService.isAuthenticated()).toBe(true);
    expect(localStorage.getItem('trialsage_access_token')).toBe('bootstrap-old');
  });
});
