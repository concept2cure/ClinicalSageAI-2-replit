// Walk 19: CAPA and management-review action items are a table, and their moves are named by the act (C13).
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

async function addAction(page, d, description) {
  if (await d.getByLabel('Action type').count()) {
    await d.getByLabel('Action type').selectOption({ index: 1 });
    await d.getByLabel('What will be done').fill(description);
  } else {
    await d.getByLabel(/^Action/).first().fill(description);
  }
  await d.getByLabel(/^Owner/).fill('QA').catch(() => {});
  await d.locator('button.primary, .btn.primary').last().click();
  await page.locator('.de-toast').last().waitFor({ timeout: 15000 }).catch(() => {});
  return page.locator('.de-toast').last().textContent().catch(() => null);
}
const table = (page, name) => page.getByRole('table', { name });
const items = (t) => t.evaluate((el) => ({
  heads: [...el.querySelectorAll('thead th')].map((h) => h.textContent.trim()),
  headRows: el.tHead.rows.length, bodies: el.tBodies.length,
  rows: [...el.tBodies[0].rows].map((tr) => [...tr.cells].map((td) => td.textContent.trim())),
}));

run('w19-action-items', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality?program=5d669ca3-055f-48b1-9c34-364eb33ecb95`, { waitUntil: 'networkidle' });
  // CAPA: add an action, open the CAPA, start the action.
  await page.getByRole('tab', { name: 'CAPA' }).click();
  const capa = page.locator('tbody.qms-rec').first();
  await capa.waitFor({ timeout: 30000 });
  await capa.getByRole('button', { name: /^More actions for/ }).click();
  await capa.getByRole('button', { name: 'Add action' }).click();
  log.steps.push({ name: 'capa-added', toast: await addAction(page, page.getByRole('dialog').last(), 'Walk C13: qualify the second gasket supplier') });
  await page.waitForTimeout(800);
  await capa.locator('button.qms-num').click();
  const ct = table(page, /^Action items of CAPA-/);
  await ct.waitFor({ timeout: 15000 });
  log.steps.push({ name: 'capa-items', ...(await items(ct)) });
  await ct.getByRole('button', { name: /^Start: action/ }).first().click();
  const move = page.getByRole('dialog').last();
  log.steps.push({ name: 'start-form', title: await move.locator('h2, h3, .de-title').first().textContent().catch(() => null) });
  await move.getByRole('button', { name: 'Record the move' }).click();
  await page.locator('.de-toast').filter({ hasText: 'in progress' }).first().waitFor({ timeout: 15000 }).catch(() => {});
  log.steps.push({ name: 'started', toast: await page.locator('.de-toast').last().textContent().catch(() => null) });
  await page.waitForTimeout(1200);
  const ct2 = table(page, /^Action items of CAPA-/);
  log.steps.push({ name: 'capa-items-after', ...(await items(ct2)) });
  await shot(page, 'w19-capa-items-1440', false);
  // Management review: add an action, open the review, see its Close.
  await page.getByRole('tab', { name: 'Management reviews' }).click();
  const rev = page.locator('tbody.qms-rec').first();
  await rev.waitFor({ timeout: 30000 });
  await rev.getByRole('button', { name: 'Add action' }).click();
  log.steps.push({ name: 'review-added', toast: await addAction(page, page.getByRole('dialog').last(), 'Walk C13: appoint a QA lead') });
  await page.waitForTimeout(800);
  await rev.locator('button.qms-num').click();
  const rt = table(page, /^Action items of the .* management review$/);
  await rt.waitFor({ timeout: 15000 });
  log.steps.push({ name: 'review-items', ...(await items(rt)), close: await rt.getByRole('button', { name: /^Close action/ }).count() });
  await shot(page, 'w19-review-items-1440', false);
  log.steps.push({ name: 'old', count: await page.locator('.qcc-actions, .qcc-action, .qms-chip').count() });
  await ctx.close();
});
