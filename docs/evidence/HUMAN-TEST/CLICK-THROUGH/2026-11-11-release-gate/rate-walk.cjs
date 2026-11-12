// A person-paced walk: open a screen, click each of its tabs about every two seconds. Records every API request
// (time, method, path, status) so the requests can be counted per rate-limit category per minute.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const [BASE, EMAIL, PATH, OUT, MODE] = process.argv.slice(2);
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const t0 = Date.now(); const rows = [];
  page.on('response', (r) => { const u = r.url(); if (u.includes('/api/')) rows.push({ t: Date.now() - t0, m: r.request().method(), p: u.replace(BASE, '').split('?')[0], s: r.status() }); });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (email) => { const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const j = await r.json(); for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', new Date(Date.now() + 864e5).toISOString()); s.setItem('trialsage_user', JSON.stringify(j.user)); } }, EMAIL);
  try {
    rows.length = 0;
    await page.goto(BASE + PATH, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
    const marks = [{ what: 'open', t: Date.now() - t0 }];
    if (MODE === 'tabs') {
      const tabs = await page.$$eval('main [role="tab"], main button.pj-lc-stage', (ts) => ts.filter((t) => t.getBoundingClientRect().width > 2).map((t) => (t.getAttribute('aria-label') || t.innerText || '').replace(/\s+/g, ' ').trim()));
      for (const tab of tabs) { { const byName = page.getByRole('tab', { name: tab, exact: true }).first(); const target = (await byName.count()) ? byName : page.locator('main button.pj-lc-stage').filter({ hasText: tab }).first(); await target.click({ timeout: 5000 }).catch(() => {}); } marks.push({ what: 'tab ' + tab, t: Date.now() - t0 }); await page.waitForTimeout(2000); }
    } else {
      const docs = page.locator('main').getByText(/^\[Demo · Lumen\]/).filter({ visible: true });
      const n = Math.min(await docs.count(), 14); marks.push({ what: 'rows found ' + n, t: Date.now() - t0 });
      for (let i = 0; i < n; i++) { await docs.nth(i).click({ timeout: 4000 }).catch(() => {}); marks.push({ what: 'row ' + i, t: Date.now() - t0 }); await page.waitForTimeout(2000); }
    }
    const fail = await page.evaluate(() => [...document.querySelectorAll('[role=alert], .error-state, .vd-dr-err')].map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 140)).filter(Boolean));
    await page.screenshot({ path: OUT + '.png' });
    fs.writeFileSync(OUT + '.json', JSON.stringify({ marks, rows, fail }));
    console.info('requests', rows.length, 'in', Math.round((Date.now() - t0) / 1000), 's; 429s', rows.filter((r) => r.s === 429).length, '; alerts', JSON.stringify(fail).slice(0, 400));
  } finally {
    await page.evaluate(async () => { const t = localStorage.getItem('trialsage_access_token'); await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }); }).catch(() => {});
    await b.close();
  }
})();
