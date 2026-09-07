// Real-browser check of E1: the project landing lists the open program's own
// conversations and resumes one.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5000';
const OUT = process.env.OUT ?? path.resolve('shots-threads');
const PID = 'ab75896b-d316-49f9-b6a9-229ee3359e0e';
fs.mkdirSync(OUT, { recursive: true });

const login = await fetch(`${BASE}/api/auth/dev-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@concept2cure.pro' }),
}).then((r) => r.json());
if (!login.accessToken) { console.error('dev-login failed', login); process.exit(1); }

// The API the surface reads, checked directly first.
const api = await fetch(`${BASE}/api/chat/threads?program_id=${PID}&limit=8`, {
  headers: { Authorization: `Bearer ${login.accessToken}` },
}).then(async (r) => ({ status: r.status, body: await r.json() }));
const apiBad = await fetch(`${BASE}/api/chat/threads?program_id=42&limit=8`, {
  headers: { Authorization: `Bearer ${login.accessToken}` },
}).then(async (r) => ({ status: r.status, body: await r.json() }));

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const expiry = new Date(Date.now() + (login.expiresIn || 86400) * 1000).toISOString();
await ctx.addInitScript(([a, r, u, x, pid]) => {
  for (const st of [localStorage, sessionStorage]) {
    st.setItem('trialsage_access_token', a);
    st.setItem('trialsage_refresh_token', r || '');
    st.setItem('trialsage_token_expiry', x);
    st.setItem('trialsage_user', JSON.stringify(u || {}));
  }
  // The shell's per-tab mirror of the open program (shellProject.ts).
  sessionStorage.setItem('c2c.shell-project', JSON.stringify({ id: pid, title: 'BX-301 Oncology IND' }));
}, [login.accessToken, login.refreshToken, login.user, expiry, PID]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
const reads = [];
page.on('request', (r) => { if (r.url().includes('/api/chat/threads')) reads.push(r.url().replace(BASE, '')); });

const out = { api, apiBad, errors, reads };
await page.goto(`${BASE}/concept2cure/project-home`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.c2c-v2.shell', { timeout: 30000 });
await page.waitForTimeout(3500);

out.landing = await page.evaluate(() => {
  const list = document.querySelector('[data-testid="pj-threads"]');
  const rows = [...(list?.querySelectorAll('.pj-file') ?? [])].map((b) => ({
    title: b.querySelector('.pj-file-n')?.textContent?.trim(),
    meta: b.querySelector('.pj-file-m')?.textContent?.trim(),
  }));
  const convo = document.querySelector('.pj-convo');
  const grid = document.querySelector('.pj-grid');
  return {
    rows,
    emptyState: document.body.textContent.includes('No project conversations yet'),
    errorState: document.body.textContent.includes("Couldn't load conversations"),
    ringInAside: Boolean(document.querySelector('.pj-side .pj-map-ring')),
    ringInMain: Boolean(document.querySelector('.pj-main .pj-map-ring')),
    composerBeforeGrid: Boolean(convo && grid && (convo.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING)),
  };
});
await page.screenshot({ path: path.join(OUT, 'project-landing.png'), fullPage: false });

// Resume the first conversation.
const first = page.locator('[data-testid="pj-threads"] .pj-file').first();
if (await first.count()) {
  await first.click();
  await page.waitForTimeout(3000);
  out.resumed = await page.evaluate(() => ({
    convo: window.C2C_CONVO ?? null,
    url: location.pathname,
    surface: document.querySelector('.c2c-v2.shell')?.getAttribute('data-surface') ?? null,
    // The resumed thread's own messages, as rendered.
    turns: [...document.querySelectorAll('.ct-turn')].slice(0, 6).map((n) => n.textContent.trim().slice(0, 90)),
    bodyHasSeed: document.body.textContent.includes('Module 2.5 clinical overview'),
  }));
  await page.screenshot({ path: path.join(OUT, 'resumed-thread.png'), fullPage: false });
} else out.resumed = 'no thread rows to click';

fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
