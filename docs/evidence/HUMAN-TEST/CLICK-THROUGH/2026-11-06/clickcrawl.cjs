// Click every visible control on every screen a person reaches, and record what breaks: page errors, console
// errors, failed requests (>= 400), failure text, loading that never ends, clicks that change nothing.
//
// The founder, 2026-11-06: "make sure that everything in the user interface, when it does load in the code space
// today, works. If I click on something, it needs to do what I anticipate." See README.md beside this file.
//
// Usage: node clickcrawl.cjs <baseUrl> <email> <outDir> [seedsJson]
//   env ALLOW          regex on the path: only stops matching it are crawled (split areas across parallel runs)
//   env FULL_PROGRAMS  comma list of program UUIDs whose screens get every control clicked; other projects' stops
//                      are load-checked only
//   env DISCOVER=1     also click each rail button and each account-menu item from Home, record where it lands
//   env MAXSTOPS       stop after this many stops (default 400)
//   env MAXPERSTOP     click at most this many controls on one stop, an even sample of its list, and record a "sampled"
//                      line saying how many of how many (a Vault lists a hundred document rows that run the same code)
//   env MAXCLICKS      end this process after this many new clicks, with no "end" line, so a shell loop can start it
//                      again from its log: a headless browser holds temporary files until it exits (several GB over a
//                      long run, which filled a disk on 2026-11-10). Loop until the log holds an "end" line:
//                        until grep -q '"kind":"end"' out/A/clicks.jsonl; do MAXCLICKS=60 node clickcrawl.cjs …; done
// Each account holds 5 concurrent sessions (shared/auth/session-policy.ts): run at most 3 of these as one person,
// and sign any other test browser out, or the runs' sessions are superseded and every screen shows sign-in.
/* global getComputedStyle, innerHeight -- page code passed to page.evaluate runs in the browser */
const { chromium } = require('playwright');
const fs = require('fs');
const [BASE, EMAIL, OUT, SEEDS] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const LOG = `${OUT}/clicks.jsonl`;
// Also skipped: a control that makes a new record and a new, differently named control each time. "Start sequence
// 0001" leaves "Start sequence 0002" behind it, so a resumed run never ran out of them (it reached 0014 on 2026-11-10).
// The first one, 0000, is still clicked.
const SKIP = /^(sign out|log out|delete account|reset|revoke all|end all sessions|start sequence (?!0000$)\d{4}|type of sequence (?!0000$)\d{4})$/i;
const FAIL_TEXT = /couldn['’]t load|could not be loaded|could not load|something went wrong|unexpected error|failed to (load|fetch)|\[object object\]|\bNaN\b|\bundefined\b|internal server error|cannot read propert|is not a function|try again later/gi;
const LOADING_TEXT = /\b(loading|reading|fetching)(…|\.\.\.)/gi;
// Tabs, and controls that behave as tabs: a project's lifecycle steps (.pj-lc-stage, the current one aria-current="step").
const TAB_SEL = '[role="tab"], button.pj-lc-stage';
const TAB_ON = '[role="tab"][aria-selected="true"], button.pj-lc-stage[aria-current="step"]';
const CONTROL_SEL = 'button, a[href], [role="tab"], [role="button"], [role="menuitem"], summary, select, input[type="checkbox"], input[type="radio"]';
let sessionEnded = false;

// Resume (2026-11-10): a run stopped part way (a push needing the memory, a full disk) starts again from its own log.
// A click already recorded is not clicked again, a stop already recorded is not recorded twice, and the screens the
// recorded clicks reached are queued as they were.
const clickKey = (stop, c) => `${JSON.stringify(stop)}|${c.role}|${c.name}`;
function priorRun() {
  const done = { stops: new Set(), clicks: new Set(), reached: [], discovered: false };
  const lines = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean) : [];
  for (const line of lines) {
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (r.kind === 'stop') done.stops.add(JSON.stringify(r.stop));
    if (r.kind !== 'click') continue;
    if ((r.stop?.tabs || [])[0] === '(rail)') done.discovered = true;
    done.clicks.add(clickKey(r.stop, r.control));
    if (r.effect === 'navigated' && r.url) done.reached.push(r.url);
    if (r.control?.href?.startsWith('/concept2cure')) done.reached.push(r.control.href);
  }
  return done;
}
const DONE = priorRun();
const BUDGET = { left: Number(process.env.MAXCLICKS || Infinity) };

// The app must answer before a stop is crawled: with it down, every click would be recorded as the app's failure.
async function requireApp(page) {
  const up = await page.request.get(`${BASE}/healthz`, { timeout: 10_000 }).then((r) => r.ok()).catch(() => false);
  if (!up) throw new Error('the app did not answer /healthz; stopping so nothing is recorded against an app that is down');
}
// The browser storage just after sign-in. Screens remember UI state there (a collapsed folder, a filter, the last
// step), so every reopen starts from this snapshot and finds the controls it first listed.
let FRESH = null;

async function login(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json(); const exp = new Date(Date.now() + 864e5).toISOString();
    for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? ''); s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user)); }
  }, EMAIL);
}

const snapshot = (page) => page.evaluate(() => {
  const t = (document.querySelector('main') || document.body).innerText || '';
  const attrs = [...document.querySelectorAll('[aria-expanded="true"],[aria-pressed="true"],[aria-selected="true"],[aria-checked="true"],[role="dialog"],[role="menu"],[role="listbox"],[role="alertdialog"],dialog[open],details[open]')].length;
  let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return { h, attrs, url: location.pathname + location.search };
});
const bodyText = (page) => page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));
const count = (text, re) => (text.match(re) || []).length;

// Every visible, enabled control outside the rail (each rail destination is its own stop).
const controls = (page) => page.evaluate((sel) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight * 3; };
  const name = (e) => (e.getAttribute('aria-label') || e.innerText || e.getAttribute('title') || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const seen = {}; const out = [];
  for (const e of document.querySelectorAll(sel)) {
    if (!vis(e) || e.disabled || e.getAttribute('aria-disabled') === 'true' || e.closest('.rail')) continue;
    const n = name(e); if (!n) continue;
    const role = e.getAttribute('role') || e.tagName.toLowerCase();
    const key = role + '|' + n; seen[key] = (seen[key] || 0) + 1;
    out.push({ role, name: n, nth: seen[key] - 1, href: e.tagName === 'A' ? e.getAttribute('href') : null });
  }
  return out;
}, CONTROL_SEL);

async function locate(page, c) {
  const all = page.locator(CONTROL_SEL);
  const i = await all.evaluateAll((els, c) => {
    const name = (e) => (e.getAttribute('aria-label') || e.innerText || e.getAttribute('title') || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    let k = 0;
    for (let i = 0; i < els.length; i++) {
      const e = els[i]; const role = e.getAttribute('role') || e.tagName.toLowerCase();
      if (e.closest('.rail') || e.disabled) continue;
      const r = e.getBoundingClientRect(); if (r.width <= 2 || r.height <= 2) continue;
      if (role === c.role && name(e) === c.name) { if (k === c.nth) return i; k++; }
    }
    return -1;
  }, c);
  return i >= 0 ? all.nth(i) : null;
}

async function openStop(page, stop) {
  if (FRESH) await page.evaluate((f) => { try { localStorage.clear(); sessionStorage.clear(); for (const [k, v] of Object.entries(f.l)) localStorage.setItem(k, v); for (const [k, v] of Object.entries(f.s)) sessionStorage.setItem(k, v); } catch { /* storage refused */ } }, FRESH).catch(() => {});
  await page.goto(BASE + stop.url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const selected = await page.$$eval(TAB_ON, (ts) => ts.filter((t) => t.getBoundingClientRect().width > 2).map((t) => (t.getAttribute('aria-label') || t.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
  if (!stop.selected) stop.selected = (stop.tabs || []).length ? [] : selected;
  for (const tab of [...(stop.selected || []).filter((t) => !selected.includes(t)), ...(stop.tabs || [])]) {
    const byName = page.getByRole('tab', { name: tab, exact: true }).first();
    const target = (await byName.count()) ? byName : page.locator(TAB_SEL).filter({ hasText: tab }).first();
    if (await target.count()) { await target.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(900); }
  }
}

// What a page reports while the run works: errors, failed requests, downloads.
function watch(page) {
  const ev = { errors: [], api: [], downloads: 0 };
  page.on('pageerror', (e) => ev.errors.push('pageerror: ' + String(e.message || e).slice(0, 240)));
  page.on('console', (m) => { if (m.type() === 'error') ev.errors.push('console: ' + m.text().slice(0, 240)); });
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/') && r.status() >= 400) ev.api.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, '').slice(0, 160)}`);
    if (r.status() === 401 && /\/api\/(users\/me|tenants|v1\/auth\/session)/.test(u)) sessionEnded = true;
  });
  // A download is counted, then discarded. Kept, the browser held every clicked file until it closed: 3.6 GB of
  // them filled the disk and took the app down mid-run (2026-11-10).
  page.on('download', (d) => { ev.downloads++; d.cancel().catch(() => {}).then(() => d.delete().catch(() => {})); });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  return ev;
}

// The stops to crawl: the seeds, Home, and every screen a click reaches, held to ALLOW.
function stopQueue() {
  const ALLOW = process.env.ALLOW ? new RegExp(process.env.ALLOW) : null;
  const queue = []; const known = new Set();
  const norm = (u) => { try { const x = new URL(u, BASE); x.searchParams.delete('docId'); return x.pathname + (x.search || ''); } catch { return null; } };
  const add = (url, tabs = []) => {
    const n = norm(url); if (!n || !n.startsWith('/concept2cure') || (ALLOW && !ALLOW.test(n))) return;
    const k = n + '#' + tabs.join('>'); if (known.has(k)) return; known.add(k); queue.push({ url: n, tabs });
  };
  for (const s of SEEDS ? JSON.parse(fs.readFileSync(SEEDS, 'utf8')) : []) add(s.url, s.tabs || []);
  add('/concept2cure');
  return { queue, add };
}

// One click from Home (a rail button or an account-menu item), recorded with where it lands.
async function recordFromHome(page, ev, add, label, act) {
  await page.goto(BASE + '/concept2cure', { waitUntil: 'networkidle' }).catch(() => {}); await page.waitForTimeout(1000);
  const b = await snapshot(page); ev.errors.length = 0; ev.api.length = 0;
  let clickErr = null; try { await act(); } catch (e) { clickErr = String(e.message).split('\n')[0].slice(0, 160); }
  await page.waitForTimeout(1800);
  const a = await snapshot(page);
  const effect = clickErr ? 'click-failed' : a.url !== b.url ? 'navigated' : (a.h !== b.h || a.attrs !== b.attrs) ? 'changed' : 'nothing';
  fs.appendFileSync(LOG, JSON.stringify({ kind: 'click', stop: { url: '/concept2cure', tabs: ['(rail)'] }, control: { role: 'rail', name: label }, effect, url: a.url, errors: ev.errors.slice(0, 6), api: ev.api.slice(0, 6), newFail: [], stuck: [], clickErr }) + '\n');
  if (a.url !== b.url) add(a.url);
  await page.keyboard.press('Escape').catch(() => {});
}

// DISCOVER=1: each rail button and each account-menu item from Home is a click to check and a stop to crawl.
async function discover(page, ev, add) {
  await page.goto(BASE + '/concept2cure', { waitUntil: 'networkidle' }).catch(() => {});
  const railNames = await page.$$eval('.rail button', (bs) => bs.map((b) => (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
  const seen = {};
  for (const n of railNames.filter((n) => n !== 'Collapse')) {
    const k = seen[n] = (seen[n] ?? -1) + 1;
    await recordFromHome(page, ev, add, n, () => page.locator('.rail button').filter({ hasText: n }).nth(k).click({ timeout: 4000 }));
  }
  const acct = page.locator('.rail button').filter({ hasText: new RegExp(EMAIL.split('.')[0], 'i') }).first();
  await page.goto(BASE + '/concept2cure', { waitUntil: 'networkidle' }).catch(() => {});
  if (!(await acct.count())) return;
  await acct.click().catch(() => {}); await page.waitForTimeout(800);
  const items = await page.$$eval('[role="menuitem"], [role="menu"] button, [role="menu"] a', (es) => es.map((e) => (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
  for (const it of items.filter((it) => !/sign out|log out/i.test(it))) {
    await recordFromHome(page, ev, add, 'account menu › ' + it, async () => { await acct.click({ timeout: 4000 }); await page.waitForTimeout(600); await page.locator('[role="menuitem"], [role="menu"] button, [role="menu"] a').filter({ hasText: it }).first().click({ timeout: 4000 }); });
  }
}

// One control on a freshly opened stop: click it and record what happened.
// What the click did, from the page before (b) and after (a) it.
function effectOf(clickErr, b, a, downloaded) {
  if (clickErr) return 'click-failed';
  if (!a || !b) return 'unknown';
  if (a.url !== b.url) return 'navigated';
  if (a.h !== b.h || a.attrs !== b.attrs) return 'changed';
  return downloaded ? 'download' : 'nothing';
}

// The page after a click. Loading text the click added gets 4.5 more seconds before it counts as stuck.
async function afterClick(page, bt) {
  await page.waitForTimeout(1500);
  let a = await snapshot(page).catch(() => null);
  let at = await bodyText(page).catch(() => '');
  let stuck = [];
  if (count(at, LOADING_TEXT) > count(bt, LOADING_TEXT)) {
    await page.waitForTimeout(4500);
    at = await bodyText(page).catch(() => '');
    a = await snapshot(page).catch(() => a);
    stuck = at.match(LOADING_TEXT) || [];
  }
  const newFail = count(at, FAIL_TEXT) > count(bt, FAIL_TEXT) ? (at.match(FAIL_TEXT) || []) : [];
  return { a, stuck, newFail };
}

// One control on a freshly opened stop: click it and record what happened.
async function clickOne(page, ev, add, stop, c) {
  if (DONE.clicks.has(clickKey(stop, c)) || BUDGET.left <= 0) return;
  BUDGET.left--;
  await openStop(page, stop);
  const b = await snapshot(page).catch(() => null);
  const bt = await bodyText(page).catch(() => '');
  const loc = await locate(page, c).catch(() => null);
  if (!loc) { fs.appendFileSync(LOG, JSON.stringify({ kind: 'click', stop, control: c, outcome: 'not-found-after-reopen' }) + '\n'); return; }
  ev.errors.length = 0; ev.api.length = 0; const dl0 = ev.downloads;
  let clickErr = null;
  try { await loc.click({ timeout: 4000 }); } catch (e) { clickErr = String(e.message).split('\n')[0].slice(0, 160); }
  const { a, stuck, newFail } = await afterClick(page, bt);
  const effect = effectOf(clickErr, b, a, ev.downloads > dl0);
  fs.appendFileSync(LOG, JSON.stringify({ kind: 'click', stop, control: c, effect, url: a?.url, errors: ev.errors.slice(0, 6), api: ev.api.slice(0, 6), newFail: newFail.slice(0, 6), stuck: stuck.slice(0, 4), clickErr }) + '\n');
  if (effect === 'navigated') add(a.url);
  if (c.href?.startsWith('/concept2cure')) add(c.href);
  await page.keyboard.press('Escape').catch(() => {});
}

// One stop: open it, record how it loaded, queue its tabs, and click each control (full projects only).
function logStop(stop, ev, t0) {
  const rec = { kind: 'stop', stop, errors: ev.errors.splice(0), api: ev.api.splice(0), fail: t0.match(FAIL_TEXT) || [], loading: t0.match(LOADING_TEXT) || [] };
  if (!DONE.stops.has(JSON.stringify(stop))) fs.appendFileSync(LOG, JSON.stringify(rec) + '\n');
}

// An even sample of a long list, the same one on every run so a resumed run continues it.
function sampled(list, stop) {
  const cap = Number(process.env.MAXPERSTOP || 0);
  if (!cap || list.length <= cap) return list;
  const pick = list.filter((_, i) => Math.floor(i * cap / list.length) !== Math.floor((i - 1) * cap / list.length));
  const line = JSON.stringify({ kind: 'sampled', stop, clicked: pick.length, of: list.length });
  if (!fs.readFileSync(LOG, 'utf8').includes(line)) fs.appendFileSync(LOG, line + '\n');
  return pick;
}

async function crawlStop(page, ev, add, stop) {
  await requireApp(page);
  ev.errors.length = 0; ev.api.length = 0;
  await openStop(page, stop);
  logStop(stop, ev, await bodyText(page).catch(() => ''));
  if ((stop.tabs || []).length < 2) {
    const tabs = await page.$$eval(TAB_SEL, (ts) => ts.filter((t) => t.getBoundingClientRect().width > 2).map((t) => (t.getAttribute('aria-label') || t.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
    for (const t of tabs) add(stop.url, [...(stop.tabs || []), t]);
  }
  const full = (process.env.FULL_PROGRAMS || '').split(',').filter(Boolean);
  const prog = (stop.url.match(/[?&]program=([^&#]+)/) || [])[1];
  if (prog && full.length && !full.includes(prog)) return 0;
  const stepNames = await page.$$eval('button.pj-lc-stage', (bs) => bs.map((b) => (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim())).catch(() => []);
  const list = (await controls(page)).filter((c) => c.role !== 'tab' && !stepNames.includes(c.name) && !SKIP.test(c.name) && !(c.href && /^https?:/.test(c.href) && !c.href.startsWith(BASE)));
  for (const c of sampled(list, stop)) await clickOne(page, ev, add, stop, c);
  return list.length;
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  const ev = watch(page);
  await login(page);
  FRESH = await page.evaluate(() => ({ l: { ...localStorage }, s: { ...sessionStorage } }));
  const { queue, add } = stopQueue();
  for (const url of DONE.reached) add(url);
  if (process.env.DISCOVER === '1' && !DONE.discovered) await discover(page, ev, add);
  for (let qi = 0; qi < queue.length && qi < Number(process.env.MAXSTOPS || 400); qi++) {
    if (sessionEnded) { fs.appendFileSync(LOG, JSON.stringify({ kind: 'fatal', error: 'session ended (401 on the session read); stopping' }) + '\n'); break; }
    await crawlStop(page, ev, add, queue[qi]);
    if (BUDGET.left <= 0) break;
  }
  // The end line counts every click on record, this process's and the ones it resumed over.
  const recorded = fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes('"kind":"click"')).length;
  if (BUDGET.left > 0) fs.appendFileSync(LOG, JSON.stringify({ kind: 'end', stops: queue.length, clicks: recorded }) + '\n');
  // Sign out, so this run's session does not hold one of the account's five slots.
  await page.evaluate(async () => { const t = localStorage.getItem('trialsage_access_token'); await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }).catch(() => {}); }).catch(() => {});
  await browser.close();
})().catch((e) => { fs.appendFileSync(LOG, JSON.stringify({ kind: 'fatal', error: String(e.message || e) }) + '\n'); process.exit(1); });
