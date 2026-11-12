// Opens every stop (a screen and its tabs) a click-through reached, as one person, and records what the server
// refused and every API path the screen asked for. It clicks nothing but tabs. Run against an app started with
// production's launch-scope gate (LAUNCH_SCOPE_ENFORCE=on, LAUNCH_SCOPE_API_UNATTRIBUTED=enforce).
//
//   node gatewalk.cjs <base> <email> <stops.json> <out.jsonl>
//
// stops.json: [{ url, tabs, selected }], as clickcrawl.cjs records a stop. A fresh browser every 20 stops, because a
// headless browser reloading Submission Center holds its temporary files until it closes (2026-11-10).
const fs = require('fs');
const { chromium } = require('playwright');
const [BASE, EMAIL, STOPS, OUT] = process.argv.slice(2);
const TAB_SEL = '[role="tab"], button.pj-lc-stage';
const TAB_ON = '[role="tab"][aria-selected="true"], button.pj-lc-stage[aria-current="step"]';
const stops = JSON.parse(fs.readFileSync(STOPS, 'utf8'));
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).key; } catch { return null; } }) : []);
const keyOf = (s) => s.url + '#' + (s.tabs || []).join('>');
const shape = (u) => u.replace(BASE, '').split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{22,}/g, ':id').replace(/\/\d+(?=\/|$)/g, '/:n');

async function login(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json(); const exp = new Date(Date.now() + 864e5).toISOString();
    for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user)); }
  }, EMAIL);
}

async function openStop(page, stop) {
  await page.goto(BASE + stop.url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const selected = await page.$$eval(TAB_ON, (ts) => ts.filter((t) => t.getBoundingClientRect().width > 2).map((t) => (t.getAttribute('aria-label') || t.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
  for (const tab of [...(stop.selected || []).filter((t) => !selected.includes(t)), ...(stop.tabs || [])]) {
    const byName = page.getByRole('tab', { name: tab, exact: true }).first();
    const target = (await byName.count()) ? byName : page.locator(TAB_SEL).filter({ hasText: tab }).first();
    if (await target.count()) { await target.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(900); }
  }
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

(async () => {
  const todo = stops.filter((s) => !done.has(keyOf(s)));
  for (let i = 0; i < todo.length; i += 20) {
    const up = await fetch(`${BASE}/healthz`).then((r) => r.ok).catch(() => false);
    if (!up) { fs.appendFileSync(OUT, JSON.stringify({ kind: 'fatal', error: 'the app did not answer /healthz' }) + '\n'); process.exit(1); }
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    let refused = []; let asked = new Set(); const waits = [];
    page.on('response', (r) => {
      const u = r.url(); if (!u.includes('/api/')) return;
      asked.add(`${r.request().method()} ${shape(u)}`);
      if (r.status() >= 400) waits.push(r.text().catch(() => '').then((t) => { let code = ''; try { const j = JSON.parse(t); code = j.code || j.error?.code || (typeof j.error === 'string' ? j.error : '') || ''; } catch { /* not JSON */ } refused.push(`${r.status()} ${r.request().method()} ${shape(u)} ${String(code).slice(0, 60)}`.trim()); }));
    });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await login(page);
    for (const stop of todo.slice(i, i + 20)) {
      refused = []; asked = new Set(); waits.length = 0;
      await openStop(page, stop);
      await Promise.all(waits);
      const main = await page.evaluate(() => ((document.querySelector('main') || document.body).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 240)).catch(() => '');
      const landed = page.url().replace(BASE, '');
      fs.appendFileSync(OUT, JSON.stringify({ kind: 'stop', key: keyOf(stop), stop, landed, refused: [...new Set(refused)], asked: [...asked].sort(), main }) + '\n');
    }
    await page.evaluate(async () => { const t = localStorage.getItem('trialsage_access_token'); await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }).catch(() => {}); }).catch(() => {});
    await browser.close();
  }
  fs.appendFileSync(OUT, JSON.stringify({ kind: 'end', stops: stops.length }) + '\n');
})().catch((e) => { fs.appendFileSync(OUT, JSON.stringify({ kind: 'fatal', error: String(e.message || e) }) + '\n'); process.exit(1); });
