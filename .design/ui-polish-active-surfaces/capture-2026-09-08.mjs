// Screenshot capture for the ui-polish-active-surfaces review.
//
// WHY THIS EXISTS. That review (2026-09-05) says plainly: "Screenshots were NOT
// captured, and that is a real gap in this review. The app needs Postgres and
// the Docker daemon is unavailable in this environment." Postgres is now
// provisioned locally and the dev server runs, so the gap is closable.
//
// The review's central finding is a DARK-THEME one — 326 contrast failures the
// light-only pipeline could never see, down to 8 — so every surface is captured
// in both themes rather than light with a token dark pass. Dark is set through
// the real pref (`c2c-v2-prefs`), which is what drives V2App's `dark` class AND
// the `data-theme` attribute the generated ramp keys off (V2App.tsx:756); a
// capture that forced only one of the two would photograph a state no user can
// reach and would hide the exact bug the review is about.
//
// It also captures the three states of ONE surface (loading, empty, failed)
// because open must-fix #3 is that they "still look like three different
// components" — a claim that needs pictures to settle. Those states are forced
// through page.route, which is the only way to photograph a failed read on
// demand; the rows in the populated shot are equally synthetic and labelled as
// such in the review. Nothing here is evidence about real customer data.
//
// Usage: DEV_EMAIL=<an account in this database> node <this file>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5000';
const OUT = process.env.OUT ?? path.resolve('.design/ui-polish-active-surfaces/screenshots');
fs.mkdirSync(OUT, { recursive: true });

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
];

// The review's scope: the active UI-v2 surfaces. Home and Projects are the two
// highest-traffic ones and both changed on 2026-09-07, so they are re-shot here
// as much to re-baseline as to close the gap.
const SURFACES = [
  { id: 'home', url: '/', wait: '.landing-greet' },
  { id: 'projects', url: '/concept2cure/projects', wait: '.pj-index' },
  { id: 'vault', url: '/concept2cure/vault', wait: null },
  { id: 'tasks', url: '/concept2cure/tasks', wait: null },
  { id: 'apps', url: '/concept2cure/apps', wait: null },
];

const BREAKPOINTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const expiry = new Date(Date.now() + (login.expiresIn || 86400) * 1000).toISOString();

async function makeCtx(dark, viewport) {
  const ctx = await browser.newContext({ viewport, colorScheme: dark ? 'dark' : 'light' });
  await ctx.addInitScript(([a, r, u, x, isDark]) => {
    for (const st of [localStorage, sessionStorage]) {
      st.setItem('trialsage_access_token', a);
      st.setItem('trialsage_refresh_token', r || '');
      st.setItem('trialsage_token_expiry', x);
      st.setItem('trialsage_user', JSON.stringify(u || {}));
    }
    // The REAL pref the shell reads, so the class and data-theme both follow.
    const prev = (() => { try { return JSON.parse(localStorage.getItem('c2c-v2-prefs') || '{}'); } catch { return {}; } })();
    localStorage.setItem('c2c-v2-prefs', JSON.stringify({ ...prev, dark: isDark }));
  }, [login.accessToken, login.refreshToken, login.user, expiry, dark]);
  return ctx;
}

const results = { shots: [], themeProof: {}, consoleErrors: [] };

for (const theme of ['light', 'dark']) {
  for (const bp of BREAKPOINTS) {
    const ctx = await makeCtx(theme === 'dark', { width: bp.width, height: bp.height });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => results.consoleErrors.push(`${theme}/${bp.name}: ${e.message}`));
    await page.route('**/api/c2c/projects*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: PROGRAMS }) }));

    for (const s of SURFACES) {
      await page.goto(`${BASE}${s.url}`, { waitUntil: 'networkidle' }).catch(() => {});
      if (s.wait) await page.waitForSelector(s.wait, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(900);

      // Proof the theme actually took — the review's root cause #1 was a shell
      // whose class said dark while the generated ramp stayed light, so a
      // screenshot alone would not have proved it.
      if (s.id === 'home' && bp.name === 'desktop') {
        results.themeProof[theme] = await page.evaluate(() => {
          const shell = document.querySelector('.c2c-v2');
          const cs = shell ? getComputedStyle(shell) : null;
          return {
            hasDarkClass: !!shell && shell.classList.contains('dark'),
            dataTheme: shell ? shell.getAttribute('data-theme') : null,
            bg000: cs ? cs.getPropertyValue('--bg-000').trim() : null,
            accent200: cs ? cs.getPropertyValue('--accent-200').trim() : null,
            bodyBg: getComputedStyle(document.body).backgroundColor,
          };
        });
      }

      const file = `review-${s.id}-${theme}-${bp.name}-${bp.width}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: true });
      results.shots.push(file);
    }
    await ctx.close();
  }
}

// ── Must-fix #3: do loading / empty / failed read as three different components? ──
for (const theme of ['light', 'dark']) {
  const ctx = await makeCtx(theme === 'dark', { width: 1280, height: 900 });
  const page = await ctx.newPage();
  let mode = 'loading';
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route('**/api/c2c/projects*', async (route) => {
    if (mode === 'loading') { await held; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }); }
    if (mode === 'empty') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'forced for review evidence' }) });
  });

  await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `review-projects-state-loading-${theme}-1280.png`), fullPage: true });
  results.shots.push(`review-projects-state-loading-${theme}-1280.png`);
  release();

  for (const m of ['empty', 'failed']) {
    mode = m;
    await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `review-projects-state-${m}-${theme}-1280.png`), fullPage: true });
    results.shots.push(`review-projects-state-${m}-${theme}-1280.png`);
  }
  await ctx.close();
}

fs.writeFileSync(path.join(OUT, 'capture-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ shots: results.shots.length, themeProof: results.themeProof, consoleErrors: results.consoleErrors }, null, 2));
await browser.close();
