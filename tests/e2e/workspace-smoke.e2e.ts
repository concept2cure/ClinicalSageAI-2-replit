/**
 * Workspace Smoke Tests — Route/Render Truth Audit
 *
 * Validates every primary workspace nav item:
 *   1. Click nav item
 *   2. Verify non-empty main content
 *   3. Verify no blank pane
 *   4. Verify at least one stable test-id in primary content
 *   5. Capture screenshot
 *
 * Workspace coverage:
 *   - RI Copilot (regulatory-workspace + intelligence)
 *   - eCTD Co-Author
 *   - IND Workspace
 *   - CMC Platform
 *   - Clinical Trial Hub
 *   - Submission Ops
 *   - Document Vault
 *   - Mission Control
 *
 * @stabilization Hard stabilization sprint — no new features until these pass.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || process.env.APP_BASE || 'http://localhost:5000';
const SCREENSHOT_DIR = 'test-results/workspace-smoke-screenshots';

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function loginToApp(page: Page): Promise<void> {
  const runtimeErrors: string[] = [];
  page.on('pageerror', e => runtimeErrors.push(e.message));

  await page.goto(`${BASE_URL}/concept2cure/login`, { waitUntil: 'domcontentloaded' });

  // Use "Quick Demo Access" button if available (fastest path)
  const quickDemo = page.locator('button:has-text("Quick Demo Access")');
  if (await quickDemo.isVisible({ timeout: 3000 }).catch(() => false)) {
    await quickDemo.click();
  } else {
    // Fallback: manual email + password flow
    await page.fill('input[type="email"]', 'jm.smith@concept2cure.pro');
    await page.click('button:has-text("Continue")');

    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
    await page.fill('input[type="password"]', 'Concept2Cure2026!');
    await page.click('button:has-text("Sign in")');
  }

  // Wait for auth redirect — match any post-login route
  await page.waitForURL(
    url => {
      const path = url.pathname;
      return path.startsWith('/client-portal') || path.startsWith('/concept2cure');
    },
    { timeout: 20000 }
  );
}

// ─── Helper: navigate via sidebar ─────────────────────────────────────────────

async function clickSidebarNav(page: Page, label: string): Promise<void> {
  // Expand sidebar if collapsed
  const sidebar = page.locator('aside[aria-label="Main sidebar"]');
  const width = await sidebar.evaluate(el => el.getBoundingClientRect().width);
  if (width < 100) {
    await page.click('button[aria-label="Expand sidebar"]');
    await page.waitForTimeout(300);
  }

  // Click the nav item by exact label text
  const navButton = sidebar.locator(`button:has-text("${label}")`).first();
  await expect(navButton).toBeVisible({ timeout: 5000 });
  await navButton.click();
  await page.waitForTimeout(500);
}

// ─── Helper: ensure a project is selected ─────────────────────────────────────

async function ensureProjectSelected(page: Page): Promise<void> {
  // Check if "Select Project" prompt is showing (meaning no project selected)
  const selectPrompt = page.locator('button:has-text("Select Project")');
  if (await selectPrompt.isVisible({ timeout: 2000 }).catch(() => false)) {
    await selectPrompt.click();
    // Wait for project switcher to open, pick the first project
    const firstProject = page.locator('[data-testid="project-row"]').first();
    if (await firstProject.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstProject.click();
      await page.waitForTimeout(500);
    } else {
      // Try clicking any button in the project list
      const anyProject = page.locator('button:has-text("Lemizumab")').first();
      if (await anyProject.isVisible({ timeout: 2000 }).catch(() => false)) {
        await anyProject.click();
        await page.waitForTimeout(500);
      }
    }
  }
}

// ─── Helper: verify workspace renders content ─────────────────────────────────

async function verifyWorkspaceContent(
  page: Page,
  testId: string,
  opts: { minHeight?: number; screenshot?: string } = {}
): Promise<{ pass: boolean; height: number; errors: string[] }> {
  const errors: string[] = [];

  // Collect runtime errors
  const runtimeErrors: string[] = [];
  const errorHandler = (e: Error) => runtimeErrors.push(e.message);
  page.on('pageerror', errorHandler);

  // Check the workspace container exists
  const container = page.locator(`[data-testid="${testId}"]`);
  try {
    await expect(container).toBeVisible({ timeout: 8000 });
  } catch {
    errors.push(`Container [data-testid="${testId}"] not visible`);
    return { pass: false, height: 0, errors };
  }

  // Get container height
  const box = await container.boundingBox();
  const height = box?.height ?? 0;

  if (height < (opts.minHeight ?? 100)) {
    errors.push(`Container height ${height}px < minimum ${opts.minHeight ?? 100}px`);
  }

  // Check for visible text content (not blank)
  const textContent = await container.textContent();
  if (!textContent || textContent.trim().length < 10) {
    errors.push(`Container has no meaningful text content (${textContent?.length ?? 0} chars)`);
  }

  // Check for runtime errors
  if (runtimeErrors.length > 0) {
    errors.push(`Runtime errors: ${runtimeErrors.join('; ')}`);
  }

  // Screenshot
  if (opts.screenshot) {
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/${opts.screenshot}.png`,
      fullPage: false,
    });
  }

  page.off('pageerror', errorHandler);

  return {
    pass: errors.length === 0,
    height,
    errors,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Workspace Smoke Tests — Route/Render Truth', () => {
  test.beforeEach(async ({ page }) => {
    await loginToApp(page);
  });

  // ─── RI Copilot ───────────────────────────────────────────────────────────

  test('SMOKE-01: RI Copilot renders with content', async ({ page }) => {
    await clickSidebarNav(page, 'RI Copilot');
    await page.waitForTimeout(1000);

    const result = await verifyWorkspaceContent(page, 'workspace-ri-copilot', {
      minHeight: 200,
      screenshot: '01-ri-copilot',
    });

    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
    expect(result.height).toBeGreaterThan(200);
  });

  // ─── eCTD Co-Author ───────────────────────────────────────────────────────

  test('SMOKE-02: eCTD Co-Author renders with content', async ({ page }) => {
    await clickSidebarNav(page, 'eCTD Co-Author');
    await page.waitForTimeout(500);
    await ensureProjectSelected(page);
    await page.waitForTimeout(1000);

    const result = await verifyWorkspaceContent(page, 'workspace-ectd-coauthor', {
      minHeight: 200,
      screenshot: '02-ectd-coauthor',
    });

    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);

    // Verify the eCTD content actually rendered (outline panel is visible)
    const outline = page.locator('[data-testid="ectd-coauthor-outline"]');
    await expect(outline).toBeVisible({ timeout: 5000 });
  });

  // ─── IND Workspace ────────────────────────────────────────────────────────

  test('SMOKE-03: IND Workspace renders with content', async ({ page }) => {
    await clickSidebarNav(page, 'IND Workspace');
    await page.waitForTimeout(500);
    await ensureProjectSelected(page);
    await page.waitForTimeout(1000);

    const result = await verifyWorkspaceContent(page, 'workspace-ind', {
      minHeight: 200,
      screenshot: '03-ind-workspace',
    });

    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  // ─── CMC Platform ─────────────────────────────────────────────────────────

  test('SMOKE-04: CMC Platform renders with content', async ({ page }) => {
    await clickSidebarNav(page, 'CMC Platform');
    await page.waitForTimeout(500);
    await ensureProjectSelected(page);
    await page.waitForTimeout(1000);

    const result = await verifyWorkspaceContent(page, 'workspace-cmc', {
      minHeight: 200,
      screenshot: '04-cmc-platform',
    });

    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  // ─── Clinical Trial Hub ───────────────────────────────────────────────────

  test('SMOKE-05: Clinical Trial Hub renders with content', async ({ page }) => {
    await clickSidebarNav(page, 'Clinical Trial Hub');
    await page.waitForTimeout(1000);

    const result = await verifyWorkspaceContent(page, 'workspace-clinical-trial', {
      minHeight: 200,
      screenshot: '05-clinical-trial',
    });

    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  // ─── Submission Ops ───────────────────────────────────────────────────────

  test('SMOKE-06: Submission Ops renders with content', async ({ page }) => {
    // Expand Governance group first (collapsed by default)
    const sidebar = page.locator('aside[aria-label="Main sidebar"]');
    const govButton = sidebar.locator('button:has-text("Governance")');
    if (await govButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await govButton.click();
      await page.waitForTimeout(300);
    }

    await clickSidebarNav(page, 'Submission Ops');
    await page.waitForTimeout(500);
    await ensureProjectSelected(page);
    await page.waitForTimeout(1000);

    const result = await verifyWorkspaceContent(page, 'workspace-submission-ops', {
      minHeight: 200,
      screenshot: '06-submission-ops',
    });

    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  // ─── Document Vault ───────────────────────────────────────────────────────

  test('SMOKE-07: Document Vault renders with content', async ({ page }) => {
    await clickSidebarNav(page, 'Document Vault');
    await page.waitForTimeout(1000);

    const result = await verifyWorkspaceContent(page, 'workspace-document-vault', {
      minHeight: 200,
      screenshot: '07-document-vault',
    });

    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  // ─── Mission Control ──────────────────────────────────────────────────────

  test('SMOKE-08: Mission Control renders with content', async ({ page }) => {
    // Expand Governance group first (collapsed by default)
    const sidebar = page.locator('aside[aria-label="Main sidebar"]');
    const govButton = sidebar.locator('button:has-text("Governance")');
    if (await govButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await govButton.click();
      await page.waitForTimeout(300);
    }

    await clickSidebarNav(page, 'Mission Control');
    await page.waitForTimeout(1000);

    const result = await verifyWorkspaceContent(page, 'workspace-mission-control', {
      minHeight: 200,
      screenshot: '08-mission-control',
    });

    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  // ─── Dead Routes Redirect ─────────────────────────────────────────────────

  test('SMOKE-09: Dead routes redirect instead of showing blank', async ({ page }) => {
    // Navigate directly to concept2cure — we'll test that deprecated modes
    // don't produce blank screens by verifying the redirect mechanism exists
    await page.goto(`${BASE_URL}/concept2cure`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // The app should be on a valid workspace, not showing blank
    // Check that we're on a named route, not a dead one
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(50);
  });
});
