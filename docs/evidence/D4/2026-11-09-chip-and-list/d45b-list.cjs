/* global getComputedStyle */
/* D4-5b walk: the conversation's Documents list is quiet. Its scope is D0's segmented control, not an orange pressed
   pill, and the open document's "← Documents" is a ghost button in the editor's bar. 1440 light and dark. */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const P = 'c2ed888d-2958-4332-b186-e81482f2ceec';
const BASE = 'http://127.0.0.1:5100';
const OUT = S + '/walk-1109-evidence/d45b-list';

function measureList() {
  const scope = document.querySelector('.cdl-scope');
  const pressed = scope && scope.querySelector('[aria-pressed="true"]');
  const other = scope && scope.querySelector('[aria-pressed="false"]');
  const cs = (el) => (el ? { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color, weight: getComputedStyle(el).fontWeight } : null);
  const accent = getComputedStyle(document.querySelector('.c2c-v2')).getPropertyValue('--accent-200').trim();
  return { scopeClass: scope && scope.className, pressedText: pressed && pressed.textContent.trim(), pressed: cs(pressed), other: cs(other), accent200: accent };
}

async function run(browser, dark, results) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, storageState: S + '/walk-1109-capture/work/state.json' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/concept2cure', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate((d) => { try { const k = 'c2c-v2-prefs'; const p = JSON.parse(localStorage.getItem(k) || '{}'); p.dark = d; localStorage.setItem(k, JSON.stringify(p)); } catch { /* none */ } }, dark);
  await page.goto(BASE + `/concept2cure/project-home?program=${P}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.c2c-v2'); await page.waitForTimeout(2500);
  await page.locator('button.btn').filter({ hasText: /^\s*Open\s*$/ }).first().click();
  await page.waitForSelector('.ed', { timeout: 30000 }); await page.waitForTimeout(2500);
  if (!(await page.locator('.rse-ribbon').count())) {
    if (await page.locator('aside.ed-tree[hidden]').count()) await page.locator('[data-testid="ed-outline-toggle"]').click();
    await page.locator('.ed-tree-row').filter({ hasText: /2\.3 · Quality Overall/ }).first().click();
    await page.waitForSelector('.rse-ribbon', { timeout: 30000 }); await page.waitForTimeout(1500);
  }
  await page.getByRole('button', { name: /Draft with AnA/ }).first().click();
  await page.waitForSelector('.ct-canvas-pane .ed', { timeout: 30000 }); await page.waitForTimeout(2500);
  const name = dark ? 'dark' : 'light';
  const docsBtn = page.locator('.ct-canvas-pane [data-testid="dc-documents"]');
  const r = { case: `list-1440-${name}`, documentsButton: (await docsBtn.count()) ? await docsBtn.first().evaluate((b) => ({ cls: b.className, text: b.textContent.trim() })) : null };
  if (r.documentsButton) { await docsBtn.first().click(); await page.waitForTimeout(1500); }
  else { await page.locator('[data-testid="ct-documents-toggle"]').click(); await page.waitForTimeout(1500); }
  r.list = await page.evaluate(measureList);
  await page.screenshot({ path: `${OUT}/list-1440-${name}.png` });
  results.push(r);
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--disable-gpu', '--no-sandbox'] });
  const results = [];
  try { for (const dark of [false, true]) { try { await run(browser, dark, results); } catch (e) { results.push({ dark, error: String(e).slice(0, 300) }); } } } finally { await browser.close(); }
  fs.writeFileSync(OUT + '/d45b-list.json', JSON.stringify(results, null, 1));
  console.info(JSON.stringify(results, null, 1));
})().catch((e) => { console.error('ERR', String(e).slice(0, 600)); process.exit(1); });
