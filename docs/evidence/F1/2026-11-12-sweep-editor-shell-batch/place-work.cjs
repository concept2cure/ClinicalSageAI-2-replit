/* Sweep finding 22, the server half: the 1.20 document (sections 1.20 and 1.20:work:1..9) gets one saved
   sentence, then is placed into a sequence of its project from the editor. What does the server answer? */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const BASE = 'http://127.0.0.1:5100';
const OUT = S + '/walk-1112-evidence/batch2/place';
const LMN = 'e00d4d40-5378-41dc-b85e-e49662afe6a6';
const DOC = 'c1ddeda6-3a31-424b-8018-488dc00e711d';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const calls = [];
  page.on('response', async (r) => {
    const u = r.url().replace(BASE, ''); const m = r.request().method();
    if (m !== 'GET' && /\/api\/(authoring|submissions|coauthor|c2c)/.test(u)) {
      let body = null; try { body = JSON.stringify(await r.json()).slice(0, 400); } catch { /* not json */ }
      calls.push({ status: r.status(), method: m, url: u.slice(0, 110), body });
    }
  });
  await page.goto(BASE + '/concept2cure/login', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('input[type=email]', { timeout: 180000 });
  await page.fill('input[type=email]', 'jm.smith@concept2cure.pro');
  await page.fill('input[autocomplete="current-password"]', fs.readFileSync(S + '/d0-before-admin-pw.txt', 'utf8').trim());
  await page.click('button[type=submit]');
  await page.waitForTimeout(6000);
  await page.goto(`${BASE}/concept2cure/document-authoring?program=${LMN}&documentId=${DOC}&sectionCode=${encodeURIComponent('1.20:work:1')}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ed', { timeout: 60000 });
  await page.waitForTimeout(7000);
  const editable = page.locator('[contenteditable="true"]').first();
  await editable.click();
  await page.keyboard.type('LMN-201 is a live biotherapeutic product for the prevention of recurrent C. difficile infection.');
  await page.getByLabel('Reason for change').fill('Walk: first text, to place the document.');
  await page.getByTestId('save-section').click();
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: /Place into filing/ }).first().click();
  await page.waitForTimeout(3000);
  const target = page.getByLabel('Target submission');
  const options = await target.locator('option').allTextContents();
  const values = await target.locator('option').evaluateAll((os) => os.map((o) => o.value));
  const pick = values.find((v) => v);
  if (pick) await target.selectOption(pick);
  await page.waitForTimeout(3000);
  const seq = page.getByLabel(/Target sequence|Sequence/).first();
  const seqOptions = await seq.locator('option').allTextContents().catch(() => []);
  const seqValues = await seq.locator('option').evaluateAll((os) => os.filter((o) => !o.disabled).map((o) => o.value)).catch(() => []);
  const seqPick = seqValues.find((v) => v);
  if (seqPick) await seq.selectOption(seqPick);
  await page.getByLabel(/^Reason for this placement/).fill('Walk: placing the 1.20 introductory statement.');
  await page.waitForTimeout(1200);
  const button = page.getByRole('button', { name: /Place leaf in the sequence/ });
  const disabled = await button.isDisabled();
  const before = await page.evaluate(() => (document.querySelector('.de, [role="dialog"]') || document.body).textContent.replace(/\s+/g, ' ').slice(0, 900));
  if (!disabled) { await button.click(); await page.waitForTimeout(7000); }
  const after = await page.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"], .de-verdict, .de-note')].map((e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 300)).filter(Boolean).slice(0, 6));
  await page.screenshot({ path: `${OUT}/placed.png` });
  const result = { submissions: options, sequences: seqOptions, sectionCode: await page.getByLabel(/Section code/).inputValue(), placeDisabled: disabled, dialogBefore: before, said: after, calls: calls.slice(-6) };
  fs.writeFileSync(OUT + '/place.json', JSON.stringify(result, null, 1));
  console.info(JSON.stringify(result, null, 1));
  await browser.close();
})().catch((e) => { console.error('ERR', String(e).slice(0, 700)); process.exit(1); });
