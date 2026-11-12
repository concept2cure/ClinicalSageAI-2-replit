// Walk 21: Quality opened with a project open reads that project's records; "Show the whole organisation" widens it
// (C14, QP3).
const { run, signIn, shot, log, BASE } = require('./lib.cjs');
const PROGRAM = '5d669ca3-055f-48b1-9c34-364eb33ecb95';

async function read(page, label) {
  await page.waitForTimeout(1800);
  const f = await page.evaluate(() => {
    const area = document.querySelector('[data-work-area]');
    const sec = area.querySelector('.pj-sec');
    return {
      scope: (document.querySelector('[data-testid="quality-scope"]') || {}).textContent || null,
      toggle: [...document.querySelectorAll('.ph-acts button')].map((b) => b.textContent.trim()),
      rows: area.querySelectorAll('tbody.qms-doc, tbody.qcc-change, tbody.qms-rec').length,
      empty: (sec.querySelector('.c2c-empty-state') || {}).textContent || null,
      figures: (sec.querySelector('.sec-sub') || {}).textContent || null,
      url: location.search,
    };
  });
  log.steps.push({ name: label, ...f });
}

run('w21-project-scope', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  await read(page, 'sop-project');
  await shot(page, 'w21-sop-project-1440', false);
  for (const tab of ['Change control', 'CAPA', 'Nonconformances', 'Deviations']) {
    await page.getByRole('tab', { name: tab }).click();
    await read(page, `${tab}-project`);
  }
  // A nonconformance recorded here is filed under the project by default.
  await page.getByRole('tab', { name: 'Nonconformances' }).click();
  await page.getByRole('button', { name: 'Record nonconformance' }).click();
  const d = page.getByRole('dialog').last();
  await d.waitFor({ timeout: 15000 });
  log.steps.push({ name: 'nc-form-project', checked: await d.getByRole('radio', { checked: true }).allTextContents() });
  await d.getByLabel(/^Number/).fill(`NC-C14-${String(Date.now()).slice(-5)}`);
  await d.getByLabel(/What was found/).fill('Walk C14: filed under the open project.');
  await d.getByRole('button', { name: 'Record', exact: true }).click();
  await page.locator('.de-toast').last().waitFor({ timeout: 15000 }).catch(() => {});
  await read(page, 'nc-after-record');
  await shot(page, 'w21-nc-project-1440', false);
  // Widen to the whole organisation.
  await page.getByRole('button', { name: 'Show the whole organisation' }).click();
  await read(page, 'nc-organisation');
  await page.getByRole('tab', { name: 'SOP register' }).click();
  await read(page, 'sop-organisation');
  await shot(page, 'w21-sop-organisation-1440', false);
  // A reload keeps the choice.
  await page.reload({ waitUntil: 'networkidle' });
  await read(page, 'sop-organisation-reloaded');
  await page.getByRole('button', { name: /only$/ }).click();
  await read(page, 'sop-project-again');
  await ctx.close();
});
