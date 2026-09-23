/**
 * OQ — access to the launch catalog is limited to an authenticated session.
 *
 * 21 CFR 11.10(d): "Limiting system access to authorized individuals." This is
 * the browser-tier evidence for that control across every surface of the six
 * launch applications (`shared/constants/launch-scope.ts`), executed by
 * `scripts/ops/generate-validation-package.mjs --run` and traced in
 * TM-LAUNCH-001.
 *
 * ── Why both halves are here ─────────────────────────────────────────────────
 * The positive case alone proves nothing about the guard: a surface with NO
 * guard at all renders just as happily for an authenticated user. It is the
 * negative control that gives the positive case its meaning — the same URL,
 * with no session, must come back to sign-in. Each surface is asserted both
 * ways, so neither result can be read on its own.
 *
 * ── What "rendered" is allowed to mean ───────────────────────────────────────
 * An earlier reconnaissance pass asserted rendering by reading `body.innerText`
 * a couple of seconds after navigation and concluded that nine launch surfaces
 * were blank. They were not: the heavy canvas-owning surfaces (`full: true` in
 * surfaceViews.ts) were still mounting, and every one of them turned out to
 * carry 23–39 KB of DOM and hundreds of nodes once given time. That very nearly
 * became a false finding in a validation document, which is the failure mode
 * this whole package exists to avoid.
 *
 * So this spec waits for a DOM-node threshold rather than for text, and never
 * asserts an exact string. It is deliberately a weak claim about CONTENT and a
 * strong claim about ACCESS, because access is what the control is about.
 *
 * Needs a live server with ALLOW_DEV_AUTH=1 (see scripts/run-e2e-smoke.mjs).
 */
import { test, expect } from '@playwright/test';
import { authenticateViaDevLogin } from './dev-auth-helper';

/**
 * One surface per launch application, plus the two compliance surfaces that
 * `LAUNCH_SHELL_SURFACES` marks as never switchable. Not the full 25: the
 * control is per-guard, not per-route, and the guard is the same component for
 * every surface — driving all of them would multiply runtime without adding a
 * distinct control. `client/src/concept2cure/v2/__tests__/navigationReachability.test.ts`
 * covers registry-wide reachability, which is a different question.
 */
const SURFACES: ReadonlyArray<{ id: string; app: string }> = [
  { id: 'projects', app: 'Projects' },
  { id: 'vault', app: 'Vault' },
  { id: 'review', app: 'Authoring' },
  { id: 'submission-center', app: 'Submission Center' },
  { id: 'dispatch-readiness', app: 'Submission Readiness' },
  { id: 'quality', app: 'QMS controlled documents' },
  { id: 'audit-trail', app: '§11.10(e) audit trail (never switchable)' },
  { id: 'part11-console', app: 'Part 11 console (never switchable)' },
];

const MIN_NODES = 50; // a mounted surface; a bare error page carries far fewer

test.describe('OQ — 21 CFR 11.10(d): the launch catalog is closed to an unauthenticated visitor', () => {
  for (const { id, app } of SURFACES) {
    test(`negative control — /${id} (${app}) bounces a visitor with no session`, async ({
      page,
      baseURL,
    }) => {
      test.setTimeout(120_000);
      if (!baseURL) throw new Error('baseURL is required (set BASE_URL for the live server)');
      // No authenticateViaDevLogin: this context deliberately carries no session.
      await page.goto(`/concept2cure/${id}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await expect
        .poll(() => new URL(page.url()).pathname, {
          timeout: 45_000,
          message: `/${id} did not return an unauthenticated visitor to sign-in`,
        })
        .toMatch(/login|auth/);
    });

    test(`/${id} (${app}) renders for an authenticated session`, async ({ page, baseURL }) => {
      test.setTimeout(180_000);
      if (!baseURL) throw new Error('baseURL is required (set BASE_URL for the live server)');
      const { organizationId } = await authenticateViaDevLogin(page, baseURL);
      expect(organizationId, 'dev-login should resolve the seeded organisation').toBeTruthy();

      await page.goto(`/concept2cure/${id}`, { waitUntil: 'domcontentloaded', timeout: 110_000 });
      // Poll on node count, not on text: see the header note on the false
      // finding a text assertion produced here.
      await expect
        .poll(() => page.evaluate(() => document.body?.querySelectorAll('*').length ?? 0), {
          timeout: 60_000,
          message: `/${id} never mounted a surface`,
        })
        .toBeGreaterThan(MIN_NODES);
      expect(new URL(page.url()).pathname, `/${id} bounced an AUTHENTICATED session to login`).not.toMatch(
        /login/,
      );
    });
  }
});
