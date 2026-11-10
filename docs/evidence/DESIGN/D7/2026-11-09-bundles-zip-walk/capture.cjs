// Reporting Bundles evidence: a saved pack's actions and the legal-companion chooser
// in the running app, 1440x900 and 390x844 (mobile), light. Usage: node capture.cjs <out-dir>
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5100', PROGRAM = 'e89b7009-bb05-4060-8bc0-6da509648e95', OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const b = await chromium.launch(); const out = {};
  for (const [key, vp, mobile] of [['1440', { width: 1440, height: 900 }, false], ['390', { width: 390, height: 844 }, true]]) {
    const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile });
    await ctx.addInitScript((a) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', a.accessToken); s.setItem('trialsage_refresh_token', a.refreshToken || ''); s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(a.user || {})); } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark: false, welcomeDismissed: true })); }, a);
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e.message)));
    await p.goto(`${BASE}/concept2cure/insights?program=${PROGRAM}`, { waitUntil: 'networkidle' });
    await p.getByRole('tab', { name: 'Bundles' }).click();
    await p.getByText('C2C-101 readiness review pack').first().waitFor({ timeout: 60000 });
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(OUT, `bundles-${key}-light.png`), fullPage: true });
    const buttons = await p.evaluate(() => [...document.querySelectorAll('[role="tabpanel"] button')].map((el) => ({ text: el.textContent.trim(), cls: el.className, display: window.getComputedStyle(el).display, height: Math.round(el.getBoundingClientRect().height), border: window.getComputedStyle(el).borderStyle })));
    await p.getByRole('button', { name: 'Choose legal companions for ZIP' }).click();
    await p.waitForLoadState('networkidle'); await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(OUT, `legal-companions-${key}-light.png`), fullPage: true });
    const chooser = await p.evaluate(() => { const f = document.querySelector('[role="tabpanel"] fieldset'); return f ? f.innerText.slice(0, 1200) : null; });
    const zip = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /\(ZIP\)/.test(x.textContent)); return b ? { text: b.textContent.trim(), disabled: b.disabled } : null; });
    out[key] = { buttons, chooser, zip, errors, overflow: await p.evaluate(() => { const pg = document.querySelector('#c2c-page'); return pg ? pg.scrollWidth - pg.clientWidth : null; }) };
    await ctx.close();
  }
  await b.close(); fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify(out, null, 2)); console.info('done');
})().catch((e) => { console.error(e); process.exit(1); });
