// Walk 16: an approval signs the content the approver read. An edit landing while the signature dialog is open is
// refused at signing; after reading it again, the approver signs the new content (F1, the approval bound to the read).
const { run, signIn, shot, api, log, BASE } = require('./lib.cjs');

const dataOf = (r) => (r.body && r.body.data) || {};
const bodyOf = (page, n) => page.locator('tbody.qcc-change').filter({ hasText: n });
async function openLog(page) {
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Change control' }).click();
  await page.locator('tbody.qcc-change').first().waitFor({ timeout: 60000 });
}
async function signDialog(page, n) {
  await bodyOf(page, n).getByRole('button', { name: 'Approve' }).click();
  const sign = page.getByRole('dialog', { name: /Electronic signature/ });
  await sign.waitFor({ timeout: 15000 });
  return sign;
}

run('w16-sign-what-read', async (browser) => {
  const n = `CC-SIGN-${String(Date.now()).slice(-6)}`;
  const author = await signIn(browser, 'author', 1440);
  const raised = await api(author.page, 'POST', '/api/mdx/qms/changes', { changeNumber: n, title: 'Walk: sign what was read',
    reason: 'Walk: the approval binds the content read.', impactAssessment: 'As first assessed.', implementationPlan: 'As first planned.' });
  const id = dataOf(raised).id;
  const moved = await api(author.page, 'POST', `/api/mdx/qms/changes/${id}/transition`, { to: 'under_assessment', reason: 'Walk: open the assessment.' });
  log.steps.push({ name: 'raised', status: raised.status, moved: moved.status });

  const approver = await signIn(browser, 'approver', 1440);
  await openLog(approver.page);
  let sign = await signDialog(approver.page, n);
  log.steps.push({ name: 'dialog-read', record: await sign.getByTestId('change-approval-record').textContent() });
  // While the dialog is open, the author edits the assessment (still under assessment, so the edit is allowed).
  const edited = await api(author.page, 'PATCH', `/api/mdx/qms/changes/${id}`, { impactAssessment: 'Edited while the approver was reading.' });
  log.steps.push({ name: 'edited-meanwhile', status: edited.status });
  await sign.getByLabel(/Reason for this action/).fill('Walk: approved as read.');
  await sign.getByLabel(/Password/).fill(process.env.WALK_PASSWORD);
  await sign.getByRole('button', { name: /Sign and commit/ }).click();
  await approver.page.waitForTimeout(2500);
  log.steps.push({ name: 'signed-stale', dialog: (await sign.textContent().catch(() => '')).slice(0, 1200),
    state: dataOf(await api(approver.page, 'GET', `/api/mdx/qms/changes/${id}`)).status });
  await shot(approver.page, 'w16-refused-1440', false);
  // Read it again: close, reload, and the dialog shows the edited assessment; signing it succeeds.
  await approver.page.keyboard.press('Escape');
  await openLog(approver.page);
  sign = await signDialog(approver.page, n);
  log.steps.push({ name: 'dialog-reread', record: await sign.getByTestId('change-approval-record').textContent() });
  await sign.getByLabel(/Reason for this action/).fill('Walk: approved as read again.');
  await sign.getByLabel(/Password/).fill(process.env.WALK_PASSWORD);
  await sign.getByRole('button', { name: /Sign and commit/ }).click();
  await approver.page.getByText('Signature applied').waitFor({ timeout: 20000 }).catch(() => {});
  const after = dataOf(await api(approver.page, 'GET', `/api/mdx/qms/changes/${id}`));
  log.steps.push({ name: 'signed-reread', state: after.status, impact: after.impact_assessment });
  await shot(approver.page, 'w16-signed-1440', false);
  await approver.ctx.close(); await author.ctx.close();
});
