// Walk 28: a training drawer's act takes focus on its heading and gives it back to its opener; while the act saves the
// drawer cannot be dismissed; a disabled Delete says why beside it; on a phone the drawer's small buttons are 44px.
const { run, signIn, shot, log, api, BASE } = require('./lib.cjs');

const focusOf = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? { tag: a.tagName, text: (a.textContent || '').trim().slice(0, 60), cls: a.className || '' } : null;
});

async function openJobRoles(page) {
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Job roles' }).click();
  await page.getByRole('dialog', { name: 'Job roles' }).waitFor();
  await page.waitForTimeout(1000);
  return page.getByRole('dialog', { name: 'Job roles' });
}

/* The organization had no job roles, so the walk first makes one through the real routes: a role, one holder (Theo,
   the trainee) and an assignment to an effective SOP. Each write states its reason. */
async function setup(page) {
  const WHY = 'Walk 28: a job role to read the training drawers against.';
  let roles = (await api(page, 'GET', '/api/mdx/qms/job-roles')).body?.data?.roles ?? [];
  let role = roles.find((r) => r.name === 'QA reviewer (walk)');
  if (!role) {
    const made = await api(page, 'POST', '/api/mdx/qms/job-roles', { name: 'QA reviewer (walk)', description: 'Reviews controlled procedures before release.', reason: WHY });
    log.steps.push({ name: 'setup-role', status: made.status });
    role = made.body?.data;
  }
  if (!role?.id) return;
  roles = (await api(page, 'GET', '/api/mdx/qms/job-roles')).body?.data?.roles ?? [];
  role = roles.find((r) => r.id === role.id) ?? role;
  if (!(role.members ?? []).some((m) => m.userId === 3)) {
    const add = await api(page, 'POST', `/api/mdx/qms/job-roles/${role.id}/members`, { userId: 3, reason: WHY });
    log.steps.push({ name: 'setup-holder', status: add.status, error: add.body?.message ?? add.body?.error ?? null });
  }
  if (!role.documentCount) {
    const docs = (await api(page, 'GET', '/api/mdx/qms/documents')).body?.data ?? [];
    const sop = docs.find((d) => d.status === 'effective' && d.doc_type === 'sop');
    if (sop) {
      const assign = await api(page, 'POST', `/api/mdx/qms/documents/${sop.id}/training-assignments`, { jobRoleId: role.id, reason: WHY });
      log.steps.push({ name: 'setup-assignment', document: sop.doc_number, status: assign.status, error: assign.body?.message ?? assign.body?.error ?? null });
    } else log.steps.push({ name: 'setup-assignment', skipped: 'no effective SOP' });
  }
}

async function wide(browser) {
  const { page } = await signIn(browser, 'approver', 1440);
  await setup(page);
  const roles = await api(page, 'GET', '/api/mdx/qms/job-roles');
  const list = roles.body?.data?.roles ?? [];
  log.steps.push({ name: 'job-roles-read', status: roles.status, roles: list.map((r) => ({ id: r.id, name: r.name, documentCount: r.documentCount, members: r.members?.length })) });
  const dialog = await openJobRoles(page);

  // A role assigned to a document: Delete is disabled and the reason is said beside it.
  const assigned = list.find((r) => r.documentCount > 0);
  if (assigned) {
    const row = dialog.getByTestId(`qms-job-role-${assigned.id}`);
    const del = row.getByRole('button', { name: 'Delete' });
    const note = await del.evaluate((b) => ({ disabled: b.disabled, title: b.getAttribute('title'),
      describedBy: b.getAttribute('aria-describedby'),
      note: document.getElementById(b.getAttribute('aria-describedby') || '')?.textContent?.trim() ?? null }));
    log.steps.push({ name: 'delete-note', role: assigned.name, ...note });
    await row.scrollIntoViewIfNeeded();
    await shot(page, 'w28-delete-note-1440', false);
  } else {
    log.steps.push({ name: 'delete-note', skipped: 'no job role is assigned to a document in this organization' });
  }

  // New job role: focus moves to the act's heading, the footer button stays (disabled), and Cancel gives focus back.
  const create = dialog.getByRole('button', { name: /New job role/ });
  await create.focus();
  await create.click();
  await page.waitForTimeout(300);
  const inAct = await focusOf(page);
  const createDisabled = await create.isDisabled();
  const createOpacity = await create.evaluate((b) => window.getComputedStyle(b).opacity);
  await shot(page, 'w28-act-open-1440', false);
  await dialog.getByRole('form', { name: /New job role/ }).getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(300);
  log.steps.push({ name: 'act-focus', focusInAct: inAct, footerDisabledWhileOpen: createDisabled, footerOpacityWhileOpen: createOpacity, focusAfterCancel: await focusOf(page) });

  // Remove a holder, with the write held for two seconds and then refused (nothing is removed): while it saves, the
  // drawer's Close is disabled and Escape does not close it.
  const holder = list.find((r) => (r.members?.length ?? 0) > 0);
  if (holder) {
    await page.route(`**/api/mdx/qms/job-roles/${holder.id}/members/**`, async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue();
      await new Promise((r) => setTimeout(r, 2000));
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Held by the walk; nothing was removed.' }) });
    });
    const row = dialog.getByTestId(`qms-job-role-${holder.id}`);
    await row.getByRole('button', { name: 'Remove' }).first().click();
    const form = dialog.getByRole('form', { name: /^Remove / });
    await form.getByRole('textbox').fill('Walk 28: checking the drawer holds while the act saves.');
    await form.getByRole('button', { name: 'Remove' }).click();
    await page.waitForTimeout(400);
    const close = dialog.getByRole('button', { name: 'Close', exact: true });
    const closeDisabled = await close.isDisabled().catch(() => null);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const stillOpen = await dialog.isVisible();
    await shot(page, 'w28-act-saving-1440', false);
    await page.waitForTimeout(2200);
    const refusal = await form.locator('[role="alert"], .de-error, .error').first().textContent().catch(() => null);
    log.steps.push({ name: 'act-saving', role: holder.name, closeDisabledWhileSaving: closeDisabled, openAfterEscape: stillOpen,
      refusalAfter: refusal?.trim() ?? null, closeEnabledAfter: !(await close.isDisabled()) });
    await page.unroute(`**/api/mdx/qms/job-roles/${holder.id}/members/**`);
  } else {
    log.steps.push({ name: 'act-saving', skipped: 'no job role has a holder in this organization' });
  }
}

async function phone(browser) {
  const { page } = await signIn(browser, 'approver', 390);
  const dialog = await openJobRoles(page);
  const sizes = await dialog.evaluate((d) => [...d.querySelectorAll('.de-body .btn.small, .vr-member .btn.small, .de-seg-opt')]
    .map((b) => ({ text: (b.textContent || '').trim().slice(0, 30), h: Math.round(b.getBoundingClientRect().height) })));
  log.steps.push({ name: 'phone-touch-targets', count: sizes.length, minHeight: Math.min(...sizes.map((s) => s.h)), sample: sizes.slice(0, 6) });
  await shot(page, 'w28-job-roles-390', false);
}

run('w28-training-acts', async (browser) => { await wide(browser); await phone(browser); });
