/* global getComputedStyle */
/* D4-5a walk: the document beside the conversation has one bar; the conversation keeps 420-560 px; the bar's
   close, Escape, "Open full width" and Documents work. 1440 light and dark, 1280, and 390. */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const P = 'c2ed888d-2958-4332-b186-e81482f2ceec';
const BASE = 'http://127.0.0.1:5100';
const OUT = S + '/walk-1109-evidence/d45-onebar';

function measure() {
  const hit = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1) return false;
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!h && (h === el || el.contains(h));
  };
  const pane = document.querySelector('.ct-canvas-pane');
  const exp = pane && pane.querySelector('.dcv-expanded');
  const conv = document.querySelector('.ct-conv');
  const bars = exp ? [...exp.querySelectorAll('.dcv-bar')].filter((b) => b.getBoundingClientRect().height > 0) : [];
  const bar = bars[0];
  const q = (sel) => (bar ? bar.querySelector(sel) : null);
  const close = q('[data-testid="dc-back"]');
  const full = q('[data-testid="dc-edit-in-authoring"]');
  return {
    paneOpen: !!exp && !exp.hidden,
    placement: exp && exp.getAttribute('data-placement'),
    convWidth: conv && getComputedStyle(conv).display !== 'none' ? Math.round(conv.getBoundingClientRect().width) : 0,
    paneWidth: pane ? Math.round(pane.getBoundingClientRect().width) : 0,
    visibleBars: bars.length,
    barHeight: bar ? Math.round(bar.getBoundingClientRect().height) : null,
    escChip: !!(exp && exp.querySelector('.dcv-bar-hint')),
    close: close ? { label: close.getAttribute('aria-label'), keys: close.getAttribute('aria-keyshortcuts'), visible: hit(close) } : null,
    openFullWidth: full ? { label: full.getAttribute('aria-label'), visible: hit(full) } : null,
    status: !!q('[data-testid="dc-status"]'),
    outlineToggle: !!q('[data-testid="ed-outline-toggle"]'),
    sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
}

async function openPane(page, dark) {
  await page.goto(BASE + '/concept2cure', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate((d) => { try { const k = 'c2c-v2-prefs'; const p = JSON.parse(localStorage.getItem(k) || '{}'); p.dark = d; localStorage.setItem(k, JSON.stringify(p)); localStorage.removeItem('c2c.editor.outline'); } catch { /* none */ } }, dark);
  await page.goto(BASE + `/concept2cure/project-home?program=${P}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.c2c-v2'); await page.waitForTimeout(2500);
  await page.locator('button.btn').filter({ hasText: /^\s*Open\s*$/ }).first().click();
  await page.waitForSelector('.ed', { timeout: 30000 }); await page.waitForTimeout(2500);
  // The project's first document can be its filing copy with no section open; open the QOS working copy instead.
  if (!(await page.locator('.rse-ribbon').count())) {
    if (await page.locator('aside.ed-tree[hidden]').count()) await page.locator('[data-testid="ed-outline-toggle"]').click();
    await page.locator('.ed-tree-row').filter({ hasText: /2\.3 · Quality Overall/ }).first().click();
    await page.waitForSelector('.rse-ribbon', { timeout: 30000 }); await page.waitForTimeout(2000);
  }
  await page.getByRole('button', { name: /Draft with AnA/ }).first().click();
  await page.waitForSelector('.ct-canvas-pane .ed, .ct-conv', { timeout: 30000 }); await page.waitForTimeout(3000);
}

async function run(browser, c, results) {
  const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: 1, isMobile: c.w < 500, hasTouch: c.w < 500, storageState: S + '/walk-1109-capture/work/state.json' });
  const page = await ctx.newPage();
  const name = `pane-${c.w}-${c.dark ? 'dark' : 'light'}`;
  await openPane(page, c.dark);
  const open = await page.evaluate(measure);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const r = { case: name, open };
  if (open.close) {
    await page.locator('.ct-canvas-pane [data-testid="dc-back"]').focus();
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    r.afterEscape = await page.evaluate(measure);
  }
  results.push(r);
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--disable-gpu', '--no-sandbox'] });
  const results = [];
  try {
    for (const c of [{ w: 1440, h: 900, dark: false }, { w: 1440, h: 900, dark: true }, { w: 1280, h: 800, dark: false }, { w: 390, h: 844, dark: false }]) {
      try { await run(browser, c, results); } catch (e) { results.push({ case: `${c.w}-${c.dark}`, error: String(e).slice(0, 300) }); }
    }
  } finally { await browser.close(); }
  fs.writeFileSync(OUT + '/d45-onebar.json', JSON.stringify(results, null, 1));
  console.info(JSON.stringify(results, null, 1));
})().catch((e) => { console.error('ERR', String(e).slice(0, 600)); process.exit(1); });
