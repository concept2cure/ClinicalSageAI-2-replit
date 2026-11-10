/**
 * D3-4 follow-up (2026-11-08): the two J1 phone rules moved from project-home-v2.css to app-v2.css, checked in the
 * running app at 390 with touch. The project page's Submit step has no horizontal scroll and its doors wrap under the
 * heading; New project's filing tabs scroll sideways inside their row and are not shrunk.
 *
 *   node docs/evidence/DESIGN/D3/D3-4/css-move-check.cjs [base-url] [programId]
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PROGRAM = process.argv[3];
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) });
    const j = await r.json();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', new Date(Date.now() + 864e5).toISOString()); s.setItem('trialsage_user', JSON.stringify(j.user));
    }
  });
  await page.goto(`${BASE}/concept2cure/project-home?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  await page.locator('.pj-lc-stage', { hasText: 'Submit' }).click();
  await page.waitForTimeout(1500);
  const submit = await page.evaluate(() => {
    const inner = document.querySelector('.page-inner.pj');
    const head = document.querySelector('[data-testid="pj-markets"] .pj-sec-h');
    return { hScroll: inner.scrollWidth - inner.clientWidth, wrap: window.getComputedStyle(head).flexWrap };
  });
  expect(submit.hScroll <= 1 && submit.wrap === 'wrap', `Submit at 390: no sideways scroll, head wraps (${JSON.stringify(submit)})`);
  await page.locator('[data-testid="pj-markets"]').evaluate((n) => n.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'css-move-390-submit.png') });
  await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /New project/ }).first().click();
  const tabs = page.locator('.npw .rpk-tabs');
  await tabs.waitFor({ timeout: 20000 });
  const row = await tabs.evaluate((t) => ({ overflowX: window.getComputedStyle(t).overflowX, scrolls: t.scrollWidth > t.clientWidth,
    shrink: window.getComputedStyle(t.firstElementChild).flexShrink }));
  expect(row.overflowX === 'auto' && row.scrolls && row.shrink === '0', `the filing tabs scroll sideways (${JSON.stringify(row)})`);
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'css-move-390-new-project.png') });
  console.info(`ok  Submit ${JSON.stringify(submit)}; New project tabs ${JSON.stringify(row)}`);
  await browser.close();
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
