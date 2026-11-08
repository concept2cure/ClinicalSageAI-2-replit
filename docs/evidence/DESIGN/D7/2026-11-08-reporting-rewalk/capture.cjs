// D7-D evidence capture: Reporting & analytics and Audit & compliance reports
// in the running app, 1440x900 and 390x844 (mobile), light and dark.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5100';
const EMAIL = 'jm.smith@concept2cure.pro';
const PROGRAM = 'e89b7009-bb05-4060-8bc0-6da509648e95';
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
    suggestions: [...document.querySelectorAll('[aria-label="Find suggestions"] .sp-starter')].map((b) => b.textContent.trim()),
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

      // 1. Reporting & analytics, the Reports view, with the project open.
      await page.goto(`${BASE}/concept2cure/insights?program=${PROGRAM}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-testid="rc-find-result"]', { state: 'attached', timeout: 60000 });
      await page.waitForTimeout(800);
      await shot('reporting');

      // 2. The first suggestion run through the router: a result under the field.
      await page.locator('[aria-label="Find suggestions"] .sp-starter').first().click();
      await page.waitForFunction(() => (document.querySelector('[data-testid="rc-find-result"]')?.textContent || '').trim().length > 0, null, { timeout: 60000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
      await shot('reporting-find');

      // 3. The Catalog view with the Preview plan seg, previewing Standard.
      await page.goto(`${BASE}/concept2cure/insights?program=${PROGRAM}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-testid="rc-find-result"]', { state: 'attached', timeout: 60000 });
      await page.getByRole('tab', { name: 'Catalog' }).click();
      await page.getByRole('group', { name: 'Preview plan' }).waitFor({ timeout: 60000 });
      await page.getByRole('group', { name: 'Preview plan' }).getByRole('button', { name: 'Standard' }).click();
      await page.waitForTimeout(800);
      await shot('reporting-catalog-preview');

      // 3b. Bundles: the pack recorded in report_bundles (C-3, P-91).
      await page.getByRole('tab', { name: 'Bundles' }).click();
      await page.getByText('C2C-101 readiness review pack').first().waitFor({ timeout: 60000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
      await shot('reporting-bundles');

      // 4. Audit & compliance reports, reached by its header ghost.
      await page.getByRole('tab', { name: 'Reports' }).click();
      await page.locator('[data-work-area="insights"] > .ph .ph-acts').getByRole('button', { name: 'Audit & compliance reports' }).click();
      await page.waitForSelector('[data-work-area="compliance-reports"]', { timeout: 60000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
      await shot('compliance-reports');

      // 5. Its back link returns to Reporting & analytics.
      await page.locator('[data-work-area="compliance-reports"] > .pj-back').click();
      await page.waitForSelector('[data-work-area="insights"]', { timeout: 60000 });
      results.screens[`back-link-${size.key}-${theme}`] = { returnedTo: await page.evaluate(() => document.querySelector('[data-work-area]')?.getAttribute('data-work-area')) };
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify(results, null, 2));
  console.info('captured', Object.keys(results.screens).length);
})().catch((e) => { console.error(e); process.exit(1); });
