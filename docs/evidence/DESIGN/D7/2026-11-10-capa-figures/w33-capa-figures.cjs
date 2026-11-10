// Walk 33: the CAPA register's figures line at the read cap is one sentence, with no stacked colons.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');
run('w33-capa-figures', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'CAPA' }).click();
  const figures = page.getByTestId('qms-record-figures');
  await figures.waitFor({ timeout: 15000 });
  log.steps.push({ name: 'capa-figures', text: (await figures.textContent()).trim() });
  await shot(page, 'w33-capa-figures-1440', false);
  await ctx.close();
});
