// Shared browser helper: open a page with the saved session, record /api failures.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('/opt/node22/lib/node_modules/playwright/package.json');
const { chromium } = require('playwright-core');
export const BASE = process.env.APP_URL || 'http://localhost:5078';
export const OUT = process.env.OUT;
fs.mkdirSync(path.join(OUT, 'screens'), { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function open() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: process.env.STATE });
  const page = await ctx.newPage();
  const log = [];
  page.on('pageerror', (e) => log.push({ kind: 'pageerror', text: String(e).slice(0, 300) }));
  page.on('response', async (r) => {
    const u = r.url();
    if (!u.includes('/api/') || r.status() < 400) return;
    let body = ''; try { body = (await r.text()).slice(0, 300); } catch {}
    log.push({ kind: 'http', status: r.status(), method: r.request().method(), url: u.replace(BASE, ''), body });
  });
  return { browser, ctx, page, log, done: async () => browser.close() };
}
export async function snap(page, name) {
  const base = path.join(OUT, 'screens', name.replace(/[^a-z0-9-]+/gi, '-'));
  await page.screenshot({ path: `${base}.png`, fullPage: false }).catch(() => {});
  const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  fs.writeFileSync(`${base}.txt`, text);
  return base;
}
