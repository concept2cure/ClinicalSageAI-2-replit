/* Task 86: a rail work area clicked in a browser that never opened a project. One sign-in, then a
   fresh context per entry from that saved state (signed in, nothing remembered), from Home. */
const fs = require('fs');
const S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/787f5dd9-ee05-54b6-8bf9-81340ad671c0/scratchpad';
const { chromium } = require(S + '/pwtest/node_modules/playwright');
const BASE = 'http://127.0.0.1:5100';
const OUT = S + '/walk-1109-evidence/rail86/' + (process.env.TAG || 'before'); // TAG=before on trunk, TAG=after with this change
const STATE = S + '/walk-1109-evidence/rail86/state.json';
const ENTRIES = ['CMC / Module 3', 'Vault', 'Quality', 'Biostatistics', 'Submission Center', 'Risk-based monitoring'];
const W = { width: Number(process.env.WIDTH || 1440), height: 900 };

async function signIn(browser) {
  const ctx = await browser.newContext({ viewport: W });
  const page = await ctx.newPage();
  await page.goto(BASE + '/concept2cure/login', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('input[type=email]', { timeout: 120000 });
  await page.fill('input[type=email]', 'jm.smith@concept2cure.pro');
  await page.fill('input[autocomplete="current-password"]', fs.readFileSync(S + '/d0-before-admin-pw.txt', 'utf8').trim());
  await page.click('button[type=submit]');
  await page.waitForTimeout(6000);
  await ctx.storageState({ path: STATE });
  await ctx.close();
}

async function entry(browser, name) {
  const ctx = await browser.newContext({ viewport: W, storageState: STATE });
  const page = await ctx.newPage();
  const api = []; const cons = [];
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) api.push(`${r.status()} ${r.url().replace(BASE, '').slice(0, 120)}`); });
  page.on('console', (m) => { if (m.type() === 'error') cons.push(m.text().slice(0, 160)); });
  await page.goto(BASE + '/concept2cure', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.c2c-v2', { timeout: 60000 });
  await page.waitForTimeout(3000);
  const before = await page.evaluate(() => ({ lastProject: localStorage.getItem('c2c.last-project'), open: Boolean(window.C2C_PROJECT) }));
  await page.locator('nav[aria-label="Primary"]').getByRole('button', { name: name, exact: true }).first().click();
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => ({
    url: location.pathname + location.search,
    h1: document.querySelector('h1, .ph-title')?.textContent.trim().slice(0, 80) ?? null,
    project: window.C2C_PROJECT ? (window.C2C_PROJECT.title || String(window.C2C_PROJECT.id)) : null,
    notice: [...document.querySelectorAll('[role="status"], [role="alert"], .toast, .notice')].map((e) => e.textContent.trim()).filter((t) => /project/i.test(t)).slice(0, 2),
  }));
  const file = `${OUT}/${name.replace(/[^A-Za-z]+/g, '-').toLowerCase()}.png`;
  await page.screenshot({ path: file });
  await ctx.close();
  return { entry: name, before, ...r, apiFailures: api, consoleErrors: cons.slice(0, 4) };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  if (!process.env.REUSE) await signIn(browser);
  const results = [];
  for (const name of ENTRIES) results.push(await entry(browser, name));
  await browser.close();
  fs.writeFileSync(OUT + '/rail86.json', JSON.stringify(results, null, 1));
  for (const r of results) console.info(`${r.entry} -> ${r.url} | h1 ${r.h1} | project ${r.project} | notice ${r.notice.join(' / ') || '-'} | api>=400 ${r.apiFailures.length}`);
})().catch((e) => { console.error('ERR', String(e).slice(0, 500)); process.exit(1); });
