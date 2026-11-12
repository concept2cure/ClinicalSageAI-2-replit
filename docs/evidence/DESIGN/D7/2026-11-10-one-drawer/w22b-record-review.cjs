// Walk 22b: the periodic-review decision is the same drawer (C15). The walk organisation had no effective document,
// so the approver first approves the one in review through the register's own Approve and the e-signature, then opens
// Record review on it and chooses an outcome in the drawer's single choice. Nothing is signed in the review itself.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');

async function more(page) {
  const b = page.getByRole('button', { name: /^More actions for / }).first();
  if (await b.getAttribute('aria-expanded') !== 'true') await b.click();
}

async function approveIfOffered(page) {
  await more(page);
  const approve = page.getByRole('button', { name: /^Approve/ }).first();
  log.steps.push({ name: 'approve-offered', count: await approve.count() });
  if (!(await approve.count())) return;
  await approve.click();
  const sign = page.getByRole('dialog', { name: /Electronic signature/ });
  await sign.waitFor({ timeout: 15000 });
  await sign.getByLabel(/Reason for this action/).fill('Walk C15: approve so its periodic review can be recorded.');
  await sign.getByLabel(/Password/).fill(process.env.WALK_PASSWORD);
  await sign.getByRole('button', { name: /Sign and commit/ }).click();
  await page.waitForTimeout(2500);
  log.steps.push({ name: 'approved', status: await page.locator('tbody.qms-doc .rd-chip').first().textContent() });
}

run('w22b-record-review', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await approveIfOffered(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await more(page);
  const review = page.getByRole('button', { name: /^Record review: / }).first();
  log.steps.push({ name: 'record-review-offered', count: await review.count() });
  if (!(await review.count())) { await ctx.close(); return; }
  await review.click();
  const d = page.getByRole('dialog', { name: 'Record periodic review' });
  await d.waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  const before = await d.getByRole('radio').evaluateAll((rs) => rs.map((r) => `${r.textContent}:${r.getAttribute('aria-checked')}`));
  await shot(page, 'w22-record-review-1440', false);
  await d.getByRole('button', { name: 'Continue to sign' }).click();
  const refused = await d.getByRole('alert').textContent();
  await d.getByRole('radio', { name: 'Revision required' }).click();
  const after = await d.getByRole('radio').evaluateAll((rs) => rs.map((r) => `${r.textContent}:${r.getAttribute('aria-checked')}`));
  const box = await d.evaluate((el) => { const r = el.getBoundingClientRect(); return { cls: el.className, backdrop: el.parentElement.className, left: Math.round(r.left), width: Math.round(r.width) }; });
  log.steps.push({ name: 'record-review-drawer', ...box, before, refusedWithoutDate: refused, after,
    dateFieldAfterRevision: await d.getByLabel('Next periodic review').count() });
  await shot(page, 'w22-record-review-revision-1440', false);
  await d.getByRole('button', { name: 'Cancel' }).click();
  await ctx.close();
});
