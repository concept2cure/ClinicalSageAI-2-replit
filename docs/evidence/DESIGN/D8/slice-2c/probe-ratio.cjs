/**
 * The contrast ratio of named elements on one screen, in light and dark: the lowest and highest over every match.
 *   node probe-ratio.cjs <base-url> <email> <path-and-query> <out.json> <selector> [<selector> ...]
 */
/* global getComputedStyle -- `measure` runs in the page, not in Node. */
const { chromium } = require('playwright');
const fs = require('fs');
const [BASE_ARG, EMAIL, URL_PATH, OUT, ...SELECTORS] = process.argv.slice(2);
const BASE = BASE_ARG.replace(/\/$/, '');
const measure = (selectors) => {
  const channel = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4));
  const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3), a: p[3] ?? 1 }; };
  const over = (top, a, under) => top.map((c, i) => c * a + under[i] * (1 - a));
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 0.999) break; } }
    let colour = [255, 255, 255];
    for (const l of layers.reverse()) colour = over(l.rgb, l.a, colour);
    return colour;
  };
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const out = {};
  for (const sel of selectors) {
    const all = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length > 0);
    let lowest = null; let highest = null;
    for (const el of all) {
      const cs = getComputedStyle(el); const fg = parse(cs.color); const bg = bgOf(el);
      const colour = over(fg.rgb, fg.a * Number(cs.opacity), bg);
      const l1 = lum(colour); const l2 = lum(bg);
      const ratio = Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
      const row = { ratio, colour: hex(colour), on: hex(bg) };
      if (!lowest || ratio < lowest.ratio) lowest = row;
      if (!highest || ratio > highest.ratio) highest = row;
    }
    out[sel] = { elements: all.length, lowest, highest };
  }
  return out;
};
(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const dark of [false, true]) {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
    const ok = await page.evaluate(async ([email, isDark]) => {
      const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      if (!r.ok) return `dev-login ${r.status}`;
      const j = await r.json(); const exp = new Date(Date.now() + 864e5).toISOString();
      for (const s of [localStorage, sessionStorage]) {
        s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
        s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user));
      }
      const prefs = JSON.parse(localStorage.getItem('c2c-v2-prefs') || '{}');
      localStorage.setItem('c2c-v2-prefs', JSON.stringify({ ...prefs, dark: isDark }));
      return 'ok';
    }, [EMAIL, dark]);
    if (ok !== 'ok') throw new Error(ok);
    await page.goto(BASE + URL_PATH, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const m = await page.evaluate(measure, SELECTORS);
    out[dark ? 'dark' : 'light'] = m;
    for (const [sel, v] of Object.entries(m)) console.info(`${dark ? 'dark' : 'light'} ${sel}: ${v.elements} element(s), lowest ${v.lowest ? `${v.lowest.ratio}:1 (${v.lowest.colour} on ${v.lowest.on})` : '—'}, highest ${v.highest ? v.highest.ratio + ':1' : '—'}`);
    await page.context().close();
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
