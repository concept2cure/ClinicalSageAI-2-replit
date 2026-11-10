const fs = require('fs'); const { chromium } = require('playwright');
(async () => {
  const BASE = 'http://127.0.0.1:5100';
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript((a) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', a.accessToken); s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(a.user || {})); } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark: false, welcomeDismissed: true })); }, a);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/concept2cure/insights?program=e89b7009-bb05-4060-8bc0-6da509648e95`, { waitUntil: 'networkidle' });
  await p.getByRole('tab', { name: 'Run history' }).click();
  await p.getByRole('button', { name: /^Open the Research Administration Scorecard run of / }).first().click();
  await p.locator('.ro-rep-actions').waitFor({ timeout: 30000 });
  await p.getByText('Seal, signature and sources').click(); await p.waitForTimeout(2500);
  console.info('EVIDENCE', await p.evaluate(() => { const d = [...document.querySelectorAll('details, section')].find((x) => /Seal, signature and sources/.test(x.innerText)); return d ? d.innerText.replace(/\s+/g, ' ').slice(0, 900) : null; }));
  await p.screenshot({ path: process.argv[2] + '/finalize-ok-reopened-evidence-1440.png', fullPage: false });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Export PDF/ }).click()]);
  await dl.saveAs(process.argv[2] + '/reopened.pdf'); console.info('PDF', fs.statSync(process.argv[2] + '/reopened.pdf').size);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
