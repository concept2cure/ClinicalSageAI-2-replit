// Shared QA harness (QA 2026-10-08, walk 2; kept beside the scripts that import it): drive the real app in headless Chromium as a signed-in user,
// and record what breaks — console errors, page errors, failed /api calls — with
// screenshots. Each journey script imports this and writes under its own OUT dir.
//
//   APP_URL     default http://localhost:5077
//   SERVER_LOG  the app's log (the dev sign-in code is read from it)
//   OUT         this journey's evidence folder
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire('/opt/node22/lib/node_modules/playwright/package.json');
export const { chromium } = require('playwright-core');

export const BASE = process.env.APP_URL || 'http://localhost:5077';
export const SERVER_LOG = process.env.SERVER_LOG || '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/2dce5675-71af-532e-b288-abcf4efad803/scratchpad/qa/server.log';
export const OUT = process.env.OUT || '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/2dce5675-71af-532e-b288-abcf4efad803/scratchpad/qa/out';
fs.mkdirSync(path.join(OUT, 'screens'), { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const say = (...a) => console.info(new Date().toISOString().slice(11, 19), ...a);

// No password is written here: the seed user's comes from the environment.
export const SEED_USER = { email: 'jm.smith@concept2cure.pro', password: process.env.QA_SEED_PASSWORD };

function otps() {
  const log = fs.existsSync(SERVER_LOG) ? fs.readFileSync(SERVER_LOG, 'utf8') : '';
  return [...log.matchAll(/"code":"(\d{6})"[^\n]*Dev OTP code|Dev OTP code[^\n]*"code":"(\d{6})"/g)].map((m) => m[1] || m[2]);
}

/** Sign in through the real form (password, then the emailed code read from the dev log). Returns a context. */
export async function signIn(browser, user = SEED_USER) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/concept2cure/login?returnTo=%2Fconcept2cure`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-email', { timeout: 120000 });
  const seen = otps().length;
  await page.fill('#login-email', user.email);
  await page.fill('#login-password', user.password);
  await page.click('button:has-text("Sign in")');
  let otp = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (!/\/login/.test(page.url())) break; // no second factor asked
    const all = otps();
    if (all.length > seen) { otp = all[all.length - 1]; break; }
  }
  if (otp) {
    const digits = page.locator('input[maxlength="1"]:visible');
    for (let i = 0; i < 6; i++) {
      await digits.nth(i).click();
      await page.keyboard.type(otp[i]);
    }
    await sleep(800);
    if (/\/login/.test(page.url())) {
      const verify = page.locator('button:has-text("Verify")');
      if (await verify.isEnabled().catch(() => false)) await verify.click().catch(() => {});
    }
  }
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 60000 });
  await page.close();
  return ctx;
}

/** A page whose console errors, page errors and failed /api calls are recorded in `log`. */
export async function watchedPage(ctx, log) {
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') log.push({ kind: 'console', text: m.text().slice(0, 500), url: page.url() }); });
  page.on('pageerror', (e) => log.push({ kind: 'pageerror', text: String(e).slice(0, 500), url: page.url() }));
  page.on('response', async (r) => {
    const u = r.url();
    if (!u.includes('/api/') || r.status() < 400) return;
    let body = '';
    try { body = (await r.text()).slice(0, 400); } catch { /* streamed */ }
    log.push({ kind: 'http', status: r.status(), method: r.request().method(), url: u.replace(BASE, ''), body, at: page.url() });
  });
  page.on('requestfailed', (r) => { if (r.url().includes('/api/')) log.push({ kind: 'requestfailed', url: r.url().replace(BASE, ''), error: r.failure()?.errorText }); });
  return page;
}

let shot = 0;
/** Screenshot plus the visible text, named in order. */
export async function snap(page, name) {
  shot += 1;
  const base = path.join(OUT, 'screens', `${String(shot).padStart(2, '0')}-${name.replace(/[^a-z0-9-]+/gi, '-')}`);
  await page.screenshot({ path: `${base}.png`, fullPage: false }).catch(() => {});
  const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  fs.writeFileSync(`${base}.txt`, text);
  return `${base}.png`;
}

export function writeLog(name, log) {
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(log, null, 2));
}
