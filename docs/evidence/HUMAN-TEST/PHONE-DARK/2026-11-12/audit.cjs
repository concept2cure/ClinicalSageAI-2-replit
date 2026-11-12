/**
 * Phone width and dark mode across the launch screens (GA readiness; the lead session's open item, 2026-11-12).
 *
 *   node docs/evidence/HUMAN-TEST/PHONE-DARK/2026-11-12/audit.cjs [base-url]
 *
 * A local server with ALLOW_DEV_AUTH=1. For every launch screen (shared/constants/launch-scope.ts) it opens the
 * screen three ways (390 light, 390 dark, 1440 dark) and records what a person would hit:
 *   - sideways scroll, and the elements that stick out past the viewport;
 *   - text whose colour against its nearest opaque background is below WCAG AA (4.5:1; 3:1 for large text);
 *   - page errors and API answers of 500 and over.
 * It changes nothing. Results: ./results.json; one screenshot per view in ./screenshots/.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5100').replace(/\/$/, '');
const EMAIL = process.env.WALK_EMAIL || 'walk.owner@example.com';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const VIEWS = [
  { key: '390-light', width: 390, dark: false },
  { key: '390-dark', width: 390, dark: true },
  { key: '1440-dark', width: 1440, dark: true },
];
const DEVICE = /^device-|^human-factors$|^labeling$/;
const SCREENS = [
  'home', 'projects', 'project-home', 'tasks', 'communication-center', 'vault', 'document-authoring', 'review', 'protocol-dev',
  'submission-center', 'ectd-compile', 'gateway-transmittals', 'ind-checklist', 'dispatch-readiness', 'quality', 'cmc', 'rbm',
  'biostatistics', 'insights', 'compliance-reports',
  'device-510k', 'device-pma', 'device-cer', 'device-diagnostics', 'device-clinical-studies', 'device-software', 'device-engineering',
  'device-udi', 'device-postmarket', 'device-presub', 'human-factors', 'labeling',
  'apps', 'audit-trail', 'admin-console', 'usage', 'licensing', 'access-requests', 'identity-console',
];

/* global getComputedStyle, NodeFilter */

/** In the page: how far the layout overflows sideways, and the elements that stick out. */
function measureOverflow() {
  const vw = document.documentElement.clientWidth;
  const overflow = Math.max(0, document.documentElement.scrollWidth - vw);
  if (overflow === 0) return { overflow, wide: [] };
  const wide = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > vw + 1 && r.left < vw) {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      wide.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} (+${Math.round(r.right - vw)}px)`);
    }
  }
  return { overflow, wide: [...new Set(wide)].slice(0, 6) };
}

/** In the page: text whose colour against its nearest opaque background is below WCAG AA, one line per class. */
function measureContrast() {
  const channel = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4));
  const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { rgb: p.slice(0, 3), a: p[3] ?? 1 }; };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.95) return c.rgb; } return [255, 255, 255]; };
  const shown = (el, cs) => cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0 && el.getClientRects().length > 0
    && !el.closest('[disabled],[aria-disabled="true"]'); // disabled controls are exempt (WCAG 1.4.3)
  const nameOf = (el) => (typeof el.className === 'string' && el.className.trim() ? el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase());
  const low = new Map();
  const walker = document.createTreeWalker(document.querySelector('.c2c-v2') || document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim();
    const el = n.parentElement;
    const cs = t ? getComputedStyle(el) : null;
    const fg = cs && shown(el, cs) ? parse(cs.color) : null;
    if (!fg) continue;
    const l1 = lum(fg.rgb); const l2 = lum(bgOf(el));
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const need = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700) ? 3 : 4.5;
    if (ratio < need && !low.has(nameOf(el))) low.set(nameOf(el), `${nameOf(el)}: ${ratio.toFixed(2)} (needs ${need}) "${t.slice(0, 32)}"`);
  }
  return [...low.values()].slice(0, 12);
}

async function context(browser, view, auth) {
  const ctx = await browser.newContext({ viewport: { width: view.width, height: view.width === 390 ? 844 : 900 }, isMobile: view.width === 390, hasTouch: view.width === 390 });
  await ctx.addInitScript(([a, dark]) => {
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', a.accessToken); s.setItem('trialsage_refresh_token', a.refreshToken || '');
      s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(a.user || {}));
    }
    localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark, welcomeDismissed: true }));
  }, [auth, view.dark]);
  return ctx;
}

async function visit(page, screen, programs, view) {
  const errors = []; const failed = [];
  const onErr = (e) => errors.push(String(e.message).slice(0, 160));
  const onRes = (r) => { if (r.url().includes('/api/') && r.status() >= 500) failed.push(`${r.status()} ${new URL(r.url()).pathname}`); };
  page.on('pageerror', onErr); page.on('response', onRes);
  const program = DEVICE.test(screen) ? programs.device : programs.ind;
  const url = screen === 'home' ? `${BASE}/concept2cure` : `${BASE}/concept2cure/${screen}${program ? `?program=${program}` : ''}`;
  let result;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1200);
    const m = { ...(await page.evaluate(measureOverflow)), low: await page.evaluate(measureContrast) };
    const locked = await page.getByText(/not included in your plan|is not part of this release|Request access/i).count();
    await page.screenshot({ path: path.join(SHOTS, `${screen}-${view.key}.png`) });
    result = { ...m, locked: locked > 0, errors: [...new Set(errors)], failed: [...new Set(failed)] };
  } catch (e) {
    result = { loadError: String(e.message).split('\n')[0].slice(0, 160), errors, failed };
  }
  page.off('pageerror', onErr); page.off('response', onRes);
  return result;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const login = await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: EMAIL }) });
  const auth = await login.json();
  if (!auth.accessToken) throw new Error(`dev-login failed: ${JSON.stringify(auth).slice(0, 200)}`);
  const list = await (await fetch(`${BASE}/api/c2c/projects?limit=100`, { headers: { Authorization: `Bearer ${auth.accessToken}` } })).json();
  const rows = list.data || [];
  const programs = { ind: rows.find((p) => p.pathway === 'ind')?.id ?? rows[0]?.id, device: rows.find((p) => p.ws === 'MDX')?.id ?? rows[0]?.id };
  const out = { base: BASE, startedAt: new Date().toISOString(), programs, screens: {} };
  const browser = await chromium.launch();
  for (const view of VIEWS) {
    const ctx = await context(browser, view, auth);
    const page = await ctx.newPage();
    for (const screen of SCREENS) {
      (out.screens[screen] = out.screens[screen] || {})[view.key] = await visit(page, screen, programs, view);
      process.stdout.write('.');
    }
    await ctx.close();
    process.stdout.write(` ${view.key}\n`);
  }
  await browser.close();
  out.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(out, null, 2) + '\n');
})();
