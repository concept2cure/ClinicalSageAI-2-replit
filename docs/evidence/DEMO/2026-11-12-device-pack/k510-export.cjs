// The walk of GA-DEMO-10: on the seeded device project, click "Export 510(k) package" as a person would.
const { chromium } = require('playwright');
(async () => {
  const [BASE, EMAIL, PROG, OUT] = process.argv.slice(2);
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  const api = []; page.on('response', (r) => { const u = r.url(); if (u.includes('/api/510k/estar/')) api.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`); });
  const downloads = []; page.on('download', (d) => { downloads.push(d.suggestedFilename()); d.cancel().catch(() => {}); });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (email) => { const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const j = await r.json(); for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', new Date(Date.now() + 864e5).toISOString()); s.setItem('trialsage_user', JSON.stringify(j.user)); } }, EMAIL);
  try {
    await page.goto(`${BASE}/concept2cure/device-510k?program=${PROG}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
    const btn = page.getByRole('button', { name: /Export 510\(k\) package/ }).first();
    console.info('button:', await btn.count(), 'enabled:', await btn.isEnabled().catch(() => false));
    await btn.scrollIntoViewIfNeeded(); await btn.click({ timeout: 8000 }); await page.waitForTimeout(6000);
    const status = await page.locator('[role=status]').allInnerTexts().catch(() => []);
    console.info('status:', JSON.stringify(status.map((s) => s.replace(/\s+/g, ' ').slice(0, 240))));
    console.info('api:', JSON.stringify(api), 'downloads:', JSON.stringify(downloads));
    await page.screenshot({ path: OUT });
  } finally {
    await page.evaluate(async () => { const t = localStorage.getItem('trialsage_access_token'); await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }); }).catch(() => {});
    await b.close();
  }
})();
