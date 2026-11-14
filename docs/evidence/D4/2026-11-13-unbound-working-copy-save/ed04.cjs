/* ED-04: an unbound working copy (LMN-201's "1.2 · Cover Letter", made from an IND template, bound to no filing),
   written and saved in the one editor. What does the save say, and what does the page say about the filing? */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const BASE = 'http://127.0.0.1:5100';
const TAG = process.env.TAG || 'before';
const OUT = S + '/ed04/' + TAG;
const LMN = 'e00d4d40-5378-41dc-b85e-e49662afe6a6';
const DOC = 'caf5f425-bb94-4cef-a3d6-7e9f2964c76b';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const api = []; const saves = [];
  page.on('response', async (r) => {
    const u = r.url().replace(BASE, '');
    if (u.includes('/api/') && r.status() >= 400) api.push(`${r.status()} ${r.request().method()} ${u.slice(0, 110)}`);
    if (r.request().method() === 'PATCH' && /\/api\/authoring\/sections\//.test(u)) {
      try { saves.push({ status: r.status(), filing: (await r.json()).filing ?? null }); } catch { saves.push({ status: r.status() }); }
    }
  });
  await page.goto(BASE + '/concept2cure/login', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('input[type=email]', { timeout: 180000 });
  await page.fill('input[type=email]', 'jm.smith@concept2cure.pro');
  await page.fill('input[autocomplete="current-password"]', fs.readFileSync(S + '/d0-before-admin-pw.txt', 'utf8').trim());
  await page.click('button[type=submit]');
  await page.waitForTimeout(6000);
  await page.goto(`${BASE}/concept2cure/document-authoring?program=${LMN}&documentId=${DOC}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ed', { timeout: 90000 });
  await page.waitForTimeout(7000);
  const pageSays = await page.evaluate(() => [...document.querySelectorAll('.c2c-v2 *')]
    .filter((e) => e.children.length === 0 && /unbound|not bound|not placed|working copy/i.test(e.textContent || ''))
    .map((e) => `${e.className || e.tagName}: ${e.textContent.trim().replace(/\s+/g, ' ').slice(0, 160)}`).slice(0, 6));
  const editable = page.locator('[contenteditable="true"]').first();
  await editable.click();
  await page.keyboard.type(`Walk ED-04 (${TAG}): this letter transmits the original IND for LMN-201. `);
  await page.getByLabel('Reason for change').fill('Walk ED-04: what the save says for a working copy bound to no filing.');
  await page.getByTestId('save-section').click();
  await page.waitForTimeout(1500);
  const said = await page.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"], .toast')]
    .map((e) => e.textContent.trim().replace(/\s+/g, ' ')).filter((t) => /saved|filing|section|bound/i.test(t)).slice(0, 4));
  await page.screenshot({ path: `${OUT}/save.png` });
  await page.waitForTimeout(2500);
  const pageSaysAfter = await page.evaluate(() => [...document.querySelectorAll('.c2c-v2 *')]
    .filter((e) => e.children.length === 0 && /unbound|not bound|not placed|working copy/i.test(e.textContent || ''))
    .map((e) => `${e.className || e.tagName}: ${e.textContent.trim().replace(/\s+/g, ' ').slice(0, 160)}`).slice(0, 6));
  const result = { url: page.url().replace(BASE, ''), pageSaysBeforeSave: pageSays, said, pageSaysAfterSave: pageSaysAfter, saves, apiFailures: api };
  fs.writeFileSync(OUT + '/ed04.json', JSON.stringify(result, null, 1));
  console.info(JSON.stringify(result, null, 1));
  await browser.close();
})().catch((e) => { console.error('ERR', String(e).slice(0, 700)); process.exit(1); });
