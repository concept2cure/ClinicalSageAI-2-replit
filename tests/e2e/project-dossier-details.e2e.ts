import { expect, test } from '@playwright/test';

/** A2.6: actual scaffold, governed read and Author details, without provider calls. */
test('Author shows its governed section details and hands the critical path to AnA', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `dossier-${stamp}@walk.example`;
  const password = `N7!${Math.random().toString(36).slice(2)}#qLm4-Rt`;
  const signup = await page.request.post('/api/auth/signup', {
    data: { email, password, companyName: `Dossier ${stamp}`, industryMode: 'biotech', firstName: 'Dossier', lastName: 'Tester' },
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
  await page.getByLabel('Project name').fill(`Dossier detail ${stamp}`);
  await page.getByLabel('Product name').fill('DD-101');
  await page.getByLabel('Indication').fill('Synthetic test indication');
  await page.getByLabel('Product type').selectOption('Drug');
  await page.getByLabel('Target submission date').fill('2027-03-31');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const dossierResponse = page.waitForResponse(r => /\/api\/c2c\/projects\/[^/]+\/dossier$/.test(new URL(r.url()).pathname));
  await page.getByRole('button', { name: /Create project/ }).click();
  await expect(page).toHaveURL(/project-home/, { timeout: 30_000 });
  const response = await dossierResponse;
  expect(response.status()).toBe(200);
  const dossier = await response.json();
  expect(dossier.rows.length).toBeGreaterThan(0);
  expect(dossier.rows[0].sections.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Author', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Module completion', exact: true })).toBeVisible();
  const row = page.locator('.pj-lmodrow').first();
  await row.locator('summary').click();
  const sections = row.getByRole('list');
  await expect(sections.getByRole('listitem')).toHaveCount(dossier.rows[0].sections.length);
  for (const section of dossier.rows[0].sections) {
    await expect(sections).toContainText(`${section.key} · ${section.label}`);
  }
  await expect(row.locator('time')).toHaveAttribute('datetime', dossier.rows[0].lastUpdated);
  const homeRows = dossier.rows.filter((r: { agency: string | null }) => r.agency === null);
  const inReview = homeRows.reduce((sum: number, r: { inReview: number }) => sum + r.inReview, 0);
  const drafted = homeRows.reduce((sum: number, r: { drafted: number }) => sum + r.drafted, 0);
  await expect(page.getByText(`${inReview} in review · ${drafted} drafted`, { exact: true })).toBeVisible();
  await testInfo.attach('author-section-details.png', { body: await page.screenshot(), contentType: 'image/png' });

  const modelRequests: string[] = [];
  const writes: string[] = [];
  page.on('request', r => {
    if (r.method() === 'POST' && /^\/api\/(ana-ri\/stream|ana\/chat|chat\/stream)/.test(new URL(r.url()).pathname)) modelRequests.push(r.url());
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && /\/api\/c2c\/(projects|documents)/.test(r.url())) writes.push(r.url());
  });
  await page.getByRole('button', { name: /Ask AnA: critical path to filing/ }).click();
  await expect(page).toHaveURL(/conversation-thread/);
  await expect(page.getByRole('textbox', { name: 'Reply to AnA', exact: true })).toHaveValue('What is the critical path to filing?');
  expect(modelRequests).toHaveLength(0);
  expect(writes).toHaveLength(0);
  await testInfo.attach('critical-path-prefill.png', { body: await page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('dossier-details-result.json', { body: JSON.stringify({
    dossierReadStatus: response.status(), moduleRows: dossier.rows.length,
    firstModuleSections: dossier.rows[0].sections.length, moduleUpdatedAt: dossier.rows[0].lastUpdated,
    homeInReview: inReview, homeDrafted: drafted, questionPrefilled: true,
    modelRequests: modelRequests.length, writesAfterQuestion: writes.length,
  }, null, 2), contentType: 'application/json' });
});
