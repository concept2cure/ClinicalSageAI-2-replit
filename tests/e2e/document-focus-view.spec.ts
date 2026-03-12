/**
 * Document Focus View — Runtime Visual Acceptance
 *
 * Captures screenshots at 1366x768 and 1440x900.
 *
 * Flow: Login → Projects → RI Copilot → Project Launcher → Open Workspace
 *       → Intelligence view → Toggle Editor → Artifact list → Open doc
 *       → Inspector drawers → IND Workspace → Document Vault
 */
import { test, type Page } from '@playwright/test';
import { createRequire } from 'module';
import * as path from 'path';
import * as fs from 'fs';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');

const APP_BASE = process.env.APP_BASE || 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'trialsage-codespace-jwt-secret-2026';
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'test-artifacts/document-focus-final');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function mintToken(): string {
  return jwt.sign(
    {
      userId: '3',
      email: 'jm.smith@concept2cure.pro',
      organizationId: '2',
      organizationUuid: null,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function buildAuthUser(): object {
  return {
    id: '3',
    email: 'jm.smith@concept2cure.pro',
    firstName: 'JM',
    lastName: 'Smith',
    displayName: 'JM Smith',
    roles: ['admin', 'regulatory_writer'],
    permissions: ['read', 'write', 'admin'],
    organizationId: '2',
    organizationName: 'Concept2Cure',
    mfaEnabled: false,
    mfaMethods: [],
    mustChangePassword: false,
  };
}

async function injectAuth(page: Page) {
  const token = mintToken();
  const user = buildAuthUser();
  const expiry = new Date(Date.now() + 3600_000).toISOString();
  await page.goto(APP_BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ t, u, exp }: { t: string; u: object; exp: string }) => {
      localStorage.setItem('trialsage_access_token', t);
      sessionStorage.setItem('trialsage_access_token', t);
      localStorage.setItem('trialsage_refresh_token', t);
      sessionStorage.setItem('trialsage_refresh_token', t);
      localStorage.setItem('trialsage_token_expiry', exp);
      sessionStorage.setItem('trialsage_token_expiry', exp);
      localStorage.setItem('trialsage_user', JSON.stringify(u));
      localStorage.setItem('token', t);
      localStorage.setItem('authToken', t);
      localStorage.setItem('auth_token', t);
      localStorage.setItem('currentOrganizationId', '2');
    },
    { t: token, u: user, exp: expiry }
  );
}

async function snap(page: Page, name: string) {
  const filepath = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`  [screenshot] ${name}`);
}

async function clickBtn(page: Page, text: string, wait = 2000): Promise<boolean> {
  const loc = page.locator(`button:has-text("${text}")`).first();
  try {
    if (await loc.isVisible({ timeout: 3000 })) {
      await loc.click();
      await page.waitForTimeout(wait);
      console.log(`  [nav] Clicked "${text}"`);
      return true;
    }
  } catch {
    /* not found */
  }
  console.log(`  [nav] "${text}" NOT visible`);
  return false;
}

async function clickTestId(page: Page, tid: string, wait = 1500): Promise<boolean> {
  const loc = page.locator(`[data-testid="${tid}"]`);
  try {
    if (await loc.isVisible({ timeout: 3000 })) {
      await loc.click();
      await page.waitForTimeout(wait);
      console.log(`  [nav] Clicked [${tid}]`);
      return true;
    }
  } catch {
    /* not found */
  }
  console.log(`  [nav] [${tid}] NOT visible`);
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════

for (const vp of [
  { w: 1366, h: 768 },
  { w: 1440, h: 900 },
]) {
  const tag = `${vp.w}x${vp.h}`;

  test.describe(`Document Focus View @ ${tag}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });

    test(`full acceptance pass at ${tag}`, async ({ page }) => {
      test.setTimeout(120_000);

      await injectAuth(page);
      await page.goto(`${APP_BASE}/concept2cure`, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(3000);

      // ── 01: Projects hub ────────────────────────────────────────────
      await snap(page, `01-projects-hub-${tag}.png`);

      // ── 02: Click RI Copilot → ProjectLauncher ──────────────────────
      await clickBtn(page, 'RI Copilot');
      await snap(page, `02-project-launcher-${tag}.png`);

      // ── 03: Enter workspace → RI Copilot Intelligence ──────────────
      (await clickBtn(page, 'Open Project Workspace')) ||
        (await clickBtn(page, 'Open Workspace')) ||
        (await clickBtn(page, 'Ask RI'));
      await snap(page, `03-ri-intelligence-${tag}.png`);

      // ── 04: Toggle to Editor mode → Artifact list ───────────────────
      await clickTestId(page, 'view-toggle-editor');
      await snap(page, `04-editor-artifact-list-${tag}.png`);

      // ── 05: Click first document → Editor with toolbar ──────────────
      // The artifact list items are <button> elements in a list
      const firstDoc = page.locator('.space-y-1 > button').first();
      const hasDoc = await firstDoc.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasDoc) {
        await firstDoc.click();
        await page.waitForTimeout(2000);
        console.log('  [nav] Opened first document');
      } else {
        // Create a document if none exist
        const createInput = page.locator('input[placeholder*="New document"]');
        if (await createInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await createInput.fill('Test Acceptance Document');
          await page.locator('button:has-text("Create")').first().click();
          await page.waitForTimeout(3000);
          console.log('  [nav] Created new document');
        } else {
          console.log('  [nav] No documents and no create input found');
        }
      }
      await snap(page, `05-editor-document-open-${tag}.png`);

      // ── 06–09: Inspector drawers ────────────────────────────────────
      for (const [panel, num] of [
        ['intelligence', '06'],
        ['provenance', '07'],
        ['compare', '08'],
        ['audit', '09'],
      ]) {
        await clickTestId(page, `inspector-${panel}`);
        await snap(page, `${num}-editor-${panel}-drawer-${tag}.png`);
      }

      // ── 10: IND Workspace ───────────────────────────────────────────
      await clickBtn(page, 'IND Workspace');
      await snap(page, `10-ind-workspace-${tag}.png`);

      // ── 11: Document Vault ──────────────────────────────────────────
      await clickBtn(page, 'Document Vault');
      await snap(page, `11-document-vault-${tag}.png`);
    });
  });
}
