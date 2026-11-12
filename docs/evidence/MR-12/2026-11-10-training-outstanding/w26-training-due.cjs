// Walk 26: the per-person training view lists who has not yet acknowledged (G10, MR-12 Stage 4 slice 5). The approver
// assigns a person to the effective SOP through "Who must train"; that person is listed as due 14 days after they were
// assigned (they were assigned after it took effect), and the all-clear is not given.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

async function section(page, label) {
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => {
    const sec = document.querySelector('[data-testid="training-expiry"]');
    return sec ? { head: sec.querySelector('h2').textContent, sub: (sec.querySelector('.sec-sub') || {}).textContent || null,
      rows: [...sec.querySelectorAll('[data-testid="training-expiry-row"]')].map((r) => r.textContent),
      empty: (sec.querySelector('.c2c-empty-state') || {}).textContent || null } : null;
  });
  log.steps.push({ name: label, ...s });
}

run('w26-training-due', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await section(page, 'before');
  const row = page.locator('tbody.qms-doc').filter({ hasText: 'QS-SOP-001' });
  const more = row.getByRole('button', { name: /^More actions for / });
  if (await more.getAttribute('aria-expanded') !== 'true') await more.click();
  await row.getByRole('button', { name: /^Training/ }).click();
  const d = page.getByRole('dialog', { name: /Who must train on QS-SOP-001/ });
  await d.waitFor({ timeout: 15000 });
  await d.getByRole('button', { name: 'Assign a person' }).click();
  const form = d.getByRole('form', { name: 'Assign a person' });
  const choice = form.getByLabel('Person');
  const options = await choice.locator('option').allTextContents();
  log.steps.push({ name: 'people-offered', options });
  const theo = options.find((o) => /Theo/.test(o));
  await choice.selectOption({ label: theo });
  await form.getByLabel('Reason').fill('Walk slice 5: Theo works complaints and must train on this procedure.');
  await form.getByRole('button', { name: 'Assign' }).click();
  await page.waitForTimeout(2000);
  log.steps.push({ name: 'assigned', count: await d.getByTestId('qms-assigned-count').textContent() });
  await d.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await section(page, 'after');
  await page.locator('[data-testid="training-expiry"]').scrollIntoViewIfNeeded();
  await shot(page, 'w26-training-due-1440', false);
  await ctx.close();
});
