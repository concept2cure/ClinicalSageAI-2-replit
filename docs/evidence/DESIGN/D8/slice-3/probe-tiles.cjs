/**
 * Every stat tile on the device screens: what it holds (its children by class), its box, where the row ends, and
 * where the first thing after the row starts, at a given width.
 *   node probe-tiles.cjs <base-url> <email> <stops.json> <out.json> [width] [height]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const [BASE_ARG, EMAIL, STOPS, OUT, W = '1440', H = '900'] = process.argv.slice(2);
const BASE = BASE_ARG.replace(/\/$/, '');
const stops = JSON.parse(fs.readFileSync(STOPS, 'utf8'));
const measure = () => {
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const rows = [...document.querySelectorAll('.mdx-shell .metrics-row')].filter((r) => r.getClientRects().length > 0);
  return rows.map((row) => {
    const r = row.getBoundingClientRect();
    const next = row.nextElementSibling ? Math.round(row.nextElementSibling.getBoundingClientRect().top + window.scrollY) : null;
    return {
      top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), height: Math.round(r.height), nextStartsAt: next,
      tiles: [...row.querySelectorAll(':scope > .metric-card')].map((c) => ({
        children: [...c.children].map((k) => String(k.className || k.tagName).split(' ')[0]),
        text: clean(c.innerText).slice(0, 90),
        height: Math.round(c.getBoundingClientRect().height),
      })),
    };
  });
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
    await page.waitForTimeout(2000);
    const m = await page.evaluate(measure);
    out[stop.name] = m;
    for (const row of m) console.info(`${stop.name} @${W}: row ${row.top}-${row.bottom} (${row.height}px), next at ${row.nextStartsAt} | ${row.tiles.map((t) => `[${t.children.join(',')}] "${t.text.slice(0, 40)}"`).join(' ')}`);
    if (!m.length) console.info(`${stop.name} @${W}: no tile row`);
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
