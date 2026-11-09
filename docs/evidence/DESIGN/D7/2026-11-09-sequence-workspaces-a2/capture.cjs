// D7-A2 evidence capture: the sequence workspaces and the one verdict, and Submission readiness, in the running app,
// 1440x900 and 390x844 (mobile), light and dark. Adapted from ../2026-11-09-submission-center-a1/capture.cjs.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5100';
const EMAIL = process.env.WALK_EMAIL;
const PROGRAM = process.env.WALK_PROGRAM;
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [
  { key: '1440', viewport: { width: 1440, height: 900 } },
  { key: '390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

/* Measured in the page. Every value is read, none assumed. Playwright sends
   only this function into the page, so its helpers are declared inside it. */
function probe() {
  const style = (el) => (el ? window.getComputedStyle(el) : null);
  const text = (sel) => document.querySelector(sel)?.textContent ?? null;
  const label = (el) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''}`;
  // Resolve --accent-strong to the rgb() string computed styles report.
  const accentRgbOf = () => {
    const root = document.querySelector('.c2c-v2');
    const swatch = document.createElement('div');
    swatch.style.background = (root && style(root).getPropertyValue('--accent-strong').trim()) || 'transparent';
    document.body.appendChild(swatch);
    const rgb = style(swatch).backgroundColor;
    swatch.remove();
    return rgb;
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const orangeFills = (area, rgb) => [...area.querySelectorAll('*')]
    .filter((el) => visible(el) && style(el).backgroundColor === rgb)
    .map((el) => `${label(el)} "${(el.textContent || '').trim().slice(0, 50)}"`);
  const childrenOf = (area) => [...area.children].map((el) => {
    const r = el.getBoundingClientRect();
    return { el: label(el), x: Math.round(r.left), w: Math.round(r.width), top: Math.round(r.top + window.scrollY) };
  });
  const area = document.querySelector('[data-work-area]');
  const accentRgb = accentRgbOf();
  const kids = area ? childrenOf(area) : [];
  const page = document.querySelector('#c2c-page');
  return {
    url: location.pathname + location.search,
    workArea: area?.getAttribute('data-work-area') ?? null,
    title: text('[data-work-area] .ph-title'),
    sub: text('[data-work-area] > .ph .ph-sub'),
    back: text('[data-work-area] > .pj-back')?.trim() ?? null,
    actions: [...document.querySelectorAll('[data-work-area] > .ph .ph-acts button')].map((b) => `${b.className}: ${b.textContent.trim()}`),
    areaDisplay: style(area)?.display ?? null,
    childrenInOrder: kids,
    oneColumn: kids.length > 0 && new Set(kids.filter((k) => k.w > 0).map((k) => k.x)).size === 1,
    tabs: [...document.querySelectorAll('[role="tablist"] [role="tab"]')].map((t) => `${t.textContent.trim()}${t.getAttribute('aria-selected') === 'true' ? ' (selected)' : ''}`),
    suggestions: [...document.querySelectorAll('[data-work-area] > .sp-starters .sp-starter')].map((b) => b.textContent.trim()),
    verdict: text('[data-testid="sc-dispatch-verdict"]')?.replace(/\s+/g, ' ').trim() ?? null,
    verdictEmphasis: [...document.querySelectorAll('[data-emphasis="verdict"]')].length,
    sections: [...document.querySelectorAll('[data-work-area] .pj-sec > .pj-sec-h h2')].map((h) => h.textContent.trim()),
    context: text('[data-work-area] > .sc-context')?.replace(/\s+/g, ' ').trim() ?? null,
    contextRect: (() => { const r = document.querySelector('[data-work-area] > .sc-context')?.getBoundingClientRect(); return r ? { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } : null; })(),
    accentStrong: accentRgb,
    orangeFills: area ? orangeFills(area, accentRgb) : [],
    horizontalOverflow: page ? page.scrollWidth - page.clientWidth : null,
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}

(async () => {
  const login = await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL }) });
  if (!login.ok) throw new Error(`dev-login ${login.status}`);
  const auth = await login.json();
  const browser = await chromium.launch();
  const results = { base: BASE, email: EMAIL, program: PROGRAM, browser: browser.version(), screens: {} };

  for (const size of SIZES) {
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: size.viewport, isMobile: !!size.isMobile, hasTouch: !!size.hasTouch, deviceScaleFactor: 1 });
      await ctx.addInitScript(({ a, dark }) => {
        const expiry = new Date(Date.now() + (a.expiresIn || 86400) * 1000).toISOString();
        for (const store of [localStorage, sessionStorage]) {
          store.setItem('trialsage_access_token', a.accessToken);
          store.setItem('trialsage_refresh_token', a.refreshToken || '');
          store.setItem('trialsage_token_expiry', expiry);
          store.setItem('trialsage_user', JSON.stringify(a.user || {}));
        }
        localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark, railCollapsed: false, anaOpen: false, anaMode: 'standard', segment: 'biopharma', welcomeDismissed: true }));
      }, { a: auth, dark: theme === 'dark' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message || e)));
      const shot = async (name) => {
        const file = `${name}-${size.key}-${theme}.png`;
        const h = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.screenshot({ path: path.join(OUT, file), fullPage: h <= 4000 });
        results.screens[`${name}-${size.key}-${theme}`] = { file, ...(await page.evaluate(probe)), pageErrors: [...errors] };
      };

      const open = async () => {
        await page.goto(`${BASE}/concept2cure/submission-center?program=${PROGRAM}`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => /sequence/.test(document.querySelector('[data-testid="sc-state"]')?.textContent || ''), null, { timeout: 60000 });
        await page.waitForTimeout(500);
      };
      await open();
      for (const [tab, name, ready] of [
        ['Builder', 'builder', '[data-testid="sc-builder-sources"]'],
        ['Validation', 'validation', '.pj-sec-h h2'],
        ['Required deliverables', 'required-deliverables', '.pj-sec-h h2'],
        ['Dispatch', 'dispatch', '[data-testid="sc-dispatch-verdict"], [role="status"]'],
      ]) {
        await page.getByRole('tab', { name: tab }).click();
        await page.waitForSelector(ready, { timeout: 60000 }).catch(() => undefined);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(900);
        await shot(`submission-center-${name}`);
      }
      // Submission readiness, the dispatch-readiness surface, on the same project.
      await page.goto(`${BASE}/concept2cure/dispatch-readiness?program=${PROGRAM}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-work-area="dispatch-readiness"]', { timeout: 60000 });
      await page.waitForTimeout(1200);
      await shot('submission-readiness');
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify(results, null, 2));
  console.info('captured', Object.keys(results.screens).length);
})().catch((e) => { console.error(e); process.exit(1); });
