// @vitest-environment jsdom
/**
 * F06 (2026-10-14 audit): opening the actual signup verification URL must
 * reach VerifyEmail through ZenRouter before the protected UI-v2 fast path.
 * Keep the existing bootstrap and authenticated-session guards in place.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
  isBootstrapping: false,
}));
vi.mock('@/services/portal/authService', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => auth,
}));
vi.mock('../../auth', async () => ({
  ZenSignup: () => <div>Signup page</div>,
  ZenAuthLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  // Render the real verification component, including its token consumption.
  VerifyEmail: (await import('../../auth/VerifyEmail')).VerifyEmail,
}));
vi.mock('../../components/concept2cure-auth', () => ({ Concept2CureLogin: () => <div>Login page</div> }));
vi.mock('../../components/session/IdleSessionGuard', () => ({ IdleSessionGuard: () => null }));
vi.mock('../../v2/V2App', () => ({ default: () => <div>Authenticated app</div> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/i18n/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));

import { ZenRouter } from '../ZenRouter';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJ0eXBlIjoiZW1haWxfdmVyaWZpY2F0aW9uIn0.signature-part-long-enough';

beforeEach(() => {
  Object.assign(auth, { isAuthenticated: false, isLoading: false, isBootstrapping: false });
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  sessionStorage.clear();
});

describe('signup verification routing', () => {
  it.each(['#token=', '?token='])('an anonymous %s link reaches verification without signing in', async tokenPrefix => {
    window.history.replaceState(null, '', `/concept2cure/verify-email${tokenPrefix}${TOKEN}`);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"success":true}', { status: 200 }));

    render(<ZenRouter />);

    await screen.findByText('verifyEmail.done');
    expect(window.location.pathname).toBe('/concept2cure/verify-email');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    expect(screen.queryByText('Login page')).toBeNull();
    expect(screen.queryByText('Authenticated app')).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/auth/verify-email');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ token: TOKEN });
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of ['trialsage_access_token', 'trialsage_refresh_token', 'trialsage_user']) {
        expect(storage.getItem(key)).toBeNull();
      }
    }
  });

  it('waits for session bootstrap before consuming an anonymous verification token', async () => {
    auth.isBootstrapping = true;
    window.history.replaceState(null, '', `/concept2cure/verify-email#token=${TOKEN}`);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    const view = render(<ZenRouter />);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.location.hash).toBe(`#token=${TOKEN}`);
    expect(screen.queryByText('verifyEmail.done')).toBeNull();

    auth.isBootstrapping = false;
    view.rerender(<ZenRouter />);
    await screen.findByText('verifyEmail.done');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('an authenticated session redirects to the app without consuming another account verification token', async () => {
    auth.isAuthenticated = true;
    localStorage.setItem('trialsage_access_token', 'existing-session');
    window.history.replaceState(null, '', `/concept2cure/verify-email#token=${TOKEN}`);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<ZenRouter />);

    await waitFor(() => expect(window.location.pathname).toBe('/concept2cure'));
    await screen.findByText('Authenticated app');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('trialsage_access_token')).toBe('existing-session');
  });

  it('ordinary anonymous app navigation still requires sign-in and keeps its return URL', async () => {
    window.history.replaceState(null, '', '/concept2cure/vault?program=program-123');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<ZenRouter />);

    await screen.findByText('Login page');
    expect(window.location.pathname).toBe('/concept2cure/login');
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/concept2cure/vault?program=program-123');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
