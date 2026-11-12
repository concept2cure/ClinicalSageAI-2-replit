/* The Lumen lead sends every drafted heading of the LMN-201 report's build for review in one act.
 * Usage: [BUILD=<job id>] node send-drafts.cjs <out-dir> [look|send]   (look: only read what the section review offers) */
const { open, rail, fs } = require('../../DEMO/2026-11-10-showcase-walk/tour-lib.cjs');
const [OUT, STEP = 'send'] = process.argv.slice(2);
const states = (review) => review.locator('li').evaluateAll((rows) => rows.reduce((count, row) => {
  const word = (row.textContent.match(/(Not drafted|In review|Approved|Draft)/) || ['other'])[0];
  count[word] = (count[word] || 0) + 1; return count;
}, {}));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const w = await open(null); const { page } = w;
  await rail(page, 'Projects').click(); await page.waitForTimeout(1500);
  await page.getByText(/LMN-201 — prevention of recurrent/).first().click();
  await page.getByRole('heading', { level: 1, name: /LMN-201/ }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /^Open .*Clinical Study Report — SYNTHETIC/ }).first().click();
  await page.waitForSelector('.ed', { timeout: 60000 });
  const panel = page.locator('details[aria-label="Build from the study’s data"]');
  await panel.waitFor({ timeout: 60000 });
  if (!(await panel.evaluate((d) => d.open))) await panel.locator('summary').click();
  // The panel opens on the newest build. BUILD names another: a document takes its imported sections from one build.
  const picker = panel.getByLabel('CSR build', { exact: true });
  const review = panel.locator('section[aria-label="Section review"]');
  await review.waitFor({ timeout: 60000 }); await page.waitForTimeout(2500);
  if (process.env.BUILD) { await picker.selectOption(process.env.BUILD); await review.waitFor({ timeout: 60000 }); await page.waitForTimeout(3000); }
  const before = await states(review);
  const summary = (await review.locator('div').first().innerText()).replace(/\n+/g, ' | ');
  const button = review.getByRole('button', { name: /^Send \d+ drafts for review$/ });
  const offered = (await button.count()) ? await button.innerText() : null;
  await review.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/before.png` });
  const record = { step: STEP, summary, offered, before };
  if (STEP === 'send' && offered) {
    const t0 = Date.now();
    await button.click();
    // The build section holds the line, because it empties and re-reads the list after a review decision.
    const said = panel.locator('p[role="status"], p[role="alert"]').filter({ hasText: /sent for review/ }).last();
    await said.waitFor({ timeout: 120000 });
    record.seconds = Math.round((Date.now() - t0) / 1000);
    record.said = await said.innerText(); record.saidAs = await said.getAttribute('role');
    await page.waitForTimeout(3000);
    record.after = await states(review);
    record.offeredAfter = (await button.count()) ? await button.innerText() : null;
    await review.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/after.png` });
  }
  record.failedRequests = w.net; record.consoleErrors = w.cons;
  fs.writeFileSync(`${OUT}/${STEP}.json`, JSON.stringify(record, null, 2));
  console.info(JSON.stringify(record, null, 1));
  await w.browser.close();
})().catch((e) => { console.error('FAILED', String(e).slice(0, 700)); process.exit(1); });
