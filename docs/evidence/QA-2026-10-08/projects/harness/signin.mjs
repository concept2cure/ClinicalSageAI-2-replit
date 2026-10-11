// Sign in through the real login form (password + dev OTP from the server log); save the session.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/opt/node22/lib/node_modules/playwright/package.json');
const { chromium } = require('playwright-core');
const LOG = process.env.SERVER_LOG;
const BASE = process.env.APP_URL || 'http://localhost:5078';
const EMAIL = process.env.EMAIL;
const otps = () => {
  const t = fs.readFileSync(LOG, 'utf8');
  return [...t.matchAll(/Dev OTP code[^\n]*?"code":"(\d{6})"|"code":"(\d{6})"[^\n]*?Dev OTP code/g)].map((m) => m[1] || m[2]);
};
const seen = otps().length;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/concept2cure/login?returnTo=%2Fconcept2cure`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#login-email', { timeout: 120000 });
await page.fill('#login-email', EMAIL);
await page.fill('#login-password', process.env.PW);
await page.click('button:has-text("Sign in")');
let otp = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (!/\/login/.test(page.url())) break;
  const all = otps();
  if (all.length > seen) { otp = all[all.length - 1]; break; }
}
console.info('otp found:', otp ? 'yes' : 'no');
if (otp) {
  const digits = page.locator('input[maxlength="1"]:visible');
  for (let i = 0; i < 6; i++) { await digits.nth(i).click(); await page.keyboard.type(otp[i]); }
  await new Promise((r) => setTimeout(r, 800));
}
await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
console.info('signed in, url:', page.url());
await ctx.storageState({ path: process.env.STATE });
await browser.close();
