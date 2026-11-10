// Walk 7: "Open" on a register row reaches the one editor (C5), and the editor's Back returns to the register.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

run('w7-open', async (browser) => {
  const { ctx, page } = await signIn(browser, 'author', 1440);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.locator('.qms-row').first().waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: /^More actions for QS-SOP-001/ }).click();
  const group = page.getByRole('group', { name: 'Actions for QS-SOP-001' });
  log.steps.push({ name: 'more', buttons: await group.getByRole('button').allTextContents() });
  await group.getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => ({
    workArea: !!document.querySelector('[data-work-area="quality"]'),
    editing: !!document.querySelector('.qms-shell[data-editing]'),
    reader: !!document.querySelector('.qms-training-overlay'),
    back: [...document.querySelectorAll('button')].some((b) => /Back to Quality register/.test(b.textContent || '')),
    text: (document.querySelector('main') || document.body).innerText.slice(0, 400),
  }));
  log.steps.push({ name: 'after-open', ...state });
  await shot(page, 'w7-open-editor', false);
  const back = page.getByRole('button', { name: /Back to Quality register/ });
  if (await back.count()) {
    await back.first().click();
    await page.waitForTimeout(1500);
    log.steps.push({ name: 'after-back', workArea: await page.locator('[data-work-area="quality"]').count() });
  }
  await ctx.close();
});
