/* The Lumen LMN-201 report's build section: which build it opens on, and what it says on another.
 * Usage: node document-build.cjs <out-dir> */
const { open, rail, fs } = require('../../DEMO/2026-11-10-showcase-walk/tour-lib.cjs');
const OUT = process.argv[2];
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
  const builds = panel.locator('section[aria-label="CSR builds from this study data"]');
  const picker = builds.getByLabel('CSR build', { exact: true });
  await picker.waitFor({ timeout: 60000 });
  await builds.locator('section[aria-label="Section review"]').waitFor({ timeout: 60000 });
  const read = async () => ({
    open: await picker.inputValue(),
    options: await picker.locator('option').allInnerTexts(),
    status: (await builds.locator('p[role="status"]').first().innerText()).replace(/ · last updated.*/, ''),
    line: await builds.locator('p').filter({ hasText: /imported sections come from this build|holds sections imported from/ }).allInnerTexts(),
    review: (await builds.locator('section[aria-label="Section review"] span').first().innerText()),
  });
  await builds.scrollIntoViewIfNeeded();
  const opened = await read();
  await page.screenshot({ path: `${OUT}/opens-on.png` });
  const newest = opened.options[0].match(/CSR build (\d+)/)[1];
  await picker.selectOption(newest);
  await builds.locator('p[role="status"]').filter({ hasText: new RegExp(`CSR build ${newest} · `) }).first().waitFor({ timeout: 30000 });
  await builds.locator('section[aria-label="Section review"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  const other = await read();
  await builds.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/another-build.png` });
  const record = { opened, other, failedRequests: w.net, consoleErrors: w.cons };
  fs.writeFileSync(`${OUT}/document-build.json`, JSON.stringify(record, null, 2));
  console.info(JSON.stringify(record, null, 1));
  await w.browser.close();
})().catch((e) => { console.error('FAILED', String(e).slice(0, 700)); process.exit(1); });
