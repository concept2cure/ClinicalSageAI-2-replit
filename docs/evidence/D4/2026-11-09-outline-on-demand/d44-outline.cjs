/* global getComputedStyle */
/* D4-4 walk: the outline on demand, in the running app. Page placement at 1440 (light, dark) and 390, and the pane
   beside the conversation at 1440. Visibility by elementFromPoint, never by box alone. */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const P = 'c2ed888d-2958-4332-b186-e81482f2ceec';
const BASE = 'http://127.0.0.1:5100';
const OUT = S + '/walk-1109-evidence/d44-outline';

function outlineState() {
  const ed = document.querySelector('.ed');
  const tree = document.querySelector('aside.ed-tree');
  const toggle = document.querySelector('[data-testid="ed-outline-toggle"]');
  const hit = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const h = document.elementFromPoint(r.left + Math.min(40, r.width / 2), r.top + Math.min(40, r.height / 2));
    return !!h && (h === el || el.contains(h));
  };
  const seen = (el) => { const c = el.cloneNode(true); c.querySelectorAll('.sr-only').forEach((n) => n.remove()); return c.textContent || ''; };
  const rows = tree ? [...tree.querySelectorAll('.ed-tree-row')] : [];
  const active = tree && tree.querySelector('.ed-tree-row[data-active]');
  const doc = document.querySelector('.ed-doc');
  return {
    dataOutline: ed && ed.getAttribute('data-outline'),
    treeHidden: tree ? tree.hidden : null,
    treeVisible: hit(tree),
    treeWidth: tree ? Math.round(tree.getBoundingClientRect().width) : null,
    treePosition: tree ? getComputedStyle(tree).position : null,
    docWidth: doc ? Math.round(doc.getBoundingClientRect().width) : null,
    toggle: toggle ? { expanded: toggle.getAttribute('aria-expanded'), label: toggle.getAttribute('aria-label'), visible: hit(toggle) } : null,
    rows: rows.length,
    visibleRequiredWords: rows.filter((r) => /required/i.test(seen(r))).length,
    rings: tree ? tree.querySelectorAll('.ed-tree-row .ed-req').length : 0,
    unstartedDimmedByOpacity: rows.filter((r) => r.style.opacity && r.style.opacity !== '1').length,
    activeRowBg: active ? getComputedStyle(active).backgroundColor : null,
    activeRowColor: active ? getComputedStyle(active).color : null,
    basis: (() => { const d = tree && tree.querySelector('details.ed-basis'); return d ? { open: d.open, summary: d.querySelector('summary').textContent.trim() } : null; })(),
    focusIs: document.activeElement && (document.activeElement.getAttribute('data-testid') || document.activeElement.className),
    pageSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
}

async function openEditor(page, dark) {
  await page.goto(BASE + '/concept2cure', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate((d) => { try { const k = 'c2c-v2-prefs'; const p = JSON.parse(localStorage.getItem(k) || '{}'); p.dark = d; localStorage.setItem(k, JSON.stringify(p)); localStorage.removeItem('c2c.editor.outline'); } catch { /* none */ } }, dark);
  await page.goto(BASE + `/concept2cure/project-home?program=${P}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.c2c-v2'); await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.locator('button.btn').filter({ hasText: /^\s*Open\s*$/ }).first().click();
  await page.waitForSelector('.rse-ribbon', { timeout: 30000 }); await page.waitForTimeout(2500);
}

async function pageCase(browser, w, h, dark, results) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500, storageState: S + '/walk-1109-capture/work/state.json' });
  const page = await ctx.newPage();
  const name = `page-${w}-${dark ? 'dark' : 'light'}`;
  await openEditor(page, dark);
  const opened = await page.evaluate(outlineState);
  await page.screenshot({ path: `${OUT}/${name}-default.png` });
  await page.locator('[data-testid="ed-outline-toggle"]').click(); await page.waitForTimeout(500);
  const toggled = await page.evaluate(outlineState);
  await page.screenshot({ path: `${OUT}/${name}-toggled.png` });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.rse-ribbon', { timeout: 30000 }); await page.waitForTimeout(2500);
  const reloaded = await page.evaluate(outlineState);
  results.push({ case: name, opened, toggled, reloaded });
  await ctx.close();
}

async function paneCase(browser, results) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, storageState: S + '/walk-1109-capture/work/state.json' });
  const page = await ctx.newPage();
  await openEditor(page, false);
  // The page placement remembers nothing yet; open the conversation beside the canvas.
  await page.getByRole('button', { name: /Draft with AnA/ }).first().click();
  await page.waitForSelector('.ct-canvas-pane .ed', { timeout: 30000 }); await page.waitForTimeout(2500);
  const pane = page.locator('.ct-canvas-pane');
  const before = await page.evaluate(outlineState);
  await page.screenshot({ path: `${OUT}/pane-1440-default.png` });
  await pane.locator('[data-testid="ed-outline-toggle"]').click(); await page.waitForTimeout(500);
  const open = await page.evaluate(outlineState);
  await page.screenshot({ path: `${OUT}/pane-1440-outline-open.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  const afterEscape = await page.evaluate(outlineState);
  const canvasStillOpen = await page.evaluate(() => !!document.querySelector('.ct-canvas-pane:not([hidden]) .ed'));
  results.push({ case: 'pane-1440-light', before, open, afterEscape, canvasStillOpen });
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--disable-gpu', '--no-sandbox'] });
  const results = [];
  try {
    for (const [w, h, dark] of [[1440, 900, false], [1440, 900, true], [390, 844, false]]) {
      try { await pageCase(browser, w, h, dark, results); } catch (e) { results.push({ case: `page-${w}-${dark}`, error: String(e).slice(0, 300) }); }
    }
    try { await paneCase(browser, results); } catch (e) { results.push({ case: 'pane', error: String(e).slice(0, 300) }); }
  } finally { await browser.close(); }
  fs.writeFileSync(OUT + '/d44-outline.json', JSON.stringify(results, null, 1));
  console.info(JSON.stringify(results, null, 1));
})().catch((e) => { console.error('ERR', String(e).slice(0, 600)); process.exit(1); });
