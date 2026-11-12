// Walk 40: a record linked to a change is removed from the change's own row, with its reason; the link shows why it
// was linked; a closed, cancelled or rejected change offers neither a link nor a removal.
const { run, signIn, shot, log, api, BASE } = require('./lib.cjs');

const toast = async (page) => { await page.locator('.de-toast').last().waitFor({ timeout: 15000 }).catch(() => {}); return page.locator('.de-toast').last().textContent().catch(() => null); };

run('w40-remove-link', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  // The walk links a record of its own to a proposed change (no reason is needed there), then removes it on screen.
  const listed = (await api(page, 'GET', '/api/mdx/qms/changes')).body?.data ?? [];
  const proposed = listed.find((c) => c.status === 'proposed' && (c.links ?? []).length === 0);
  const ref = `VP-W40-${String(Date.now()).slice(-5)}`;
  const added = await api(page, 'POST', `/api/mdx/qms/changes/${proposed.id}/links`, { linkType: 'validation', linkedRef: ref, linkedLabel: 'Walk 40 validation protocol' });
  log.steps.push({ name: 'link-added', status: added.status, to: proposed.change_number, ref });
  const changes = (await api(page, 'GET', '/api/mdx/qms/changes')).body?.data ?? [];
  const linked = changes.find((c) => c.id === proposed.id);
  await page.reload({ waitUntil: 'networkidle' });
  const terminal = changes.find((c) => ['closed', 'cancelled', 'rejected'].includes(c.status));
  log.steps.push({ name: 'changes', linked: linked && { number: linked.change_number, status: linked.status, links: linked.links.map((l) => ({ id: l.id, ref: l.linked_ref, note: l.note })) },
    terminal: terminal ? `${terminal.change_number}:${terminal.status}` : null });
  await page.getByRole('tab', { name: 'Change control' }).click();
  await page.waitForTimeout(1500);

  // The change's record, in its row: its linked records, why each was linked, and Remove.
  const row = page.locator('tbody.qcc-change', { hasText: linked.change_number });
  await row.locator('button.qcc-linkcount').click();
  await page.waitForTimeout(600);
  const link = linked.links[0];
  const items = await row.locator('.qcc-links li').evaluateAll((lis) => lis.map((li) => li.textContent.trim().replace(/\s+/g, ' ')));
  log.steps.push({ name: 'record', items, linkCount: await row.locator('button.qcc-linkcount').getAttribute('aria-label') });
  await shot(page, 'w40-linked-records-1440', false);

  await row.getByRole('button', { name: `Remove ${link.linked_ref} from ${linked.change_number}` }).click();
  const d = page.getByRole('dialog', { name: new RegExp(`Remove ${link.linked_ref} from ${linked.change_number}`) });
  await d.waitFor({ timeout: 15000 });
  await d.getByRole('button', { name: 'Remove link' }).click();
  await page.waitForTimeout(600);
  log.steps.push({ name: 'no-reason', stillOpen: await d.count(), invalid: await d.getByLabel(/Reason for removing it/).getAttribute('aria-invalid') });
  await shot(page, 'w40-remove-link-1440', false);
  await d.getByLabel(/Reason for removing it/).fill('Walk 40: linked to this change in error.');
  await d.getByRole('button', { name: 'Remove link' }).click();
  log.steps.push({ name: 'removed', toast: await toast(page) });
  await page.waitForTimeout(1500);
  log.steps.push({ name: 'after', linkCount: await row.locator('button.qcc-linkcount').getAttribute('aria-label'),
    items: await row.locator('.qcc-links li').evaluateAll((lis) => lis.map((li) => li.textContent.trim().replace(/\s+/g, ' '))),
    empty: await row.locator('.qcc-detail .c2c-empty-state').allTextContents() });

  // A link recorded with its reason shows why it was linked.
  const noted = changes.find((c) => (c.links ?? []).some((l) => l.note) && c.id !== linked.id);
  if (noted) {
    const n = page.locator('tbody.qcc-change', { hasText: noted.change_number });
    await n.locator('button.qcc-linkcount').click();
    await page.waitForTimeout(600);
    log.steps.push({ name: 'why-linked', number: noted.change_number, notes: await n.locator('.qcc-link-note').allTextContents() });
    await shot(page, 'w40-why-linked-1440', false);
  }

  // A change the server takes no link on offers none: the walk raises one and cancels it through its lifecycle.
  const made = await api(page, 'POST', '/api/mdx/qms/changes', { changeNumber: `CC-W40-${String(Date.now()).slice(-6)}`, title: 'Walk 40: raised to be cancelled', changeType: 'supplier', reason: 'Walk 40: a cancelled change, to read its row.' });
  const cancelled = made.body?.data;
  const move = await api(page, 'POST', `/api/mdx/qms/changes/${cancelled.id}/transition`, { to: 'cancelled', reason: 'Walk 40: cancelled to read a terminal change.' });
  log.steps.push({ name: 'cancelled', status: move.status, state: move.body?.data?.status });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Change control' }).click();
  await page.waitForTimeout(1500);
  {
    const t = page.locator('tbody.qcc-change', { hasText: cancelled.change_number });
    await t.locator('button.qcc-linkcount').click();
    await page.waitForTimeout(500);
    log.steps.push({ name: 'terminal', number: cancelled.change_number,
      actions: await t.locator('tr.qms-row-acts-tr button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || b.textContent.trim())),
      empty: await t.locator('.qcc-detail .c2c-empty-state').allTextContents() });
  }
  if (terminal) {
    const t = page.locator('tbody.qcc-change', { hasText: terminal.change_number });
    log.steps.push({ name: 'terminal', number: terminal.change_number,
      actions: await t.locator('tr.qms-row-acts-tr button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || b.textContent.trim())) });
  } else {
    log.steps.push({ name: 'terminal', skipped: 'no closed, cancelled or rejected change in the walk organisation' });
  }
  log.steps.push({ name: 'ids', change: linked.id, link: link.id });
  await ctx.close();
});
