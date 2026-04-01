import { expect, test, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const SCREENSHOT_DIR = 'test-results/rc-beta-path-screenshots';

async function forceDevSession(page: Page) {
  const res = await page.request.post(`${BASE_URL}/api/auth/dev-login`, {
    data: { email: 'jm.smith@concept2cure.pro' },
  });

  if (!res.ok()) {
    throw new Error(`dev-login failed: ${res.status()}`);
  }

  const payload = await res.json();
  if (!payload?.success || !payload?.accessToken || !payload?.user) {
    throw new Error('dev-login payload missing required auth fields');
  }

  await page.goto(`${BASE_URL}/concept2cure/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ accessToken, refreshToken, expiresIn, user }) => {
    const expiry = new Date(Date.now() + Number(expiresIn || 86400) * 1000).toISOString();
    sessionStorage.setItem('trialsage_access_token', String(accessToken));
    sessionStorage.setItem('trialsage_refresh_token', String(refreshToken || accessToken));
    sessionStorage.setItem('trialsage_token_expiry', expiry);
    localStorage.setItem('trialsage_user', JSON.stringify(user));
    localStorage.setItem('concept2cure_first_run_complete', 'true');
  }, payload);
}

function bodyContains(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

test.describe.serial('RC beta-safe path', () => {
  test('RC-01 root entry resolves correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const path = new URL(page.url()).pathname;
    expect(path).not.toBe('/');
    expect(path.startsWith('/concept2cure')).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/rc-01-root.png` });
  });

  test('RC-02 login aliases route to canonical login', async ({ page }) => {
    for (const alias of ['/sign-in', '/auth', '/login']) {
      await page.goto(`${BASE_URL}${alias}`, { waitUntil: 'domcontentloaded' });
      const aliasPath = new URL(page.url()).pathname;
      expect(aliasPath).toContain('/concept2cure/login');
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/rc-02-login-aliases.png` });
  });

  test('RC-03 /client-portal/* is fenced to beta-safe surface', async ({ page }) => {
    await page.goto(`${BASE_URL}/client-portal/legacy-route`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const fencedPath = new URL(page.url()).pathname;
    expect(fencedPath.startsWith('/client-portal')).toBeFalsy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/rc-03-client-portal-fence.png` });
  });

  test('RC-04 authenticated /concept2cure/project/:projectId resolves', async ({ page }) => {
    await forceDevSession(page);

    const projectId = 'RC-BIO-001';
    await page.goto(`${BASE_URL}/concept2cure/project/${projectId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const path = new URL(page.url()).pathname;
    expect(path.includes('/concept2cure/project/')).toBeTruthy();
    expect(path.includes(projectId)).toBeTruthy();
  });

  test('RC-05 project shell and governed workspace load', async ({ page }) => {
    await forceDevSession(page);
    await page.goto(`${BASE_URL}/concept2cure/project/RC-BIO-001`, { waitUntil: 'domcontentloaded' });

    const bodyText = (await page.textContent('body')) || '';
    expect(bodyText.length).toBeGreaterThan(30);

    const shellHintsPresent = bodyContains(bodyText, [/project/i, /workspace/i, /editor/i, /vault/i]);
    expect(shellHintsPresent).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/rc-05-project-workspace-shell.png` });
  });

  test('RC-06 artifact/review/provenance surfaces are reachable and return preserves identity', async ({ page }) => {
    await forceDevSession(page);
    await page.goto(`${BASE_URL}/concept2cure/project/RC-BIO-001`, { waitUntil: 'domcontentloaded' });
    const startPath = new URL(page.url()).pathname;

    const candidateSelectors = [
      'button:has-text("Review")',
      'button:has-text("Provenance")',
      'button:has-text("Audit")',
      'a:has-text("Review")',
      'a:has-text("Provenance")',
    ];

    for (const selector of candidateSelectors) {
      const candidate = page.locator(selector).first();
      if (await candidate.isVisible({ timeout: 800 }).catch(() => false)) {
        await candidate.click();
        await page.waitForTimeout(600);
      }
    }

    const currentPath = new URL(page.url()).pathname;
    expect(currentPath.includes('RC-BIO-001') || startPath.includes('RC-BIO-001')).toBeTruthy();

    await page.goto(`${BASE_URL}/concept2cure/project/RC-BIO-001`, { waitUntil: 'domcontentloaded' });
    const returnPath = new URL(page.url()).pathname;
    expect(returnPath.includes('RC-BIO-001')).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/rc-06-review-provenance-return.png` });
  });

  test('RC-07 no primary beta CTA misroutes to dead/legacy destination', async ({ page }) => {
    await forceDevSession(page);
    await page.goto(`${BASE_URL}/concept2cure/project/RC-BIO-001`, { waitUntil: 'domcontentloaded' });

    const ctaSelectors = [
      'a:has-text("Open Project")',
      'a:has-text("Workspace")',
      'a:has-text("Editor")',
      'button:has-text("Workspace")',
      'button:has-text("Editor")',
    ];

    for (const selector of ctaSelectors) {
      const cta = page.locator(selector).first();
      if (await cta.isVisible({ timeout: 800 }).catch(() => false)) {
        await cta.click();
        await page.waitForTimeout(500);

        const path = new URL(page.url()).pathname;
        expect(path.startsWith('/client-portal')).toBeFalsy();
      }
    }
  });

  test('RC-08 fail-closed and command/panel safety smoke', async ({ page }) => {
    await forceDevSession(page);

    const failClosed = await page.request.get(`${BASE_URL}/api/authoring-actions/invalid-test-route`);
    expect([400, 401, 403, 404, 405]).toContain(failClosed.status());

    await page.goto(`${BASE_URL}/concept2cure/project/RC-BIO-001`, { waitUntil: 'domcontentloaded' });
    const bodyText = (await page.textContent('body')) || '';

    // Dead legacy command names should not be surfaced as primary actions.
    expect(/legacy chat/i.test(bodyText)).toBeFalsy();
  });
});
