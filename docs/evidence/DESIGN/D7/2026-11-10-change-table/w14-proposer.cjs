// Walk 14: the change under assessment offers Approve to the approver, not to the author who proposed it (C8).
const { run, signIn, log, BASE } = require('./lib.cjs');

run('w14-proposer', async (browser) => {
  for (const who of ['author', 'approver']) {
    const { ctx, page } = await signIn(browser, who, 1440);
    await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Change control' }).click();
    await page.locator('tbody.qcc-change').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(600);
    const rows = await page.evaluate(() => [...document.querySelectorAll('tbody.qcc-change')].map((b) => ({
      number: b.querySelector('.qms-num').textContent.trim(),
      status: b.dataset.status,
      next: [...b.querySelectorAll('tr:first-child .qms-rowacts button')].map((x) => x.textContent.trim()),
    })));
    log.steps.push({ name: who, assessed: rows.filter((r) => r.status === 'under_assessment') });
    await ctx.close();
  }
});
