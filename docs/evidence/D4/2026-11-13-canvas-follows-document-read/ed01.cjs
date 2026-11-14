/* ED-01: the editor's canvas with no document open, while the document list is being read, after the read failed,
   with a stage filter on, and on a project that has no documents. What does the canvas say and offer? */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const BASE = 'http://127.0.0.1:5100';
const TAG = process.env.TAG || 'before';
const OUT = S + '/ed01/' + TAG;
const LMN = 'e00d4d40-5378-41dc-b85e-e49662afe6a6';

const canvasSays = (page) => page.evaluate(() => {
  const c = document.querySelector('.ed-doc-inner');
  if (!c) return { text: '(no canvas)', buttons: [] };
  const panels = [...c.querySelectorAll('.c2c-empty-state, .c2c-error-state')];
  const panel = panels[panels.length - 1];
  if (!panel) return { text: '(no empty or error panel: ' + (c.querySelector('.ed-mast-num, .ed-mast') ? 'a section is open' : 'other content') + ')', buttons: [] };
  return {
    text: panel.textContent.trim().replace(/\s+/g, ' ').slice(0, 260),
    buttons: [...panel.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 6),
    tree: [...document.querySelectorAll('.ed-tree-scroll [role="status"], .ed-tree-scroll .c2c-error-state, .ed-tree-scroll .c2c-empty-state')]
      .map((e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 90)).slice(0, 2),
  };
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/concept2cure/login', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('input[type=email]', { timeout: 180000 });
  await page.fill('input[type=email]', 'jm.smith@concept2cure.pro');
  await page.fill('input[autocomplete="current-password"]', fs.readFileSync(S + '/d0-before-admin-pw.txt', 'utf8').trim());
  await page.click('button[type=submit]');
  await page.waitForTimeout(6000);
  const result = {};
  const isDocs = (url) => /\/api\/authoring\/docs\?/.test(url);

  /* 1. The list read is held for 9 seconds. */
  let hold = true;
  await page.route('**/api/authoring/docs?**', async (route) => {
    if (hold && isDocs(route.request().url())) { await new Promise((r) => setTimeout(r, 9000)); }
    await route.continue();
  });
  await page.goto(`${BASE}/concept2cure/document-authoring?program=${LMN}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ed-doc-inner', { timeout: 90000 });
  await page.waitForTimeout(2500);
  result.whileReading = await canvasSays(page);
  await page.screenshot({ path: `${OUT}/1-while-reading.png` });
  hold = false;
  await page.waitForTimeout(12000);
  result.afterTheRead = await canvasSays(page);
  await page.unroute('**/api/authoring/docs?**');

  /* 2. The list read fails (503), then answers when Try again is pressed. */
  let fail = true; let reads = 0;
  await page.route('**/api/authoring/docs?**', async (route) => {
    if (!isDocs(route.request().url())) return route.continue();
    reads += 1;
    if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'unavailable' }) });
    return route.continue();
  });
  await page.goto(`${BASE}/concept2cure/document-authoring?program=${LMN}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ed-doc-inner', { timeout: 90000 });
  await page.waitForTimeout(6000);
  result.afterAFailedRead = await canvasSays(page);
  await page.screenshot({ path: `${OUT}/2-failed-read.png` });
  const again = page.locator('.ed-doc-inner').getByRole('button', { name: 'Try again' });
  result.tryAgainOffered = await again.count() > 0;
  if (result.tryAgainOffered) {
    fail = false; const before = reads;
    await again.click();
    await page.waitForTimeout(7000);
    result.afterTryAgain = { ...(await canvasSays(page)), readAgain: reads > before };
    await page.screenshot({ path: `${OUT}/2b-after-try-again.png` });
  }
  await page.unroute('**/api/authoring/docs?**');

  /* 3. A stage filter with nothing at that stage (LMN-201's documents are all drafts). */
  await page.goto(`${BASE}/concept2cure/document-authoring?program=${LMN}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ed-doc-inner', { timeout: 90000 });
  await page.waitForTimeout(7000);
  await page.getByLabel('Filter documents by status').selectOption('approved');
  await page.waitForTimeout(5000);
  result.filterApproved = await canvasSays(page);
  await page.screenshot({ path: `${OUT}/3-filter-approved.png` });
  const showAll = page.locator('.ed-doc-inner').getByRole('button', { name: 'Show all documents' });
  if (await showAll.count() > 0) {
    await showAll.click();
    await page.waitForTimeout(6000);
    result.afterShowAll = { filter: await page.getByLabel('Filter documents by status').inputValue(), ...(await canvasSays(page)) };
  }

  fs.writeFileSync(OUT + '/ed01.json', JSON.stringify(result, null, 1));
  console.info(JSON.stringify(result, null, 1));
  await browser.close();
})().catch((e) => { console.error('ERR', String(e).slice(0, 700)); process.exit(1); });
