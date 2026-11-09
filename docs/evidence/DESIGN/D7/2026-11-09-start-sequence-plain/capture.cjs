// D7: "Start sequence NNNN" on the Sequences tab is a plain button with no spark (D0 §7 check 2, §8.1; the
// coordinating session, 2026-11-09). Walked in the running app at 1440x900 and 390x844, light and dark: the empty
// state's "Start sequence 0000", then 0000 started from it once (1440, light), then the next sequence's control.
// Visibility is tested with elementFromPoint, not by boxes.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5100';
const EMAIL = process.env.WALK_EMAIL;
const PROGRAM = process.env.WALK_PROGRAM;
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

const COMBOS = [
  { key: '1440', viewport: { width: 1440, height: 900 } },
  { key: '390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
].flatMap((size) => ['light', 'dark'].map((theme) => ({ size, theme })));

/* Measured in the page. Playwright sends only this function, so its helpers are inside it. */
function probe() {
  const style = (el) => window.getComputedStyle(el);
  const label = (el) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''}`;
  const accentRgb = () => {
    const root = document.querySelector('.c2c-v2');
    const swatch = document.createElement('div');
    swatch.style.background = root ? style(root).getPropertyValue('--accent-strong').trim() : 'transparent';
    document.body.appendChild(swatch);
    const rgb = style(swatch).backgroundColor;
    swatch.remove();
    return rgb;
  };
  const hit = (el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top && (top === el || el.contains(top)) ? 'hit' : `covered by ${top ? label(top) : 'nothing'}`;
  };
  const rgb = accentRgb();
  const area = document.querySelector('[data-work-area]');
  const start = [...document.querySelectorAll('button')].find((b) => /^Start sequence \d{4}$/.test(b.textContent.trim()));
  const page = document.querySelector('#c2c-page');
  return {
    start: start ? { text: start.textContent.trim(), className: start.className, spark: !!start.querySelector('svg'), hit: hit(start) } : null,
    orangeFills: [...area.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().width > 0 && style(el).backgroundColor === rgb)
      .map((el) => `${label(el)} "${el.textContent.trim().slice(0, 40)}"`),
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

  const walk = async ({ size, theme }, name, act) => {
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
    await page.goto(`${BASE}/concept2cure/submission-center?program=${PROGRAM}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => /sequence/.test(document.querySelector('[data-testid="sc-state"]')?.textContent || ''), null, { timeout: 60000 });
    await page.getByRole('tab', { name: 'Sequences' }).click();
    const start = page.getByRole('button', { name: /^Start sequence \d{4}$/ });
    await start.waitFor({ timeout: 60000 });
    if (act) await act(page, start);
    await page.getByRole('button', { name: /^Start sequence \d{4}$/ }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const key = `${name}-${size.key}-${theme}`;
    await page.screenshot({ path: path.join(OUT, `${key}.png`) });
    results.screens[key] = { file: `${key}.png`, ...(await page.evaluate(probe)), pageErrors: errors };
    await ctx.close();
  };

  for (const combo of COMBOS) await walk(combo, 'start-0000-empty');
  // Start 0000 once, from the plain button, and see the next sequence's control.
  await walk(COMBOS[0], 'start-0000-clicked', async (page, start) => {
    await start.click();
    await page.getByRole('button', { name: 'Start sequence 0001' }).waitFor({ timeout: 60000 });
  });
  for (const combo of COMBOS) await walk(combo, 'start-next');

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify(results, null, 2));
  console.info('captured', Object.keys(results.screens).length);
})().catch((e) => { console.error(e); process.exit(1); });
