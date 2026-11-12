/**
 * For each stat tile on a device screen: its label, its figure, the tone it carries and the colour its figure is
 * drawn in, beside the colour of the page's own text. Light and dark.
 *
 *   node probe-tile-tone.cjs <base-url> <email> <program-id> <out.json>
 */
/* global getComputedStyle -- `tiles` runs in the page, not in Node. */
const { chromium } = require('playwright');
const fs = require('fs');

const [BASE_ARG, EMAIL, PROGRAM, OUT] = process.argv.slice(2);
const BASE = BASE_ARG.replace(/\/$/, '');
const SCREENS = ['device-postmarket', 'device-udi'];

const tiles = () => {
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const title = document.querySelector('.mdx-shell .page-title');
  return {
    textColour: title ? getComputedStyle(title).color : null,
    tiles: [...document.querySelectorAll('.mdx-shell .metrics-row .metric-card')].map((card) => {
      const figure = card.querySelector('.metric-val');
      return {
        label: clean(card.querySelector('.metric-label')?.textContent),
        figure: clean(figure?.textContent),
        note: clean(card.querySelector('.metric-meta')?.textContent),
        tone: card.getAttribute('data-tone') || '',
        figureColour: figure ? getComputedStyle(figure).color : null,
      };
    }),
  };
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
    for (const screen of SCREENS) {
      await page.goto(`${BASE}/concept2cure/${screen}?program=${PROGRAM}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(2500);
      out[`${screen} ${dark ? 'dark' : 'light'}`] = await page.evaluate(tiles);
    }
    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}));
    await page.context().close();
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out)) for (const t of v.tiles) console.info(`${k} | ${t.label} | ${t.figure} | tone=${t.tone || 'none'} | ${t.figureColour}${t.figureColour === v.textColour ? ' (text colour)' : ''}`);
})().catch((e) => { console.error(e); process.exit(1); });
