// Real-browser check of the 2026-09-07 UI convergence:
//   Home  — greeting + composer + action row + "Browse all capabilities"
//   Overlay — CapabilityBrowser opens, searches, navigates, closes on Escape
//   Projects — quiet summary line, search, two-column cards
//
// Same shape as project-threads-walk-2026-09-07.mjs: dev-login, inject the
// tokens the shell reads, drive the real app, screenshot, and fail loudly on a
// console error.
//
// The portfolio is served through page.route so the card grid renders against
// KNOWN rows: this checks the LAYOUT, and a local database with an empty
// regulatory_programs table would only ever show the honest empty state. The
// failed-read branch is exercised separately below, unmocked, by making the
// same route return 500 — that one has to be a real failure, not a fixture.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5000';
const OUT = process.env.OUT ?? path.resolve('shots-convergence');
fs.mkdirSync(OUT, { recursive: true });

// Whoever runs this supplies the account: DEV_EMAIL=… node <this file>. Not
// hardcoded, so a real address does not live in a committed evidence script.
const EMAIL = process.env.DEV_EMAIL;
if (!EMAIL) { console.error('set DEV_EMAIL to an account that exists in this database'); process.exit(1); }

const login = await fetch(`${BASE}/api/auth/dev-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL }),
}).then((r) => r.json());
if (!login.accessToken) { console.error('dev-login failed', login); process.exit(1); }

const PROGRAMS = [
  { id: 'p-1', title: 'First-in-Human ZX-9', code: 'ZX-9', ws: 'Pharma', stage: 'Authoring',
    status: 'active', readiness: 62, lead: 'Dana Whitfield', blocker: null, due: 'Q4 2026' },
  { id: 'p-2', title: 'Companion assay KP-2', code: 'KP-2', ws: 'Biotech', stage: 'Review',
    status: 'blocked', readiness: 38, lead: 'Rae Okafor', blocker: 'Assay validation open', due: '54 days' },
  { id: 'p-3', title: 'CardioMesh 510(k)', code: 'CM-1', ws: 'MDX', stage: 'Evidence',
    status: 'active', readiness: 81, lead: 'Sam Ortiz', blocker: null, due: 'Q1 2027' },
  { id: 'p-4', title: 'Dermal patch PMA', code: 'DP-7', ws: 'MDX', stage: 'Draft',
    status: 'complete', readiness: 100, lead: 'Lee Park', blocker: null, due: 'filed' },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const expiry = new Date(Date.now() + (login.expiresIn || 86400) * 1000).toISOString();
await ctx.addInitScript(([a, r, u, x]) => {
  for (const st of [localStorage, sessionStorage]) {
    st.setItem('trialsage_access_token', a);
    st.setItem('trialsage_refresh_token', r || '');
    st.setItem('trialsage_token_expiry', x);
    st.setItem('trialsage_user', JSON.stringify(u || {}));
  }
}, [login.accessToken, login.refreshToken, login.user, expiry]);

const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

let portfolio = { mode: 'rows' };
await page.route('**/api/c2c/projects*', async (route) => {
  if (portfolio.mode === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'forced' }) });
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: PROGRAMS }) });
});

const results = {};
const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }); };

// ── Home ────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
results.homeGreeting = await page.locator('.landing-greet h1').first().textContent().catch(() => null);
results.homeActionCount = await page.locator('.landing-action').count();
results.browseTriggerVisible = await page.locator('.landing-browse').isVisible().catch(() => false);
// The chips and tagline this change removed must be gone.
results.pathwayChipsGone = (await page.locator('.landing-segctx-path').count()) === 0;
results.inlineModuleGridGone = (await page.locator('.landing-modules').count()) === 0;
await shot('01-home-1440');

// ── Overlay ─────────────────────────────────────────────────────────────────
await page.locator('.landing-browse').click();
await page.waitForSelector('.capbrowser', { timeout: 5000 });
results.overlayGroupCount = await page.locator('.capbrowser-group').count();
results.overlayCardCount = await page.locator('.cb-card').count();
await shot('02-overlay-open-1440');

const firstCard = await page.locator('.cb-card-l').first().textContent();
await page.locator('.cb-input').fill(firstCard.slice(0, 6));
await page.waitForTimeout(300);
results.searchNarrowed = (await page.locator('.cb-card').count()) < results.overlayCardCount;
results.searchCardsRemaining = await page.locator('.cb-card').count();
await shot('03-overlay-search-1440');

await page.locator('.cb-input').fill('zzzz-no-such-capability');
await page.waitForTimeout(300);
results.searchEmptyMessage = await page.locator('.cb-empty').textContent().catch(() => null);
await shot('04-overlay-no-match-1440');

await page.locator('.cb-input').fill('');
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
results.escapeClosed = (await page.locator('.capbrowser').count()) === 0;

// Navigation out of the overlay.
await page.locator('.landing-browse').click();
await page.waitForSelector('.capbrowser');
const navTarget = await page.locator('.cb-card-l').first().textContent();
await page.locator('.cb-card').first().click();
await page.waitForTimeout(1200);
results.navigatedFrom = navTarget;
results.overlayClosedOnNav = (await page.locator('.capbrowser').count()) === 0;
results.urlAfterNav = page.url();
await shot('05-after-overlay-nav-1440');

// ── Overlay, narrow ─────────────────────────────────────────────────────────
await page.setViewportSize({ width: 420, height: 900 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.locator('.landing-browse').click().catch(() => {});
await page.waitForTimeout(600);
results.overlayNarrowSingleColumn = await page.evaluate(() => {
  const g = document.querySelector('.capbrowser-groups');
  return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length === 1 : null;
});
await shot('06-overlay-420');
await page.keyboard.press('Escape');

// ── Projects ────────────────────────────────────────────────────────────────
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
results.projectsSummaryText = await page.locator('.pj-summary').textContent().catch(() => null);
results.projectsMetricTilesGone = (await page.locator('.metrics .metric').count()) === 0;
results.projectsCardCount = await page.locator('.pj-card').count();
results.projectsColumns = await page.evaluate(() => {
  const g = document.querySelector('.pj-cards');
  return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : null;
});
await shot('07-projects-1440');

await page.locator('.pj-search-i').fill('KP-2');
await page.waitForTimeout(400);
results.projectsSearchCount = await page.locator('.pj-card').count();
results.projectsSearchTitles = await page.locator('.pj-card-t').allTextContents();
await shot('08-projects-search-1440');

// Search must not reach `lead` — it can hold an email address.
await page.locator('.pj-search-i').fill('Dana');
await page.waitForTimeout(400);
results.leadSearchCount = await page.locator('.pj-card').count();
await shot('09-projects-lead-search-1440');

await page.locator('.pj-search-i').fill('');
await page.setViewportSize({ width: 720, height: 1000 });
await page.waitForTimeout(500);
results.projectsNarrowColumns = await page.evaluate(() => {
  const g = document.querySelector('.pj-cards');
  return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : null;
});
await shot('10-projects-720');

// ── The honest figure, over a REAL failed read ──────────────────────────────
await page.setViewportSize({ width: 1440, height: 1000 });
portfolio.mode = 'fail';
await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
results.failedSummaryText = await page.locator('.pj-summary').textContent().catch(() => null);
results.failedBodyHasPercent = /\d+%/.test(await page.locator('.pj-index').textContent().catch(() => ''));
results.failedShowsErrorPanel = await page.getByText(/Couldn.t load the project portfolio/i).isVisible().catch(() => false);
await shot('11-projects-failed-read-1440');

results.consoleErrors = errors;
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

await browser.close();
