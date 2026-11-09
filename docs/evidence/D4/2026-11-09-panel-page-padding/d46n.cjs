/* global getComputedStyle */
/* D4-6 follow-up: the ribbon and the page inside a narrow panel. At 1440 and 1280 the editor opens beside the
   conversation; measure the panel, the page, the ribbon and whether its last control lies past the panel. */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const P = 'c2ed888d-2958-4332-b186-e81482f2ceec';
const BASE = 'http://127.0.0.1:5100';
const OUT = S + '/walk-1109-evidence/' + (process.env.TAG || 'd46n');

function measure() {
  const pane = document.querySelector('.ct-canvas-pane');
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }; };
  const ribbon = pane && pane.querySelector('.rse-ribbon');
  const inner = pane && pane.querySelector('.ed-doc-inner');
  const kids = ribbon ? [...ribbon.children].filter((c) => c.getBoundingClientRect().width > 0) : [];
  const last = kids[kids.length - 1];
  const paneR = pane ? pane.getBoundingClientRect().right : 0;
  const pastPanel = kids.filter((c) => c.getBoundingClientRect().right > paneR + 1).map((c) => (c.getAttribute('aria-label') || c.textContent || c.className).trim().slice(0, 30));
  return {
    pane: box(pane), page: box(inner), ribbon: box(ribbon),
    ribbonScroll: ribbon ? [ribbon.scrollWidth, ribbon.clientWidth] : null,
    ribbonOverflowX: ribbon ? getComputedStyle(ribbon).overflowX : null,
    pagePad: inner ? getComputedStyle(inner).paddingLeft + ' / ' + getComputedStyle(inner).paddingRight : null,
    last: last ? { what: (last.getAttribute('aria-label') || last.textContent || last.className).trim().slice(0, 30), ...box(last) } : null,
    pastPanel,
    docScroll: document.scrollingElement.scrollWidth > window.innerWidth + 1,
  };
}

async function run(browser, width, results) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, storageState: S + '/walk-1109-capture/work/state.json' });
  const page = await ctx.newPage();
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
  await page.waitForSelector('.ct-canvas-pane .rse-ribbon', { timeout: 30000 }); await page.waitForTimeout(2500);
  const r = { case: `pane-${width}`, ...(await page.evaluate(measure)) };
  await page.screenshot({ path: `${OUT}/pane-${width}.png` });
  results.push(r);
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--disable-gpu', '--no-sandbox'] });
  const results = [];
  try { for (const w of [1440, 1280]) { try { await run(browser, w, results); } catch (e) { results.push({ w, error: String(e).slice(0, 300) }); } } } finally { await browser.close(); }
  fs.writeFileSync(OUT + '/d46n.json', JSON.stringify(results, null, 1));
  console.info(JSON.stringify(results, null, 1));
})().catch((e) => { console.error('ERR', String(e).slice(0, 600)); process.exit(1); });
