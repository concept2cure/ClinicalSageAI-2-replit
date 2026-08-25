/**
 * Dev-auth helper for browser E2E (Tier 5 of the proof hierarchy).
 *
 * The app's surfaces sit behind `ProtectedRoute`, so a browser test that just
 * navigates to a page is bounced to /login and proves nothing. This helper
 * authenticates a Playwright context the way the client itself does — WITHOUT a
 * password — using the hard-gated dev-login endpoint:
 *
 *   1. POST /api/auth/dev-login { email }  (only works when the server runs with
 *      NODE_ENV=development AND ALLOW_DEV_AUTH=1 — see server/auth/dev-auth-policy.ts;
 *      returns 404 otherwise, so it can never authenticate a real environment).
 *   2. GET /api/v1/auth/session validates that token and returns the canonical
 *      user object the client expects.
 *   3. Seed the four storage keys the client's `loadStoredAuth()` reads
 *      (server/../authService.tsx: trialsage_access_token / _refresh_token /
 *      _token_expiry / _user) via addInitScript, so on first paint the app
 *      bootstraps as an authenticated user.
 *
 * This is the same session the real login flow produces; the only shortcut is
 * skipping the password/MFA, which is exactly what dev-login is for.
 */

import type { Page } from '@playwright/test';

/** The user install-fresh / the default-org seed provisions (org-admin). */
export const DEFAULT_DEV_USER = 'jonmichaelpsmith@gmail.com';

interface DevLoginResponse {
  success?: boolean;
  accessToken?: string;
  refreshToken?: string;
  error?: { message?: string };
}

/**
 * Authenticate a Playwright page's context via dev-login. Call BEFORE the first
 * `page.goto` — the seeded storage is applied to every subsequent navigation.
 */
export async function authenticateViaDevLogin(
  page: Page,
  baseURL: string,
  email: string = DEFAULT_DEV_USER
): Promise<{ email: string; organizationId: string }> {
  const dl = (await (
    await fetch(`${baseURL}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseURL },
      body: JSON.stringify({ email }),
    })
  ).json()) as DevLoginResponse;

  if (!dl.accessToken || !dl.refreshToken) {
    throw new Error(
      `dev-login failed for ${email} (${dl.error?.message ?? 'no token'}). ` +
        'The server must run with NODE_ENV=development and ALLOW_DEV_AUTH=1.'
    );
  }

  const sess = (await (
    await fetch(`${baseURL}/api/v1/auth/session`, {
      headers: { Authorization: `Bearer ${dl.accessToken}`, Origin: baseURL },
    })
  ).json()) as { authenticated?: boolean; user?: { organizationId: string } };

  if (!sess.authenticated || !sess.user) {
    throw new Error('session validation failed after dev-login');
  }

  // Future expiry so loadStoredAuth() trusts the token (it drops expired sessions).
  const expiry = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();

  await page.context().addInitScript(
    ([token, refresh, exp, userJson]) => {
      for (const store of [window.localStorage, window.sessionStorage]) {
        store.setItem('trialsage_access_token', token);
        store.setItem('trialsage_refresh_token', refresh);
        store.setItem('trialsage_token_expiry', exp);
        store.setItem('trialsage_user', userJson);
      }
    },
    [dl.accessToken, dl.refreshToken, expiry, JSON.stringify(sess.user)] as const
  );

  return { email, organizationId: sess.user.organizationId };
}
