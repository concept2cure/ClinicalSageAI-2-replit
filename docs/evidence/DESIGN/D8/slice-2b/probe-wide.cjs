/**
 * On a device screen at a given width: how far its page container scrolls sideways, and the outermost elements that
 * are wider than the container (the ones that cause it), by class.
 *   node probe-wide.cjs <base-url> <email> <program-id> <out.json> [width] [height] [screens,comma]
 */
/* global getComputedStyle -- `find` runs in the page, not in Node. */
const { chromium } = require('playwright');
const fs = require('fs');
const [BASE_ARG, EMAIL, PROGRAM, OUT, W = '390', H = '844', LIST = 'device-510k,device-pma,device-diagnostics,device-cer'] = process.argv.slice(2);
const BASE = BASE_ARG.replace(/\/$/, '');
const find = () => {
  const page = document.querySelector('.mdx-shell .page');
  if (!page) return { error: 'no .mdx-shell .page' };
  const limit = page.getBoundingClientRect().right;
  const wide = [];
  // The outermost elements past the container's right edge: past it themselves, with a parent that is not.
  const walk = (el, depth, parentPast) => {
    for (const c of el.children) {
      const s = getComputedStyle(c);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const r = c.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const past = r.right > limit + 1;
      if (past && !parentPast) wide.push({ depth, cls: String(c.className || c.tagName).split(' ').slice(0, 2).join('.'), parent: String(el.className || el.tagName).split(' ').slice(0, 2).join('.'), parentDisplay: getComputedStyle(el).display, parentCols: getComputedStyle(el).display.includes('grid') ? getComputedStyle(el).gridTemplateColumns.slice(0, 70) : undefined, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), top: Math.round(r.top + page.scrollTop) });
      const clips = ['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowX);
      if (!clips && depth < 12) walk(c, depth + 1, past);
    }
  };
  walk(page, 0, false);
  return { pageClientWidth: page.clientWidth, pageScrollWidth: page.scrollWidth, wide: wide.slice(0, 40) };
};
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: Number(W), height: Number(H) }, hasTouch: Number(W) < 500 })).newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  const ok = await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    if (!r.ok) return `dev-login ${r.status}`;
    const j = await r.json(); const exp = new Date(Date.now() + 864e5).toISOString();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user));
    }
    return 'ok';
  }, EMAIL);
  if (ok !== 'ok') throw new Error(ok);
  const out = {};
  for (const screen of LIST.split(',')) {
    await page.goto(`${BASE}/concept2cure/${screen}?program=${PROGRAM}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const m = await page.evaluate(find); out[screen] = m;
    if (m.error) { console.info(`${screen}: ${m.error}`); continue; }
    console.info(`${screen} @${W}: page ${m.pageClientWidth}px wide, scrolls to ${m.pageScrollWidth}px`);
    for (const w of m.wide) console.info(`   .${w.cls} ${w.left}-${w.right} (${w.width}px) @${w.top} in .${w.parent} (${w.parentDisplay}${w.parentCols ? ' [' + w.parentCols + ']' : ''})`);
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
