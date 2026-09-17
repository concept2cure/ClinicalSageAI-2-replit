// The other half of the E1 loop: a conversation STARTED with a project open
// must carry that program to the server (so it is minted into the project's
// list), and a RESUMED conversation must continue the same thread rather than
// minting a second one. Captures the real POST bodies.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5000';
const OUT = process.env.OUT ?? path.resolve('shots-send');
const PID = 'ab75896b-d316-49f9-b6a9-229ee3359e0e';
fs.mkdirSync(OUT, { recursive: true });

const login = await fetch(`${BASE}/api/auth/dev-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@concept2cure.pro' }),
}).then((r) => r.json());
if (!login.accessToken) { console.error('dev-login failed', login); process.exit(1); }

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
  sessionStorage.setItem('c2c.shell-project', JSON.stringify({ id: pid, title: 'BX-301 Oncology IND' }));
}, [login.accessToken, login.refreshToken, login.user, expiry, PID]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
const sends = [];
page.on('request', (r) => {
  if (r.method() === 'POST' && r.url().endsWith('/api/ana-ri/stream')) {
    let b = {};
    try { b = JSON.parse(r.postData() || '{}'); } catch { b = { unparsed: (r.postData() || '').slice(0, 200) }; }
    sends.push({ message: b.message, project_id: b.project_id ?? null, thread_id: b.thread_id ?? null, screen: b.context?.screen ?? null });
  }
});

const out = { programId: PID, errors, sends: {} };
await page.goto(`${BASE}/concept2cure/project-home`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.c2c-v2.shell', { timeout: 30000 });
await page.waitForTimeout(3000);

// 1. New conversation from the project landing composer.
const pj = page.locator('.pj-composer textarea, .pj-convo textarea').first();
out.projectComposerFound = (await pj.count()) > 0;
if (out.projectComposerFound) {
  await pj.click();
  await pj.type('Start a new conversation about the IND timeline', { delay: 10 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  out.afterProjectSend = { url: page.url().replace(BASE, ''), convo: await page.evaluate(() => window.C2C_CONVO ?? null) };
  await page.screenshot({ path: path.join(OUT, 'project-send.png') });
}
out.sends.new = sends.slice();

// 2. Continue a RESUMED conversation.
sends.length = 0;
await page.goto(`${BASE}/concept2cure/project-home`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.c2c-v2.shell', { timeout: 30000 });
await page.waitForTimeout(3000);
const row = page.locator('[data-testid="pj-threads"] .pj-file').first();
if (await row.count()) {
  await row.click();
  await page.waitForTimeout(3000);
  const ta = page.locator('.ct-composer textarea').first();
  if (await ta.count()) {
    await ta.click();
    await ta.type('And what about the CMC section?', { delay: 10 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT, 'resumed-send.png') });
  } else out.resumedComposer = 'not found';
}
out.sends.resumed = sends.slice();

fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
