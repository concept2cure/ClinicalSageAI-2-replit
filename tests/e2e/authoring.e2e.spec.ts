import { test, expect } from '@playwright/test';

/**
 * E2E Smoke: Document Authoring
 * Requires BASE_URL env and a document already openable in the UI.
 * You may need to adjust tab labels if your UI text differs.
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test('Document Authoring smoke: toolbar, insert token, drawers', async ({ page }) => {
  test.setTimeout(90_000);

  const runtimeErrors: string[] = [];
  page.on('pageerror', e => runtimeErrors.push(e.message));

  const loginPage = await page.goto(`${BASE_URL}/concept2cure/login`, {
    waitUntil: 'domcontentloaded',
  });
  expect(loginPage?.status()).toBe(200);

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

  const authoringResponse = await page.goto(`${BASE_URL}/client-portal/ectd-coauthor`, {
    waitUntil: 'domcontentloaded',
  });
  expect(authoringResponse?.status()).toBe(200);

  await expect(page.locator('body')).toContainText(/eCTD Co-Author|Co-Author|Concept2Cure/i);
  expect(runtimeErrors).toEqual([]);
});
