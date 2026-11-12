/* Reach walk: start a build on the Lumen CSR, stop it part-way from the panel, read what it kept, resume it. */
const { open, rail, fs } = require('../../../DEMO/2026-11-10-showcase-walk/tour-lib.cjs');
const OUT = process.argv[2];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const w = await open(null); const { page } = w;
  await rail(page, 'Projects').click(); await page.waitForTimeout(1500);
  await page.getByText(/LMN-201 — prevention of recurrent/).first().click();
  await page.getByRole('heading', { level: 1, name: /LMN-201/ }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /^Open .*Clinical Study Report — SYNTHETIC/ }).first().click();
  await page.waitForSelector('.ed', { timeout: 60000 });
  const panel = page.locator('details[aria-label="Build from the study’s data"]');
  await panel.waitFor({ timeout: 60000 });
  if (!(await panel.evaluate((d) => d.open))) await panel.locator('summary').click();
  const line = async () => (await panel.getByRole('status').filter({ hasText: /^CSR build \d+ · / }).first().innerText()).replace(/ · last updated.*/, '');
  const drafted = async () => (await panel.getByText(/of 119 ICH E3 headings drafted/).first().innerText().catch(() => '')).trim();
  await panel.getByRole('button', { name: /Build CSR draft · / }).click();
  await panel.getByText(/^Writing §/).first().waitFor({ timeout: 120000 });
  for (let i = 0; i < 60; i++) { if (/ (1[0-9]|[2-9][0-9]) of 69/.test(await panel.getByText(/^Writing §/).first().innerText().catch(() => ''))) break; await page.waitForTimeout(1000); }
  console.info('running :', await line(), '|', await panel.getByText(/^Writing §/).first().innerText());
  const stop = panel.getByRole('button', { name: /^Stop build \d+$/ });
  await stop.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/01-running-with-stop.png` });
  await stop.click();
  await panel.getByText('This build was stopped. The sections already saved are kept.').waitFor({ timeout: 30000 });
  await page.waitForTimeout(6000);
  const kept = await drafted();
  console.info('stopped :', await line(), '|', kept, '| stop offered:', await panel.getByRole('button', { name: /^Stop build/ }).count(), '| live view:', await panel.getByText(/^Writing §/).count());
  await page.screenshot({ path: `${OUT}/02-stopped.png` });
  await page.waitForTimeout(12000);
  console.info('12 s on :', await line(), '|', await drafted(), '(unchanged means nothing more was saved)');
  await panel.getByRole('button', { name: /^Resume build \d+$/ }).click();
  const started = Date.now();
  for (;;) { await page.waitForTimeout(5000); const l = await line(); if (/· (complete|not complete|stopped|failed) ·/.test(l) && Date.now() - started > 8000) break; if (Date.now() - started > 15 * 60000) break; }
  console.info('resumed :', await line(), '|', await drafted());
  await page.screenshot({ path: `${OUT}/03-resumed-complete.png` });
  console.info('API', JSON.stringify(w.net.slice(0, 8)), 'CONSOLE', JSON.stringify(w.cons.slice(0, 4)));
  await w.browser.close();
})().catch((e) => { console.error('FAILED', String(e).slice(0, 500)); process.exit(1); });
