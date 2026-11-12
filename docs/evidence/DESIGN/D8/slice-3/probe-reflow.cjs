/**
 * Reflow of the device figures: at a given width and text scale, does any figure, label or note run outside its
 * line, overlap another, or make the page scroll sideways?
 *   node probe-reflow.cjs <base-url> <email> <stops.json> <width> <text-scale>
 * The text scale multiplies every font size on the page (WCAG 1.4.4 asks for 200%), leaving the layout width as is.
 */
/* global getComputedStyle -- `check` runs in the page, not in Node. */
const { chromium } = require('playwright');
const fs = require('fs');
const [BASE_ARG, EMAIL, STOPS, W = '320', SCALE = '2'] = process.argv.slice(2);
const BASE = BASE_ARG.replace(/\/$/, '');
const stops = JSON.parse(fs.readFileSync(STOPS, 'utf8'));
const check = (scale) => {
  for (const el of document.querySelectorAll('.mdx-shell .metrics-row, .mdx-shell .metrics-row *')) {
    if (!el.dataset.fs) el.dataset.fs = getComputedStyle(el).fontSize;
    el.style.fontSize = `${parseFloat(el.dataset.fs) * scale}px`;
  }
  const out = [];
  for (const card of document.querySelectorAll('.mdx-shell .metric-card')) {
    const c = card.getBoundingClientRect();
    const parts = [...card.children].map((k) => ({ cls: String(k.className).split(' ')[0], r: k.getBoundingClientRect() }));
    const label = parts.find((p) => p.cls === 'metric-label'); const val = parts.find((p) => p.cls === 'metric-val');
    for (const p of parts) if (p.r.right > c.right + 1 || p.r.left < c.left - 1) out.push(`${p.cls} outside its figure (${Math.round(p.r.left)}-${Math.round(p.r.right)} of ${Math.round(c.left)}-${Math.round(c.right)})`);
    if (label && val && label.r.right > val.r.left + 1 && label.r.bottom > val.r.top && val.r.bottom > label.r.top) out.push('label overlaps figure');
    if (c.right > document.documentElement.clientWidth + 1) out.push(`figure past the screen (${Math.round(c.right)})`);
  }
  return { problems: [...new Set(out)], pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, figures: document.querySelectorAll('.mdx-shell .metric-card').length };
};
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: Number(W), height: 800 }, hasTouch: true })).newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json(); const exp = new Date(Date.now() + 864e5).toISOString();
    for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user)); }
  }, EMAIL);
  for (const stop of stops) {
    await page.goto(BASE + stop.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const m = await page.evaluate(check, Number(SCALE));
    console.info(`${stop.name} @${W} ×${SCALE}: ${m.figures} figures, page overflow ${m.pageOverflow}, ${m.problems.length ? m.problems.join('; ') : 'no figure outside its line or overlapping'}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
