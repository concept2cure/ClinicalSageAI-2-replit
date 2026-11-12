/* The CSR scientific review on the Lumen LMN-201 report, as the reviewer sees it: which headings it asks about.
 * Usage: node heading-only.cjs <out-dir> send|review [label]
 *   send   : the Lumen lead sends the report for review to the Lumen approver (once).
 *   review : the Lumen approver opens the review decision, chooses Approve, reads the retained tables, and the
 *            script records what the screen says about each section and what still stops the approval. */
const { open, rail, fs } = require('../../DEMO/2026-11-10-showcase-walk/tour-lib.cjs');
const [OUT, STEP, LABEL = 'after'] = process.argv.slice(2);
const REPORT = /Clinical Study Report — SYNTHETIC/;

async function project(page) {
  await rail(page, 'Projects').click(); await page.waitForTimeout(1500);
  await page.getByText(/LMN-201 — prevention of recurrent/).first().click();
  await page.getByRole('heading', { level: 1, name: /LMN-201/ }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
}

async function send(w) {
  const { page } = w;
  await project(page);
  await page.getByRole('button', { name: /^Open .*Clinical Study Report — SYNTHETIC/ }).first().click();
  await page.waitForSelector('.ed', { timeout: 60000 }); await page.waitForTimeout(3000);
  await page.getByRole('button', { name: /Send for review/ }).first().click();
  const dlg = page.getByRole('dialog').last();
  await dlg.getByRole('checkbox', { name: 'Lumen Approver' }).check();
  await dlg.locator('#sfr-reason').fill('Scientific review of the LMN-201 clinical study report before approval.');
  await dlg.locator('#sfr-due').fill(new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10));
  await dlg.getByRole('button', { name: 'Send for review', exact: true }).click();
  await page.waitForTimeout(5000);
  return { sent: !(await page.getByRole('dialog').count()) || (await page.getByRole('dialog').last().innerText()).slice(0, 300) };
}

async function review(w) {
  const { page } = w;
  await project(page);
  await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Review/ }).click();
  await page.getByRole('button', { name: 'Review documents on the review board' }).click();
  await page.waitForTimeout(3000);
  // The board lists each document in review as a row; the decision buttons act on the selected row.
  await page.locator('main').getByRole('button').filter({ hasText: REPORT }).filter({ hasText: /In review/ }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /Record review decision/ }).first().click();
  const dlg = page.getByRole('dialog').last();
  await dlg.locator('#rv-decision').selectOption({ label: 'Approve' });
  await dlg.getByText('CSR scientific review').first().waitFor({ timeout: 30000 });
  const runs = dlg.locator('.rv-csr-run input[type="checkbox"]');
  await runs.first().waitFor({ timeout: 30000 });
  await runs.first().check();
  const read = page.waitForResponse((r) => /\/csr-evidence\/preview$/.test(r.url()), { timeout: 120000 });
  await dlg.getByRole('button', { name: 'Read the retained tables' }).click();
  const preview = await read;
  await dlg.getByText('2. Each figure in the saved text').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  const sections = await dlg.locator('.rv-csr-section').evaluateAll((els) => els.map((el) => ({
    heading: el.querySelector('h4').textContent.trim(),
    says: [...el.querySelectorAll('p')].map((p) => p.textContent.trim()).join(' '),
    asksForStatement: !!el.querySelector('textarea, input[type="checkbox"]'),
  })));
  const gaps = await dlg.locator('.rv-csr-gaps li').allInnerTexts();
  const ethics = dlg.locator('.rv-csr-section').filter({ hasText: /^5 · / }).first();
  await ethics.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${LABEL}-ethics.png` });
  await dlg.getByText('3. Your attestation').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${LABEL}-gaps.png` });
  const recordDisabled = await dlg.getByRole('button', { name: 'Record approval' }).isDisabled();
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  const noText = gaps.filter((g) => /has no saved text/.test(g));
  return {
    tablesPreview: preview.status(), sections: sections.length,
    headingOnly: sections.filter((s) => /^Heading only/.test(s.says)).map((s) => s.heading),
    saysNoSavedText: sections.filter((s) => /No saved text/.test(s.says)).length,
    gapsNamingNoText: noText.length, gapsTotal: gaps.length, firstGaps: gaps.slice(0, 6), recordApprovalDisabled: recordDisabled,
    ethics: sections.find((s) => /^5 · /.test(s.heading)), investigationalPlan: sections.find((s) => /^9 · /.test(s.heading)),
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const w = await open(STEP === 'send' ? null : 'lumen.approver@lumen-demo.example');
  const result = await (STEP === 'send' ? send(w) : review(w));
  const record = { step: STEP, label: LABEL, ...result, failedRequests: w.net, consoleErrors: w.cons };
  fs.writeFileSync(`${OUT}/${STEP}-${LABEL}.json`, JSON.stringify(record, null, 2));
  console.info(JSON.stringify(record, null, 1).slice(0, 3500));
  await w.browser.close();
})().catch((e) => { console.error('FAILED', String(e).slice(0, 700)); process.exit(1); });
