// @vitest-environment jsdom
/**
 * QA 2026-10-08 (j9, finding 9): Setup told administrators that MFA is "TOTP
 * via an authenticator app, enrolled by each member" — but no screen in the
 * product starts an authenticator enrolment (the server's /api/auth/mfa/setup
 * and /mfa/enable have no client caller), so no member can do what the page
 * says each member does. Until an enrolment screen existed the row said what
 * sign-in actually asks for: an emailed code, or an authenticator app for an
 * account that already has one.
 *
 * P-25 (2026-10-08): the account panel (v2/AccountPanel.tsx, opened from
 * Account in the shell's account menu) now enrols one. The row says where, and
 * no longer says enrolment is not offered — that sentence became false the day
 * the panel shipped (accountPanel.test.tsx pins the panel itself).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import { Setup } from '../surfaces/AdminSurfaces';

const Surface = Setup as unknown as React.ComponentType<Record<string, unknown>>;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 404, headers: { 'content-type': 'application/json' } })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Setup → Multi-factor authentication', () => {
  it('says what sign-in asks for, and where each person enrols an authenticator', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <Surface onAsk={() => {}} onNav={() => {}} segment="biotech" />
      </QueryClientProvider>,
    );
    const row = await waitFor(() => {
      const found = Array.from(view.container.querySelectorAll('.txw-row')).find((r) => /Multi-factor authentication/.test(r.textContent || ''));
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    expect(row.textContent).not.toMatch(/enrolled by each member/);
    expect(row.textContent).toMatch(/emailed code/);
    expect(row.textContent).not.toMatch(/not offered in this product/);
    expect(row.textContent).toMatch(/Account in the account menu/);
  });
});
