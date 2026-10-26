import { expect, test, type Page } from '@playwright/test';

async function signUpAndLogIn(page: Page, stamp: string) {
  const email = `filing-core-${stamp}@walk.example`;
  const password = `N7!${Math.random().toString(36).slice(2)}#qLm4-Rt`;
  const signup = await page.request.post('/api/auth/signup', { data: {
    email, password, companyName: `Filing core ${stamp}`, industryMode: 'biotech', firstName: 'Filing', lastName: 'Tester',
  } });
  expect(signup.status()).toBe(201);
  await page.goto('/concept2cure/login');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

async function chooseInd(page: Page) {
  await page.getByLabel('Search filing types').fill('Investigational New Drug Application');
  await page.getByRole('button', { name: /^Investigational New Drug Application/ }).first().click();
  const chosen = page.getByTestId('rpk-chosen-offer');
  await expect(chosen).toContainText('Authority / region');
  await expect(chosen).toContainText('Submission format');
  await expect(chosen).toContainText('CTD module');
  const guide = chosen.getByRole('region', { name: 'Filing lifecycle reference', exact: true });
  await guide.getByText('Reference guide', { exact: true }).click();
  await expect(guide).toContainText('Authored filing-family guidance');
  await expect(guide).toContainText('Clinical Hold');
  await expect(guide.getByRole('progressbar')).toHaveCount(0);
  return chosen;
}

async function createInd(page: Page, stamp: string) {
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Project name').fill(`Filing core ${stamp}`);
  await page.getByLabel('Product name').fill('FC-101');
  await page.getByLabel('Indication').fill('Synthetic test indication');
  await page.getByLabel('Product type').selectOption('Drug');
  await page.getByLabel('Target submission date').fill('2027-03-31');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/c2c/projects' && response.request().method() === 'POST');
  const detail = page.waitForResponse(response => /\/api\/c2c\/projects\/[^/]+$/.test(new URL(response.url()).pathname) && response.request().method() === 'GET');
  await page.getByRole('button', { name: /Create project/ }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const receipt = await response.json();
  expect(receipt.program.submission_type_id).toBe('us_ind');
  expect(Number.isSafeInteger(receipt.meta.projectAnchorId)).toBe(true);
  const read = await detail;
  expect(read.status()).toBe(200);
  const project = await read.json();
  expect(project.submission_type_id).toBe('us_ind');
  expect(project).not.toHaveProperty('metadata');
  return { createStatus: response.status(), readStatus: read.status(), filingId: project.submission_type_id };
}

test('the old filing catalogue reaches the core selection and recorded project reference', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await signUpAndLogIn(page, stamp);
  const oldLink = '/concept2cure/filings-catalog?view=reference#filing';
  await page.goto(oldLink);
  await expect(page).toHaveURL(url => url.pathname === '/concept2cure/projects' && url.search === '?view=reference' && url.hash === '#filing');
  await expect(page.getByRole('heading', { name: 'New project', exact: true })).toBeVisible();
  const chosen = await chooseInd(page);
  await testInfo.attach('wizard-filing-reference.png', { body: await page.screenshot(), contentType: 'image/png' });

  const modelRequests: string[] = [];
  const writes: string[] = [];
  const observe = (request: { method(): string; url(): string }) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && /^\/api\/(ana-ri\/stream|ana\/chat|chat\/stream)/.test(path)) modelRequests.push(path);
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && path.startsWith('/api/c2c/projects')) writes.push(path);
  };
  page.on('request', observe);
  await chosen.getByRole('button', { name: 'Ask AnA', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Reply to AnA', exact: true })).toHaveValue(/Tell me about the Investigational New Drug Application/);
  expect(modelRequests).toHaveLength(0); expect(writes).toHaveLength(0);
  page.off('request', observe);

  await page.goto(oldLink); await chooseInd(page);
  const saved = await createInd(page, stamp);
  await expect(page).toHaveURL(/project-home/);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  const guide = page.getByTestId('pj-plan').getByRole('region', { name: 'Filing lifecycle reference', exact: true });
  await guide.getByText('Reference guide', { exact: true }).click();
  await expect(guide).toContainText('Assemble IND/IDE');
  await expect(guide).toContainText('Clinical Hold');
  await guide.scrollIntoViewIfNeeded();
  await testInfo.attach('project-plan-filing-reference.png', { body: await page.screenshot(), contentType: 'image/png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Collapse', exact: true }).click();
  await expect(page.locator('.rail-scrim')).toHaveCount(0);
  await guide.scrollIntoViewIfNeeded();
  await expect(guide).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await testInfo.attach('project-plan-filing-reference-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
  await page.reload();
  await expect(page.locator('.pj-lc-stage[aria-current="step"]')).toHaveText('Plan');
  await guide.getByText('Reference guide', { exact: true }).click();
  await expect(guide).toContainText('Clinical Hold');
  await testInfo.attach('filing-core-result.json', { body: JSON.stringify({
    alias: 'filings-catalog', destination: 'projects/new-project', copiedQueryAndHashPreserved: true,
    ...saved, metadataWithheld: true, recordedPlanGuideReached: true, reloadPreservedPlan: true,
    viewportWidths: [1440, 390], questionPrefilled: true, modelRequests: modelRequests.length, writesAfterQuestion: writes.length,
  }, null, 2), contentType: 'application/json' });
});
