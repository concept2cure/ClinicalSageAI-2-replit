// Scratch harness for driving the product in headless Chromium (W5/D7 IND lane).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

export const BASE = process.env.BASE || 'http://localhost:5000';
export const OUT = process.env.OUT || path.resolve('out');
fs.mkdirSync(OUT, { recursive: true });

export async function devLogin(email = 'jm.smith@concept2cure.pro') {
  const dl = await (await fetch(`${BASE}/api/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email }),
  })).json();
  if (!dl.accessToken) throw new Error('dev-login failed: ' + JSON.stringify(dl));
  const sess = await (await fetch(`${BASE}/api/v1/auth/session`, {
    headers: { Authorization: `Bearer ${dl.accessToken}`, Origin: BASE },
  })).json();
  return { token: dl.accessToken, refresh: dl.refreshToken, user: sess.user };
}

export async function api(token, method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method, headers: { Authorization: `Bearer ${token}`, Origin: BASE, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

export async function openBrowser({ video = false, email } = {}) {
  const auth = await devLogin(email);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, acceptDownloads: true,
    ...(video ? { recordVideo: { dir: path.join(OUT, 'video'), size: { width: 1440, height: 900 } } } : {}),
  });
  const expiry = new Date(Date.now() + 23 * 3600 * 1000).toISOString();
  await context.addInitScript(([t, r, e, u]) => {
    for (const s of [window.localStorage, window.sessionStorage]) {
      s.setItem('trialsage_access_token', t); s.setItem('trialsage_refresh_token', r);
      s.setItem('trialsage_token_expiry', e); s.setItem('trialsage_user', u);
    }
  }, [auth.token, auth.refresh, expiry, JSON.stringify(auth.user)]);
  const page = await context.newPage();
  const log = { console: [], failed: [] };
  let stage = 'start';
  page.on('console', (m) => { if (m.type() === 'error') log.console.push(`[${stage}] ${m.text().slice(0, 300)}`); });
  page.on('requestfailed', (r) => log.failed.push(`[${stage}] ${r.failure()?.errorText} ${r.method()} ${r.url().slice(0, 160)}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) log.failed.push(`[${stage}] ${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`); });
  return { browser, context, page, auth, log, setStage: (s) => { stage = s; } };
}

export async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

export async function mainText(page, max = 4000) {
  const t = await page.evaluate(() => (document.querySelector('main') || document.body).innerText);
  return t.replace(/\n{2,}/g, '\n').slice(0, max);
}

export async function settle(page, ms = 1500) {
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch { /* keep going */ }
  await page.waitForTimeout(ms);
}
