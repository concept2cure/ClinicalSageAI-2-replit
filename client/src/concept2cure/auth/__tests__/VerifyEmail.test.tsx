// @vitest-environment jsdom
/**
 * The page the sign-up link opens (IAM-17, P1-2): the token is read from the
 * fragment, dropped from the address bar, and posted; the page says confirmed
 * or not, and offers a new link by address. It never stores a session.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ setLocation: vi.fn() }));
vi.mock('wouter', () => ({ useLocation: () => ['/concept2cure/verify-email', nav.setLocation] }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars?.email ? `${key}:${vars.email}` : key) }),
}));
vi.mock('@/components/i18n/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));

import { VerifyEmail, tokenFromLocation } from '../VerifyEmail';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJ0eXBlIjoiZW1haWxfdmVyaWZpY2F0aW9uIn0.signature-part-long-enough';

beforeEach(() => {
  nav.setLocation.mockClear();
  window.history.replaceState(null, '', `/concept2cure/verify-email#token=${encodeURIComponent(TOKEN)}`);
});
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  sessionStorage.clear();
});

describe('tokenFromLocation', () => {
  it('reads the fragment first, then the query, and refuses junk', () => {
    expect(tokenFromLocation(`#token=${TOKEN}`, '')).toBe(TOKEN);
    expect(tokenFromLocation('', `?token=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromLocation('#token=short', '')).toBeNull();
    expect(tokenFromLocation('#token=<script>alert(1)</script>aaaaaaaaaaaaaaaaaaaaa', '')).toBeNull();
    expect(tokenFromLocation('', '')).toBeNull();
  });
});

describe('VerifyEmail', () => {
  it('posts the fragment token, drops it from the address bar, and offers sign-in when the server confirms', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    render(<VerifyEmail />);
    expect(window.location.hash).toBe('');
    await waitFor(() => expect(screen.getByText('verifyEmail.done')).toBeTruthy());
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/verify-email');
    expect(JSON.parse(String(init.body))).toEqual({ token: TOKEN });
    expect(localStorage.getItem('token'), 'the page must not sign the person in').toBeNull();
    fireEvent.click(screen.getByText('verifyEmail.signIn'));
    expect(nav.setLocation).toHaveBeenCalledWith('/concept2cure/login');
  });

  it('when the server refuses, says so and lets the person request a new link by address', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"error":{"code":"AUTH_VERIFY_INVALID"}}', { status: 400 }))
      .mockResolvedValueOnce(new Response('{"success":true}', { status: 202 }));
    render(<VerifyEmail />);
    await waitFor(() => expect(screen.getByText('verifyEmail.failed')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('verifyEmail.emailLabel'), { target: { value: 'ada@example.test' } });
    await act(async () => {
      fireEvent.click(screen.getByText('verifyEmail.requestNew'));
    });
    await waitFor(() => expect(screen.getByText('verifyEmail.requested')).toBeTruthy());
    const [url, init] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/auth/resend-verification');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'ada@example.test' });
  });

  it('with no token in the address, asks for a new link without calling the server', async () => {
    window.history.replaceState(null, '', '/concept2cure/verify-email');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<VerifyEmail />);
    expect(screen.getByText('verifyEmail.failed')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
