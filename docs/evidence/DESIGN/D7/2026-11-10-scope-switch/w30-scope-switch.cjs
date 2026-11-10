// Walk 30: after "Show the whole organisation", the project's rows are not shown as the organisation's while the
// organisation's read loads; a version history the server does not find is said in the document's words.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');
const PROGRAM = '5d669ca3-055f-48b1-9c34-364eb33ecb95';

const register = (page) => page.evaluate(() => {
  const area = document.querySelector('[data-work-area]');
  const sec = area.querySelector('.pj-sec');
  return {
    scope: (document.querySelector('[data-testid="quality-scope"]') || {}).textContent || null,
    rows: [...area.querySelectorAll('tbody.qms-doc, tbody.qcc-change')].map((b) => (b.querySelector('td') || {}).textContent?.trim()).slice(0, 12),
    loading: (sec.querySelector('.c2c-empty-state') || {}).textContent?.trim() || null,
  };
});

/** Hold the organisation-wide read of `path` (no program_id) for 2.5 seconds, then let it through unchanged. */
async function holdOrganisationRead(page, path) {
  await page.route((url) => url.pathname === path && !url.searchParams.has('program_id'), async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
}

run('w30-scope-switch', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  log.steps.push({ name: 'sop-project', ...(await register(page)) });

  await holdOrganisationRead(page, '/api/mdx/qms/documents');
  await page.getByRole('button', { name: 'Show the whole organisation' }).click();
  await page.waitForTimeout(500);
  log.steps.push({ name: 'sop-organisation-while-loading', ...(await register(page)) });
  await shot(page, 'w30-sop-switching-1440', false);
  await page.waitForTimeout(3000);
  log.steps.push({ name: 'sop-organisation-read', ...(await register(page)) });
  await page.unroute((url) => url.pathname === '/api/mdx/qms/documents');

  // Back to the project, then the change log, the same way.
  await page.getByRole('button', { name: /only$/ }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('tab', { name: 'Change control' }).click();
  await page.waitForTimeout(1500);
  log.steps.push({ name: 'changes-project', ...(await register(page)) });
  await holdOrganisationRead(page, '/api/mdx/qms/changes');
  await page.getByRole('button', { name: 'Show the whole organisation' }).click();
  await page.waitForTimeout(500);
  log.steps.push({ name: 'changes-organisation-while-loading', ...(await register(page)) });
  await shot(page, 'w30-changes-switching-1440', false);
  await page.waitForTimeout(3000);
  log.steps.push({ name: 'changes-organisation-read', ...(await register(page)) });

  // A version history the server does not find (the walk answers 404 for it).
  await page.route('**/api/mdx/qms/documents/*/versions', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Document not found' }) }));
  await page.getByRole('tab', { name: 'SOP register' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /^More actions for / }).first().click();
  await page.getByRole('button', { name: /^View version history of / }).first().click();
  const failed = page.getByTestId('qms-history-failed');
  await failed.waitFor({ timeout: 15000 });
  log.steps.push({ name: 'history-404', text: (await failed.textContent()).trim(),
    tryAgain: await failed.getByRole('button', { name: 'Try again' }).count() });
  await shot(page, 'w30-history-404-1440', false);
  await ctx.close();
});
