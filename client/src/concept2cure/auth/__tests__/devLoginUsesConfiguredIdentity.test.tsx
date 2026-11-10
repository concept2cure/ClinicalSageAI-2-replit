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
import { verifyDemoAccessReadiness } from '../redirectUtils';

const CASES = [
  ['Concept2CureLogin', () => render(<Concept2CureLogin />), /action\.demoAccess/],
  ['ZenLogin', () => render(<ZenLogin />), /Demo Access/],
] as const;

// jsdom has no ResizeObserver; ZenLogin's checkbox (Radix) needs one.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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

/* F1 demo readiness: neither login view may imply a prepared demonstration
   just because the development-only endpoint returned a bearer. */
const DEMO_ACCOUNT = {
  id: '17', email: 'dev-admin@local.test',
  organizationId: '42', organizationName: 'Faux Biotech Therapeutics',
  roles: ['admin'],
};
const jsonReply = (data: unknown, ok = true) => ({
  ok, status: ok ? 200 : 403, json: async () => data,
}) as Response;
const verifiedSession = () => ({ authenticated: true, user: DEMO_ACCOUNT });
const demoBoard = () => ({ data: [], meta: { partial: false, unreadSources: [] } });

function stubDemoReads(
  change: {
    session?: unknown; projects?: unknown; board?: unknown;
    failingPath?: string;
  } = {},
) {
  fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === '/api/auth/session') return jsonReply(change.session ?? verifiedSession());
    if (path === '/api/c2c/projects?limit=1') return jsonReply(change.projects ?? { data: [{ id: 'p-1' }], meta: {} });
    if (path === '/api/task-management/board') return jsonReply(change.board ?? demoBoard());
    return jsonReply({}, false);
  });
}

describe('Demo Access verifies the existing authenticated destinations before storing credentials', () => {
  it('accepts an existing populated, fully readable demonstration', async () => {
    stubDemoReads();
    const result = await verifyDemoAccessReadiness('test-access', DEMO_ACCOUNT, 'DEV-ADMIN@LOCAL.TEST');
    expect(result).toEqual({ ready: true });
    expect(fetchSpy.mock.calls.map((args: unknown[]) => String(args[0]))).toEqual([
      '/api/auth/session', '/api/c2c/projects?limit=1', '/api/task-management/board',
    ]);
    for (const [, options] of fetchSpy.mock.calls) {
      const headers = (options as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test-access');
      expect(headers['x-organization-id']).toBe('42');
      expect((options as RequestInit).method).toBe('GET');
    }
  });

  it('refuses an unspecified or mismatched account before any read', async () => {
    for (const account of [null, { ...DEMO_ACCOUNT, organizationId: '' },
      { ...DEMO_ACCOUNT, organizationId: 'not-an-id' },
      { ...DEMO_ACCOUNT, email: 'another@example.test' }]) {
      expect((await verifyDemoAccessReadiness('test-access', account, 'dev-admin@local.test')).ready).toBe(false);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses an authenticated session from another organization', async () => {
    stubDemoReads({ session: { authenticated: true, user: { ...DEMO_ACCOUNT, organizationId: '84' } } });
    const result = await verifyDemoAccessReadiness('test-access', DEMO_ACCOUNT, DEMO_ACCOUNT.email);
    expect(result.ready).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refuses an account with no recorded organization name', async () => {
    stubDemoReads({ session: { authenticated: true, user: { ...DEMO_ACCOUNT, organizationName: null } } });
    expect((await verifyDemoAccessReadiness('test-access', DEMO_ACCOUNT, DEMO_ACCOUNT.email)).ready).toBe(false);
  });

  it.each([
    ['empty project list', { data: [], meta: { hasMore: false } }],
    ['unprovisioned project store', { data: [], meta: { pendingStore: true } }],
    ['unreconciled project access', { data: [], meta: { reconciliationRequired: true } }],
    ['malformed list', { data: null }],
  ])('refuses %s instead of showing a blank demonstration', async (_name, projects) => {
    stubDemoReads({ projects });
    const result = await verifyDemoAccessReadiness('test-access', DEMO_ACCOUNT, DEMO_ACCOUNT.email);
    expect(result.ready).toBe(false);
    expect(fetchSpy.mock.calls.map((args: unknown[]) => String(args[0]))).not.toContain('/api/task-management/board');
  });

  it.each([
    ['partial board', { data: [], meta: { partial: true, unreadSources: [] } }],
    ['unread task store', { data: [], meta: { partial: false, unreadSources: ['unified_tasks'] } }],
    ['malformed board', { data: null, meta: { partial: false, unreadSources: [] } }],
  ])('refuses %s before redirecting', async (_name, board) => {
    stubDemoReads({ board });
    expect((await verifyDemoAccessReadiness('test-access', DEMO_ACCOUNT, DEMO_ACCOUNT.email)).ready).toBe(false);
  });

  it('refuses failed or unreachable APIs without claiming readiness', async () => {
    fetchSpy.mockResolvedValue(jsonReply({}, false));
    expect((await verifyDemoAccessReadiness('test-access', DEMO_ACCOUNT, DEMO_ACCOUNT.email)).ready).toBe(false);
    fetchSpy.mockRejectedValue(new Error('offline'));
    expect((await verifyDemoAccessReadiness('test-access', DEMO_ACCOUNT, DEMO_ACCOUNT.email)).ready).toBe(false);
  });
});

describe.each(CASES)('%s unprepared demo', (_name, mount, button) => {
  it('does not persist a bearer when there is no accessible project', async () => {
    vi.stubEnv('VITE_DEV_LOGIN_EMAIL', DEMO_ACCOUNT.email);
    fetchSpy.mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url) === '/api/auth/dev-login') {
        return jsonReply({ success: true, accessToken: 'test-access',
          refreshToken: 'test-refresh', user: DEMO_ACCOUNT });
      }
      if (String(url) === '/api/auth/session') return jsonReply(verifiedSession());
      if (String(url) === '/api/c2c/projects?limit=1') return jsonReply({ data: [], meta: { hasMore: false } });
      return jsonReply({}, false);
    });
    mount();
    fireEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(screen.getByText(/no accessible demo project/i)).toBeTruthy());
    expect(localStorage.getItem('trialsage_access_token')).toBeNull();
    expect(sessionStorage.getItem('trialsage_access_token')).toBeNull();
    expect(fetchSpy.mock.calls.map((args: unknown[]) => String(args[0]))).toEqual([
      '/api/auth/dev-login', '/api/auth/session', '/api/c2c/projects?limit=1',
    ]);
  });
});

/* "Demo access" with a choice of demo people (2026-11-10, DemoAccounts.tsx): the live login screen only. */
describe('Concept2CureLogin demo people', () => {
  const ACCOUNTS = 'lead@demo.example|Lena Lead|Acme Bio (demo)|Lead and author;'
    + 'rev@demo.example|Rex Reviewer|Acme Bio (demo)|Reviewer;'
    + 'mon@other.example|Mo Monitor|Other Org|Clinical monitor';

  it('offers no choice for a single configured identity', () => {
    vi.stubEnv('VITE_DEV_LOGIN_EMAIL', 'dev-admin@local.test');
    vi.stubEnv('VITE_DEMO_ACCOUNTS', '');
    render(<Concept2CureLogin />);
    expect(screen.queryByRole('combobox', { name: 'Demo person' })).toBeNull();
  });

  it('lists the people by organisation and role, and signs in as the one chosen', async () => {
    vi.stubEnv('VITE_DEV_LOGIN_EMAIL', 'lead@demo.example');
    vi.stubEnv('VITE_DEMO_ACCOUNTS', ACCOUNTS);
    render(<Concept2CureLogin />);
    const pick = screen.getByRole('combobox', { name: 'Demo person' }) as HTMLSelectElement;
    expect(pick.value).toBe('lead@demo.example');
    expect(screen.getByRole('option', { name: 'Mo Monitor — Clinical monitor' })).toBeTruthy();
    expect(pick.querySelectorAll('optgroup')).toHaveLength(2);
    fireEvent.change(pick, { target: { value: 'mon@other.example' } });
    fireEvent.click(screen.getByRole('button', { name: /action\.demoAccess/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/dev-login');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'mon@other.example' });
  });

  it('skips a malformed entry rather than guessing', async () => {
    const { parseDemoAccounts } = await import('../../components/concept2cure-auth/DemoAccounts');
    expect(parseDemoAccounts('not-an-email|X|Y|Z;ok@a.example|Ok||;ok@a.example|Dup||').map((a) => a.email)).toEqual(['ok@a.example']);
  });
});
