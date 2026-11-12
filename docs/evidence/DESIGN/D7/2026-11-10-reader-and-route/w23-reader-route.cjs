// Walk 23: the training reader is the product's drawer, its SOP set in the reading serif (C16); the review route's
// sheets are the drawer and reassigning is the shared sheet, with no orange on the member lines (C17).
const { run, signIn, shot, log, api, BASE } = require('./lib.cjs');
const PROGRAM = '5d669ca3-055f-48b1-9c34-364eb33ecb95';

async function more(page, n) {
  const b = page.locator('tbody.qms-doc').filter({ hasText: n }).getByRole('button', { name: /^More actions for / });
  if (await b.getAttribute('aria-expanded') !== 'true') await b.click();
}

function drawerFacts() {
  const d = [...document.querySelectorAll('[role="dialog"]')].at(-1);
  if (!d) return { open: false };
  const r = d.getBoundingClientRect();
  const bd = window.getComputedStyle(d.parentElement);
  const rail = document.querySelector('.rail');
  const text = d.querySelector('.qms-training-content p');
  return {
    dialog: d.getAttribute('aria-label') || (d.querySelector('.de-h-t') || {}).textContent, cls: d.className, backdrop: d.parentElement.className,
    left: Math.round(r.left), width: Math.round(r.width), scrim: bd.backgroundColor, z: bd.zIndex,
    railVisible: rail ? rail.getBoundingClientRect().width > 0 : null, eyebrow: !!d.querySelector('.de-h-eye'),
    textFont: text ? window.getComputedStyle(text).fontFamily : null,
    footer: [...d.querySelectorAll('.de-f button')].map((b) => `${b.textContent.trim()}${b.disabled ? ' (disabled)' : ''}`),
  };
}

async function reader(browser) {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'My acknowledgement' }).first().click();
  const d = page.getByRole('dialog', { name: 'Read and acknowledge' });
  await d.waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  log.steps.push({ name: 'reader', ...(await page.evaluate(drawerFacts)) });
  const box = d.getByRole('checkbox');
  if (await box.count()) {
    await box.focus();
    await page.keyboard.press('Space');
    const ring = await box.evaluate((el) => ({ outline: window.getComputedStyle(el).outlineColor, accent200: window.getComputedStyle(document.documentElement).getPropertyValue('--accent-200').trim() }));
    log.steps.push({ name: 'reader-declared', ring, footer: (await page.evaluate(drawerFacts)).footer });
  }
  await shot(page, 'w23-reader-1440', false);
  await d.getByRole('button', { name: 'Close', exact: true }).click();
  await ctx.close();
}

async function route(browser) {
  const { ctx, page } = await signIn(browser, 'author', 1440);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  const title = `Walk C17 route ${String(Date.now()).slice(-5)}`;
  const made = await api(page, 'POST', '/api/mdx/qms/documents', { title, docType: 'sop', programId: PROGRAM, reason: 'Walk C17: a document to send for review.' });
  log.steps.push({ name: 'created', status: made.status, number: made.body && made.body.data && made.body.data.doc_number });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // The route covers saved text: the author writes the procedure in the one editor first, as a person does.
  await more(page, title);
  await page.locator('tbody.qms-doc').filter({ hasText: title }).getByRole('button', { name: 'Open', exact: true }).click();
  const editable = page.locator('[contenteditable="true"]').first();
  await editable.waitFor({ timeout: 20000 });
  await editable.click();
  await page.keyboard.type('Receive the complaint, log it within one working day, and assess it for reportability.');
  await page.getByLabel('Reason for change').fill('Walk C17: the first text of the procedure.');
  await page.getByTestId('save-section').click();
  await page.waitForTimeout(4000);
  log.steps.push({ name: 'written', saveEnabledAfter: await page.getByTestId('save-section').isEnabled() });
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.locator('tbody.qms-doc').filter({ hasText: title }).getByRole('button', { name: /Send for review/ }).click();
  const form = page.getByTestId('qms-route-form');
  await form.waitFor({ timeout: 15000 });
  log.steps.push({ name: 'route-form', ...(await page.evaluate(drawerFacts)) });
  const approver = form.locator('input[type="checkbox"][data-testid^="qms-approver-"]:not([disabled])').first();
  await approver.waitFor({ timeout: 15000 });
  await approver.check();
  const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  await form.getByTestId('qms-approval-due').fill(due);
  await form.getByTestId('qms-route-reason').fill('Walk C17: ready for QA review.');
  await form.getByTestId('qms-route-send').click();
  await page.waitForTimeout(2500);
  const refused = await page.getByTestId('qms-route-error').count() ? await page.getByTestId('qms-route-error').textContent() : null;
  log.steps.push({ name: 'sent', refused });
  if (refused) { await shot(page, 'w23-route-refused-1440', false); await ctx.close(); return; }
  await more(page, title);
  await page.locator('tbody.qms-doc').filter({ hasText: title }).getByTestId('qms-route-open').click();
  const panel = page.getByTestId('qms-route-panel');
  await panel.waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const lineButtons = await panel.locator('.vr-member button').evaluateAll((bs) => bs.map((b) => `${b.textContent.trim()}: ${b.className}, ${window.getComputedStyle(b).color}`));
  log.steps.push({ name: 'route-panel', ...(await page.evaluate(drawerFacts)), lineButtons });
  await shot(page, 'w23-route-panel-1440', false);
  await panel.getByRole('button', { name: /^Reassign / }).first().click();
  const sheet = page.getByTestId('vault-route-reassign');
  await sheet.waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  log.steps.push({ name: 'reassign-sheet', ...(await page.evaluate(drawerFacts)),
    offered: await sheet.locator('[data-testid^="vr-reassign-"][type]').count(), reading: await sheet.getByText('Read it again').count() });
  await shot(page, 'w23-reassign-1440', false);
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await ctx.close();
}

run('w23-reader-route', async (browser) => {
  await reader(browser);
  await route(browser);
});
