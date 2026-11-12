// Walk 31 (F1): a record linked to a change past proposal states why, and the link's audit row keeps how the record
// relates and why; a link to a proposed change may say why and need not.
const { run, signIn, shot, log, api, BASE } = require('./lib.cjs');

run('w31-change-link-reason', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  const changes = (await api(page, 'GET', '/api/mdx/qms/changes')).body?.data ?? [];
  const assessing = changes.find((c) => c.status === 'under_assessment');
  const approved = changes.find((c) => c.status === 'approved');
  log.steps.push({ name: 'changes', assessing: assessing && `${assessing.change_number}:${assessing.status}`, approved: approved && `${approved.change_number}:${approved.status}` });

  // In the drawer, as a person links a record to a change under assessment.
  await page.getByRole('tab', { name: 'Change control' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: `More actions for ${assessing.change_number}` }).click();
  await page.getByRole('button', { name: /Link a record/ }).click();
  const d = page.getByRole('dialog', { name: new RegExp(`Link a record to ${assessing.change_number}`) });
  await d.waitFor({ timeout: 15000 });
  const why = d.getByLabel(/Why it is linked/);
  log.steps.push({ name: 'drawer', reasonField: await why.count(), required: await why.getAttribute('aria-required'),
    desc: await d.locator('text=Required once a change is past proposal').count() });
  await d.getByLabel(/Record type/).selectOption('validation');
  const ref = `VP-W31-${String(Date.now()).slice(-5)}`;
  await d.getByLabel(/^Reference/).fill(ref);
  await d.getByRole('button', { name: 'Link record' }).click();
  await page.waitForTimeout(800);
  log.steps.push({ name: 'no-reason', stillOpen: await d.count(), invalid: await why.getAttribute('aria-invalid') });
  await shot(page, 'w31-link-reason-1440', false);
  await why.fill('The validation protocol this change is assessed against.');
  await d.getByRole('button', { name: 'Link record' }).click();
  await page.locator('.de-toast').last().waitFor({ timeout: 15000 }).catch(() => {});
  log.steps.push({ name: 'linked', toast: await page.locator('.de-toast').last().textContent().catch(() => null), ref });

  // The route: an approved change without a reason is refused; a proposed one needs none.
  if (approved) {
    const refused = await api(page, 'POST', `/api/mdx/qms/changes/${approved.id}/links`, { linkType: 'validation', linkedRef: 'VP-W31-X' });
    log.steps.push({ name: 'approved-no-reason', status: refused.status, error: refused.body?.error ?? null });
  }
  const made = await api(page, 'POST', '/api/mdx/qms/changes', { changeNumber: `CC-W31-${String(Date.now()).slice(-6)}`, title: 'Walk 31: a proposed change', changeType: 'supplier', reason: 'Walk 31: a proposed change to link to.' });
  const proposedId = made.body?.data?.id;
  const plain = await api(page, 'POST', `/api/mdx/qms/changes/${proposedId}/links`, { linkType: 'validation', linkedRef: 'VP-W31-P' });
  log.steps.push({ name: 'proposed-no-reason', status: plain.status, auditTrail: plain.body?.meta?.auditTrail ?? null });
  log.steps.push({ name: 'ids', assessing: assessing.id, proposed: proposedId });
  await ctx.close();
});
