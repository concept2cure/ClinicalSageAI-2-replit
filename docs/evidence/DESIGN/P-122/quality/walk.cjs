// P-122 Quality walk: before/after screenshots at 1440 and 390, light and dark.
// Usage: NODE_PATH=$(npm root -g) node walk.cjs <phase: before|after> <outdir>
// Needs WALK_PASSWORD (never printed) and BASE (default http://localhost:5263).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:5263';
const PW = process.env.WALK_PASSWORD;
const [phase, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const LMN201 = 'af5db78f-529b-45a2-a1f0-fede3f15181b'; // [Demo · Lumen] LMN-201: the project with QMS data
const NEUR = '747737b6-7d3a-431d-9082-3b8a102b771f';   // the organisation's IVD 510(k) project
const log = { phase, apiErrors: [], pageErrors: [], shots: [], texts: {} };

async function signIn(browser, width, dark) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const page = await ctx.newPage();
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) log.apiErrors.push({ width, dark, status: r.status(), url: r.url().replace(BASE, ''), at: page.url().replace(BASE, '') }); });
  page.on('pageerror', (e) => log.pageErrors.push({ width, dark, message: e.message.slice(0, 300) }));
  await page.goto(`${BASE}/concept2cure/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.locator('input[type=email]').fill('rr5-author@example.test');
  await page.locator('input[type=password]').fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 60000 });
  await page.evaluate((dark) => {
    const raw = localStorage.getItem('c2c-v2-prefs');
    const prefs = raw ? JSON.parse(raw) : {};
    prefs.dark = dark;
    if (window.innerWidth <= 640) prefs.railCollapsed = true;
    localStorage.setItem('c2c-v2-prefs', JSON.stringify(prefs));
  }, dark);
  return { ctx, page };
}
async function open(page, url) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(2500);
}
async function shot(page, name, full = false) {
  const file = path.join(out, `${phase}-${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  log.shots.push(path.basename(file));
}
async function text(page, key) {
  log.texts[key] = (await page.evaluate(() => (document.querySelector('main') || document.body).innerText)).replace(/\s+/g, ' ').slice(0, 1500);
}
async function tab(page, name) {
  const t = page.getByRole('tab', { name, exact: true });
  if (await t.count()) { await t.first().click(); await page.waitForTimeout(2000); return true; }
  return false;
}

(async () => {
  if (!PW) throw new Error('WALK_PASSWORD is not set');
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      for (const dark of [false, true]) {
        const theme = dark ? 'dark' : 'light';
        const { ctx, page } = await signIn(browser, width, dark);
        // Quality, opened with a project open (the demo's Lumen project).
        await open(page, `/concept2cure/quality?program=${LMN201}`);
        await shot(page, `quality-sop-${width}-${theme}`);
        if (width === 1440 && !dark) await text(page, 'quality-sop');
        if (await tab(page, 'CAPA')) {
          await shot(page, `quality-capa-${width}-${theme}`);
          if (width === 1440 && !dark) await text(page, 'quality-capa');
        }
        if (await tab(page, 'Complaints and MDR')) {
          await shot(page, `quality-complaints-${width}-${theme}`);
          if (width === 1440 && !dark) await text(page, 'quality-complaints');
        }
        // Post-market surveillance on the organisation's device project.
        await open(page, `/concept2cure/device-postmarket?program=${NEUR}`);
        await shot(page, `postmarket-${width}-${theme}`, width === 1440);
        if (width === 1440 && !dark) await text(page, 'postmarket');
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, `${phase}-walk.log.json`), JSON.stringify(log, null, 2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
