import { test, expect, Page } from '@playwright/test';
import { mkdirSync } from 'fs';

const APP_BASE = process.env.APP_BASE || 'http://localhost:5000';
const SCREENSHOT_DIR = 'test-artifacts/final-meeting-screenshots';

// Ensure screenshot directory exists
mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function login(page: Page) {
  await page.goto(`${APP_BASE}/concept2cure/login`);
  const emailInput = page.locator('input#email');
  await expect(emailInput).toBeVisible({ timeout: 15000 });
  await emailInput.fill('jm.smith@concept2cure.pro');
  const continueBtn = page.locator('button').filter({ hasText: 'Continue' });
  await continueBtn.click();
  const passwordInput = page.locator('input#password');
  await expect(passwordInput).toBeVisible({ timeout: 10000 });
  await passwordInput.fill('demo123');
  const signInBtn = page.locator('button').filter({ hasText: 'Sign in' });
  await signInBtn.click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
  await expect(page.locator('button').filter({ hasText: 'eCTD Co-Author' })).toBeVisible({
    timeout: 15000,
  });
}

async function clickSidebarModule(page: Page, buttonText: string) {
  const btn = page.locator('button').filter({ hasText: buttonText });
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
}

test.describe('Final Meeting Screenshots', () => {
  test('Capture full walkthrough screenshots', async ({ page }) => {
    // 1. Login and capture biotech-first shell
    await login(page);
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/01-biotech-first-shell.png`,
      fullPage: false,
    });

    // 2. Navigate to eCTD Co-Author (drafting surface)
    await clickSidebarModule(page, 'eCTD Co-Author');
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/02-ectd-drafting-surface.png`,
      fullPage: false,
    });

    // 3. Look for editor/drafting elements and interact
    // Try to find any draft/compose button or section builder
    const draftBtn = page
      .locator('button')
      .filter({ hasText: /draft|compose|new|create|section/i })
      .first();
    if (await draftBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await draftBtn.click();
      await page.waitForTimeout(2000);
    }
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/03-editor-populated.png`,
      fullPage: false,
    });

    // 4. Navigate to CMC Platform
    await clickSidebarModule(page, 'CMC Platform');
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/04-cmc-dashboard.png`,
      fullPage: false,
    });

    // 5. Look for Module 3 / export / generate functionality in CMC
    const module3Btn = page
      .locator('button, a, [role="button"]')
      .filter({ hasText: /module.?3|export|generate|drug.substance/i })
      .first();
    if (await module3Btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await module3Btn.click();
      await page.waitForTimeout(2000);
    }
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/05-cmc-module3-doc.png`,
      fullPage: false,
    });

    // 6. Navigate to Document Vault for artifact list
    await clickSidebarModule(page, 'Document Vault');
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/06-artifact-list.png`,
      fullPage: false,
    });

    // 7. Also capture IND Workspace for completeness
    await clickSidebarModule(page, 'IND Workspace');
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/07-ind-workspace.png`,
      fullPage: false,
    });
  });
});
