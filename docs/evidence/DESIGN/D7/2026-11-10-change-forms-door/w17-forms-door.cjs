// Walk 17: the change-control documents open the one "New controlled document" door, with the change templates (C10).
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

run('w17-forms-door', async (browser) => {
  for (const width of [1440, 390]) {
    const { ctx, page } = await signIn(browser, 'author', width);
    await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: 'Change control' }).click();
    const sec = page.getByRole('region', { name: 'Change-control documents and forms' });
    await sec.waitFor({ timeout: 60000 });
    await sec.getByRole('button', { name: 'New controlled document' }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    log.steps.push({ name: `section-${width}`, sub: await sec.locator('.sec-sub').textContent(),
      buttons: await sec.getByRole('button').allTextContents(),
      docScroll: await page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth) });
    await sec.scrollIntoViewIfNeeded();
    if (width === 1440) await shot(page, 'w17-section-1440', false);
    await sec.getByRole('button', { name: 'New controlled document' }).click();
    const d = page.getByRole('dialog', { name: /New controlled document/ });
    await d.waitFor({ timeout: 15000 });
    const select = d.getByLabel(/^Template/);
    log.steps.push({ name: `door-${width}`, options: await select.locator('option').allTextContents() });
    await select.selectOption('change_control_sop').catch(() => {});
    await page.waitForTimeout(300);
    log.steps.push({ name: `chosen-${width}`, title: await d.getByLabel('Title').inputValue().catch(() => null),
      type: await d.getByLabel(/Document type/).inputValue().catch(() => null),
      hint: await d.locator('#qms-template-description').textContent().catch(() => null) });
    await shot(page, `w17-door-${width}`, false);
    await ctx.close();
  }
});
