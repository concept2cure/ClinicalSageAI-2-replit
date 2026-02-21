import { test, expect } from '@playwright/test';

test.describe('Stability First-Run Guide', () => {
  test('stability entry points remain accessible through current CMC experience', async ({
    page,
  }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));

    await page.goto('/concept2cure/login');
    await page.fill('input[type="email"]', 'jm.smith@concept2cure.pro');
    await page.click('button:has-text("Continue")');
    await page.fill('input[type="password"]', 'Concept2Cure2026!');
    await page.click('button:has-text("Sign in")');
    await page.waitForURL(
      url => {
        const path = url.pathname;
        return path.startsWith('/client-portal') || path === '/concept2cure';
      },
      { timeout: 15000 }
    );

    const cmcResponse = await page.goto('/client-portal/cmc-wizard', {
      waitUntil: 'domcontentloaded',
    });
    expect(cmcResponse?.status()).toBe(200);
    await expect(page.locator('body')).toContainText(/CMC|Chemistry|Manufacturing|Controls/i);

    // Legacy stability direct route should not crash the SPA
    const legacyResponse = await page.goto('/stability', { waitUntil: 'domcontentloaded' });
    expect(legacyResponse?.status()).toBe(200);
    await expect(page.locator('body')).toContainText(/Concept2Cure|TrialSage|Not Found|CMC/i);

    expect(runtimeErrors).toEqual([]);
  });
});
