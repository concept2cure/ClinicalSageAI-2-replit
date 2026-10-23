// @vitest-environment jsdom
/**
 * The dev-login buttons sign in as the configured dev identity, or are not shown.
 *
 * Until 2026-10-15 both "Demo Access" buttons (ZenLogin, Concept2CureLogin)
 * posted one specific person's personal gmail address to /api/auth/dev-login.
 * The dev database seeds an account only when DEMO_USER_EMAIL names it, so the
 * identity is configuration: the client reads VITE_DEV_LOGIN_EMAIL and, with
 * none configured, offers no button.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('wouter', () => ({ useLocation: () => ['/concept2cure/login', vi.fn()] }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));
vi.mock('@/components/i18n/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));
vi.mock('@/services/portal/authService', () => ({
  authService: { adoptSession: vi.fn(), getUser: vi.fn(() => null), requestPasswordReset: vi.fn(), confirmPasswordReset: vi.fn() },
  useAuth: () => ({ login: vi.fn(), verifyMfa: vi.fn() }),
}));

import { Concept2CureLogin } from '../../components/concept2cure-auth/Concept2CureLogin';
import { ZenLogin } from '../ZenLogin';

const CASES = [
  ['Concept2CureLogin', () => render(<Concept2CureLogin />), /action\.demoAccess/],
  ['ZenLogin', () => render(<ZenLogin />), /Demo Access/],
] as const;

// jsdom has no ResizeObserver; ZenLogin's checkbox (Radix) needs one.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 403, json: async () => ({ success: false }) } as Response);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe.each(CASES)('%s dev login', (_name, mount, button) => {
  it('offers no dev-login button when no dev identity is configured', () => {
    vi.stubEnv('VITE_DEV_LOGIN_EMAIL', '');
    mount();
    expect(screen.queryByRole('button', { name: button })).toBeNull();
  });

  it('signs in as the configured dev identity', async () => {
    vi.stubEnv('VITE_DEV_LOGIN_EMAIL', 'dev-admin@local.test');
    mount();
    fireEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/dev-login');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'dev-admin@local.test' });
  });
});

it('no client login source carries a personal address', () => {
  for (const rel of ['client/src/concept2cure/auth/ZenLogin.tsx', 'client/src/concept2cure/components/concept2cure-auth/Concept2CureLogin.tsx']) {
    expect(readFileSync(path.resolve(process.cwd(), rel), 'utf8'), rel).not.toMatch(/@gmail\.com/);
  }
});
