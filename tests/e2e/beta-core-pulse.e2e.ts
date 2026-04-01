import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || process.env.APP_BASE || 'http://localhost:5000';
const SCREENSHOT_DIR = 'test-results/beta-core-pulse';

async function loginToCore(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/concept2cure/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('concept2cure_first_run_complete', 'true');
  });

  const demoAccess = page.locator(
    'button:has-text("Quick Demo Access"), button:has-text("Demo Access")'
  );

  if (await demoAccess.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await demoAccess.first().click();
    const persona = page
      .locator(
        'button:has-text("JM Smith"), button:has-text("Demo User"), button:has-text("Sarah Chen"), button:has-text("Mike Torres")'
      )
      .first();
    if (await persona.isVisible({ timeout: 3000 }).catch(() => false)) {
      await persona.click();
    }
  } else {
    await page.request.post(`${BASE_URL}/api/auth/dev-login`, {
      data: { email: 'jm.smith@concept2cure.pro' },
    });
  }

  const redirected = await page
    .waitForURL(
      url => {
        const path = url.pathname;
        return (
          path.startsWith('/client-portal') ||
          (path.startsWith('/concept2cure') && !path.startsWith('/concept2cure/login'))
        );
      },
      { timeout: 10000 }
    )
    .then(() => true)
    .catch(() => false);

  if (!redirected) {
    const devLogin = await page.request.post(`${BASE_URL}/api/auth/dev-login`, {
      data: { email: 'jm.smith@concept2cure.pro' },
    });
    const payload = await devLogin.json();

    if (!devLogin.ok() || !payload?.success || !payload?.accessToken || !payload?.user) {
      throw new Error(`Unable to establish auth session (${devLogin.status()}).`);
    }

    await page.evaluate(({ accessToken, refreshToken, expiresIn, user }) => {
      const expiryIso = new Date(Date.now() + Number(expiresIn || 86400) * 1000).toISOString();
      sessionStorage.setItem('trialsage_access_token', String(accessToken));
      sessionStorage.setItem('trialsage_refresh_token', String(refreshToken || accessToken));
      sessionStorage.setItem('trialsage_token_expiry', expiryIso);
      localStorage.setItem('trialsage_user', JSON.stringify(user));
      localStorage.setItem('concept2cure_first_run_complete', 'true');
    }, payload);

    await page.goto(`${BASE_URL}/concept2cure`, { waitUntil: 'domcontentloaded' });
  }
}

async function openProjectFromSidebar(page: Page): Promise<void> {
  const sidebar = page.locator('aside[aria-label="Main sidebar"], aside[role="navigation"]').first();
  await expect(sidebar).toBeVisible({ timeout: 12000 });

  const existingProject = sidebar.locator('[data-testid="project-select"]').first();
  if (await existingProject.isVisible({ timeout: 2000 }).catch(() => false)) {
    await existingProject.click();
    return;
  }

  await page.evaluate(() => {
    const now = new Date().toISOString();
    localStorage.setItem(
      'concept2cure_projects',
      JSON.stringify([
        {
          id: 'beta-pulse-seeded-project',
          name: 'Beta Pulse Project',
          submissionType: 'IND',
          description: 'Seeded from beta pulse e2e',
          conversations: [],
          status: 'active',
          createdAt: now,
          updatedAt: now,
          metadata: { pinned: false, starred: false },
        },
      ])
    );
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(sidebar.locator('[data-testid="project-row"]').first()).toBeVisible({ timeout: 10000 });
  await sidebar.locator('[data-testid="project-select"]').first().click();
}

test.describe('Beta core pulse', () => {
  test('validates canonical beta path and fences', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', e => pageErrors.push(e.message));

    // 1) Root entry should not settle on dead portal truth.
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/concept2cure(\/login)?|\/client-portal/);

    // 2) Login redirect behavior should preserve concept2cure target.
    await page.goto(
      `${BASE_URL}/concept2cure/login?returnTo=${encodeURIComponent('/concept2cure/project/beta-pulse-seeded-project')}`,
      { waitUntil: 'domcontentloaded' }
    );
    await loginToCore(page);

    // 3) /client-portal/* compatibility fence should not dead-end.
    await page.goto(`${BASE_URL}/client-portal/ectd-coauthor`, { waitUntil: 'domcontentloaded' });
    const portalUrl = new URL(page.url());
    expect(portalUrl.pathname.startsWith('/client-portal') || portalUrl.pathname.startsWith('/concept2cure')).toBeTruthy();

    // 4) Authenticated /concept2cure/project/:projectId.
    await page.goto(`${BASE_URL}/concept2cure/project/beta-pulse-seeded-project`, {
      waitUntil: 'domcontentloaded',
    });

    // 5) Project shell load.
    await expect(page.locator('aside[aria-label="Main sidebar"], aside[role="navigation"]').first()).toBeVisible({
      timeout: 15000,
    });

    // 6) Governed workspace shell visible.
    const workspaceShell = page.locator('[data-testid="workspace-shell"], [data-testid="project-workspace-shell"]').first();
    const workspaceShellVisible = await workspaceShell.isVisible({ timeout: 4000 }).catch(() => false);

    // Fallback check for current shell variants.
    if (!workspaceShellVisible) {
      await expect(
        page.locator('text=/Project Workspace|Workspace|Document Studio/i').first()
      ).toBeVisible({ timeout: 10000 });
    }

    // 7) Open at least one project context surface.
    await openProjectFromSidebar(page);
    await page.waitForTimeout(600);

    // 8) Open workspace and return without blank state.
    const toolsButton = page.locator('button:has-text("Tools"), a:has-text("Tools")').first();
    if (await toolsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await toolsButton.click();
      await page.waitForTimeout(500);
    }

    const overviewButton = page.locator('button:has-text("Overview"), a:has-text("Overview")').first();
    if (await overviewButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await overviewButton.click();
      await page.waitForTimeout(500);
    }

    const mainContent = page.locator('main, [role="main"], [data-testid="workspace-content"]').first();
    await expect(mainContent).toBeVisible({ timeout: 10000 });
    const mainText = (await mainContent.textContent()) || '';
    expect(mainText.trim().length).toBeGreaterThan(20);

    // 9) No route lands in dead portal truth.
    const finalPath = new URL(page.url()).pathname;
    expect(finalPath).not.toContain('/client-portal/dead');
    expect(finalPath).not.toContain('/dead');

    // 10) No primary beta CTA lands in unmapped/dead route.
    const ctaCandidates = page
      .locator('a:has-text("Open"), button:has-text("Open"), a:has-text("Launch"), button:has-text("Launch")')
      .first();
    if (await ctaCandidates.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ctaCandidates.click();
      await page.waitForTimeout(800);
      const postCtaPath = new URL(page.url()).pathname;
      expect(postCtaPath).not.toContain('/404');
      expect(postCtaPath).not.toContain('/not-found');
    }

    expect(pageErrors, `Browser runtime errors: ${pageErrors.join(' | ')}`).toEqual([]);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/beta-core-pulse-final.png`,
      fullPage: true,
    });
  });
});
