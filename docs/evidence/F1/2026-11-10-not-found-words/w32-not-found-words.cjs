// Walk 32 (F1): a record's 404 names the record, in the product's one refusal panel (ErrorState's readSubject), not
// "this project". The walk answers 404 for a controlled document's version history and for a CAPA's action items.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

async function failedText(page, testId) {
  const failed = page.getByTestId(testId).first();
  await failed.waitFor({ timeout: 15000 });
  return { text: (await failed.textContent()).trim(), tryAgain: await failed.getByRole('button', { name: 'Try again' }).count() };
}

run('w32-not-found-words', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  const notFound = (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) });
  await page.route('**/api/mdx/qms/documents/*/versions', notFound);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // A controlled document's version history.
  await page.getByRole('button', { name: /^More actions for / }).first().click();
  await page.getByRole('button', { name: /^View version history of / }).first().click();
  log.steps.push({ name: 'history-404', ...(await failedText(page, 'qms-history-failed')) });
  await shot(page, 'w32-history-404-1440', false);
  await page.getByRole('dialog').last().getByRole('button', { name: 'Close', exact: true }).click();

  // A CAPA's action items.
  await page.route((url) => /^\/api\/capa-mdr\/capa\/[^/]+$/.test(url.pathname), notFound);
  await page.getByRole('tab', { name: 'CAPA' }).click();
  await page.waitForTimeout(1500);
  const number = page.locator('button.qms-num[title="Show action items"]').first();
  if (await number.count()) {
    await number.click();
    log.steps.push({ name: 'capa-actions-404', ...(await failedText(page, 'capa-actions-failed')) });
    await shot(page, 'w32-capa-actions-404-1440', false);
  } else {
    log.steps.push({ name: 'capa-actions-404', skipped: 'no CAPA is recorded in the walk organisation' });
  }
  await ctx.close();
});
