// Walk 18 (CAPA): open the project, go to Quality, raise a CAPA through its form, then read the CAPA register.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');
const PROJECT = '5d669ca3-055f-48b1-9c34-364eb33ecb95';
run('w18-capa', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  // The project is opened the way a link opens it (shellProject.ts programIdFromUrl).
  await page.goto(`${BASE}/concept2cure/quality?program=${PROJECT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.getByRole('tab', { name: 'CAPA' }).click();
  await page.getByRole('button', { name: 'Raise CAPA' }).first().click();
  const d = page.getByRole('dialog').last();
  await d.waitFor({ timeout: 15000 });
  log.steps.push({ name: 'form', notice: (await d.textContent()).slice(0, 220) });
  await d.getByLabel(/^Title/).fill('Walk C11: gasket supplier CAPA');
  await d.getByLabel(/Raised from/).selectOption('supplier').catch(async () => { await d.getByLabel(/Raised from/).selectOption({ index: 6 }); });
  await d.getByLabel(/Target close/).fill('2026-12-15').catch(() => {});
  await d.getByRole('button', { name: 'Raise CAPA' }).click();
  const toast = page.locator('.de-toast').last();
  await toast.waitFor({ timeout: 15000 }).catch(() => {});
  log.steps.push({ name: 'raised', toast: await toast.textContent().catch(() => null), open: await d.isVisible().catch(() => false),
    refusal: await d.locator('[role=alert], .de-notice').first().textContent().catch(() => null), url: page.url().replace(BASE, '') });
  await shot(page, 'w18-capa-raised', false);
  await ctx.close();
});
