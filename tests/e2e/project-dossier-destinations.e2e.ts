import { expect, test } from '@playwright/test';
import pg from 'pg';

/** Native request-role reads, real artifact API and local tracking fixtures. */
test('legacy dossier URLs reach Author with all recorded detail, or Projects without a project', async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  // Explicit local fixture access only; never seed a deployment or silently skip it.
  const fixtureUrl = process.env.DOSSIER_PARITY_DATABASE_URL;
  expect(fixtureUrl, 'Set DOSSIER_PARITY_DATABASE_URL to the local concept_handoff fixture database').toBeTruthy();
  const fixtureTarget = new URL(fixtureUrl!);
  expect(['localhost', '127.0.0.1']).toContain(fixtureTarget.hostname);
  expect(fixtureTarget.pathname).toBe('/concept_handoff');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `dossier-fold-${stamp}@walk.example`;
  const password = `N7!${Math.random().toString(36).slice(2)}#qLm4-Rt`;
  const signup = await page.request.post('/api/auth/signup', {
    data: { email, password, companyName: `Dossier fold ${stamp}`, industryMode: 'biotech', firstName: 'Dossier', lastName: 'Fold' },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  await page.goto('/concept2cure/login');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  const token = await page.evaluate(() => localStorage.getItem('trialsage_access_token'));
  const headers = { Authorization: `Bearer ${token}` };

  await page.goto('/concept2cure/dossier-map');
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await testInfo.attach('no-project-dossier-url.png', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Search filing types').fill('Investigational New Drug');
  await page.getByRole('button', { name: /^Investigational New Drug Application/ }).first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Project name').fill(`Dossier parity ${stamp}`);
  await page.getByLabel('Product name').fill('DP-101');
  await page.getByLabel('Indication').fill('Synthetic test indication');
  await page.getByLabel('Product type').selectOption('Drug');
  await page.getByLabel('Target submission date').fill('2027-03-31');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const createdResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/c2c/projects' && r.request().method() === 'POST');
  await page.getByRole('button', { name: /Create project/ }).click();
  const created = await createdResponse;
  expect(created.status()).toBe(201);
  const receipt = await created.json();
  const pid = receipt.data.id as string;
  const anchor = receipt.meta.projectAnchorId as number;
  expect(Number.isSafeInteger(anchor)).toBe(true);
  await expect(page).toHaveURL(/project-home/, { timeout: 30_000 });
  const initial = await page.request.get(`/api/c2c/projects/${pid}/dossier`, { headers });
  expect(initial.status()).toBe(200);
  const initialHome = (await initial.json()).home;

  const artifact = await page.request.post(`/api/concept2cure/projects/${pid}/artifacts`, {
    headers,
    data: { type: 'protocol', category: 'document', title: `Recorded section artifact ${stamp}`,
      content: '<p>Manually recorded synthetic protocol content for dossier parity verification.</p>',
      ctdSection: '3.2.P.5', metadata: { generationMethod: 'manual' } },
  });
  expect(artifact.status(), await artifact.text()).toBe(201);
  // The older tracking writer is not admitted for this fresh user's workflow.
  // Seed only synthetic historical tracking rows for the just-created anchor;
  // the read below still runs through the real app_service request role and guards.
  const fixture = new pg.Client({ connectionString: fixtureUrl });
  await fixture.connect();
  try {
    const inserted = await fixture.query(`INSERT INTO project_sections
      (organization_id, project_id, section_code, module, title, status)
      SELECT p.organization_id, p.id, s.code, 'M3', s.title, s.status
      FROM projects p CROSS JOIN (VALUES
        ('3.2.P.5', 'Synthetic recorded drug product controls', 'approved'),
        ('3.2.P.8', 'Synthetic recorded stability', 'drafting')) AS s(code,title,status)
      WHERE p.id=$1 AND p.regulatory_program_id=$2 RETURNING id`, [anchor, pid]);
    expect(inserted.rowCount).toBe(2);
  } finally { await fixture.end(); }
  const dossierRead = await page.request.get(`/api/c2c/projects/${pid}/dossier`, { headers });
  expect(dossierRead.status()).toBe(200);
  const dossier = await dossierRead.json();
  expect(dossier.home).toEqual(initialHome);
  expect(dossier.supportingReadiness.artifactReadiness.state).toBe('read');
  expect(dossier.supportingReadiness.sectionTracking.state).toBe('read');
  const section = dossier.supportingReadiness.artifactReadiness.sections.find((s: { ctdSection: string }) => s.ctdSection === '3.2.P.5');
  expect(section).toMatchObject({ status: 'draft', artifactCount: 1, draftCount: 1 });
  const modules = dossier.supportingReadiness.sectionTracking.modules;
  expect(modules.length).toBeGreaterThan(0);

  // A copied legacy URL carries its project, then applies Author once.
  await page.goto(`/concept2cure/dossier-map?program=${pid}#section-status`);
  await expect(page).toHaveURL(new RegExp(`/project-home\\?program=${pid}#section-status$`));
  const active = page.locator('.pj-lc-stage[aria-current="step"]');
  await expect(active).toHaveText('Author');
  const artifacts = page.getByRole('region', { name: 'Section artifacts', exact: true });
  await expect(artifacts.getByRole('rowheader', { name: '3.2.P.5', exact: true })).toBeVisible();
  await expect(artifacts.locator('time')).toHaveAttribute('datetime', section.lastUpdated);
  await expect(artifacts).toContainText('1 section · 0 ready · 0 in progress · 1 draft');
  const tracking = page.getByRole('region', { name: 'Tracked CTD sections', exact: true });
  await expect(tracking).toContainText(`Module ${modules[0].m} · ${modules[0].label} · ${modules[0].pct}%`);
  await expect(tracking).toContainText(modules[0].sections[0]);
  await artifacts.scrollIntoViewIfNeeded();
  await testInfo.attach('author-artifact-and-tracking-parity.png', { body: await page.screenshot(), contentType: 'image/png' });

  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await page.reload();
  await expect(active).toHaveText('Evidence');
  await page.goto(`/concept2cure/dossier?program=${pid}`);
  await expect(page).toHaveURL(new RegExp(`/project-home\\?program=${pid}$`));
  await expect(active).toHaveText('Author');

  const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const second = await other.request.post('/api/auth/signup', { data: {
    email: `other-dossier-${stamp}@walk.example`, password, companyName: `Other dossier ${stamp}`,
    industryMode: 'biotech', firstName: 'Other', lastName: 'Scope',
  } });
  expect(second.status(), await second.text()).toBe(201);
  const session = await second.json();
  const otherToken = session.token;
  expect(typeof otherToken).toBe('string');
  const denied = await other.request.get(`/api/c2c/projects/${pid}/dossier`, { headers: { Authorization: `Bearer ${otherToken}` } });
  expect(denied.status()).toBe(404);
  await other.close();
  await testInfo.attach('dossier-destination-result.json', { body: JSON.stringify({
    noProjectDestination: 'projects', legacyDestinations: ['dossier', 'dossier-map'], canonicalStage: 'author',
    artifactCount: section.artifactCount, artifactSectionUpdatedAt: section.lastUpdated,
    trackedModules: modules.length, governedFigureUnchanged: true, reloadPreservedEvidence: true,
    trackingFixture: 'two synthetic rows in local concept_handoff only; served through native app_service',
    otherOrganizationStatus: denied.status(),
  }, null, 2), contentType: 'application/json' });
});
