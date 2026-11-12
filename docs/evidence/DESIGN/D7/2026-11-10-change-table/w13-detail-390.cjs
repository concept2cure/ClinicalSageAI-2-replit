// Walk 13: at 390, a change's More and linked records stay inside the visible section while the table scrolls (C8).
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

run('w13-detail-390', async (browser) => {
  const { ctx, page } = await signIn(browser, 'author', 390);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Change control' }).click();
  const first = page.locator('tbody.qcc-change').first();
  await first.waitFor({ timeout: 60000 });
  await first.getByRole('button', { name: /^More actions for/ }).click();
  await first.locator('button.qms-num').click();
  await page.waitForTimeout(500);
  const measure = () => page.evaluate(() => {
    const sec = document.querySelector('[data-work-area] .pj-sec').getBoundingClientRect();
    const box = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right) }; };
    const t = document.querySelector('table.qms-reg');
    return { section: { left: Math.round(sec.left), right: Math.round(sec.right) }, detail: box('.qms-reg .qcc-detail'), more: box('.qms-reg .qms-row-more'),
      tableScrollLeft: t.scrollLeft, docScroll: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth };
  });
  log.steps.push({ name: 'at-rest', ...(await measure()) });
  await shot(page, 'w13-detail-390', false);
  await page.evaluate(() => { document.querySelector('table.qms-reg').scrollLeft = 300; });
  await page.waitForTimeout(300);
  log.steps.push({ name: 'table-scrolled', ...(await measure()) });
  await shot(page, 'w13-detail-390-scrolled', false);
  await ctx.close();
});
