// The Plan step's schedule line on C2C-101 after the clock's dashes fix. Usage: node planstep.cjs <out-dir>
const path = require('path'); const { chromium } = require('playwright');
(async () => {
  const BASE = 'http://127.0.0.1:5100', OUT = process.argv[2];
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((a) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', a.accessToken); s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(a.user || {})); } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark: false, welcomeDismissed: true })); }, a);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/concept2cure/project-home?program=e89b7009-bb05-4060-8bc0-6da509648e95`, { waitUntil: 'networkidle' });
  await p.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Plan/ }).click();
  const line = p.getByTestId('pj-schedule-line'); await line.waitFor({ timeout: 30000 }); await line.scrollIntoViewIfNeeded();
  await line.screenshot({ path: path.join(OUT, 'plan-step-line-1440-light.png') });
  console.info(JSON.stringify(await line.evaluate((el) => ({ clock: window.getComputedStyle(el.querySelector('.py-line-clock')).backgroundImage.slice(0, 80), caption: el.querySelector('figcaption').innerText }))));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
