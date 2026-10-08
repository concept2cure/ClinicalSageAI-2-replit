// Real-form sign-in, then record the roles the client holds after login and after a reload
// (the reload triggers GET /api/v1/auth/session in the client bootstrap). Password from env DPW.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const BASE = 'http://localhost:5077';
const EMAIL = process.env.QA_EMAIL;
const PW = process.env.DPW;
const OUT = process.env.OUT_DIR;
if (!EMAIL || !PW || !OUT) throw new Error('QA_EMAIL, DPW, OUT_DIR required');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

const sessionCalls = [];
const loginCalls = [];
page.on('response', async (r) => {
  const u = r.url();
  if (u.includes('/api/v1/auth/session') || u.includes('/api/v1/auth/login')) {
    let body = null;
    try { body = await r.json(); } catch {}
    const rec = { url: u.replace(BASE, ''), status: r.status(), roles: body?.user?.roles ?? null, permissions: body?.user?.permissions ?? null };
    (u.includes('/session') ? sessionCalls : loginCalls).push(rec);
  }
});

const storedUser = async () =>
  page.evaluate(() => {
    const keys = Object.keys(localStorage).concat(Object.keys(sessionStorage));
    const hits = {};
    for (const k of keys) {
      if (!/user|auth|session/i.test(k)) continue;
      const raw = localStorage.getItem(k) ?? sessionStorage.getItem(k);
      try {
        const v = JSON.parse(raw);
        if (v && typeof v === 'object' && (v.roles || v.user?.roles)) hits[k] = { roles: v.roles ?? v.user?.roles, permissions: v.permissions ?? v.user?.permissions ?? null };
      } catch {}
    }
    return hits;
  });

await page.goto(BASE + '/concept2cure/login', { waitUntil: 'domcontentloaded' });
await page.fill('#login-email', EMAIL);
await page.fill('#login-password', PW);
await page.click('button:has-text("Sign in")');
await page.waitForTimeout(4000);
console.log('after sign-in URL:', page.url());
const afterLogin = await storedUser();
console.log('stored user after sign-in:', JSON.stringify(afterLogin));
await page.screenshot({ path: `${OUT}/02-after-signin.png` });

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
console.log('after reload URL:', page.url());
const afterReload = await storedUser();
console.log('stored user after reload:', JSON.stringify(afterReload));
await page.screenshot({ path: `${OUT}/03-after-reload.png` });

console.log('login calls:', JSON.stringify(loginCalls));
console.log('session calls:', JSON.stringify(sessionCalls));
fs.writeFileSync(`${OUT}/flow.json`, JSON.stringify({ email: EMAIL, afterLogin, afterReload, loginCalls, sessionCalls }, null, 2));
await browser.close();
