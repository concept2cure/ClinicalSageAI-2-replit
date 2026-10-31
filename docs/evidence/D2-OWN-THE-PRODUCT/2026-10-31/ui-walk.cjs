const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const BASE = 'http://localhost:5000'; const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const BROKEN = /something went wrong|error boundary|failed to load|cannot read|undefined is not|unexpected error|could not be read|not available right now/i;
(async () => {
  const dl = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const sess = await (await fetch(`${BASE}/api/v1/auth/session`, { headers: { Authorization: `Bearer ${dl.accessToken}`, Origin: BASE } })).json();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const expiry = new Date(Date.now() + 23 * 3600 * 1000).toISOString();
  await context.addInitScript(([t, r, e, u]) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', t); s.setItem('trialsage_refresh_token', r); s.setItem('trialsage_token_expiry', e); s.setItem('trialsage_user', u); } }, [dl.accessToken, dl.refreshToken, expiry, JSON.stringify(sess.user)]);
  const page = await context.newPage();
  let stage = 'start'; const per = {};
  const rec = (k, v) => { (per[stage] ??= { pageerror: [], console: [], failed: [] })[k].push(v); };
  page.on('pageerror', (e) => rec('pageerror', String(e?.message || e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') rec('console', m.text().slice(0, 240)); });
  page.on('response', (r) => { if (r.status() >= 400) rec('failed', `${r.status()} ${r.request().method()} ${r.url().replace(BASE, '').slice(0, 140)}`); });
  const settle = async () => {
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch { /* not idle within 15s; the loading check below decides */ }
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) { const busy = await page.getByText(/Loading surface|Loading…|Loading\.\.\./).count().catch(() => 0); if (!busy) break; await page.waitForTimeout(1000); }
    console.info(`   (settled in ${Math.round((Date.now() - t0) / 1000)}s)`);
    await page.waitForTimeout(2000);
  };
  const report = async (name) => {
    const text = await page.evaluate(() => (document.querySelector('main') || document.body).innerText).catch(() => '');
    const flagged = text.split('\n').filter(l => BROKEN.test(l)).slice(0, 5);
    await page.screenshot({ path: path.join(OUT, `w_${name.replace(/\W+/g, '_')}.png`) });
    const p = per[stage] || { pageerror: [], console: [], failed: [] };
    console.info(`== ${name} (${page.url().replace(BASE, '')}) chars=${text.length} pageerrors=${p.pageerror.length} console=${p.console.length} failed=${p.failed.length}${flagged.length ? ' FLAGGED: ' + JSON.stringify(flagged) : ''}`);
    for (const k of ['pageerror', 'console', 'failed']) for (const v of [...new Set(p[k])].slice(0, 6)) console.info(`   ${k}: ${v}`);
  };
  stage = 'project home';
  await page.goto(BASE + '/concept2cure/project-home?program=11111111-2222-3333-4444-000000000204', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await settle(); await report('project home');
  const nav = ['Vault', 'Tasks', 'Communication', 'CMC / Module 3', 'Risk-based monitoring', 'Quality', 'Reporting & analytics', 'Projects', 'Home'];
  for (const label of nav) {
    stage = label;
    const link = page.locator('aside, nav').filter({ hasText: 'WORK AREAS' }).getByText(label, { exact: true }).first();
    if (!(await link.count())) { console.info(`== ${label}: NOT FOUND in nav`); continue; }
    await link.click({ timeout: 10000 }).catch(e => rec('pageerror', 'click ' + e.message.slice(0, 200)));
    await settle(); await report('with project: ' + label);
  }
  await browser.close();
})().catch(e => { console.error('WALK FAILED', e); process.exit(1); });
