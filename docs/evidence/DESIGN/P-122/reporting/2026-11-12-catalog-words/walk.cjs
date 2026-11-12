// P-122 Reporting: the catalog in words. Reporting on C2C-101, Catalog tab, 1440x900 and 390x844, light and dark.
// Usage: node catalog-walk.cjs <program-uuid> <out-dir>
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5100', PROGRAM = process.argv[2], OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });

function probe() {
  const panel = document.querySelector('[role="tabpanel"]');
  const pg = document.querySelector('#c2c-page');
  const selectOptions = (label) => { const l = [...panel.querySelectorAll('label')].find((x) => x.textContent.trim() === label); const s = l ? document.getElementById(l.htmlFor) : null; return s ? [...s.options].map((o) => o.text) : null; };
  return {
    counts: [...panel.querySelectorAll('p.rl-sub')].slice(0, 4).map((p) => p.innerText),
    firstCards: [...panel.querySelectorAll('.rl-card')].slice(0, 3).map((c) => c.innerText.replace(/\s+/g, ' ').slice(0, 220)),
    scopeOptions: selectOptions('Data scope'), availabilityOptions: selectOptions('Availability'),
    overflow: pg ? pg.scrollWidth - pg.clientWidth : null,
  };
}

async function view(b, a, { key, vp, mobile, dark }) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript(([a, dark]) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', a.accessToken); s.setItem('trialsage_refresh_token', a.refreshToken || ''); s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(a.user || {})); } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark, welcomeDismissed: true })); }, [a, dark]);
  const p = await ctx.newPage(); const errors = []; const http = [];
  p.on('pageerror', (e) => errors.push(String(e.message)));
  p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) http.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });
  await p.goto(`${BASE}/concept2cure/insights?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  await p.screenshot({ path: path.join(OUT, `landing-${key}-${dark ? 'dark' : 'light'}.png`) });
  await p.getByRole('tab', { name: 'Catalog' }).click();
  await p.locator('.rl-card').first().waitFor({ timeout: 60000 });
  await p.getByRole('heading', { name: 'Report catalog' }).scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(OUT, `catalog-${key}-${dark ? 'dark' : 'light'}.png`) });
  const out = { ...(await p.evaluate(probe)), errors, http };
  await ctx.close(); return out;
}

(async () => {
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const b = await chromium.launch(); const out = {};
  for (const [key, vp, mobile] of [['1440', { width: 1440, height: 900 }, false], ['390', { width: 390, height: 844 }, true]]) {
    for (const dark of [false, true]) out[`${key}-${dark ? 'dark' : 'light'}`] = await view(b, a, { key, vp, mobile, dark });
  }
  await b.close(); fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify(out, null, 2));
  const v = out['1440-light']; console.info(JSON.stringify({ counts: v.counts, firstCards: v.firstCards, scopeOptions: v.scopeOptions, availabilityOptions: v.availabilityOptions }, null, 1));
  for (const [k, o] of Object.entries(out)) console.info(k, 'overflow', o.overflow, 'errors', o.errors.length, 'http', JSON.stringify(o.http));
})().catch((e) => { console.error(e); process.exit(1); });
