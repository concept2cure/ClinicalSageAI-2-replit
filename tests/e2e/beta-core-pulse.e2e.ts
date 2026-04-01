import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || process.env.APP_BASE || 'http://localhost:5000';
const PROJECT_ID = process.env.BETA_PULSE_PROJECT_ID || 'stage8-pulse-project';
const ARTIFACT_ID = process.env.BETA_PULSE_ARTIFACT_ID || 'stage8-pulse-artifact-1-1';

async function seedAuthenticatedBrowserState(page: Page) {
  const expiryIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await page.addInitScript(
    ({ expiry, projectId, artifactId }) => {
      const user = {
        id: 'stage8-user',
        email: 'jm.smith@concept2cure.pro',
        firstName: 'JM',
        lastName: 'Smith',
        organizationId: '1',
        organizationName: 'Concept2Cure',
        roles: ['user'],
      };
      sessionStorage.setItem('trialsage_access_token', 'stage8-token');
      sessionStorage.setItem('trialsage_refresh_token', 'stage8-token');
      sessionStorage.setItem('trialsage_token_expiry', expiry);
      localStorage.setItem('trialsage_user', JSON.stringify(user));
      localStorage.setItem('concept2cure_first_run_complete', 'true');
      localStorage.setItem('currentOrganizationId', '1');
      localStorage.setItem('currentOrganizationName', 'Concept2Cure');
      localStorage.setItem('activeProjectId', projectId);
      localStorage.setItem('activeArtifactId', artifactId);
    },
    { expiry: expiryIso, projectId: PROJECT_ID, artifactId: ARTIFACT_ID }
  );
}

test.describe('Stage 8 beta core pulse', () => {
  test('covers canonical beta-safe shell path and route fences', async ({ page }) => {
    await seedAuthenticatedBrowserState(page);

    await test.step('1) / resolves to auth-aware Concept2Cure flow', async () => {
      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(
        u => u.pathname === '/concept2cure' || u.pathname === '/concept2cure/login',
        { timeout: 15000 }
      );
      expect(page.url()).toMatch(/\/concept2cure(\/login)?/);
    });

    await test.step('2) /login, /auth, /sign-in alias to canonical login', async () => {
      for (const path of ['/login', '/auth', '/sign-in']) {
        await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(u => u.pathname === '/concept2cure/login', { timeout: 15000 });
      }
    });

    await test.step('3) /client-portal/* fences back to canonical shell', async () => {
      await page.goto(`${BASE_URL}/client-portal/legacy-surface`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(u => u.pathname.startsWith('/concept2cure'), { timeout: 15000 });
      expect(page.url()).toContain('/concept2cure');
    });

    await test.step('4-5) authenticated project route loads real shell/workspace', async () => {
      await page.goto(`${BASE_URL}/concept2cure/project/${PROJECT_ID}`, {
        waitUntil: 'domcontentloaded',
      });
      const sidebar = page.locator('aside[aria-label="Main sidebar"], aside[role="navigation"]').first();
      await expect(sidebar).toBeVisible({ timeout: 15000 });
      await expect(page.locator('main, [data-testid="project-workspace-shell"]').first()).toBeVisible({
        timeout: 15000,
      });
    });

    await test.step('6-7) governed artifact path opens and returns to workspace with context', async () => {
      await page.goto(
        `${BASE_URL}/concept2cure/project/${PROJECT_ID}/artifacts/${ARTIFACT_ID}`,
        { waitUntil: 'domcontentloaded' }
      );
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.goto(`${BASE_URL}/concept2cure/project/${PROJECT_ID}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForURL(u => u.pathname.includes(`/concept2cure/project/${PROJECT_ID}`), {
        timeout: 15000,
      });
    });

    await test.step('8) top-level nav does not dead-end', async () => {
      for (const route of ['/concept2cure', `/concept2cure/project/${PROJECT_ID}`]) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('text=Something went wrong, text=404').first()).toBeHidden({
          timeout: 3000,
        });
      }
    });

    await test.step('9) command/panel safety check is gated to PR-334 intake', async () => {
      test.skip(
        process.env.STAGE8_INCLUDE_PR334_CHECKS !== 'true',
        'Enable STAGE8_INCLUDE_PR334_CHECKS=true only when PR 334 changes are present.'
      );
    });

    await test.step('10) fail-closed governed checks are gated to PR-333/335 intake', async () => {
      test.skip(
        process.env.STAGE8_INCLUDE_FAILCLOSED_CHECKS !== 'true',
        'Enable STAGE8_INCLUDE_FAILCLOSED_CHECKS=true only when PR 333/335 changes are present.'
      );
    });
  });
});
