import { expect, test, type Page } from '@playwright/test';

async function recordSyntheticArtifacts(page: Page, programId: string, stamp: string) {
  return page.evaluate(async ({ programId, stamp }) => {
    const call = async (method: string, path: string, body?: unknown) => {
      const token = localStorage.getItem('trialsage_access_token');
      const response = await fetch(path, { method, credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const created = [];
    for (const index of [1, 2]) created.push(await call('POST', `/api/concept2cure/projects/${programId}/artifacts`, {
      type: 'document', category: 'document', title: `Synthetic artifact ${stamp}-${index}`,
      content: '<p>Synthetic test evidence.</p>', ctdSection: '1.1',
      documentClass: 'strategy_memo', submissionProgram: 'ind', workspaceTarget: 'project',
      metadata: { generationMethod: 'manual', synthetic: true },
    }));
    const artifact = created[0].body.data ?? created[0].body;
    const review = artifact.id
      ? await call('PUT', `/api/concept2cure/projects/${programId}/artifacts/${artifact.id}/status`, { status: 'review', reason: 'Synthetic browser test review request.' })
      : null;
    const refreshed = await call('GET', `/api/c2c/projects/${programId}/dossier`);
    return { created: created.map(r => r.status), errors: created.map(r => r.body.error?.details?.errors ?? r.body.error), review: review?.status, refreshed };
  }, { programId, stamp });
}

/** Actual scaffold, governed sections and carried artifact facts, without provider calls. */
test('Author shows governed sections and artifact states, then hands the critical path to AnA', async ({ page }, testInfo) => {
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

  // Record synthetic artifacts through the governed API, leaving signatures and
  // approval untouched. The browser's auth token never leaves page context.
  const artifacts = await recordSyntheticArtifacts(page, dossier.projectId, stamp);
  expect(artifacts.created, JSON.stringify(artifacts.errors)).toEqual([201, 201]);
  expect(artifacts.review).toBe(200);
  expect(artifacts.refreshed.status).toBe(200);
  const rollup = artifacts.refreshed.body.artifactReadiness;
  expect(rollup).toMatchObject({ basis: 'governed_artifacts', state: 'measured', sections: [
    { ctdSection: '1.1', artifactCount: 2, draftCount: 1, reviewCount: 1, unknownCount: 0, status: 'draft' },
  ] });
  expect(artifacts.refreshed.body.home).toEqual(dossier.home);
  await page.reload();
  const artifactPanel = page.getByRole('region', { name: 'Artifact section status' });
  await expect(artifactPanel.getByRole('cell', { name: '1.1', exact: true })).toBeVisible();
  await expect(artifactPanel.getByRole('cell', { name: '1 / 1 / 0 / 0 / 0', exact: true })).toBeVisible();
  await expect(artifactPanel.getByRole('cell', { name: 'Draft', exact: true })).toBeVisible();
  await expect(artifactPanel.locator('time')).toHaveAttribute('datetime', rollup.sections[0].lastUpdated);
  await artifactPanel.scrollIntoViewIfNeeded();
  await testInfo.attach('author-artifact-status.png', { body: await page.screenshot(), contentType: 'image/png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('Escape');
  await artifactPanel.scrollIntoViewIfNeeded();
  await expect(artifactPanel.getByRole('cell', { name: '1.1', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await testInfo.attach('author-artifact-status-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
  await page.setViewportSize({ width: 1440, height: 1000 });

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
    artifactReadiness: rollup, artifactCreates: artifacts.created, artifactReview: artifacts.review,
    modelRequests: modelRequests.length, writesAfterQuestion: writes.length,
  }, null, 2), contentType: 'application/json' });
});
