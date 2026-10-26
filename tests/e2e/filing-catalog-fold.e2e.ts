import { expect, test } from '@playwright/test';
import { resolveFilingCatalogEntry } from '../../shared/regulatory/filing-catalog';

for (const example of [
  { filingId: 'us_ind', industry: 'biotech', productType: 'Drug', clock: 'IND: 30-day default review', archetype: 'Clinical-trial authorization' },
  { filingId: 'us_510k', industry: 'medtech', productType: 'Device', clock: '510(k): 90 FDA days', archetype: 'US device market authorization' },
]) {
  test(`${example.filingId}: legacy filing link reaches reference, canonical creation and recorded Plan`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(30_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const email = `filing-fold-${stamp}@walk.example`;
    const password = `N7!${Math.random().toString(36).slice(2)}#qLm4-Rt`;
    const signup = await page.request.post('/api/auth/signup', { data: {
      email, password, companyName: `Filing fold ${stamp}`, industryMode: example.industry,
      firstName: 'Filing', lastName: 'Tester',
    } });
    expect(signup.status()).toBe(201);
    await page.goto('/concept2cure/login');
    await page.locator('input[type="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
    const token = await page.evaluate(() => localStorage.getItem('trialsage_access_token'));
    expect(token).toBeTruthy();
    const headers = { Authorization: `Bearer ${token}` };
    const writes: string[] = [];
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/c2c/projects') writes.push(request.url());
    });

    await page.goto('/concept2cure/filings-catalog?view=all#reference');
    await expect(page).toHaveURL(/\/concept2cure\/projects\?view=all#reference/);
    await expect(page.getByRole('heading', { name: 'New project', exact: true })).toBeVisible();
    expect(writes).toHaveLength(0);
    const entry = resolveFilingCatalogEntry(example.filingId)!;
    await page.getByLabel('Search filing types').fill(entry.displayName);
    await page.getByRole('button', { name: entry.displayName }).first().click();
    const reference = page.getByTestId('filing-lifecycle-reference');
    await expect(reference).toContainText(example.archetype);
    await expect(reference).toContainText(example.clock);
    await expect(reference).toContainText('not this project’s status, deadline or agency commitment');
    await expect(page.getByTestId('filing-reference-metadata')).toContainText(entry.agency);
    await expect(page.getByTestId('rpk-chosen-build')).toBeVisible();
    await testInfo.attach(`${example.filingId}-intake-reference.png`, { body: await page.screenshot(), contentType: 'image/png' });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Project name').fill(`Filing reference ${stamp}`);
    await page.getByLabel('Product name').fill(`FR-${stamp}`);
    if (example.industry === 'biotech') {
      await page.getByLabel('Indication').fill('Synthetic test indication');
      await page.getByLabel('Product type').selectOption(example.productType);
    } else {
      await page.getByLabel('Device class').selectOption('II');
    }
    await page.getByLabel('Target submission date').fill('2027-03-31');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const before = await page.request.get('/api/c2c/projects', { headers });
    expect(before.status()).toBe(200);
    expect((await before.json()).meta.counts.total).toBe(0);
    expect(writes).toHaveLength(0);
    const creation = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/c2c/projects');
    await page.getByRole('button', { name: /Create project/ }).click();
    const created = await creation;
    expect(created.status()).toBe(201);
    const receipt = await created.json();
    expect(receipt.meta.projectAnchorId).toBeTruthy();
    await expect(page).toHaveURL(/project-home/, { timeout: 30_000 });
    const detail = await page.request.get(`/api/c2c/projects/${receipt.data.id}`, { headers });
    expect(detail.status()).toBe(200);
    const recorded = await detail.json();
    expect(recorded.submission_type_id.toLowerCase()).toBe(example.filingId);
    expect(recorded).not.toHaveProperty('metadata');
    await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.getByTestId('filing-lifecycle-reference')).toContainText(example.archetype);
    await expect(page.getByTestId('filing-lifecycle-reference')).toContainText(example.clock);
    await page.reload();
    await expect(page.getByTestId('filing-lifecycle-reference')).toContainText(example.archetype);
    expect(writes).toHaveLength(1);
    await testInfo.attach(`${example.filingId}-plan-reference.png`, { body: await page.screenshot(), contentType: 'image/png' });
    await page.setViewportSize({ width: 390, height: 844 });
    const collapse = page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('button', { name: 'Collapse', exact: true });
    if (await collapse.isVisible()) await collapse.click();
    await page.getByTestId('filing-lifecycle-reference').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('filing-lifecycle-reference')).toContainText(example.clock);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await testInfo.attach(`${example.filingId}-plan-mobile.png`, { body: await page.screenshot(), contentType: 'image/png' });
    await testInfo.attach(`${example.filingId}-fold-result.json`, { contentType: 'application/json', body: JSON.stringify({
      filingId: example.filingId, legacyDestination: 'projects', wizardOpened: true,
      writesBeforeHumanCreate: 0, canonicalCreateStatus: created.status(), writeCount: writes.length,
      canonicalAnchorRecorded: Boolean(receipt.meta.projectAnchorId), exactRecordedFiling: recorded.submission_type_id,
      internalMetadataExposed: Object.hasOwn(recorded, 'metadata'), planAfterReload: true, mobileOverflow: false,
    }, null, 2) });
  });
}
