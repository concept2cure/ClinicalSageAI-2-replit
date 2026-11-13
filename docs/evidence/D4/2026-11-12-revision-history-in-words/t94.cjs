/* Sweep findings 24, 26 and 11 in the running app: a section is saved twice with a reason each time, then
   the Versions rail is opened. What does the save say, is the count current, and what does each card show? */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const BASE = 'http://127.0.0.1:5100';
const OUT = S + '/walk-1112-evidence/t94/' + (process.env.TAG || 'after');
const LMN = 'e00d4d40-5378-41dc-b85e-e49662afe6a6';
const DOC = 'c1ddeda6-3a31-424b-8018-488dc00e711d';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const api = [];
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) api.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '').slice(0, 100)}`); });
  await page.goto(BASE + '/concept2cure/login', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('input[type=email]', { timeout: 180000 });
  await page.fill('input[type=email]', 'jm.smith@concept2cure.pro');
  await page.fill('input[autocomplete="current-password"]', fs.readFileSync(S + '/d0-before-admin-pw.txt', 'utf8').trim());
  await page.click('button[type=submit]');
  await page.waitForTimeout(6000);
  await page.goto(`${BASE}/concept2cure/document-authoring?program=${LMN}&documentId=${DOC}&sectionCode=${encodeURIComponent('1.20:work:2')}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ed', { timeout: 60000 });
  await page.waitForTimeout(7000);
  const toasts = async () => page.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"], .toast')].map((e) => e.textContent.trim().replace(/\s+/g, ' ')).filter((t) => /Section saved/.test(t)).slice(0, 2));
  const version = async () => page.evaluate(() => document.querySelector('.ed-ver')?.textContent.trim().replace(/\s+/g, ' ') ?? null);
  const saves = [];
  for (const [text, reason] of [[' The dosage form is an oral capsule.', 'Walk 94: the dosage form stated'], [' Each capsule holds one dose.', 'Walk 94: the unit dose added']]) {
    const editable = page.locator('[contenteditable="true"]').first();
    await editable.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(text);
    await page.getByLabel('Reason for change').fill(reason);
    await page.getByTestId('save-section').click();
    await page.waitForTimeout(1500);
    saves.push({ reason, said: await toasts(), versionRightAfter: await version() });
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: `${OUT}/1-saved.png` });
  await page.locator('.ed-ver').first().click();
  await page.waitForTimeout(3500);
  const cards = await page.evaluate(() => [...document.querySelectorAll('.cmt')].slice(0, 4).map((c) => ({
    head: c.querySelector('.cmt-hd, .cmt-head, .cmt-top')?.textContent.trim().replace(/\s+/g, ' ').slice(0, 120) ?? null,
    body: c.querySelector('.cmt-body')?.textContent.trim().slice(0, 160) ?? null,
    lines: [...c.querySelectorAll('.cmt-when')].map((e) => e.textContent.trim()).filter((t) => /^Reason:/.test(t)),
    markupShown: /<p>|<span|data-comment-id/.test(c.querySelector('.cmt-body')?.textContent ?? ''),
  })));
  await page.screenshot({ path: `${OUT}/2-versions.png` });
  const result = { saves, cards, apiFailures: api };
  fs.writeFileSync(OUT + '/t94.json', JSON.stringify(result, null, 1));
  console.info(JSON.stringify(result, null, 1));
  await browser.close();
})().catch((e) => { console.error('ERR', String(e).slice(0, 700)); process.exit(1); });
