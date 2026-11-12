// Walk 41 (P-122): a controlled document, end to end, in the merged Quality, every step through the screen: the author
// creates it from the one "New controlled document" door, writes it in the one editor and sends it for review; the
// approver signs it; it is effective; a person assigned to train reads and acknowledges it.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');
const PROGRAM = process.env.WALK_PROGRAM || '5d669ca3-055f-48b1-9c34-364eb33ecb95';

const rowOf = (page, title) => page.locator('tbody.qms-doc').filter({ hasText: title });
const rowFacts = async (page, title) => rowOf(page, title).evaluate((b) => ({
  facts: [...b.querySelector('tr').children].map((td) => td.textContent.trim().replace(/\s+/g, ' ').slice(0, 90)),
  actions: [...b.querySelectorAll('tr.qms-row-acts-tr button')].map((x) => x.getAttribute('aria-label') || x.textContent.trim()),
})).catch(() => null);
const figures = (page) => page.getByTestId('quality-figures').textContent().catch(() => null);
// The rows of "Training overdue, due or lapsing" that name this document.
const dueOn = (page, title) => page.getByTestId('training-expiry-row').filter({ hasText: title }).allTextContents()
  .then((rows) => rows.map((r) => r.replace(/\s+/g, ' ').trim()));
const alerts = (page) => page.locator('[role="alert"]').allTextContents();

// ── The author: creates the document, writes it, sends it for review. Answers who approves and who will read. ──
async function asAuthor(browser, title) {
  const author = await signIn(browser, 'author', 1440);
  const page = author.page;
  await page.goto(`${BASE}/concept2cure/quality?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  log.steps.push({ name: 'figures-before', line: await figures(page) });
  await page.getByRole('region', { name: 'Controlled documents' }).getByRole('button', { name: 'New controlled document' }).click();
  const d = page.getByRole('dialog', { name: 'New controlled document' });
  await d.waitFor({ timeout: 15000 });
  await page.waitForTimeout(1000);
  log.steps.push({ name: 'new-document-drawer', project: await d.getByLabel('Project').inputValue().catch(() => null),
    templates: await d.getByLabel('Template').locator('option').allTextContents().catch(() => []) });
  await d.getByLabel('Title').fill(title);
  await d.getByLabel('Template').selectOption({ index: 1 }).catch(() => {});
  await d.getByLabel('Reason').fill('Walk 41: a procedure for complaint intake.');
  await shot(page, 'w41-new-document-1440', false);
  await d.locator('.de-f .de-btn.primary').click();
  const editable = page.locator('[contenteditable="true"]').first();
  await editable.waitFor({ timeout: 30000 }).catch(() => {});
  log.steps.push({ name: 'created', inEditor: await editable.count(), alerts: await alerts(page), url: page.url().replace(BASE, '') });
  await editable.click();
  await page.keyboard.type('Receive the complaint, log it within one working day, and assess it for reportability.');
  await page.getByLabel('Reason for change').fill('Walk 41: the first text of the procedure.');
  await page.getByTestId('save-section').click();
  await page.waitForTimeout(4000);
  log.steps.push({ name: 'written', alerts: await alerts(page) });
  await shot(page, 'w41-editor-1440', false);

  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  log.steps.push({ name: 'draft-row', ...(await rowFacts(page, title)) });
  await rowOf(page, title).getByRole('button', { name: /Send for review/ }).click();
  const form = page.getByTestId('qms-route-form');
  await form.waitFor({ timeout: 15000 });
  const approverBox = form.locator('input[type="checkbox"][data-testid^="qms-approver-"]:not([disabled])');
  await approverBox.first().waitFor({ timeout: 15000 });
  const offered = await approverBox.evaluateAll((bs) => bs.map((b) => ({ id: b.getAttribute('data-testid'), label: b.closest('label')?.textContent?.trim() ?? null })));
  // The route offers only the organisation's designated approvers; the walk signs in as the one it chooses.
  const quinn = offered.find((o) => /Quinn/.test(o.label || '')) || offered[0];
  const approverWho = /Theo/.test(quinn.label || '') ? 'trainee' : 'approver';
  const readerWho = approverWho === 'trainee' ? 'approver' : 'trainee';
  const notOffered = await form.getByTestId('qms-route-not-offered').textContent().catch(() => null);
  await form.locator(`[data-testid="${quinn.id}"]`).check();
  await form.getByTestId('qms-approval-due').fill(new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
  await form.getByTestId('qms-route-reason').fill('Walk 41: ready for QA approval.');
  await shot(page, 'w41-send-for-review-1440', false);
  await form.getByTestId('qms-route-send').click();
  await page.waitForTimeout(2500);
  log.steps.push({ name: 'sent', offered: offered.map((o) => o.label), chose: quinn.label, notOffered,
    refused: (await page.getByTestId('qms-route-error').count()) ? await page.getByTestId('qms-route-error').textContent() : null });
  log.steps.push({ name: 'in-review-row-author', ...(await rowFacts(page, title)), figures: await figures(page) });
  await author.ctx.close();
  return { approverWho, readerWho };
}

// ── The approver: signs the approval, then assigns the reader to train on the document. ──
async function asApprover(browser, title, approverWho, readerWho) {
  const approver = await signIn(browser, approverWho, 1440);
  const page = approver.page;
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  log.steps.push({ name: 'in-review-row-approver', ...(await rowFacts(page, title)) });
  await rowOf(page, title).getByRole('button', { name: 'Approve', exact: true }).click();
  const sign = page.getByRole('dialog', { name: /Electronic signature/ });
  await sign.waitFor({ timeout: 15000 });
  log.steps.push({ name: 'signature-dialog', text: (await sign.textContent()).replace(/\s+/g, ' ').slice(0, 500) });
  await sign.getByLabel(/Reason for this action/).fill('Walk 41: approved for use.');
  await sign.getByLabel(/Password/).fill(process.env.WALK_PASSWORD);
  await shot(page, 'w41-sign-1440', false);
  await sign.getByRole('button', { name: /Sign and commit/ }).click();
  // Once signed, the dialog's name is "Signature applied": the manifest, then Done.
  const applied = page.getByRole('dialog', { name: 'Signature applied' });
  await applied.waitFor({ timeout: 20000 });
  log.steps.push({ name: 'signed', dialog: (await applied.textContent()).replace(/\s+/g, ' ').replace(/Chain.*$/, 'Chain …').slice(0, 420) });
  await shot(page, 'w41-signature-applied-1440', false);
  await applied.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForTimeout(1500);
  log.steps.push({ name: 'effective-row', ...(await rowFacts(page, title)), figures: await figures(page) });
  await shot(page, 'w41-effective-1440', false);

  // Assign the trainee to train on it, from the row's Training drawer.
  const row = rowOf(page, title);
  if (await row.getByRole('button', { name: /^Training/ }).count() === 0) await row.getByRole('button', { name: /^More actions for / }).click();
  await row.getByRole('button', { name: /^Training/ }).first().click();
  const d = page.getByRole('dialog', { name: /Who must train on/ });
  await d.waitFor({ timeout: 15000 });
  await page.waitForTimeout(1000);
  await d.getByRole('button', { name: 'Assign a person' }).click();
  const act = d.getByRole('form', { name: /Assign a person/ });
  await act.waitFor({ timeout: 10000 });
  const person = act.getByRole('combobox').first();
  const people = await person.locator('option').allTextContents();
  const theo = people.findIndex((p) => (readerWho === 'trainee' ? /Theo/ : /Quinn/).test(p));
  await person.selectOption({ index: theo > 0 ? theo : 1 });
  await act.getByRole('textbox').last().fill('Walk 41: complaint handlers train on the intake procedure.');
  await act.getByRole('button', { name: /^Assign/ }).click();
  await page.waitForTimeout(2000);
  log.steps.push({ name: 'assigned', people, refusal: await act.locator('[role="alert"]').allTextContents().catch(() => []),
    listed: await d.locator('.qms-train-people li, .qms-train-row').allTextContents().catch(() => []) });
  await shot(page, 'w41-assigned-1440', false);
  await d.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForTimeout(1500);
  // Behind the drawer the register re-read: the person assigned is now listed as due, with no reload.
  log.steps.push({ name: 'due-after-assigning', dueOnIt: await dueOn(page, title) });
  await shot(page, 'w41-due-after-assigning-1440', false);
  await approver.ctx.close();
}

// ── The reader: reads the document and acknowledges it. ──
async function asReader(browser, title, readerWho) {
  const trainee = await signIn(browser, readerWho, 1440);
  const page = trainee.page;
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  log.steps.push({ name: 'trainee-row', ...(await rowFacts(page, title)), dueOnIt: await dueOn(page, title) });
  await rowOf(page, title).getByRole('button', { name: /Read and acknowledge/ }).click();
  const d = page.getByRole('dialog', { name: 'Read and acknowledge' });
  await d.waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  log.steps.push({ name: 'reader', text: (await d.locator('.qms-training-content').textContent().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200) });
  const box = d.getByRole('checkbox');
  if (await box.count()) await box.check();
  await shot(page, 'w41-reader-1440', false);
  await d.getByRole('button', { name: 'Acknowledge this revision' }).click();
  await page.waitForTimeout(3000);
  log.steps.push({ name: 'acknowledged', drawer: (await d.textContent().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400), alerts: await alerts(page) });
  await shot(page, 'w41-acknowledged-1440', false);
  await d.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {});
  await page.waitForTimeout(1500);
  const coverage = page.locator('section.pj-sec', { has: page.getByRole('heading', { name: 'Read-and-understood training' }) });
  log.steps.push({ name: 'after', dueOnIt: await dueOn(page, title), figures: await figures(page), coverage: (await coverage.locator('.qms-train-row', { hasText: title }).textContent().catch(() => null)),
    expiry: (await page.getByTestId('training-expiry').textContent().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300) });
  await trainee.ctx.close();
}

run('w41-document-end-to-end', async (browser) => {
  const title = `Walk 41 complaint intake ${String(Date.now()).slice(-5)}`;
  const { approverWho, readerWho } = await asAuthor(browser, title);
  await asApprover(browser, title, approverWho, readerWho);
  await asReader(browser, title, readerWho);
});
