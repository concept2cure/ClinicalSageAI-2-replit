// @vitest-environment jsdom
/**
 * QA 2026-10-08 (j9, finding 9): Setup told administrators that MFA is "TOTP
 * via an authenticator app, enrolled by each member" — but no screen in the
 * product started an authenticator enrolment, so no member could do what the
 * page said each member does. Until an enrolment screen existed the row said
 * what sign-in actually asks for: an emailed code, or an authenticator app for
 * an account that already has one.
 *
 * P-25 (2026-10-08): the account panel (v2/AccountPanel.tsx, opened from
 * Account in the shell's account menu) now enrols one, and the row says where
 * (accountPanel.test.tsx pins the panel itself).
 *
 * Setup folded into Admin and access (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-setup/). Its Multi-factor row was
 * the same fact as the Settings tab's "Second factor at sign-in" row, which
 * GET /api/mdx/admin serves, so that row now carries the pointer and its
 * wording is pinned on the server (mdx-admin-facets.test.ts, "says where each
 * person sets up an authenticator app"). This pins that the Settings tab shows
 * the row's description, and offers no switch for it: the second factor is set
 * per person, not per organisation.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AdminAccess } from '../surfaces/AdminAccess';

const DESC =
  'Password sign-in asks for the authenticator app when one is enrolled, otherwise an emailed code. ' +
  'Each person sets up an authenticator app from Account in the account menu.';

const admin = {
  data: {
    kpis: [],
    members: [
      { id: 'u-1', initials: 'DR', name: 'Dana Reyes', email: 'dana@example.invalid', role: 'Admin', groups: [], sso: '', mfa: false, lastSeen: '', state: 'active', programs: [] },
    ],
    roles: [],
    grants: [],
    apiKeys: [],
    audit: [],
    settings: [{ id: 'mfa-required', label: 'Second factor at sign-in', kind: 'policy', value: 'Required for every member', desc: DESC }],
    sso: null,
  },
  meta: { count: 1, unavailable: [] },
};

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) =>
    new Response(JSON.stringify(method === 'GET' && url === '/api/mdx/admin' ? admin : {}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 404 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Settings → Second factor at sign-in', () => {
  it('says what sign-in asks for, and where each person enrols an authenticator', async () => {
    render(<AdminAccess surface={{ id: 'admin-console', label: 'Admin and access' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />);
    await screen.findAllByText('Dana Reyes');
    const tab = Array.from(document.querySelectorAll('.adm-tab')).find((b) => (b.textContent || '').includes('Settings'));
    fireEvent.click(tab as Element);
    const row = (await screen.findByText('Second factor at sign-in')).closest('.adm-setting') as HTMLElement;
    expect(row.textContent).toMatch(/emailed code/);
    expect(row.textContent).toMatch(/Account in the account menu/);
    expect(row.textContent).not.toMatch(/enrolled by each member/);
    expect(row.querySelector('button, [role="switch"], input')).toBeNull();
  });
});
