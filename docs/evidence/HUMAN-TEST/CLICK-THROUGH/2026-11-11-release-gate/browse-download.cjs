// The walk of the 2026-11-11 rate-limit repair: a minute of ordinary browsing (the project page, Quality, twelve
// Vault documents selected), then Download. Before the repair the catalog reads were refused 429 and so was the Download.
const { chromium } = require('playwright');
(async () => {
  const [BASE, EMAIL, PROG, OUT] = process.argv.slice(2);
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  const refused = []; let catalog = 0; let register = 0; const downloads = [];
  page.on('response', (r) => { const u = r.url().replace(BASE, '').split('?')[0]; if (/\/documents\/[^/]+\/catalog$/.test(u)) catalog++; if (/\/api\/mdx\/qms\/documents(\/review-due)?$/.test(u)) register++; if (r.status() === 429) refused.push(r.request().method() + ' ' + u); });
  page.on('download', (d) => { downloads.push(d.suggestedFilename()); d.cancel().catch(() => {}); });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (email) => { const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const j = await r.json(); for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', new Date(Date.now() + 864e5).toISOString()); s.setItem('trialsage_user', JSON.stringify(j.user)); } }, EMAIL);
  try {
    const start = Date.now();
    for (const s of ['project-home', 'quality', 'vault']) { await page.goto(`${BASE}/concept2cure/${s}?program=${PROG}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800); }
    const docs = page.locator('main').getByText(/^\[Demo · Lumen\]/).filter({ visible: true });
    const n = await docs.count();
    for (let i = 0; i < 12; i++) { await docs.nth(i % n).click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1200); }
    const dl = page.locator('aside').getByRole('button', { name: /^Download$/ }).first();
    await dl.click({ timeout: 6000 }); await page.waitForTimeout(2500);
    await page.screenshot({ path: OUT });
    console.info(JSON.stringify({ seconds: Math.round((Date.now() - start) / 1000), rowsVisible: n, catalogReads: catalog, registerReads: register, refused429: refused, downloads }));
  } finally {
    await page.evaluate(async () => { const t = localStorage.getItem('trialsage_access_token'); await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }); }).catch(() => {});
    await b.close();
  }
})();
