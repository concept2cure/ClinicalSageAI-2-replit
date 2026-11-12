// Walk 39 (P-122): the Complaints and MDR tab, used as a person uses it, with a project open: record a complaint,
// move it, record the MDR decision from it, move the MDR report, and read the complaint's vigilance timeline.
const { run, signIn, shot, log, BASE } = require('./lib.cjs');
const PROGRAM = process.env.WALK_PROGRAM || '5d669ca3-055f-48b1-9c34-364eb33ecb95';

const toast = async (page) => {
  await page.locator('.de-toast').last().waitFor({ timeout: 15000 }).catch(() => {});
  return page.locator('.de-toast').last().textContent().catch(() => null);
};
/** What the open drawer says went wrong, if it is still open. */
const refusal = async (d) => ((await d.count()) ? (await d.locator('[role="alert"], .de-err, .de-notice').allTextContents()).map((t) => t.trim()).filter(Boolean) : []);
const section = (page, name) => page.locator('section.pj-sec', { has: page.getByRole('heading', { name, exact: true }) });
const rowsOf = async (sec) => sec.locator('tbody.qms-rec').evaluateAll((bs) => bs.map((b) => ({
  facts: [...b.querySelector('tr').children].map((td) => td.textContent.trim().slice(0, 60)),
  actions: [...b.querySelectorAll('tr.qms-row-acts-tr button')].map((x) => x.getAttribute('aria-label') || x.textContent.trim()),
})));

async function pick(d, label, index = 1) { await d.getByLabel(label).selectOption({ index }); }

run('w39-complaint-to-mdr', async (browser) => {
  const { ctx, page } = await signIn(browser, 'approver', 1440);
  await page.goto(`${BASE}/concept2cure/quality?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Complaints and MDR' }).click();
  await page.waitForTimeout(1500);
  const complaints = section(page, 'Complaints');
  const mdr = section(page, 'MDR and vigilance reports');
  log.steps.push({ name: 'before', complaints: (await rowsOf(complaints)).length, mdr: (await rowsOf(mdr)).length });

  // 1. Record a complaint.
  await complaints.getByRole('button', { name: 'Record complaint' }).click();
  let d = page.getByRole('dialog', { name: /Record a complaint/ });
  await d.waitFor({ timeout: 15000 });
  log.steps.push({ name: 'complaint-form', sub: (await d.locator('.de-h-s').textContent().catch(() => null)) });
  await pick(d, /^Source/); await pick(d, /^Channel/);
  await d.getByLabel(/^Received/).fill('2026-11-10');
  await d.getByLabel(/Country of the event/).fill('US');
  const narrative = `Walk 39: gasket seal failed in use, device stopped (${String(Date.now()).slice(-5)}).`;
  await d.getByLabel(/What happened/).fill(narrative);
  await d.getByLabel(/Patient harm/).selectOption({ index: 1 });
  await pick(d, /^Severity/);
  await d.getByLabel(/^Malfunction/).selectOption('yes');
  await d.getByLabel(/Correction or removal expected/).selectOption('no');
  await d.getByLabel(/Trend threshold crossed/).selectOption('no');
  await d.getByLabel(/Device model/).fill('C11-G');
  await shot(page, 'w39-record-complaint-1440', false);
  await d.getByRole('button', { name: 'Record complaint' }).click();
  log.steps.push({ name: 'complaint-recorded', toast: await toast(page), refusal: await refusal(d) });
  await page.waitForTimeout(1200);
  const afterCreate = await rowsOf(complaints);
  const mine = afterCreate.find((r) => r.facts[1] === narrative.slice(0, 60));
  log.steps.push({ name: 'complaints-after', count: afterCreate.length, mine });
  const code = mine && mine.facts[0];
  const myRow = () => complaints.locator('tbody.qms-rec', { hasText: code });

  // 2. Move it (the server's first next state), with a reason.
  await myRow().getByRole('button', { name: 'Move', exact: true }).click();
  d = page.getByRole('dialog', { name: new RegExp(`Move ${code}`) });
  await d.waitFor({ timeout: 15000 });
  const moves = await d.getByLabel(/^Move to/).locator('option').allTextContents();
  await d.getByLabel(/^Move to/).selectOption({ index: 1 });
  await d.getByLabel(/Reason for this move/).fill('Walk 39: triaged as a device malfunction without injury.');
  await d.getByRole('button', { name: 'Record the move' }).click();
  log.steps.push({ name: 'complaint-moved', offered: moves, toast: await toast(page), refusal: await refusal(d) });
  await page.waitForTimeout(1200);

  // 3. Record the MDR decision from the complaint.
  await myRow().getByRole('button', { name: 'Record MDR decision' }).click();
  d = page.getByRole('dialog', { name: new RegExp(`Record the MDR decision for ${code}`) });
  await d.waitFor({ timeout: 15000 });
  log.steps.push({ name: 'mdr-form', sub: await d.locator('.de-h-s').textContent().catch(() => null), narrativePrefilled: (await d.getByLabel(/What happened/).inputValue()) === narrative });
  await d.getByLabel(/^Jurisdiction/).selectOption({ index: 1 });
  await d.getByLabel(/Decided on/).fill('2026-11-10');
  await d.getByLabel(/FDA report type/).selectOption({ index: 2 });
  await shot(page, 'w39-record-mdr-1440', false);
  await d.getByRole('button', { name: 'Record MDR decision' }).click();
  log.steps.push({ name: 'mdr-recorded', toast: await toast(page), refusal: await refusal(d) });
  await page.waitForTimeout(1500);
  const mdrRows = await rowsOf(mdr);
  const myMdr = mdrRows.find((r) => r.facts[1] === narrative.slice(0, 60));
  log.steps.push({ name: 'mdr-after', withoutReload: true, count: mdrRows.length, mine: myMdr || null,
    complaint: (await rowsOf(complaints)).find((r) => r.facts[0] === code) });

  // 4. Move the MDR report.
  const mdrCode = myMdr && myMdr.facts[0];
  if (mdrCode) {
    await mdr.locator('tbody.qms-rec', { hasText: mdrCode }).getByRole('button', { name: 'Move', exact: true }).click();
    d = page.getByRole('dialog', { name: new RegExp(`Move ${mdrCode}`) });
    await d.waitFor({ timeout: 15000 });
    const mdrMoves = await d.getByLabel(/^Move to/).locator('option').allTextContents();
    await d.getByLabel(/^Move to/).selectOption({ index: 1 });
    await d.getByLabel(/Reason for this move/).fill('Walk 39: the report is being prepared for filing.');
    await d.getByRole('button', { name: 'Record the move' }).click();
    log.steps.push({ name: 'mdr-moved', offered: mdrMoves, labels: await d.locator('label').allTextContents().catch(() => []), toast: await toast(page), refusal: await refusal(d) });
    await page.waitForTimeout(1200);
  }

  // 5. The complaint's vigilance timeline, in its row.
  await myRow().locator('button.qms-num').click();
  await page.waitForTimeout(1500);
  log.steps.push({ name: 'timeline', events: await complaints.locator('.qms-vigilance li').allTextContents(),
    empty: await complaints.locator('.qcc-detail .c2c-empty-state').allTextContents(), alerts: await complaints.locator('[role="alert"]').allTextContents() });
  await shot(page, 'w39-complaints-1440', true);
  log.steps.push({ name: 'figures', line: await page.getByTestId('quality-figures').textContent().catch(() => null),
    registers: await page.locator('[data-testid="qms-record-figures"]').allTextContents() });
  await ctx.close();

  // 6. The same tab on a phone.
  const phone = await signIn(browser, 'approver', 390);
  await phone.page.goto(`${BASE}/concept2cure/quality?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  const t = phone.page.getByRole('tab', { name: 'Complaints and MDR' });
  await t.scrollIntoViewIfNeeded(); await t.click(); await phone.page.waitForTimeout(1500);
  log.steps.push({ name: 'phone', pageScrolls: await phone.page.evaluate(() => document.scrollingElement.scrollWidth > window.innerWidth + 1) });
  await shot(phone.page, 'w39-complaints-390', true);
  await phone.ctx.close();
});
