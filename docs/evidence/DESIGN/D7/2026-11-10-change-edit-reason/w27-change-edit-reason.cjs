// Walk 27 (F1, Part 11 review L-2): a change's assessment edit states its reason, and the audit row keeps it with each
// field before and after; a change past approval is kept, and a proposed one is removed only with a reason.
const { run, signIn, shot, log, api, BASE } = require('./lib.cjs');

run('w27-change-edit-reason', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  const list = await api(page, 'GET', '/api/mdx/qms/changes');
  const changes = (list.body && list.body.data) || [];
  const editable = changes.find((c) => ['proposed', 'under_assessment'].includes(c.status));
  const approved = changes.find((c) => ['approved', 'in_implementation', 'verification', 'closed'].includes(c.status));
  log.steps.push({ name: 'changes', count: changes.length, editable: editable && `${editable.change_number}:${editable.status}`, approved: approved && `${approved.change_number}:${approved.status}` });

  // The edit, as a person makes it: the drawer will not save without a reason.
  await page.getByRole('tab', { name: 'Change control' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: `More actions for ${editable.change_number}` }).click();
  await page.getByRole('button', { name: 'Edit assessment' }).click();
  const d = page.getByRole('dialog', { name: new RegExp(`Assess ${editable.change_number}`) });
  await d.waitFor({ timeout: 15000 });
  const plan = `Walk F1: qualify the second source (${String(Date.now()).slice(-4)}).`;
  await d.getByLabel(/Implementation plan/).fill(plan);
  await d.getByRole('button', { name: 'Save assessment' }).click();
  await page.waitForTimeout(800);
  log.steps.push({ name: 'no-reason', stillOpen: await d.count(), invalid: await d.getByLabel(/Reason for this edit/).getAttribute('aria-invalid') });
  await shot(page, 'w27-edit-reason-1440', false);
  await d.getByLabel(/Reason for this edit/).fill('Second source added after the supplier audit.');
  await d.getByRole('button', { name: 'Save assessment' }).click();
  await page.locator('.de-toast').last().waitFor({ timeout: 15000 }).catch(() => {});
  log.steps.push({ name: 'saved', toast: await page.locator('.de-toast').last().textContent().catch(() => null), plan });

  // Removal: no client offers it; the route is checked directly.
  if (approved) {
    const kept = await api(page, 'DELETE', `/api/mdx/qms/changes/${approved.id}`, { reason: 'Walk F1: tidying the register.' });
    log.steps.push({ name: 'delete-approved', status: kept.status, code: kept.body && kept.body.details && kept.body.details.code, error: kept.body && kept.body.error });
  }
  const made = await api(page, 'POST', '/api/mdx/qms/changes', { changeNumber: `CC-F1-${String(Date.now()).slice(-6)}`, title: 'Walk F1: raised in error', changeType: 'supplier', reason: 'Walk F1: raised to be removed.' });
  const id = made.body && made.body.data && made.body.data.id;
  const noReason = await api(page, 'DELETE', `/api/mdx/qms/changes/${id}`, {});
  const removed = await api(page, 'DELETE', `/api/mdx/qms/changes/${id}`, { reason: 'Walk F1: raised twice in error.' });
  log.steps.push({ name: 'delete-proposed', created: made.status, noReason: `${noReason.status} ${noReason.body && noReason.body.error}`, removed: removed.status,
    auditTrail: removed.body && removed.body.meta && removed.body.meta.auditTrail });
  log.steps.push({ name: 'ids', edited: editable.id, removed: id });
  await ctx.close();
});
