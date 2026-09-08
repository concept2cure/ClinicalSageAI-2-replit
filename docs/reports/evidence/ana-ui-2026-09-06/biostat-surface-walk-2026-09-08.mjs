// The Biostatistics surface against live data: the design list, the assessment
// panel, its gaps and filing placements, the statistical review, and the two
// governed write-backs driven from the UI.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5000';
const OUT = process.env.OUT ?? path.resolve('shots-biostat');
const PID = 'ab75896b-d316-49f9-b6a9-229ee3359e0e';
fs.mkdirSync(OUT, { recursive: true });

const login = await fetch(`${BASE}/api/auth/dev-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@concept2cure.pro' }),
}).then((r) => r.json());
if (!login.accessToken) { console.error('dev-login failed', login); process.exit(1); }

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const expiry = new Date(Date.now() + (login.expiresIn || 86400) * 1000).toISOString();
await ctx.addInitScript(([a, r, u, x, pid]) => {
  for (const st of [localStorage, sessionStorage]) {
    st.setItem('trialsage_access_token', a);
    st.setItem('trialsage_refresh_token', r || '');
    st.setItem('trialsage_token_expiry', x);
    st.setItem('trialsage_user', JSON.stringify(u || {}));
  }
  sessionStorage.setItem('c2c.shell-project', JSON.stringify({ id: pid, title: 'BX-301 Oncology IND' }));
}, [login.accessToken, login.refreshToken, login.user, expiry, PID]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
const api = [];
page.on('response', (r) => {
  if (r.url().includes('/api/biostat-bridge')) api.push({ url: r.url().replace(BASE, ''), status: r.status() });
});

const out = { errors, api };
await page.goto(`${BASE}/concept2cure/biostatistics`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.c2c-v2.shell', { timeout: 30000 });
await page.waitForTimeout(4000);

out.list = await page.evaluate(() => {
  const text = document.body.textContent || '';
  return {
    designRows: [...document.querySelectorAll('.sp-row, [class*="design"] button')].slice(0, 8).map((n) => n.textContent.trim().slice(0, 90)).filter(Boolean),
    hasReadinessChip: Boolean(document.querySelector('.rd-chip')),
    chips: [...document.querySelectorAll('.rd-chip')].map((n) => n.textContent.trim()).slice(0, 6),
    honestEmpty: text.includes("Couldn't load study designs") || text.includes('No study designs'),
    heading: document.querySelector('.page h1, h1')?.textContent?.trim().slice(0, 80) ?? null,
  };
});
await page.screenshot({ path: path.join(OUT, 'biostat-list.png'), fullPage: false });

// Open the first design.
const first = page.locator('.rd-chip').first();
const clickable = page.locator('button:has(.rd-chip)').first();
if (await clickable.count()) { await clickable.click(); } else if (await first.count()) { await first.click(); }
await page.waitForTimeout(3500);
out.panel = await page.evaluate(() => {
  const text = document.body.textContent || '';
  return {
    gapsShown: /gap|blocking|defaulted/i.test(text),
    placements: [...document.querySelectorAll('[class*="placement"], .sp-row')].slice(0, 8).map((n) => n.textContent.trim().slice(0, 70)).filter(Boolean),
    reviewTable: Boolean(document.querySelector('table')) || /Statistical review|reviewer/i.test(text),
    applyButton: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /sample size|apply/i.test(t)).slice(0, 4),
    taskButton: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /task/i.test(t)).slice(0, 4),
  };
});
await page.screenshot({ path: path.join(OUT, 'biostat-panel.png'), fullPage: false });

fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
