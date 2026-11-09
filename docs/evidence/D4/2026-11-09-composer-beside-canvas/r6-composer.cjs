/* J3 R6 recheck: with the canvas open beside the conversation, are the composer's controls inside the
   conversation column, visible (elementFromPoint), and unclipped? 1440 light and dark, and 1280. */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const P = 'c2ed888d-2958-4332-b186-e81482f2ceec';
const BASE = 'http://127.0.0.1:5100';
const OUT = S + '/walk-1109-evidence/r6-composer';
const CASES = [{ w: 1440, h: 900, dark: false }, { w: 1440, h: 900, dark: true }, { w: 1280, h: 800, dark: false }];

function measure() {
  const conv = document.querySelector('.ct-conv');
  const foot = document.querySelector('.ct-comp-foot');
  if (!conv || !foot) return { found: false, conv: !!conv, foot: !!foot };
  const cr = conv.getBoundingClientRect();
  const hit = (el) => {
    const r = el.getBoundingClientRect();
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!h && (h === el || el.contains(h) || h.contains(el));
  };
  const controls = [...foot.children].map((el) => {
    const r = el.getBoundingClientRect();
    return { cls: String(el.className || el.tagName).slice(0, 30), text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40),
      left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height),
      inside: r.left >= cr.left - 0.5 && r.right <= cr.right + 0.5, visible: hit(el) };
  });
  const canvas = document.querySelector('.ct-canvas, [class*="ct-doc"], .ed');
  return { found: true, conv: { left: Math.round(cr.left), right: Math.round(cr.right), width: Math.round(cr.width) },
    canvasOpen: !!canvas, foot: { width: Math.round(foot.getBoundingClientRect().width), height: Math.round(foot.getBoundingClientRect().height) },
    controls, allInside: controls.every((c) => c.inside), allVisible: controls.every((c) => c.visible) };
}

async function run(browser, c, results) {
  const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: 1,
    storageState: S + '/walk-1109-capture/work/state.json' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/concept2cure', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate((d) => { try { const k = 'c2c-v2-prefs'; const p = JSON.parse(localStorage.getItem(k) || '{}'); p.dark = d; localStorage.setItem(k, JSON.stringify(p)); } catch { /* none */ } }, c.dark);
  await page.goto(BASE + `/concept2cure/project-home?program=${P}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.c2c-v2'); await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.locator('button.btn').filter({ hasText: /^\s*Open\s*$/ }).first().click();
  await page.waitForSelector('.rse-ribbon', { timeout: 30000 }); await page.waitForTimeout(2000);
  const draft = page.getByRole('button', { name: /Draft with AnA/ }).first();
  await draft.click();
  await page.waitForSelector('.ct-comp-foot', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const name = `r6-${c.w}-${c.dark ? 'dark' : 'light'}`;
  const r = await page.evaluate(measure);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  results.push({ case: name, url: page.url().replace(BASE, ''), ...r });
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--disable-gpu', '--no-sandbox'] });
  const results = [];
  try {
    for (const c of CASES) {
      try { await run(browser, c, results); } catch (e) { results.push({ case: `${c.w}-${c.dark}`, error: String(e).slice(0, 300) }); }
    }
  } finally { await browser.close(); }
  fs.writeFileSync(OUT + '/r6-composer.json', JSON.stringify(results, null, 1));
  console.info(JSON.stringify(results.map((x) => ({ case: x.case, error: x.error, conv: x.conv, canvasOpen: x.canvasOpen, allInside: x.allInside, allVisible: x.allVisible,
    controls: x.controls && x.controls.map((k) => `${k.text.slice(0, 22)} L${k.left} R${k.right} ${k.inside ? 'in' : 'OUT'} ${k.visible ? 'vis' : 'HIDDEN'}`) })), null, 1));
})().catch((e) => { console.info('ERR', String(e).slice(0, 600)); process.exit(1); });
