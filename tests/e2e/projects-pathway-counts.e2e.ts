import { expect, test } from '@playwright/test';

/** Real canonical creation, the MDX alias, runtime-role SQL and pathway tabs. */
test('MDX links and pathway filters agree with scoped portfolio counts', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `pathways-${stamp}@walk.example`;
  const password = `N7!${Math.random().toString(36).slice(2)}#qLm4-Rt`;
  const signup = await page.request.post('/api/auth/signup', {
    data: { email, password, companyName: `Pathways ${stamp}`, industryMode: 'medtech', firstName: 'Pathway', lastName: 'Tester' },
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
  const options = await page.request.get('/api/clients?purpose=project-intake', { headers });
  expect(options.status()).toBe(200);
  const client = (await options.json()).clients[0] as { id: string };
  expect(client).toBeTruthy();
  for (const [index, programType] of ['510k', '510k', 'ind'].entries()) {
    const created = await page.request.post('/api/c2c/projects', {
      headers: { ...headers, 'x-client-id': client.id },
      data: { name: `Pathway project ${index + 1} ${stamp}`, productName: `PF-${index}-${stamp}`, programType,
        productType: programType === 'ind' ? 'drug' : 'device',
        primaryAgency: 'FDA', clientWorkspaceId: Number(client.id), indication: 'Synthetic test indication',
        targetSubmissionDate: '2027-03-31' },
    });
    expect(created.status(), await created.text()).toBe(201);
    const receipt = await created.json();
    expect(receipt.data.pathway).toBe(programType === '510k' ? 'k510' : 'other');
  }
  const paged = await page.request.get('/api/c2c/projects?ws=MDX&pathway=k510&limit=1', { headers });
  expect(paged.status()).toBe(200);
  const result = await paged.json();
  expect(result.data).toHaveLength(1);
  expect(result.meta.count).toBe(1);
  expect(result.meta.hasMore).toBe(true);
  expect(result.meta.counts.total).toBe(2);
  expect(result.meta.counts.byWorkstream.MDX).toBe(2);
  expect(result.meta.counts.byWorkstream.Biotech).toBe(1);
  expect(result.meta.counts.byPathway).toEqual({ k510: 2 });
  // Canonical API creation does not select a shell project. The old MDX link
  // must still open the shared portfolio with its existing filter applied.
  expect(await page.evaluate(() => (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT ?? null)).toBeNull();
  const aliasReads: { url: string; status: number }[] = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname === '/api/c2c/projects' && url.searchParams.get('ws') === 'MDX') {
      aliasReads.push({ url: url.pathname + url.search, status: response.status() });
    }
  });
  await page.goto('/concept2cure/mdx');
  await expect(page).toHaveURL(/\/concept2cure\/projects(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  // D2-1: the workstream filter is the toolbar's "Client type" select; its counts are in the option text.
  const clientType = page.getByRole('combobox', { name: 'Client type', exact: true });
  await expect(clientType).toHaveValue('MDX');
  await expect(clientType.getByRole('option', { name: 'Medical device & IVD (2)', exact: true })).toHaveCount(1);
  await expect.poll(() => aliasReads.find(read => read.url === '/api/c2c/projects?ws=MDX')).toEqual({ url: '/api/c2c/projects?ws=MDX', status: 200 });
  await expect(page.locator('.pj-card')).toHaveCount(2);
  await expect(page.locator('.pj-card').filter({ hasText: `Pathway project 3 ${stamp}` })).toHaveCount(0);
  // D2-1: the active count is in the search's placeholder; the figures line is the list view's footing.
  await expect(page.getByRole('searchbox', { name: 'Search projects by title or code' })).toHaveAttribute('placeholder', 'Search 2 projects');
  await testInfo.attach('mdx-alias-portfolio.png', { body: await page.screenshot(), contentType: 'image/png' });

  // A person's later choice survives subsequent screen updates. The alias is
  // an opening action; it must not continually reassert the MDX filter.
  await expect(clientType.getByRole('option', { name: 'Biotech (1)', exact: true })).toHaveCount(1);
  await clientType.selectOption('Biotech');
  await expect(page.locator('.pj-card')).toHaveCount(1);
  await expect(page.locator('.pj-card').first()).toContainText(`Pathway project 3 ${stamp}`);
  await page.getByRole('searchbox', { name: 'Search projects by title or code' }).fill('Pathway project 3');
  await expect(clientType).toHaveValue('Biotech');
  await page.getByRole('searchbox', { name: 'Search projects by title or code' }).clear();
  await expect(clientType).toHaveValue('Biotech');
  await expect(page.locator('.pj-card')).toHaveCount(1);
  await expect(clientType.getByRole('option', { name: 'All client types (3)', exact: true })).toHaveCount(1);
  await clientType.selectOption('all');
  await expect(page.locator('.pj-card')).toHaveCount(3);
  await clientType.selectOption('MDX');
  await expect(page.locator('.pj-card')).toHaveCount(2);
  const filteredRead = page.waitForResponse(response => response.url().includes('/api/c2c/projects?ws=MDX&pathway=k510'));
  const pathwaySelect = page.getByRole('combobox', { name: 'Pathway', exact: true });
  await expect(pathwaySelect.getByRole('option', { name: '510(k) (2)', exact: true })).toHaveCount(1);
  await pathwaySelect.selectOption('k510');
  expect((await filteredRead).status()).toBe(200);
  await expect(page.getByRole('searchbox', { name: 'Search projects by title or code' })).toHaveAttribute('placeholder', 'Search 2 projects');
  await expect(page.locator('.pj-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('.pj-summary')).toContainText('2 active projects');
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await testInfo.attach('pathway-portfolio.png', { body: await page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('pathway-counts.json', { body: JSON.stringify({ pageCount: result.meta.count,
    hasMore: result.meta.hasMore, counts: result.meta.counts,
    alias: { canonicalPath: new URL(page.url()).pathname, selectedWorkstream: 'MDX', noProjectRequired: true,
      filteredReads: aliasReads, manualFilterSurvivedRerender: true } }, null, 2), contentType: 'application/json' });
});
