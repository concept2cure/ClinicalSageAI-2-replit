/**
 * What a person meets on each device screen, on arrival and after opening each of its tabs in turn: the text each
 * uppercase rule of the device stylesheets styles, and how section headings, their sub-lines, table headings and
 * empty states are drawn (computed font, size, weight, colour, transform).
 *   node probe-states.cjs <base-url> <email> <stops.json> <out.json>
 */
/* global getComputedStyle -- `read` runs in the page, not in Node. */
const { chromium } = require('playwright');
const fs = require('fs');
const [BASE_ARG, EMAIL, STOPS, OUT] = process.argv.slice(2);
const BASE = BASE_ARG.replace(/\/$/, '');
const ROOT = '/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/mdx/';
const upperSelectors = [];
for (const sheet of ['app.css', 'pathway-tabs.css', 'files-tree.css']) {
  const css = fs.readFileSync(ROOT + sheet, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) if (/text-transform:\s*uppercase/.test(m[2])) for (const s of m[1].split(',')) upperSelectors.push(`${sheet} ${s.trim()}`);
}
const read = (uppers) => {
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const style = (e) => { const s = getComputedStyle(e); return `${s.fontFamily.split(',')[0].replace(/"/g, '')} ${s.fontSize}/${s.fontWeight} ${s.textTransform !== 'none' ? s.textTransform + ' ' : ''}${s.letterSpacing !== 'normal' ? 'ls ' + s.letterSpacing + ' ' : ''}${s.color}`; };
  const out = { upper: {}, headings: {}, subs: {}, thead: {}, empties: [] };
  for (const entry of uppers) {
    const sel = entry.slice(entry.indexOf(' ') + 1);
    let els; try { els = [...document.querySelectorAll(sel)].filter(vis); } catch { continue; }
    const texts = [...new Set(els.map((e) => clean(e.innerText)).filter(Boolean))].slice(0, 6);
    if (texts.length) out.upper[entry] = texts;
  }
  const take = (sel, key) => { for (const e of document.querySelectorAll(sel)) { if (!vis(e)) continue; const k = `${String(e.className || e.tagName).split(' ')[0]} | ${style(e)}`; (out[key][k] ||= []).length < 4 && out[key][k].push(clean(e.innerText).slice(0, 40)); } };
  take('.mdx-shell h2, .mdx-shell h3', 'headings');
  take('.mdx-shell .section-sub, .mdx-shell .section-head .sub, .mdx-shell .sec-sub', 'subs');
  take('.mdx-shell thead th, .mdx-shell .ctable-head > *, .mdx-shell [role="columnheader"]', 'thead');
  for (const e of document.querySelectorAll('.mdx-shell .empty-state, .mdx-shell [data-testid="data-gate-empty"], .mdx-shell .empty, .mdx-shell .ps-empty')) if (vis(e)) out.empties.push(`${String(e.className).split(' ')[0]}: ${clean(e.innerText).slice(0, 90)}`);
  return out;
};
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1800 } })).newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json(); const exp = new Date(Date.now() + 864e5).toISOString();
    for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user)); }
  }, EMAIL);
  const out = {};
  for (const stop of JSON.parse(fs.readFileSync(STOPS, 'utf8'))) {
    await page.goto(BASE + stop.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2000);
    out[stop.name] = { arrival: await page.evaluate(read, upperSelectors) };
    const TABS = '.mdx-shell .pwt-btn, .mdx-shell [role="tab"], .mdx-shell .seg > button, .mdx-shell .tabs > button';
    const names = await page.$$eval(TABS, (els) => els.map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)));
    for (let i = 0; i < names.length && i < 14; i++) {
      const tabs = page.locator(TABS);
      if ((await tabs.count()) <= i) break;
      await tabs.nth(i).click({ timeout: 8000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1200);
      out[stop.name][`tab: ${names[i]}`] = await page.evaluate(read, upperSelectors);
    }
    console.info(`${stop.name}: ${names.length} tab(s)`);
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify({ upperSelectors, screens: out }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
