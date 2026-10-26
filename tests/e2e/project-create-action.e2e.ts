import { expect, test } from '@playwright/test';

/** The real screen-action opener reaches intake; only the person's Create
 * commits the canonical program/anchor. No AI provider or response mock. */
test('the New project action preserves intake and waits for the person to create', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `create-action-${stamp}@walk.example`;
  const password = `N7!${Math.random().toString(36).slice(2)}#qLm4-Rt`;
  const signup = await page.request.post('/api/auth/signup', {
    data: { email, password, companyName: `Create action ${stamp}`, industryMode: 'biotech', firstName: 'Create', lastName: 'Tester' },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  await page.goto('/concept2cure/login');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  const token = await page.evaluate(() => localStorage.getItem('trialsage_access_token'));
  expect(token).toBeTruthy();
  const headers = { Authorization: `Bearer ${token}` };
  await page.goto('/concept2cure/projects');
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  const writes: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/c2c/projects') writes.push(request.url());
  });
  const open = () => page.evaluate(async () => {
    // Load the same module already mounted by the app. This exercises the
    // real validated action bus without requiring a model to choose the tool.
    const modulePath = '/src/concept2cure/v2/surfaceActions.ts';
    const actions = await import(modulePath);
    return actions.openNewProject(() => { throw new Error('Projects should already be mounted'); });
  });
  const first = await open();
  expect(first.status).toBe('applied');
  await expect(page.getByRole('heading', { name: 'New project', exact: true })).toBeVisible();
  await page.getByLabel('Search filing types').fill('Investigational New Drug');
  await page.getByRole('button', { name: /^Investigational New Drug Application/ }).first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const projectName = `Action-created project ${stamp}`;
  await page.getByLabel('Project name').fill(projectName);
  const repeated = await open();
  expect(repeated.status).toBe('applied');
  expect(repeated.detail).toMatch(/already open/i);
  await expect(page.getByLabel('Project name')).toHaveValue(projectName);
  await page.getByLabel('Product name').fill('AC-101');
  await page.getByLabel('Indication').fill('Synthetic test indication');
  await page.getByLabel('Product type').selectOption('Drug');
  await page.getByLabel('Target submission date').fill('2027-03-31');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const before = await page.request.get('/api/c2c/projects', { headers });
  expect(before.status()).toBe(200);
  expect((await before.json()).meta.counts.total).toBe(0);
  expect(writes).toHaveLength(0);
  await testInfo.attach('review-before-create.png', { body: await page.screenshot(), contentType: 'image/png' });
  const response = page.waitForResponse(result => result.request().method() === 'POST' && new URL(result.url()).pathname === '/api/c2c/projects');
  await page.getByRole('button', { name: /Create project/ }).click();
  const created = await response;
  expect(created.status(), await created.text()).toBe(201);
  const receipt = await created.json();
  expect(receipt.meta.projectAnchorId).toBeTruthy();
  expect(receipt.meta.created).toBe(true);
  await expect(page).toHaveURL(/project-home/, { timeout: 30_000 });
  expect(writes).toHaveLength(1);
  const after = await page.request.get('/api/c2c/projects', { headers });
  expect(after.status()).toBe(200);
  expect((await after.json()).meta.counts.total).toBe(1);
  await testInfo.attach('create-action-result.json', { body: JSON.stringify({ opener: first.status,
    repeated: repeated.detail, totalBeforeCreate: 0, totalAfterCreate: 1, writeCount: writes.length,
    createStatus: created.status(), canonicalAnchorRecorded: Boolean(receipt.meta.projectAnchorId) }, null, 2), contentType: 'application/json' });
});
