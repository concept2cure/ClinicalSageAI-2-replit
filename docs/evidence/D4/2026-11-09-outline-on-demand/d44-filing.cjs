/* global getComputedStyle */
/* D4-4 walk, part 2: a filing-bound editing copy, so the outline shows its rule pack's required nodes and basis. */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const P = 'c2ed888d-2958-4332-b186-e81482f2ceec';
const BASE = 'http://127.0.0.1:5100';
const OUT = S + '/walk-1109-evidence/d44-outline';
function measure() {
  const tree = document.querySelector('aside.ed-tree');
  const seen = (el) => { const c = el.cloneNode(true); c.querySelectorAll('.sr-only').forEach((n) => n.remove()); return c.textContent || ''; };
  const rows = tree ? [...tree.querySelectorAll('.ed-tree-row')] : [];
  const ring = tree && tree.querySelector('.ed-tree-row .ed-req');
  const basis = tree && tree.querySelector('details.ed-basis');
  const key = tree && tree.querySelector('.ed-tree-key');
  return {
    title: document.querySelector('.ed-tree-t')?.textContent, meta: document.querySelector('.ed-tree-m')?.textContent,
    rows: rows.length, rings: tree ? tree.querySelectorAll('.ed-tree-row .ed-req').length : 0,
    ringsWithSrText: tree ? [...tree.querySelectorAll('.ed-tree-row .ed-req .sr-only')].filter((n) => n.textContent === 'required').length : 0,
    visibleRequiredWords: rows.filter((r) => /required/i.test(seen(r))).length,
    dimmed: rows.filter((r) => r.style.opacity && r.style.opacity !== '1').length,
    unstarted: rows.filter((r) => r.hasAttribute('data-unstarted')).length,
    ringBorder: ring ? getComputedStyle(ring).borderTopColor + ' ' + getComputedStyle(ring).borderTopWidth : null,
    basis: basis ? { open: basis.open, summary: basis.querySelector('summary').textContent.trim() } : null,
    key: key ? key.textContent.trim() : null,
  };
}
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--disable-gpu', '--no-sandbox'] });
  const res = {};
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, storageState: S + '/walk-1109-capture/work/state.json' });
    const page = await ctx.newPage();
    await page.goto(BASE + `/concept2cure/project-home?program=${P}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('.c2c-v2'); await page.waitForTimeout(3000);
    await page.locator('button.btn').filter({ hasText: /^\s*Open\s*$/ }).first().click();
    await page.waitForSelector('.rse-ribbon', { timeout: 30000 }); await page.waitForTimeout(2000);
    const create = page.getByRole('button', { name: /Create editing copy/ }).first();
    res.createOffered = await create.count() > 0;
    if (res.createOffered) { await create.click(); await page.waitForTimeout(6000); }
    await page.waitForSelector('.ed-tree-row .ed-req', { timeout: 30000 }).catch(() => {});
    res.after = await page.evaluate(measure);
    await page.screenshot({ path: `${OUT}/filing-1440-light.png` });
    const summary = page.locator('details.ed-basis > summary');
    if (await summary.count()) { await summary.click(); await page.waitForTimeout(300); res.basisOpened = await page.evaluate(() => { const d = document.querySelector('details.ed-basis'); return { open: d.open, detail: d.querySelector('.ed-basis-d')?.textContent.slice(0, 160) }; }); await page.screenshot({ path: `${OUT}/filing-1440-basis-open.png` }); }
    await ctx.close();
  } catch (e) { res.error = String(e).slice(0, 400); }
  await b.close();
  fs.writeFileSync(OUT + '/d44-filing.json', JSON.stringify(res, null, 1));
  console.info(JSON.stringify(res, null, 1));
})();
