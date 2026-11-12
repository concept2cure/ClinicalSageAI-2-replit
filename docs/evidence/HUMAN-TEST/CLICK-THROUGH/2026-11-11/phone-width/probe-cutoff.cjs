/**
 * At a given width, list every control on each screen that runs past the screen's edge, and say whether a person can
 * still reach it by scrolling its own container sideways.
 *
 *   node probe-cutoff.cjs <base-url> <email> <stops.json> <out.json> [width] [height]
 */
/* global getComputedStyle, innerWidth, scrollY -- `find` runs in the page, not in Node. */
const { chromium } = require('playwright');
const fs = require('fs');

const [BASE_ARG, EMAIL, STOPS, OUT, W = '390', H = '844'] = process.argv.slice(2);
const BASE = BASE_ARG.replace(/\/$/, '');
const stops = JSON.parse(fs.readFileSync(STOPS, 'utf8'));

const find = () => {
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const main = document.querySelector('main') || document.body;
  const out = [];
  for (const e of main.querySelectorAll('button, a[href], [role="tab"], [role="button"], input, select, textarea')) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.right <= innerWidth + 1 && r.left >= -1) continue;
    let scroller = null;
    for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 1) { scroller = p.className ? String(p.className).split(' ')[0] : p.tagName.toLowerCase(); break; }
    }
    out.push({ name: clean(e.getAttribute('aria-label') || e.innerText || e.getAttribute('placeholder') || e.tagName).slice(0, 50), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top + scrollY), reachableByScrolling: scroller });
  }
  return { viewport: innerWidth, pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, pastTheEdge: out };
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
  for (const stop of stops) {
    await page.goto(BASE + stop.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const m = await page.evaluate(find);
    out[stop.name] = m;
    const stuck = m.pastTheEdge.filter((c) => !c.reachableByScrolling);
    console.info(`${stop.name} @${W}: page overflow ${m.pageOverflow}; past the edge ${m.pastTheEdge.length}, of which not reachable by scrolling ${stuck.length}${stuck.length ? ': ' + stuck.slice(0, 6).map((c) => `"${c.name}" ${c.left}-${c.right}`).join(', ') : ''}`);
  }
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}));
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
