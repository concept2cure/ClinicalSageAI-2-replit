// Reporting use walk, after the fixes: run, export, finalize offer, Run history, a pack, a schedule.
// 1440x900 and 390x844 (mobile), light. Usage: node rewalk.cjs <out-dir>
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5100', PROGRAM = 'e89b7009-bb05-4060-8bc0-6da509648e95', OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const panelButtons = (p) => p.evaluate(() => [...document.querySelectorAll('[role="tabpanel"] button, .rc-canvas .ro-rep-actions button')]
  .filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.getAttribute('aria-label') || b.textContent.trim()));

async function session(b, a, vp, mobile) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
  await ctx.addInitScript((a) => { for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', a.accessToken); s.setItem('trialsage_refresh_token', a.refreshToken || ''); s.setItem('trialsage_token_expiry', new Date(Date.now() + 86400e3).toISOString()); s.setItem('trialsage_user', JSON.stringify(a.user || {})); } localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark: false, welcomeDismissed: true })); }, a);
  const p = await ctx.newPage(); const log = { errors: [], http: [] };
  p.on('pageerror', (e) => log.errors.push(String(e.message)));
  p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) log.http.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });
  await p.goto(`${BASE}/concept2cure/insights?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  return { ctx, p, log };
}

async function walk(b, a, key, vp, mobile) {
  const { ctx, p, log } = await session(b, a, vp, mobile); const out = {};
  await p.getByRole('tab', { name: 'Catalog' }).click();
  await p.getByRole('button', { name: 'Run Executive Readiness Digest' }).click();
  await p.locator('.ro-rep-actions').waitFor({ timeout: 60000 }); await p.waitForTimeout(800);
  out.reportActions = await p.evaluate(() => document.querySelector('.ro-rep-actions').innerText.replace(/\s+/g, ' '));
  out.finalizeOffered = await p.getByRole('button', { name: /Finalize/ }).count();
  await p.locator('.ro-rep-actions').scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(OUT, `report-actions-${key}.png`) });
  if (key === '1440') {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByRole('button', { name: /Export PDF/ }).click()]);
    const f = path.join(OUT, 'export.pdf'); await dl.saveAs(f); const buf = fs.readFileSync(f); out.pdf = { bytes: buf.length, head: buf.slice(0, 5).toString() }; fs.unlinkSync(f);
  }
  await p.getByRole('tab', { name: 'Run history' }).click();
  await p.locator('[role="tabpanel"] tbody tr').first().waitFor({ timeout: 30000 });
  out.historyRows = await p.locator('[role="tabpanel"] tbody tr').count();
  out.historyOpenNames = (await panelButtons(p)).filter((n) => /^Open/.test(n)).slice(0, 2);
  out.historyRawKeys = await p.evaluate(() => /project — \d+/.test(document.querySelector('[role="tabpanel"]').innerText));
  await p.screenshot({ path: path.join(OUT, `history-${key}.png`) });
  if (key === '1440') {
    await p.locator('[role="tabpanel"] tbody input[type="checkbox"]').first().check();
    await p.getByRole('button', { name: /^Bundle 1 report/ }).click();
    await p.getByLabel('Bundle name').fill('Re-walk pack');
    await p.getByRole('button', { name: 'Create bundle' }).click();
    await p.getByText('Re-walk pack').first().waitFor({ timeout: 30000 });
    out.packCreated = true;
  }
  await p.getByRole('tab', { name: 'Schedules' }).click();
  await p.locator('[role="tabpanel"] table tbody tr').first().waitFor({ timeout: 30000 });
  out.scheduleRow = await p.evaluate(() => document.querySelector('[role="tabpanel"] tbody tr').innerText.replace(/\s+/g, ' '));
  out.scheduleButtons = (await panelButtons(p)).filter((n) => /Pause|Resume/.test(n));
  await p.screenshot({ path: path.join(OUT, `schedules-${key}.png`) });
  out.overflow = await p.evaluate(() => { const pg = document.querySelector('#c2c-page'); return pg ? pg.scrollWidth - pg.clientWidth : null; });
  out.errors = log.errors; out.http = log.http;
  await ctx.close(); return out;
}

(async () => {
  const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
  const b = await chromium.launch(); const out = {};
  out['1440'] = await walk(b, a, '1440', { width: 1440, height: 900 }, false);
  out['390'] = await walk(b, a, '390', { width: 390, height: 844 }, true);
  await b.close(); fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify(out, null, 2)); console.info(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
