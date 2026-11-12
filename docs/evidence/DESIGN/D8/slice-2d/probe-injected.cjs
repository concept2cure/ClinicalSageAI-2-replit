/**
 * The contrast of text in states the demo data cannot open, measured with the real stylesheets in the running app:
 * the markup each state draws (copied from its component) is placed in the live device page, and the computed colour
 * of each faint line is read against the ground behind it, in light and dark.
 *   node probe-injected.cjs <base-url> <email> <path-and-query> <out.json>
 * The markup:
 *   PathwayPanes.tsx DDDocumentTab:  aside.dd-drawer > div.dd-doc-wrap > div.dd-doc-status > span.dd-doc-hint
 *   DossierAttachments.tsx:          aside.dd-drawer > div.dd-att-drop > span.dd-att-drop-sub
 *   FilesTreePane.tsx (ndjson):      div.ftp-preview.ftp-preview-ndjson > div.ftp-ndjson-head > span.ftp-trunc
 */
/* global getComputedStyle -- `measure` runs in the page, not in Node. */
const { chromium } = require('playwright');
const fs = require('fs');
const [BASE_ARG, EMAIL, URL_PATH, OUT] = process.argv.slice(2);
const BASE = BASE_ARG.replace(/\/$/, '');
const measure = () => {
  const host = document.querySelector('.mdx-shell .page-inner') || document.querySelector('.mdx-shell');
  const box = document.createElement('div');
  box.innerHTML = `
    <aside class="dd-drawer" style="position:static"><div class="dd-doc-wrap"><div class="dd-doc-status"><span class="dd-doc-dot"></span> read-only
      <span class="dd-doc-hint">this text is written from the authoring editor</span></div></div>
      <div class="dd-att-drop"><span>Drop files or click to attach</span><span class="dd-att-drop-sub">PDF · DOCX · XLSX · CSV · PNG · JSON</span></div></aside>
    <div class="ftp-preview ftp-preview-ndjson"><div class="ftp-ndjson-head">250 events · SHA-256 chained · append-only<span class="ftp-trunc"> · showing first 200</span></div></div>`;
  host.prepend(box);
  const channel = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4));
  const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3), a: p[3] ?? 1 }; };
  const over = (top, a, under) => top.map((c, i) => c * a + under[i] * (1 - a));
  const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 0.999) break; } } let colour = [255, 255, 255]; for (const l of layers.reverse()) colour = over(l.rgb, l.a, colour); return colour; };
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const out = {};
  for (const sel of ['.dd-doc-hint', '.dd-att-drop-sub', '.ftp-trunc']) {
    const el = box.querySelector(sel); const cs = getComputedStyle(el); const fg = parse(cs.color); const bg = bgOf(el);
    const colour = over(fg.rgb, fg.a * Number(cs.opacity), bg); const l1 = lum(colour); const l2 = lum(bg);
    out[sel] = { ratio: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100, colour: hex(colour), on: hex(bg), size: cs.fontSize };
  }
  box.remove();
  return out;
};
(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const dark of [false, true]) {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate(async ([email, isDark]) => {
      const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const j = await r.json(); const exp = new Date(Date.now() + 864e5).toISOString();
      for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user)); }
      const prefs = JSON.parse(localStorage.getItem('c2c-v2-prefs') || '{}'); localStorage.setItem('c2c-v2-prefs', JSON.stringify({ ...prefs, dark: isDark }));
    }, [EMAIL, dark]);
    await page.goto(BASE + URL_PATH, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const m = await page.evaluate(measure);
    out[dark ? 'dark' : 'light'] = m;
    for (const [sel, v] of Object.entries(m)) console.info(`${dark ? 'dark' : 'light'} ${sel}: ${v.ratio}:1 (${v.colour} on ${v.on}, ${v.size})`);
    await page.context().close();
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
