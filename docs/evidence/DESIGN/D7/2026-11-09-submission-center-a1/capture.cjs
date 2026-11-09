// D7-A1 evidence capture: Submission Center in the running app, 1440x900 and 390x844 (mobile), light and dark.
// Adapted from ../2026-11-08-reporting-rewalk/capture.cjs (the same probe, plus the context row and the starters).
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
        await page.waitForTimeout(800);
      };
      // 1. Submission Center with the project open: the Submissions tab.
      await open();
      await shot('submission-center');
      // 2. The organization's submissions, through the context row's toggle; then back.
      const toggle = page.getByTestId('sc-scope');
      results.screens[`toggle-${size.key}-${theme}`] = { label: (await toggle.count()) ? await toggle.textContent() : null };
      if (await toggle.count()) {
        await toggle.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(800);
        await shot('submission-center-organization');
        results.screens[`toggle-back-${size.key}-${theme}`] = { label: await page.getByTestId('sc-scope').textContent() };
        await page.getByTestId('sc-scope').click();
        await page.waitForLoadState('networkidle');
      }
      // 3. The Sequences tab.
      await page.getByRole('tab', { name: 'Sequences' }).click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
      await shot('submission-center-sequences');
      // 4. Forms and letters opens the IND screen on this submission.
      const forms = page.locator('[data-work-area] > .ph .ph-acts').getByRole('button', { name: 'Forms and letters' });
      if (await forms.count()) {
        await forms.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(800);
        results.screens[`forms-${size.key}-${theme}`] = { url: await page.evaluate(() => location.pathname + location.search), workArea: await page.evaluate(() => document.querySelector('[data-work-area]')?.getAttribute('data-work-area') ?? null), heading: await page.evaluate(() => document.querySelector('h1')?.textContent ?? null) };
      }
      // 5. Compile & export opens the compile screen on the working sequence.
      await open();
      const compile = page.locator('[data-work-area] > .ph .ph-acts').getByRole('button', { name: 'Compile & export' });
      if (await compile.count()) {
        await compile.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(800);
        results.screens[`compile-${size.key}-${theme}`] = { url: await page.evaluate(() => location.pathname + location.search), heading: await page.evaluate(() => document.querySelector('h1, .pj-card-h .t')?.textContent ?? null) };
      }
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify(results, null, 2));
  console.info('captured', Object.keys(results.screens).length);
})().catch((e) => { console.error(e); process.exit(1); });
