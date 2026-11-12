// Opens every stop a click-through reached, at phone width or in dark, and measures what a person would see wrong:
//   phone: the page scrolls sideways, and which elements run past the right edge (outside a sideways scroller);
//   dark:  large opaque light blocks, and text whose contrast against its own background is under 3:1.
// It measures; a person still judges each one. It clicks nothing but tabs.
//
//   node shapewalk.cjs <base> <email> <stops.json> <out.jsonl> <phone|dark>
const fs = require('fs');
const { chromium } = require('playwright');
const [BASE, EMAIL, STOPS, OUT, MODE] = process.argv.slice(2);
const TAB_SEL = '[role="tab"], button.pj-lc-stage';
const TAB_ON = '[role="tab"][aria-selected="true"], button.pj-lc-stage[aria-current="step"]';
const stops = JSON.parse(fs.readFileSync(STOPS, 'utf8'));
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).key; } catch { return null; } }) : []);
const keyOf = (s) => s.url + '#' + (s.tabs || []).join('>');
const VIEW = MODE === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 };

async function login(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ email, dark }) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json(); const exp = new Date(Date.now() + 864e5).toISOString();
    for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user)); }
    if (dark) { let p = {}; try { p = JSON.parse(localStorage.getItem('c2c-v2-prefs') || '{}'); } catch { /* fresh */ } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ ...p, dark: true })); }
  }, { email: EMAIL, dark: MODE === 'dark' });
}

async function openStop(page, stop) {
  await page.goto(BASE + stop.url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const selected = await page.$$eval(TAB_ON, (ts) => ts.filter((t) => t.getBoundingClientRect().width > 2).map((t) => (t.getAttribute('aria-label') || t.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
  for (const tab of [...(stop.selected || []).filter((t) => !selected.includes(t)), ...(stop.tabs || [])]) {
    const byName = page.getByRole('tab', { name: tab, exact: true }).first();
    const target = (await byName.count()) ? byName : page.locator(TAB_SEL).filter({ hasText: tab }).first();
    if (await target.count()) { await target.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(900); }
  }
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

const measurePhone = () => {
  const vw = window.innerWidth;
  const name = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} "${(e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40)}"`;
  const inScroller = (e) => { for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const o = window.getComputedStyle(n).overflowX; if ((o === 'auto' || o === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true; } return false; };
  const past = [];
  for (const e of document.querySelectorAll('main *, header *, nav *')) {
    const r = e.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.right <= vw + 4 || r.left >= vw) continue;
    const cs = window.getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed') continue;
    if (inScroller(e)) continue;
    if ([...e.children].some((c) => c.getBoundingClientRect().right > vw + 4)) continue; // report the innermost
    past.push(`${name(e)} right=${Math.round(r.right)}`);
  }
  const scroller = document.querySelector('.page') || document.scrollingElement;
  return { sideways: Math.max(document.documentElement.scrollWidth, scroller ? scroller.scrollWidth : 0) - vw, past: [...new Set(past)].slice(0, 8) };
};

const measureDark = () => {
  const css = (e) => window.getComputedStyle(e);
  const rgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = rgb(css(n).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 0, g: 0, b: 0, a: 1 }; };
  const name = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} "${(e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)}"`;
  const shown = (e, r, cs) => r.width >= 8 && r.height >= 8 && r.bottom >= 0 && r.top <= window.innerHeight * 3 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) >= 0.3;
  // A large opaque light block: what a dark screen should not have.
  const lightBlock = (e, r, cs) => {
    const own = rgb(cs.backgroundColor);
    if (!own || own.a <= 0.9 || lum(own) <= 0.7 || r.width < 120 || r.height < 40) return null;
    return /^(IMG|CANVAS|IFRAME|SVG|VIDEO)$/i.test(e.tagName) ? null : `${name(e)} ${Math.round(r.width)}x${Math.round(r.height)} bg=${cs.backgroundColor}`;
  };
  // Text of the element's own, under 3:1 against the nearest opaque background behind it.
  const lowText = (e, cs) => {
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) return null;
    const fg = rgb(cs.color); if (!fg) return null;
    const a = lum(fg); const b = lum(bgOf(e)); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return ratio < 3 ? `${name(e)} ${ratio.toFixed(1)}:1 fg=${cs.color}` : null;
  };
  const light = []; const low = [];
  for (const e of document.querySelectorAll('main *, header *, nav *, [role="dialog"] *')) {
    const r = e.getBoundingClientRect(); const cs = css(e);
    if (!shown(e, r, cs)) continue;
    const block = lightBlock(e, r, cs); if (block) light.push(block);
    const text = lowText(e, cs); if (text) low.push(text);
  }
  const isDark = document.body.getAttribute('data-theme') === 'dark' || !!document.querySelector('[data-theme="dark"]');
  return { isDark, light: [...new Set(light)].slice(0, 8), low: [...new Set(low)].slice(0, 10) };
};

(async () => {
  const todo = stops.filter((s) => !done.has(keyOf(s)));
  for (let i = 0; i < todo.length; i += 20) {
    const up = await fetch(`${BASE}/healthz`).then((r) => r.ok).catch(() => false);
    if (!up) { fs.appendFileSync(OUT, JSON.stringify({ kind: 'fatal', error: 'the app did not answer /healthz' }) + '\n'); process.exit(1); }
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: VIEW })).newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await login(page);
    for (const stop of todo.slice(i, i + 20)) {
      await openStop(page, stop);
      const seen = await page.evaluate(MODE === 'phone' ? measurePhone : measureDark).catch((e) => ({ error: String(e.message || e).slice(0, 200) }));
      fs.appendFileSync(OUT, JSON.stringify({ kind: 'stop', key: keyOf(stop), stop, mode: MODE, ...seen }) + '\n');
    }
    await page.evaluate(async () => { const t = localStorage.getItem('trialsage_access_token'); await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }).catch(() => {}); }).catch(() => {});
    await browser.close();
  }
  fs.appendFileSync(OUT, JSON.stringify({ kind: 'end', stops: stops.length }) + '\n');
})().catch((e) => { fs.appendFileSync(OUT, JSON.stringify({ kind: 'fatal', error: String(e.message || e) }) + '\n'); process.exit(1); });
