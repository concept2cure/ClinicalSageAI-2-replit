/**
 * Text on the device screens whose colour against its background is below WCAG AA (4.5:1; 3:1 for large text), in
 * light and dark, in the running app. The method is that of
 * docs/evidence/HUMAN-TEST/PHONE-DARK/2026-11-12/audit.cjs (the text's colour against its nearest background;
 * disabled controls exempt), with two differences: a part-transparent background is blended over what is behind
 * it, and every class is listed with how many texts it styles and its lowest ratio, not only the first.
 *
 *   node probe-contrast.cjs <base-url> <email> <stops.json> <out.json>
 */
/* global getComputedStyle, NodeFilter -- `measure` runs in the page, not in Node. */
const { chromium } = require('playwright');
const fs = require('fs');
const [BASE_ARG, EMAIL, STOPS, OUT] = process.argv.slice(2);
const BASE = BASE_ARG.replace(/\/$/, '');
const stops = JSON.parse(fs.readFileSync(STOPS, 'utf8'));

const measure = () => {
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
  const shown = (el, cs) => cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0 && el.getClientRects().length > 0
    && !el.closest('[disabled],[aria-disabled="true"]');
  const nameOf = (el) => (typeof el.className === 'string' && el.className.trim() ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase());
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const low = new Map();
  const root = document.querySelector('.mdx-shell') || document.querySelector('main') || document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim();
    const el = n.parentElement;
    const cs = t ? getComputedStyle(el) : null;
    const fg = cs && shown(el, cs) ? parse(cs.color) : null;
    if (!fg) continue;
    const bg = bgOf(el);
    const colour = over(fg.rgb, fg.a * Number(cs.opacity), bg);
    const l1 = lum(colour); const l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const need = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700) ? 3 : 4.5;
    if (ratio >= need) continue;
    const key = nameOf(el);
    const at = low.get(key) || { cls: key, texts: 0, lowest: 99, need, example: '', colour: '', on: '', size };
    at.texts++; if (ratio < at.lowest) { at.lowest = Math.round(ratio * 100) / 100; at.example = t.slice(0, 40); at.colour = hex(colour); at.on = hex(bg); }
    low.set(key, at);
  }
  return [...low.values()].sort((a, b) => a.lowest - b.lowest);
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
    for (const stop of stops) {
      await page.goto(BASE + stop.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const m = await page.evaluate(measure);
      (out[stop.name] = out[stop.name] || {})[dark ? 'dark' : 'light'] = m;
      console.info(`${stop.name} ${dark ? 'dark' : 'light'}: ${m.length ? m.map((x) => `.${x.cls} ${x.lowest} (${x.texts}× "${x.example}")`).join(' | ') : 'none below AA'}`);
    }
    await page.context().close();
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
