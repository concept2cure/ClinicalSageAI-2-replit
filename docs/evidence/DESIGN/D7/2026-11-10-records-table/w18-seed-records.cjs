// Walk 18 (first half): one record in each quality register, raised through its own create form as a person would.
const { run, signIn, log, BASE } = require('./lib.cjs');

const tag = String(Date.now()).slice(-5);
const today = new Date().toISOString().slice(0, 10);
const FORMS = [
  { tab: 'CAPA', create: 'Raise CAPA', fill: async (d) => {
    await d.getByLabel(/^Title/).fill(`Walk C11: gasket supplier CAPA ${tag}`);
    await d.getByLabel(/Raised from/).selectOption({ index: 1 });
  } },
  { tab: 'Deviations', create: 'Record deviation', fill: async (d) => {
    await d.getByLabel(/Deviation number/).fill(`DEV-C11-${tag}`);
    await d.getByLabel(/Detected on/).fill(today);
    await d.getByLabel(/What happened/).fill('Walk C11: EM excursion, Grade B room 2');
    await d.getByLabel(/^Description/).fill('Walk C11: a deviation recorded through the register form.');
    await d.getByRole('radio', { name: 'Major' }).click().catch(async () => { await d.getByRole('button', { name: 'Major' }).click(); });
  } },
  { tab: 'Nonconformances', create: 'Record nonconformance', fill: async (d) => {
    await d.getByLabel(/^Number/).fill(`NC-C11-${tag}`);
    await d.getByLabel(/What was found/).fill('Walk C11: label stock out of specification at receipt.');
  } },
  { tab: 'Suppliers', create: 'Add supplier', fill: async (d) => {
    await d.getByLabel(/^Supplier/).first().fill(`Walk C11 Gaskets ${tag}`);
  } },
  { tab: 'Internal audits', create: 'Plan audit', fill: async (d) => {
    await d.getByLabel(/^Number/).fill(`IA-C11-${tag}`);
    await d.getByLabel(/^Scope/).fill('Walk C11: change control and document control.');
  } },
  { tab: 'Management reviews', create: 'Record review', fill: async (d) => {
    await d.getByLabel(/Period covered/).fill(`H2-${tag}`);
    await d.getByLabel(/Held on/).fill(today);
  } },
];

run('w18-seed-records', async (browser) => {
  const { ctx, page } = await signIn(browser, 'author', 1440);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  for (const f of FORMS) {
    await page.getByRole('tab', { name: f.tab }).click();
    await page.getByRole('button', { name: f.create }).first().click();
    const d = page.getByRole('dialog').last();
    await d.waitFor({ timeout: 15000 });
    await f.fill(d);
    await d.locator('button[type=submit], .de-foot .btn.primary, button.primary').last().click();
    const toast = page.locator('.de-toast').last();
    await toast.waitFor({ timeout: 15000 }).catch(() => {});
    log.steps.push({ name: f.tab, toast: await toast.textContent().catch(() => null),
      drawerOpen: await d.isVisible().catch(() => false), refusal: await d.locator('[role=alert]').textContent().catch(() => null) });
    if (await d.isVisible().catch(() => false)) await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
  await ctx.close();
});
