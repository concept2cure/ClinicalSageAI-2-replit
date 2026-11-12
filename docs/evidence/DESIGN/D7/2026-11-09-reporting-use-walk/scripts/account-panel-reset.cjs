// Does opening your own account menu or Account panel reset Reporting? 1440x900.
const path = require('path'); const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5100', PROGRAM = 'e89b7009-bb05-4060-8bc0-6da509648e95', OUT = process.argv[2];
(async () => {
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((a) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', a.accessToken); s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(a.user || {})); } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark: false, welcomeDismissed: true })); }, a);
  const p = await ctx.newPage(); const sessionCalls = []; p.on('request', (r) => { if (r.url().endsWith('/api/auth/session')) sessionCalls.push(r.url()); });
  await p.goto(`${BASE}/concept2cure/insights?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  await p.getByRole('tab', { name: 'Catalog' }).click();
  await p.getByRole('button', { name: 'Run Research Administration Scorecard' }).click();
  await p.locator('.ro-rep-actions').waitFor({ timeout: 60000 });
  const state = async () => ({ reportShown: await p.locator('.ro-rep-actions').count(), notice: await p.evaluate(() => { const n = [...document.querySelectorAll('.ro-dash-note[role="status"]')].find((x) => /reset|session ended/.test(x.innerText)); return n ? n.innerText : null; }), sessionCalls: sessionCalls.length });
  const out = { afterRun: await state() };
  await p.getByRole('button', { name: /JM Smith/ }).first().click(); await p.waitForTimeout(1500);
  await p.keyboard.press('Escape'); await p.waitForTimeout(1500);
  out.afterMenu = await state();
  await p.getByRole('button', { name: /JM Smith/ }).first().click(); await p.waitForTimeout(800);
  await p.getByRole('menuitem', { name: 'Account' }).first().click(); await p.waitForTimeout(2500);
  await p.keyboard.press('Escape'); await p.waitForTimeout(1500);
  out.afterAccountPanel = await state();
  await p.screenshot({ path: path.join(OUT, 'reset-after-account-1440.png') });
  console.info(JSON.stringify(out, null, 1)); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
