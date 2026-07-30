/**
 * Tier 5 (browser workflow) proof: a real Chromium boots the real SPA, carries a
 * real auth session, passes `ProtectedRoute`, and renders authenticated-only
 * surfaces served by the live server.
 *
 * Why this is proof and not theater:
 *   - The session is produced by the SAME flow the client uses (dev-login →
 *     /api/v1/auth/session → the four `trialsage_*` storage keys), not by mocked
 *     network responses. If auth, CORS/CSRF, the router guard, or the surface
 *     render regressed, this goes red.
 *   - The negative control navigates the SAME protected route with NO session and
 *     asserts the guard bounces it to /login. That pins the positive test's
 *     meaning: it can only pass because the guard let an authenticated user
 *     through — not because the guard is missing or the route is public.
 *
 * Surfaces asserted are stable and authenticated-gated (they do NOT depend on any
 * beta/demo fixture): the landing greeting `<h1>` (Surfaces.tsx) and the Projects
 * `<h1>` (Projects.tsx).
 *
 * Run against a live dev server (NODE_ENV=development, ALLOW_DEV_AUTH=1):
 *   BASE_URL=http://127.0.0.1:5000 npx playwright test authenticated-app-smoke
 * or via the boot-and-run recipe: `npm run test:e2e:smoke`.
 */

import { test, expect } from '@playwright/test';
import { authenticateViaDevLogin } from './dev-auth-helper';

const GREETING = /Good (morning|afternoon|evening), JM/;

// Cold-boot tolerance: a freshly-booted dev server compiles each route's module
// graph on first navigation (Vite on-demand), which pushes the first authenticated
// paint well past the default 15s — the heavy SPA takes ~30s even warm. These
// budgets absorb a cold compile so the proof is deterministic whether the server
// was just booted (npm run test:e2e:smoke) or already warm.
const FIRST_PAINT_TIMEOUT = 90_000; // first protected navigation: cold compile + SPA boot
const WARM_NAV_TIMEOUT = 30_000; // subsequent navigations: modules already compiled

test.describe('Tier 5 — authenticated app smoke (live server)', () => {
  test('an authenticated session renders protected surfaces (landing + projects)', async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(180_000); // two heavy protected navigations, cold-boot tolerant
    if (!baseURL) throw new Error('baseURL is required (set BASE_URL for the live server)');

    // Real session, applied before first paint via addInitScript.
    const { organizationId } = await authenticateViaDevLogin(page, baseURL);
    expect(organizationId, 'dev-login should resolve the seeded org').toBeTruthy();

    // Landing: the authenticated greeting <h1>. If auth/guard regressed we'd be on /login.
    await page.goto('/concept2cure', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText(GREETING, { timeout: FIRST_PAINT_TIMEOUT });
    expect(new URL(page.url()).pathname, 'must not be bounced to login').not.toContain('/login');

    // Projects: a distinct protected surface, proving the session carries across routes.
    await page.goto('/concept2cure/projects', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible({
      timeout: WARM_NAV_TIMEOUT,
    });
    expect(new URL(page.url()).pathname).not.toContain('/login');
  });

  test('negative control: the SAME protected route bounces an unauthenticated visitor to /login', async ({
    page,
  }) => {
    test.setTimeout(120_000); // cold-boot tolerant
    // No authenticateViaDevLogin() — a clean context. The guard must bite.
    await page.goto('/concept2cure/projects', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/concept2cure\/login/, { timeout: WARM_NAV_TIMEOUT });
    expect(page.url()).toContain('/concept2cure/login');
    // The Projects heading must NOT be present when unauthenticated.
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toHaveCount(0);
  });
});
