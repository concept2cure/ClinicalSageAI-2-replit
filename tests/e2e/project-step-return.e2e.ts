import { expect, test } from '@playwright/test';

/** A2.1: a real template copy changes the default step; the chip must still
 * return to the step the person left. Uses fresh records, no mocked responses. */
test('the project chip and a reload remember Plan after starting a document', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `step-${stamp}@walk.example`;
  const password = `N7!${Math.random().toString(36).slice(2)}#qLm4-Rt`;
  const signup = await page.request.post('/api/auth/signup', {
    data: { email, password, companyName: `Step ${stamp}`, industryMode: 'biotech', firstName: 'Step', lastName: 'Tester' },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  await page.goto('/concept2cure/login');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

  const projects = page.locator('section', { has: page.getByRole('heading', { name: 'Your projects' }) });
  await projects.getByRole('button', { name: /^(Create your first project|New project)$/ }).click();
  await page.getByLabel('Search filing types').fill('Investigational New Drug');
  await page.getByRole('button', { name: /^Investigational New Drug Application/ }).first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Project name').fill(`Step return ${stamp}`);
  await page.getByLabel('Product name').fill('SR-101');
  await page.getByLabel('Indication').fill('idiopathic pulmonary fibrosis');
  await page.getByLabel('Product type').selectOption('Drug');
  await page.getByLabel('Target submission date').fill('2027-03-31');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /Create project/ }).click();
  await expect(page).toHaveURL(/project-home/, { timeout: 30_000 });
  const activeStep = page.locator('.pj-lc-stage[aria-current="step"]');
  await expect(activeStep).toHaveText('Plan');

  const entry = page.locator('details[data-phase="phase1"] .pf-library-entry')
    .filter({ has: page.locator('summary', { hasText: 'Target Product Profile' }) }).first();
  await entry.locator('> summary').click();
  await entry.getByRole('button', { name: 'Create from template', exact: true }).click();
  await expect(page).toHaveURL(/document-authoring/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Target Product Profile', exact: true })).toBeVisible();

  await page.locator('button.tb-proj').click();
  await expect(page).toHaveURL(/project-home/);
  await expect(activeStep).toHaveText('Plan');
  await expect(page.locator('details[data-phase="phase1"] > summary')).toContainText('1 started');
  await testInfo.attach('returned-plan.png', { body: await page.screenshot(), contentType: 'image/png' });

  await page.reload();
  await expect(activeStep).toHaveText('Plan');
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await page.getByRole('button', { name: 'Add or find files in Vault', exact: true }).click();
  await expect(page).toHaveURL(/\/vault/);
  await page.locator('button.tb-proj').click();
  await expect(page).toHaveURL(/project-home/);
  await expect(activeStep).toHaveText('Evidence');
});
