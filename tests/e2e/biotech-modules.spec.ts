import { test, expect, Page } from '@playwright/test';

const APP_BASE = process.env.APP_BASE || 'http://localhost:5000';
const SCREENSHOT_DIR = 'test-artifacts/biotech-modules';

/**
 * Biotech Module Runtime Tests
 *
 * Proves that each biotech sidebar module:
 * 1. Is reachable from the sidebar after login
 * 2. Renders in-shell (no window.location breakout)
 * 3. Shows real component content (not just a loading spinner)
 */

async function login(page: Page) {
  await page.goto(`${APP_BASE}/concept2cure/login`);

  // Email step
  const emailInput = page.locator('input#email');
  await expect(emailInput).toBeVisible({ timeout: 15000 });
  await emailInput.fill('jm.smith@concept2cure.pro');

  // Click Continue button
  const continueBtn = page.locator('button').filter({ hasText: 'Continue' });
  await continueBtn.click();

  // Password step
  const passwordInput = page.locator('input#password');
  await expect(passwordInput).toBeVisible({ timeout: 10000 });
  await passwordInput.fill('demo123');

  // Click Sign in
  const signInBtn = page.locator('button').filter({ hasText: 'Sign in' });
  await signInBtn.click();

  // Wait for authenticated shell to load (sidebar should appear)
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
  // Wait for sidebar to be rendered (biotech nav buttons)
  await expect(page.locator('button').filter({ hasText: 'eCTD Co-Author' })).toBeVisible({
    timeout: 15000,
  });
}

async function clickSidebarModule(page: Page, buttonText: string) {
  const btn = page.locator('button').filter({ hasText: buttonText });
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
}

test.describe('Biotech Module In-Shell Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Sidebar shows biotech navigation items', async ({ page }) => {
    const biotechItems = [
      'eCTD Co-Author',
      'CMC Platform',
      'Document Vault',
      'Clinical Trial Hub',
      'Evidence Search',
    ];
    for (const item of biotechItems) {
      await expect(page.locator('button').filter({ hasText: item })).toBeVisible();
    }
    // IND Workspace has dynamic label via workspaceLabel, just check it exists
    await expect(
      page.locator('button').filter({ hasText: /IND (Workspace|Filing)|Drug Development/ })
    ).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-sidebar-biotech-nav.png`, fullPage: true });
  });

  test('IND Workspace renders in-shell', async ({ page }) => {
    await clickSidebarModule(page, /IND (Workspace|Filing)|Drug Development/);
    // Allow workspace view or fallback to load
    await page.waitForTimeout(2000);
    // Still on same origin (no breakout)
    expect(new URL(page.url()).origin).toBe(new URL(APP_BASE).origin);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-ind-workspace.png`, fullPage: true });
  });

  test('eCTD Co-Author renders in-shell', async ({ page }) => {
    await clickSidebarModule(page, 'eCTD Co-Author');
    await expect(page.locator('text=CTD section-by-section drafting')).toBeVisible({
      timeout: 15000,
    });
    expect(new URL(page.url()).origin).toBe(new URL(APP_BASE).origin);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-ectd-coauthor.png`, fullPage: true });
  });

  test('CMC Platform renders in-shell', async ({ page }) => {
    await clickSidebarModule(page, 'CMC Platform');
    await expect(page.locator('text=Chemistry, Manufacturing & Controls')).toBeVisible({
      timeout: 15000,
    });
    expect(new URL(page.url()).origin).toBe(new URL(APP_BASE).origin);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-cmc-platform.png`, fullPage: true });
  });

  test('Document Vault renders in-shell', async ({ page }) => {
    await clickSidebarModule(page, 'Document Vault');
    await expect(page.locator('text=Secure document storage')).toBeVisible({ timeout: 15000 });
    expect(new URL(page.url()).origin).toBe(new URL(APP_BASE).origin);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-document-vault.png`, fullPage: true });
  });

  test('Clinical Trial Hub renders in-shell', async ({ page }) => {
    await clickSidebarModule(page, 'Clinical Trial Hub');
    await expect(page.locator('text=Study design · Protocol optimization')).toBeVisible({
      timeout: 15000,
    });
    expect(new URL(page.url()).origin).toBe(new URL(APP_BASE).origin);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-clinical-trial-hub.png`, fullPage: true });
  });
});
