// Walk 15: a change record is raised with its assessment, read in its row, assessed, read inside the approval
// ceremony and signed there; after approval it offers no edit, and the server refuses one (C9 with F1).
const { run, signIn, shot, api, log, BASE } = require('./lib.cjs');

const dataOf = (r) => (r.body && r.body.data) || {};

async function openLog(page) {
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Change control' }).click();
  await page.locator('tbody.qcc-change').first().waitFor({ timeout: 60000 });
}
const bodyOf = (page, n) => page.locator('tbody.qcc-change').filter({ hasText: n });
const facts = (scope) => scope.locator('dl.qcc-facts').first().evaluate((dl) =>
  [...dl.querySelectorAll('div')].map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]));

run('w15-change-record', async (browser) => {
  const n = `CC-C9-${String(Date.now()).slice(-6)}`;
  const author = await signIn(browser, 'author', 1440);
  await openLog(author.page);
  // 1. Raise it with its assessment, through the form.
  await author.page.getByRole('button', { name: 'Raise change request' }).click();
  const raise = author.page.getByRole('dialog', { name: /Raise change request/ });
  await raise.getByLabel(/Change number/).fill(n);
  await raise.getByLabel(/^Title/).fill('Walk C9: a second-source gasket');
  await raise.getByLabel(/Current state/).fill('One gasket supplier → two qualified suppliers.');
  await raise.getByLabel(/Reason for the change/).fill('Walk C9: single-source risk on the fill-line gasket.');
  await raise.getByRole('radio', { name: 'Medium' }).click().catch(async () => { await raise.getByRole('button', { name: 'Medium' }).click(); });
  await raise.getByLabel(/Impact assessment/).fill('Extractables comparison; no filing change.');
  await raise.getByLabel(/Implementation plan/).fill('Qualify the second supplier.');
  await raise.getByRole('button', { name: /Raise change/ }).click();
  await bodyOf(author.page, n).waitFor({ timeout: 20000 });
  // 2. Read it in its row.
  await bodyOf(author.page, n).locator('button.qms-num').click();
  log.steps.push({ name: 'read-proposed', facts: await facts(bodyOf(author.page, n)) });
  await shot(author.page, 'w15-record-1440', false);
  // 3. Assess it: More, then Edit assessment.
  await bodyOf(author.page, n).getByRole('button', { name: /^More actions for/ }).click();
  await bodyOf(author.page, n).getByRole('button', { name: 'Edit assessment' }).click();
  const assess = author.page.getByRole('dialog', { name: new RegExp(`Assess ${n}`) });
  await assess.getByLabel(/Implementation plan/).fill('Qualify the second supplier; update the fill-line batch record.');
  await shot(author.page, 'w15-assess-1440', false);
  await assess.getByRole('button', { name: 'Save assessment' }).click();
  const toast = author.page.locator('.de-toast').filter({ hasText: 'assessment' });
  await toast.first().waitFor({ timeout: 15000 }).catch(() => {});
  log.steps.push({ name: 'assessed', toast: await toast.first().textContent().catch(() => null) });
  await author.page.waitForTimeout(1200);
  const rowAfter = bodyOf(author.page, n);
  if (!(await rowAfter.locator('dl.qcc-facts').count())) await rowAfter.locator('button.qms-num').click();
  log.steps.push({ name: 'read-assessed', facts: await facts(rowAfter) });
  // 4. Open the assessment (an unsigned move, through the route).
  const listed = await api(author.page, 'GET', '/api/mdx/qms/changes');
  const id = ((listed.body && listed.body.data) || []).find((c) => c.change_number === n).id;
  const moved = await api(author.page, 'POST', `/api/mdx/qms/changes/${id}/transition`, { to: 'under_assessment', reason: 'Walk C9: open the assessment.' });
  log.steps.push({ name: 'under-assessment', status: moved.status });
  // 5. The approver reads the record inside the ceremony, and signs there.
  const approver = await signIn(browser, 'approver', 1440);
  await openLog(approver.page);
  await bodyOf(approver.page, n).getByRole('button', { name: 'Approve' }).click();
  const sign = approver.page.getByRole('dialog', { name: /Electronic signature/ });
  await sign.waitFor({ timeout: 15000 });
  const record = sign.getByTestId('change-approval-record');
  log.steps.push({ name: 'ceremony-record', text: await record.textContent() });
  await shot(approver.page, 'w15-approve-dialog-1440', false);
  await sign.getByLabel(/Reason for this action/).fill('Walk C9: approved as assessed.');
  await sign.getByLabel(/Password/).fill(process.env.WALK_PASSWORD);
  await sign.getByRole('button', { name: /Sign and commit/ }).click();
  await approver.page.getByText('Signature applied').waitFor({ timeout: 20000 }).catch(() => {});
  log.steps.push({ name: 'manifest', text: await approver.page.locator('.es-manifest').textContent().catch(() => null) });
  await shot(approver.page, 'w15-signed-1440', false);
  await approver.ctx.close();
  // 6. Approved: no edit is offered, and the server refuses one.
  await openLog(author.page);
  const done = bodyOf(author.page, n);
  log.steps.push({ name: 'approved-row', status: await done.getAttribute('data-status') });
  await done.getByRole('button', { name: /^More actions for/ }).click();
  log.steps.push({ name: 'approved-more', group: await done.getByRole('group').textContent() });
  const refused = await api(author.page, 'PATCH', `/api/mdx/qms/changes/${id}`, { implementationPlan: 'Rewritten after approval.' });
  log.steps.push({ name: 'approved-edit', status: refused.status, error: refused.body && refused.body.error, stored: dataOf(await api(author.page, 'GET', `/api/mdx/qms/changes/${id}`)).implementation_plan });
  await author.ctx.close();
});
