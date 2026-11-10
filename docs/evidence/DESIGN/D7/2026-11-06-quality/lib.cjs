// Shared helpers for the Quality walk (scratchpad only; the evidence copy is filed with the README).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:5200';
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/b1307220-5e64-529c-803c-1399ed66d988/scratchpad/walk/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const PW = process.env.WALK_PASSWORD;
const PEOPLE = {
  author: 'author@qs.test',
  approver: 'approver@qs.test',
  trainee: 'trainee@qs.test',
};
const log = { apiErrors: [], pageErrors: [], steps: [] };

async function shot(page, name, full = true) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });
}
async function signIn(browser, who, width = 1440) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const page = await ctx.newPage();
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) log.apiErrors.push({ who, width, status: r.status(), url: r.url().replace(BASE, ''), at: page.url().replace(BASE, '') }); });
  page.on('pageerror', (e) => log.pageErrors.push({ who, width, message: e.message.slice(0, 300) }));
  await page.goto(`${BASE}/concept2cure/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type=email]').fill(PEOPLE[who]);
  await page.locator('input[type=password]').fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  return { ctx, page };
}
/** A real route, as the signed-in person, through the page's own bearer. */
async function api(page, method, url, body) {
  return page.evaluate(async ({ method, url, body }) => {
    const token = localStorage.getItem('trialsage_access_token');
    const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const json = await r.json().catch(() => null);
    return { status: r.status, body: json };
  }, { method, url, body });
}
async function run(name, fn) {
  const browser = await chromium.launch();
  try { await fn(browser); log.steps.push({ name, ok: true }); }
  catch (e) { log.steps.push({ name, ok: false, error: String(e && e.message || e).slice(0, 600) }); console.error(name, e); }
  finally { await browser.close(); fs.writeFileSync(path.join(SHOTS, `${name}.log.json`), JSON.stringify(log, null, 2)); }
}
module.exports = { BASE, SHOTS, PEOPLE, log, shot, signIn, api, run };
