import { expect, test, type Page } from '@playwright/test';

async function signUpAndLogIn(page: Page, stamp: string) {
  const email = `mdx-entry-${stamp}@walk.example`;
  const password = `N7!${Math.random().toString(36).slice(2)}#qLm4-Rt`;
  const signup = await page.request.post('/api/auth/signup', { data: {
    email, password, companyName: `MDX entry ${stamp}`, industryMode: 'biotech',
    firstName: 'Device', lastName: 'Tester',
  } });
  expect(signup.status()).toBe(201);
  await page.goto('/concept2cure/login');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

/** The real creator, with its browser token kept inside the browser context. */
async function recordProject(page: Page, body: Record<string, unknown>) {
  const result = await page.evaluate(async body => {
    const token = localStorage.getItem('trialsage_access_token');
    const response = await fetch('/api/c2c/projects', { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body) });
    const receipt = await response.json();
    return { status: response.status, id: receipt.data?.id, workstream: receipt.data?.ws };
  }, body);
  expect(result.status).toBe(201);
  expect(typeof result.id).toBe('string');
  return result as { status: number; id: string; workstream: string };
}

async function reachMdxProjects(page: Page, suffix: string, device: { id: string; title: string }) {
  const filteredRead = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && url.pathname === '/api/c2c/projects' && url.searchParams.get('ws') === 'MDX';
  });
  await page.goto(`/concept2cure/mdx${suffix}`);
  await expect(page).toHaveURL(url => url.pathname === '/concept2cure/projects');
  expect(new URL(page.url()).searchParams.get('view')).toBe('compact');
  expect(new URL(page.url()).hash).toBe('#device-projects');
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  const mdx = page.getByRole('group', { name: 'Workstream filters' }).getByRole('button', { name: /^MDX(?: \d+)?$/ });
  await expect(mdx).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pj-card')).toHaveCount(1);
  await expect(page.locator('.pj-card')).toContainText(device.title);
  const response = await filteredRead;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.data.map((row: { id: string }) => row.id)).toEqual([device.id]);
  expect(result.meta.counts.total).toBe(1);
  return { status: response.status(), count: result.data.length, scopedTotal: result.meta.counts.total };
}

/** A2.8: the alias reaches the existing server-filtered portfolio and project. */
test('the old MDX entry reaches filtered Projects and the recorded device project', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await signUpAndLogIn(page, stamp);
  const deviceTitle = `Device assay ${stamp}`;
  const drugTitle = `Medicine filing ${stamp}`;
  const device = await recordProject(page, { name: deviceTitle, productName: `DA-${stamp}`,
    programType: '510k', productType: 'ivd', primaryAgency: 'FDA', indication: 'Synthetic test indication',
    targetSubmissionDate: '2027-03-31' });
  const drug = await recordProject(page, { name: drugTitle, productName: `MF-${stamp}`,
    programType: 'ind', productType: 'drug', primaryAgency: 'FDA', indication: 'Synthetic test indication',
    targetSubmissionDate: '2027-03-31' });
  expect(device.workstream).toBe('MDX');
  expect(drug.workstream).not.toBe('MDX');

  const noProject = await reachMdxProjects(page, '?view=compact#device-projects', { id: device.id, title: deviceTitle });
  expect(new URL(page.url()).searchParams.has('program')).toBe(false);
  await testInfo.attach('mdx-filtered-projects.png', { body: await page.screenshot(), contentType: 'image/png' });

  const filters = page.getByRole('group', { name: 'Workstream filters' });
  await filters.getByRole('button', { name: /^All workstreams(?: \d+)?$/ }).click();
  await expect(page.locator('.pj-card')).toHaveCount(2);
  await expect(filters.getByRole('button', { name: /^MDX(?: \d+)?$/ })).toHaveAttribute('aria-pressed', 'false');
  const search = page.getByRole('searchbox', { name: 'Search projects by title or code' });
  await search.fill(drugTitle);
  await expect(page.locator('.pj-card')).toHaveCount(1);
  await expect(page.locator('.pj-card')).toContainText(drugTitle);
  await expect(filters.getByRole('button', { name: /^All workstreams(?: \d+)?$/ })).toHaveAttribute('aria-pressed', 'true');
  await search.fill('');
  await page.locator('.pj-card').filter({ hasText: deviceTitle }).click();
  await expect(page).toHaveURL(/project-home/);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  const workflow = page.getByTestId('pj-mdx-workflow');
  await expect(workflow.getByRole('heading', { name: 'What this 510(k) needs', exact: true })).toBeVisible();
  await expect(workflow.locator('[data-work-package="analytical-performance"]')).toBeVisible();
  await testInfo.attach('mdx-project-plan.png', { body: await page.screenshot(), contentType: 'image/png' });

  const withProject = await reachMdxProjects(page, `?program=${device.id}&view=compact#device-projects`, { id: device.id, title: deviceTitle });
  expect(new URL(page.url()).searchParams.get('program')).toBe(device.id);
  const paged = await page.evaluate(async () => {
    const token = localStorage.getItem('trialsage_access_token');
    const response = await fetch('/api/c2c/projects?ws=MDX&limit=1', { credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const result = await response.json();
    return { status: response.status, ids: result.data?.map((row: { id: string }) => row.id),
      count: result.meta?.count, total: result.meta?.counts?.total };
  });
  expect(paged).toEqual({ status: 200, ids: [device.id], count: 1, total: 1 });
  await testInfo.attach('mdx-destination-result.json', { body: JSON.stringify({
    alias: 'mdx', canonical: 'projects', workstream: 'MDX', noProject, withProject,
    preservedQueryAndHash: true, personCanClearFilter: true, recordedDevicePlanReached: true,
    pagedRead: { status: paged.status, count: paged.count, scopedTotal: paged.total },
    projectCreators: [device.status, drug.status],
  }, null, 2), contentType: 'application/json' });
});
