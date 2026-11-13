/* Batch 2 in the running app, 1440 px: (A) search for a project, (B) Place into filing on a document of
   working headings, (C) a CMC register wider than the page, (D) the editor's source catalogue when the
   server refuses the first read with 503 SOURCE_READ_ACCESS_CHANGED. In (D) that one reply is forced by
   the walk (a save landing inside a 6-second read is not reproducible on demand). The first two replies are forced,
   one for each of the editor's two readers of that page (the citation catalogue and the Data room panel);
   every other reply is the server's own. */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const BASE = 'http://127.0.0.1:5100';
const TAG = process.env.TAG || 'before';
const OUT = S + '/walk-1112-evidence/batch2/' + TAG;
const LMN = 'e00d4d40-5378-41dc-b85e-e49662afe6a6';
const DOC = 'c1ddeda6-3a31-424b-8018-488dc00e711d';
const CMC = process.env.CMC || 'c2ed888d-2958-4332-b186-e81482f2ceec';

async function searchFor(page, term) {
  await page.keyboard.press('Control+k');
  const box = page.locator('.cmdk-in input').first();
  await box.waitFor({ timeout: 15000 });
  await box.fill(term);
  await page.waitForTimeout(2500);
  const seen = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.cmdk-list > *')].map((e) => `${e.className.includes('cmdk-hdr') ? '## ' : e.className.includes('cmdk-empty') ? '(note) ' : ''}${e.textContent.trim().replace(/\s+/g, ' ').slice(0, 90)}`);
    const i = rows.findIndex((t) => t === '## Projects');
    return i < 0 ? rows.slice(0, 4) : rows.slice(i, i + 11);
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  return seen;
}

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
  const result = {};

  // (A) Search.
  await page.goto(BASE + '/concept2cure', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.c2c-v2'); await page.waitForTimeout(3000);
  const listed = await page.evaluate(async () => {
    const token = localStorage.getItem('trialsage_access_token') || sessionStorage.getItem('trialsage_access_token');
    const r = await fetch('/api/c2c/projects?limit=200', { headers: { Authorization: `Bearer ${token}` } });
    const body = await r.json();
    const rows = Array.isArray(body) ? body : body.data || [];
    return rows.map((p) => `${p.code || '(no code)'} | ${String(p.title).slice(0, 50)}`);
  });
  result.projectsListed = listed;
  const oldestCode = (listed[listed.length - 1] || '').split(' | ')[0];
  result.searchLmn = await searchFor(page, 'lmn');
  result.searchOldestCode = { term: oldestCode, rows: await searchFor(page, oldestCode) };
  await page.keyboard.press('Control+k'); await page.waitForTimeout(600);
  await page.locator('.cmdk-in input').first().fill('lmn'); await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/A-search.png` });
  await page.keyboard.press('Escape');

  // (D) The source catalogue's first read is refused once; armed before the editor opens.
  let refused = 0; let asked = 0;
  await page.route(/\/api\/c2c\/projects\/[^/]+\/sources\?limit=200&offset=0$/, async (route) => {
    asked += 1;
    if (refused < 2) {
      refused += 1;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'SOURCE_READ_ACCESS_CHANGED', error: { code: 'SOURCE_READ_ACCESS_CHANGED', message: 'Current source access changed during the read.' } }) });
    }
    return route.continue();
  });

  // (B) Place into filing, on the 1.20 document whose sections are 1.20 and 1.20:work:1..9.
  await page.goto(`${BASE}/concept2cure/document-authoring?program=${LMN}&documentId=${DOC}&sectionCode=${encodeURIComponent('1.20:work:1')}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ed', { timeout: 60000 });
  await page.waitForTimeout(9000);
  result.sources = { asked, forcedRefusals: refused, said: await page.evaluate(() => [...document.querySelectorAll('[role="alert"], [role="status"], .es-title, .c2c-empty-state')].map((e) => e.textContent.trim().replace(/\s+/g, ' ')).filter((t) => /source|catalogue/i.test(t)).slice(0, 4)) };
  await page.screenshot({ path: `${OUT}/D-editor-after-refused-read.png` });
  const place = page.getByRole('button', { name: /Place into filing/ }).first();
  await place.click();
  await page.waitForTimeout(3500);
  result.place = await page.evaluate(() => {
    const input = [...document.querySelectorAll('label')].find((l) => /Section code/.test(l.textContent || ''));
    const field = input ? (input.control || input.querySelector('input') || document.getElementById(input.getAttribute('for') || '')) : null;
    const text = document.body.textContent || '';
    return {
      sectionCode: field ? field.value : null,
      notCtd: /is not a CTD section code/.test(text),
      oneSection: /is one section of this document/.test(text),
      filesAs: (text.match(/Files as [^.]{0,80}/) || [null])[0],
    };
  });
  await page.screenshot({ path: `${OUT}/B-place-into-filing.png` });

  // (C) A CMC register at 1440.
  await page.unroute(/\/api\/c2c\/projects\/[^/]+\/sources\?limit=200&offset=0$/);
  await page.goto(`${BASE}/concept2cure/cmc?program=${CMC}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.c2c-v2'); await page.waitForTimeout(5000);
  result.cmc = await page.evaluate(() => {
    const tables = [...document.querySelectorAll('[data-work-area="cmc"] .reg-tbl')];
    return {
      workArea: Boolean(document.querySelector('[data-work-area="cmc"]')),
      tables: tables.length,
      first: tables.slice(0, 3).map((t) => { const cs = window.getComputedStyle(t); return { display: cs.display, overflowX: cs.overflowX, scroll: t.scrollWidth, box: Math.round(t.getBoundingClientRect().width) }; }),
      pageSideways: document.scrollingElement.scrollWidth > window.innerWidth + 1,
    };
  });
  await page.screenshot({ path: `${OUT}/C-cmc.png` });

  result.apiFailures = api;
  fs.writeFileSync(OUT + '/batch2.json', JSON.stringify(result, null, 1));
  console.info(JSON.stringify(result, null, 1));
  await browser.close();
})().catch((e) => { console.error('ERR', String(e).slice(0, 700)); process.exit(1); });
