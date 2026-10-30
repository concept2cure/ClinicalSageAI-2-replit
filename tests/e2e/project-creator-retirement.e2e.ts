import { expect, test, type Page } from '@playwright/test';

const retired = [
  '/api/concept2cure/projects', '/api/concept2cure/projects/1/duplicate',
  '/api/device-projects', '/api/projects', '/api/project-hierarchy/1/children',
  '/api/workspace/projects', '/api/ctd/projects', '/api/ana/platform/projects',
  '/api/ana/platform/onboard', '/api/ana/platform/execute',
  '/api/program-journey', '/api/program-journey/1/stages/plan',
];

async function checkRetiredCreators(page: Page) {
  return page.evaluate(async paths => {
    const token = localStorage.getItem('trialsage_access_token');
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const read = async () => {
      const response = await fetch('/api/c2c/projects', { credentials: 'include', headers });
      const result = await response.json();
      return { status: response.status, ids: result.data?.map((p: { id: string }) => p.id).sort() };
    };
    const before = await read();
    const results = [];
    for (const path of paths) {
      const response = await fetch(path, { method: 'POST', credentials: 'include', headers,
        body: JSON.stringify({ name: 'Retired synthetic creator probe', deviceName: 'Synthetic device',
          submissionType: 'IND', type: 'ind', clientId: 999999, clientWorkspaceId: 999999,
          action: { category: 'project', action: 'create', parameters: { name: 'Retired synthetic probe' } } }) });
      // Under normal release enforcement some paths are refused before the
      // router. Record only the bounded policy code, never a response body.
      const refusal = response.status === 403 ? await response.json() : null;
      results.push({ path, status: response.status,
        ...(response.status === 403 ? { code: refusal?.error?.code ?? null } : {}) });
    }
    return { before, results, after: await read() };
  }, retired);
}

/** A2.9: retired HTTP writers cannot replace the core project workflow. */
test('retired creators refuse writes while the Projects wizard creates the canonical project', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `creator-retirement-${stamp}@walk.example`;
  const password = `N7!${Math.random().toString(36).slice(2)}#qLm4-Rt`;
  const signup = await page.request.post('/api/auth/signup', { data: {
    email, password, companyName: `Creator retirement ${stamp}`, industryMode: 'biotech', firstName: 'Core', lastName: 'Tester',
  } });
  expect(signup.status()).toBe(201);
  await page.goto('/concept2cure/login');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

  const home = page.locator('section', { has: page.getByRole('heading', { name: 'Your projects' }) });
  await home.getByRole('button', { name: /^(Create your first project|New project)$/ }).click();
  await page.getByLabel('Search filing types').fill('Investigational New Drug');
  await page.getByRole('button', { name: /^Investigational New Drug Application/ }).first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const projectName = `Core project ${stamp}`;
  await page.getByLabel('Project name').fill(projectName);
  await page.getByLabel('Product name').fill('CC-101');
  await page.getByLabel('Indication').fill('Synthetic test indication');
  await page.getByLabel('Product type').selectOption('Drug');
  await page.getByLabel('Target submission date').fill('2027-03-31');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const scaffoldRead = page.waitForResponse(response => /\/api\/c2c\/projects\/[^/]+\/dossier$/.test(new URL(response.url()).pathname));
  const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/c2c/projects' && response.request().method() === 'POST');
  await page.getByRole('button', { name: /Create project/ }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const receipt = await response.json();
  expect(Number.isSafeInteger(receipt.meta.projectAnchorId)).toBe(true);
  await expect(page).toHaveURL(/project-home/);
  await expect(page.getByRole('heading', { name: projectName, exact: true })).toBeVisible();
  const scaffoldResponse = await scaffoldRead;
  expect(scaffoldResponse.status()).toBe(200);
  const scaffold = await scaffoldResponse.json();
  expect(scaffold.rows.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Author', exact: true }).click();
  await expect(page.locator('.pj-lmodrow').first()).toBeVisible();
  await testInfo.attach('canonical-created-project.png', { body: await page.screenshot(), contentType: 'image/png' });

  const probe = await checkRetiredCreators(page);
  expect(probe.before).toEqual({ status: 200, ids: [receipt.data.id] });
  expect(probe.after).toEqual(probe.before);
  expect(probe.results.map(result => result.path)).toEqual(retired);
  for (const result of probe.results) {
    if (result.status === 403) expect(result.code).toBe('LAUNCH_SCOPE');
    else expect(result.status).toBe(404);
  }
  await testInfo.attach('creator-retirement-result.json', { body: JSON.stringify({
    canonicalCreateStatus: response.status(), acceptedAnchor: true, createdProjectReached: true,
    scaffoldReadStatus: scaffoldResponse.status(), moduleRows: scaffold.rows.length,
    projectCountBefore: probe.before.ids.length, projectCountAfter: probe.after.ids.length,
    retired: probe.results, uncheckedWorkspaceClientRefused: true,
  }, null, 2), contentType: 'application/json' });
});
