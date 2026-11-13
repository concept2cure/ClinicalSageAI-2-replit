/* Task 85: the editor open on a document, then the account panel opened (authService.refreshUser re-reads the
   account). Counts the editor's governed reads before and after, and whether the page shows the document. */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const BASE = 'http://127.0.0.1:5100';
const OUT = S + '/walk-1112-evidence/t85/' + (process.env.TAG || 'before');
const P = process.env.P || 'c2ed888d-2958-4332-b186-e81482f2ceec';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const reads = []; const api = [];
  page.on('request', (r) => { const u = r.url().replace(BASE, ''); if (r.method() === 'GET' && /^\/api\/authoring\/docs\//.test(u)) reads.push(u.slice(0, 110)); });
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) api.push(`${r.status()} ${r.url().replace(BASE, '').slice(0, 110)}`); });
  await page.goto(BASE + '/concept2cure/login', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('input[type=email]', { timeout: 180000 });
  await page.fill('input[type=email]', 'jm.smith@concept2cure.pro');
  await page.fill('input[autocomplete="current-password"]', fs.readFileSync(S + '/d0-before-admin-pw.txt', 'utf8').trim());
  await page.click('button[type=submit]');
  await page.waitForTimeout(6000);
  await page.goto(BASE + `/concept2cure/project-home?program=${P}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.c2c-v2'); await page.waitForTimeout(4000);
  await page.locator('button.btn').filter({ hasText: /^\s*Open\s*$/ }).first().click();
  await page.waitForSelector('.ed', { timeout: 45000 });
  await page.waitForTimeout(6000);
  const shown = () => page.evaluate(() => ({
    title: document.querySelector('.ed-mast-t, .ed h1')?.textContent.trim().slice(0, 70) ?? null,
    sections: document.querySelectorAll('.ed-tree-row').length,
    loading: [...document.querySelectorAll('.ed [role="status"], .ed .es-title')].map((e) => e.textContent.trim()).filter((t) => /loading|reading/i.test(t)).slice(0, 3),
  }));
  const settled = { reads: reads.length, ...(await shown()) };
  await page.screenshot({ path: `${OUT}/1-editor-open.png` });
  const mark = reads.length;
  await page.locator('nav[aria-label="Primary"] button[aria-haspopup="menu"]').last().click();
  await page.getByRole('menuitem', { name: 'Account', exact: true }).click();
  await page.waitForTimeout(800);
  const during = { readsSince: reads.length - mark, ...(await shown()) };
  await page.waitForTimeout(6000);
  const after = { readsSince: reads.length - mark, repeated: reads.slice(mark), ...(await shown()) };
  await page.screenshot({ path: `${OUT}/2-account-open.png` });
  const result = { settled, during, after, apiFailures: api };
  fs.writeFileSync(OUT + '/t85.json', JSON.stringify(result, null, 1));
  console.info(JSON.stringify(result, null, 1));
  await browser.close();
})().catch((e) => { console.error('ERR', String(e).slice(0, 600)); process.exit(1); });
