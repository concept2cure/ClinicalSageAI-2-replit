/* Task 87: a new Quality controlled document, written and saved in the one editor. What does the save say? */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const BASE = 'http://127.0.0.1:5100';
const TAG = process.env.TAG || 'before';
const OUT = S + '/walk-1112-evidence/t87/' + TAG;
const P = process.env.P || 'e00d4d40-5378-41dc-b85e-e49662afe6a6';

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
  await page.goto(`${BASE}/concept2cure/quality?program=${P}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.c2c-v2'); await page.waitForTimeout(5000);
  await page.getByRole('region', { name: 'Controlled documents' }).getByRole('button', { name: 'New controlled document' }).click();
  const d = page.getByRole('dialog', { name: 'New controlled document' });
  await d.waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  await d.getByLabel('Title').fill(`Walk 87 (${TAG}): sample receipt procedure`);
  await d.getByLabel('Template').selectOption({ index: 1 }).catch(() => {});
  await d.getByLabel('Reason').fill('Walk 87: what the save says for a controlled document.');
  await d.locator('.de-f .de-btn.primary').click();
  const editable = page.locator('[contenteditable="true"]').first();
  await editable.waitFor({ timeout: 45000 });
  await editable.click();
  await page.keyboard.type('Receive each sample, check its label against the manifest, and log it within one working day.');
  await page.getByLabel('Reason for change').fill('Walk 87: the first text of the procedure.');
  await page.getByTestId('save-section').click();
  await page.waitForTimeout(1500);
  const said = await page.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"], .toast')]
    .map((e) => e.textContent.trim().replace(/\s+/g, ' ')).filter((t) => /saved|filing|section/i.test(t)).slice(0, 4));
  await page.screenshot({ path: `${OUT}/save.png` });
  await page.waitForTimeout(2500);
  const result = { url: page.url().replace(BASE, ''), said, saves, apiFailures: api };
  fs.writeFileSync(OUT + '/t87.json', JSON.stringify(result, null, 1));
  console.info(JSON.stringify(result, null, 1));
  await browser.close();
})().catch((e) => { console.error('ERR', String(e).slice(0, 700)); process.exit(1); });
