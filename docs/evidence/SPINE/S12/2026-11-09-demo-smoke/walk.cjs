/**
 * Demo smoke walk (2026-11-09, before a client demo at 20:00 UTC). Opens each place a demo visits, at 1440 light, on
 * C2C-101, and records every failed API response (>= 400), page error, console error and visible error line, with a
 * screenshot per stop. It asserts nothing: it is a defect finder; walk.json is the list.
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-demo-smoke/walk.cjs [base-url] [dark]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const DARK = process.argv[3] === 'dark';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const log = { base: BASE, dark: DARK, startedAt: new Date().toISOString(), stops: [] };
const ERROR_TEXT = /something went wrong|could not be read|couldn['’]t|failed to|unexpected error|internal server error|cannot read propert|is not a function|undefined is not/i;

async function signIn(page) {
  await page.goto(BASE + '/');
  await page.evaluate(async (dark) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) });
    const j = await r.json();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', new Date(Date.now() + 864e5).toISOString()); s.setItem('trialsage_user', JSON.stringify(j.user));
    }
    localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark }));
  }, DARK);
}

async function findProgram(page) {
  return page.evaluate(async () => {
    const auth = { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` };
    const r = await fetch('/api/c2c/projects', { headers: auth });
    const j = await r.json();
    const rows = Array.isArray(j) ? j : (j.data ?? j.projects ?? []);
    const hit = rows.find((p) => /C2C-101/.test(`${p.name} ${p.code ?? ''} ${p.programCode ?? ''}`)) ?? rows[0];
    return hit ? { id: hit.id, name: hit.name } : null;
  });
}

function watch(page, sink) {
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && u.includes('/api/')) sink.failed.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`);
  });
  page.on('pageerror', (e) => sink.pageErrors.push(String(e.message).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') sink.consoleErrors.push(m.text().slice(0, 300)); });
}

async function stop(page, name, url, extra) {
  const sink = { name, url, failed: [], pageErrors: [], consoleErrors: [], errorText: [] };
  const handlers = { response: null };
  watch(page, sink);
  try {
    await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 45000 });
  } catch (e) { sink.pageErrors.push(`navigation: ${e.message.slice(0, 200)}`); }
  await page.waitForTimeout(1500);
  if (extra) { try { await extra(page, sink); } catch (e) { sink.pageErrors.push(`step: ${e.message.slice(0, 200)}`); } }
  const text = await page.locator('main, [role=main], body').first().innerText().catch(() => '');
  sink.errorText = [...new Set(text.split('\n').filter((l) => ERROR_TEXT.test(l)).map((l) => l.trim().slice(0, 200)))];
  sink.hScroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const file = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}${DARK ? '-dark' : ''}.png`;
  await page.screenshot({ path: path.join(SHOTS, file) });
  sink.screenshot = file;
  page.removeAllListeners('response'); page.removeAllListeners('pageerror'); page.removeAllListeners('console');
  void handlers;
  log.stops.push(sink);
  const n = sink.failed.length + sink.pageErrors.length + sink.consoleErrors.length + sink.errorText.length;
  console.info(`${n ? 'ISSUES' : 'ok    '} ${name}${n ? ` (${n})` : ''}`);
}

async function openFirstDocument(page) {
  const row = page.locator('[data-testid*="document"] button, .pj-doc-row, a[href*="document"]').first();
  if (await row.count()) { await row.click(); await page.waitForTimeout(4000); }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page);
    const program = await findProgram(page);
    log.program = program;
    const q = program ? `?program=${program.id}` : '';
    const places = [
      ['Home', '/concept2cure/home'],
      ['Projects', '/concept2cure/projects'],
      ['Project home', `/concept2cure/project-home${q}`],
      ['Documents (authoring)', `/concept2cure/document-authoring${q}`],
      ['Vault', `/concept2cure/vault${q}`],
      ['Submission Center', `/concept2cure/submission-center${q}`],
      ['Tasks', `/concept2cure/tasks${q}`],
      ['Communication', `/concept2cure/communication-center${q}`],
      ['CMC', `/concept2cure/cmc${q}`],
      ['Biostatistics', `/concept2cure/biostatistics${q}`],
      ['Risk-based monitoring', `/concept2cure/rbm${q}`],
      ['Quality', `/concept2cure/quality${q}`],
      ['Reporting & analytics', `/concept2cure/insights${q}`],
      ['Study & Protocol Design', `/concept2cure/protocol-dev${q}`],
    ];
    for (const [name, url] of places) await stop(page, name, url, name === 'Documents (authoring)' ? openFirstDocument : null);
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, DARK ? 'walk-dark.json' : 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
