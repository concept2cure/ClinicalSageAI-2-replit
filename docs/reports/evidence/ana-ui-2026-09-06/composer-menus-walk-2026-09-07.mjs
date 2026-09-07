// Real-browser check of the composer's `@app` and `/command` menus, and of the
// server reading the same mention back. Signs in through dev-login; nothing is
// mocked. Writes screenshots + a JSON row of what was measured.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5000';
const OUT = process.env.OUT ?? path.resolve('shots-composer');
fs.mkdirSync(OUT, { recursive: true });

const login = await fetch(`${BASE}/api/auth/dev-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo@concept2cure.pro' }),
}).then((r) => r.json());
if (!login.accessToken) { console.error('dev-login failed', login); process.exit(1); }

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const expiry = new Date(Date.now() + (login.expiresIn || 86400) * 1000).toISOString();
await ctx.addInitScript(([a, r, u, x]) => {
  localStorage.setItem('c2c-v2-prefs', JSON.stringify({ anaOpen: true }));
  for (const st of [localStorage, sessionStorage]) {
    st.setItem('trialsage_access_token', a);
    st.setItem('trialsage_refresh_token', r || '');
    st.setItem('trialsage_token_expiry', x);
    st.setItem('trialsage_user', JSON.stringify(u || {}));
  }
}, [login.accessToken, login.refreshToken, login.user, expiry]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
const streamBodies = [];
page.on('request', (req) => {
  if (req.method() === 'POST' && /ana-ri\/stream|\/api\/ana/.test(req.url())) {
    streamBodies.push({ url: req.url(), body: (req.postData() || '').slice(0, 600) });
  }
});

const result = { errors, steps: {} };
await page.goto(`${BASE}/concept2cure/home`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.c2c-v2.shell', { timeout: 30000 });
await page.waitForTimeout(2000);

async function menuState(id) {
  return page.evaluate((id) => {
    const m = document.getElementById(id);
    if (!m) return null;
    const opts = [...m.querySelectorAll('[role="option"]')];
    return {
      role: m.getAttribute('role'), label: m.getAttribute('aria-label'),
      header: m.querySelector('.ana-menu-sec')?.textContent?.trim(),
      options: opts.map((o) => o.textContent.trim().slice(0, 60)),
      active: opts.findIndex((o) => o.getAttribute('aria-selected') === 'true'),
      inViewport: (() => { const r = m.getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth && r.bottom <= innerHeight; })(),
    };
  }, id);
}

// 1. Landing composer: @ opens the app list, Enter inserts the label.
const landing = page.locator('.landing-composer textarea').first();
await landing.click();
await landing.type('@bio', { delay: 40 });
await page.waitForTimeout(300);
result.steps.landingAt = await menuState('landing-mentions');
await page.screenshot({ path: path.join(OUT, 'landing-at-menu.png') });
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
result.steps.landingAtValue = await landing.inputValue();
result.steps.landingMenuAfterEnter = await menuState('landing-mentions');
await landing.fill('');

// 2. Rail composer: leading / opens the command list, Tab inserts the command.
const rail = page.locator('.ana textarea').first();
await rail.click();
await rail.type('/pow', { delay: 40 });
await page.waitForTimeout(300);
result.steps.railSlash = await menuState('ana-rail-mentions');
await page.screenshot({ path: path.join(OUT, 'rail-slash-menu.png') });
await page.keyboard.press('Tab');
await page.waitForTimeout(200);
result.steps.railSlashValue = await rail.inputValue();
// A / after the first word offers nothing.
await rail.fill('');
await rail.type('run /pow', { delay: 20 });
await page.waitForTimeout(250);
result.steps.railSlashMidSentence = await menuState('ana-rail-mentions');
await rail.fill('');

// 3. The + menu's "Slash commands" starts a / in the rail composer.
const plus = page.locator('.ana button[aria-label*="Attach"], .ana button[title*="Attach"], .ana .ana-plus, .ana button:has-text("+")').first();
if (await plus.count()) {
  await plus.click();
  await page.waitForTimeout(200);
  const item = page.locator('.ana-menu-item:has-text("Slash commands")').first();
  if (await item.count()) {
    await item.click();
    await page.waitForTimeout(400);
    result.steps.plusSlash = { value: await rail.inputValue(), menu: await menuState('ana-rail-mentions') };
    await page.screenshot({ path: path.join(OUT, 'rail-plus-slash.png') });
  } else result.steps.plusSlash = 'menu item not found';
  await page.keyboard.press('Escape');
} else result.steps.plusSlash = 'plus button not found';
await rail.fill('');

// 4. Send a hand-typed alias mention; the server must read it back.
await rail.type('@biostats size a two-arm superiority study', { delay: 10 });
await page.keyboard.press('Escape'); // close any menu; the text stays
await page.keyboard.press('Enter');
await page.waitForTimeout(4000);
result.steps.sentBodies = streamBodies;
await page.screenshot({ path: path.join(OUT, 'rail-after-send.png') });

fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
