/**
 * Open each launch screen in the running app as a demo person and record what a person meets there.
 *
 *   node walk.cjs <base-url> <email> <outDir> <stops.json> [width] [height]
 *
 * stops.json: [{ "name": "projects", "url": "/concept2cure/projects", "click": ["text or selector", ...] }]
 * For each stop: a viewport screenshot and a full-page one, and facts read in the page (headings, visible
 * controls, closed disclosures, words that say a read failed, horizontal overflow), with every API answer >= 400
 * and every console error. Sign-in is POST /api/auth/dev-login, the identity a Codespace signs in as.
 */
/* global getComputedStyle, innerHeight -- `facts` runs in the page, not in Node. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [BASE_ARG, EMAIL, OUT, STOPS_FILE, W = '1440', H = '900'] = process.argv.slice(2);
const BASE = BASE_ARG.replace(/\/$/, '');
const stops = JSON.parse(fs.readFileSync(STOPS_FILE, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

async function login(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  const ok = await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    if (!r.ok) return `dev-login ${r.status}`;
    const j = await r.json(); const exp = new Date(Date.now() + 864e5).toISOString();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user));
    }
    return 'ok';
  }, EMAIL);
  if (ok !== 'ok') throw new Error(ok);
}

const facts = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const main = document.querySelector('main') || document.body;
  const text = clean(main.innerText);
  const said = [];
  const re = /(could ?n[o']t|couldn’t|unavailable|failed|not configured|went wrong|error|refused|not licensed|locked|not in this release|Loading…|Reading…|not yet|no .{0,40} recorded|nothing .{0,30} yet)/gi;
  let m; while ((m = re.exec(text)) && said.length < 14) said.push(clean(text.slice(Math.max(0, m.index - 70), m.index + 110)));
  const names = (sel, max) => { const out = []; for (const e of main.querySelectorAll(sel)) { if (!vis(e)) continue; const n = clean(e.getAttribute('aria-label') || e.innerText || e.getAttribute('title')).slice(0, 60); if (n && !out.includes(n)) out.push(n); if (out.length >= max) break; } return out; };
  const fold = innerHeight;
  const belowFoldH2 = [...main.querySelectorAll('h2,h3')].filter((e) => vis(e) && e.getBoundingClientRect().top > fold).map((e) => clean(e.innerText).slice(0, 50)).slice(0, 14);
  return {
    url: location.pathname + location.search,
    h1: names('h1', 3), h2: names('h2', 16), h3: names('h3', 16),
    belowFoldHeadings: belowFoldH2,
    buttons: names('button, [role="button"], a.btn', 60),
    tabs: names('[role="tab"]', 30),
    closedDisclosures: [...main.querySelectorAll('details:not([open]) > summary')].filter(vis).map((s) => clean(s.innerText).slice(0, 60)).slice(0, 20),
    said,
    textLength: text.length,
    pageHeight: document.documentElement.scrollHeight,
    hScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    rail: [...document.querySelectorAll('.rail button, .rail a, nav button, nav a')].filter(vis).map((e) => clean(e.getAttribute('aria-label') || e.innerText).slice(0, 40)).filter(Boolean).slice(0, 40),
  };
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: Number(W), height: Number(H) }, hasTouch: Number(W) < 500 });
  const page = await context.newPage();
  let failed = []; let consoleErrors = [];
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '').slice(0, 150)}`); });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + String(e.message).slice(0, 200)));
  await login(page);
  const results = [];
  for (const stop of stops) {
    failed = []; consoleErrors = [];
    const rec = { name: stop.name, at: stop.url };
    try {
      await page.goto(BASE + stop.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => { rec.neverIdle = true; });
      await page.waitForTimeout(2500);
      for (const c of stop.click || []) {
        const loc = c.startsWith('css=') ? page.locator(c.slice(4)).first() : page.getByText(c, { exact: true }).first();
        await loc.click({ timeout: 15000 }).catch((e) => { rec.clickFailed = (rec.clickFailed || []).concat(`${c}: ${String(e.message).split('\n')[0].slice(0, 120)}`); });
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
      rec.facts = await page.evaluate(facts);
      await page.screenshot({ path: path.join(OUT, `${stop.name}.png`) });
      if (!stop.noFull) await page.screenshot({ path: path.join(OUT, `${stop.name}.full.png`), fullPage: true }).catch(() => {});
    } catch (e) { rec.error = String(e.message).split('\n')[0].slice(0, 300); }
    rec.failed = [...new Set(failed)].slice(0, 30); rec.consoleErrors = [...new Set(consoleErrors)].slice(0, 10);
    results.push(rec);
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(results, null, 1));
    console.info(`${stop.name}: ${rec.error ? 'ERROR ' + rec.error : `${rec.failed.length} failed, ${rec.consoleErrors.length} console, h=${rec.facts.pageHeight}`}`);
  }
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
