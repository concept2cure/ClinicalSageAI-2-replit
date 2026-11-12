// Sweep finding 94, after the change: Reporting's landing for a biotech IND, a device project and no project,
// at 1440x900 and 390x844, light and dark. Reads the device section and the packs off the page; crops the section.
// Usage: node walk.cjs <out-dir>
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5100', OUT = process.argv[2];
const CASES = [['biotech', '1ca8c7c0-e05b-4fc1-97b3-7fd2b90ca6b8'], ['device', process.argv[3]], ['none', null]];
fs.mkdirSync(OUT, { recursive: true });
const readSection = () => {
  const dev = document.querySelector('[data-testid="rc-device-portfolio"]'); const pg = document.querySelector('#c2c-page');
  const css = (el, prop) => (el ? window.getComputedStyle(el)[prop] : null);
  const zero = dev && dev.querySelector('.ro-pace-zero .ro-li-b'); const some = dev && dev.querySelector('.ro-pace .ro-li:not(.ro-pace-zero) .ro-bar-val');
  return {
    packs: [...document.querySelectorAll('.rc-pack')].map((x) => x.innerText.replace(/\s+/g, ' ').slice(0, 90)),
    headerPrimary: (document.querySelector('.ph .btn.primary') || {}).innerText || null,
    section: dev ? { note: (dev.querySelector('[role="note"]') || {}).innerText || null, summary: [...dev.querySelectorAll('.ro-summary')].map((p) => p.innerText),
      months: [...dev.querySelectorAll('.ro-pace li')].map((li) => li.innerText.replace(/\s+/g, ' ')), zeroMonths: dev.querySelectorAll('.ro-pace-zero').length,
      zeroColour: css(zero, 'color'), submittedColour: css(some, 'color'), background: css(document.body, 'backgroundColor') } : null,
    overflow: pg ? pg.scrollWidth - pg.clientWidth : null,
  };
};
(async () => {
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const b = await chromium.launch(); const out = {};
  for (const [width, mobile] of [[1440, false], [390, true]]) for (const dark of [false, true]) {
    const ctx = await b.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
    await ctx.addInitScript(([auth, isDark]) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', auth.accessToken); s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(auth.user || {})); } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark: isDark, welcomeDismissed: true })); }, [a, dark]);
    for (const [name, program] of CASES) {
      const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e.message)));
      await p.goto(`${BASE}/concept2cure/insights${program ? `?program=${program}` : ''}`, { waitUntil: 'networkidle' });
      await p.waitForTimeout(900);
      const key = `${name}-${width}-${dark ? 'dark' : 'light'}`;
      out[key] = { ...(await p.evaluate(readSection)), errors };
      const el = p.locator('[data-testid="rc-device-portfolio"]');
      if (await el.count()) { await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: path.join(OUT, `${key}-section.png`) }); }
      if (name === 'biotech' && !dark) await p.screenshot({ path: path.join(OUT, `${key}-page.png`), fullPage: true });
      await p.close();
    }
    await ctx.close();
  }
  await b.close(); fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify(out, null, 2));
  for (const [k, v] of Object.entries(out)) console.info(k, '| note:', v.section && v.section.note, '| zero months:', v.section && v.section.zeroMonths, '| overflow:', v.overflow, '| errors:', v.errors.length, '| pack0:', v.packs[0]);
})().catch((e) => { console.error(e); process.exit(1); });
