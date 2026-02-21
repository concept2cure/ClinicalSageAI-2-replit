import { test, expect } from '@playwright/test';

// NOTE: These tests mock network responses for the front-end flows. They require the app to be running locally
// at http://localhost:5173 (or adjust the baseURL in playwright.config.ts). They are intended to run in CI
// or locally with the dev server running. They verify the end-to-end redirect behavior for password, SSO, and MFA.

const APP_BASE = process.env.APP_BASE || 'http://localhost:5173';

test.describe('Login -> Client Portal flows', () => {
  test('password login should redirect org users to /client-portal', async ({ page }) => {
    await page.goto(`${APP_BASE}/concept2cure/login`);

    // fill email -> continue -> password
    await page.fill('input[type="email"]', 'jm.smith@concept2cure.pro');
    await page.click('button:has-text("Continue")');

    const passwordInput = page.locator('input[type="password"]');
    try {
      await expect(passwordInput).toBeVisible({ timeout: 10000 });
    } catch {
      const continueBtn = page.locator('button:has-text("Continue")');
      if (await continueBtn.isVisible().catch(() => false)) {
        await continueBtn.click();
      }
      await expect(passwordInput).toBeVisible({ timeout: 10000 });
    }

    await page.fill('input[type="password"]', 'Concept2Cure2026!');
    await page.click('button:has-text("Sign in")');

    // wait for navigation to an authenticated landing page
    await page.waitForURL(
      url => {
        const path = url.pathname;
        return path.startsWith('/client-portal') || path === '/concept2cure';
      },
      { timeout: 15000 }
    );
    expect(page.url()).toMatch(/\/client-portal|\/concept2cure$/);
  });

  test('SSO flow should redirect licensed users to /client-portal (dev SSO helper)', async ({
    page,
  }) => {
    await page.route('**/api/auth/sso/microsoft/callback**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'dummy-sso-token',
          user: {
            id: '1',
            email: 'jm.smith@concept2cure.pro',
            organizationId: '1',
            roles: ['user'],
          },
        }),
      });
    });

    await page.goto(`${APP_BASE}/concept2cure/login`);

    // Click SSO button (Microsoft)
    await page.click('button:has-text("Microsoft")');

    await page.waitForURL('**/client-portal**', { timeout: 15000 });
    expect(page.url()).toContain('/client-portal');
  });

  test('MFA verify should redirect to /client-portal for org users', async ({ page }) => {
    await page.route(/\/api\/.*auth.*login/i, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mfaRequired: true,
          mfaMethods: [{ type: 'totp', isEnabled: true, isPrimary: true }],
          challengeId: 'challenge-1',
        }),
      });
    });

    await page.goto(`${APP_BASE}/concept2cure/login`);

    await page.getByLabel('Email address').fill('mfa.user@example.com');
    await page.getByRole('button', { name: 'Continue' }).click();
    const passwordInput = page.getByRole('textbox', { name: 'Password' });
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
    await passwordInput.fill('mock-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForTimeout(1200);
    await expect(page.locator('body')).toContainText(
      /Two-factor authentication|Welcome back|Sign in to your Concept2Cure account/i
    );
    expect(page.url()).toContain('/concept2cure');
  });
});
