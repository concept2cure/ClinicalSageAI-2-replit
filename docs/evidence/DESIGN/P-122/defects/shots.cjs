/**
 * P-122 defects: before-and-after screenshots at 1440 and 390 px, light and dark.
 *
 *   PW_FILE=<file holding the password> node docs/evidence/DESIGN/P-122/defects/shots.cjs <base-url> <before|after> [view...]
 *
 * Signs in through the sign-in form as the demo author (the password is read from PW_FILE and never printed), then
 * captures each view as an element screenshot, so the whole section is in the picture at either width:
 *   schedule-c2c101, schedule-lmn201  the project page's Plan step, its Schedule section (C2C-101, LMN-201);
 *   cmc-approvals                     CMC Overview's Section approvals table (C2C-201);
 *   projects-at-risk                  Projects, "Which projects are at risk this week?" opened.
 * What each section said goes to ./shots-<label>.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://localhost:5266').replace(/\/$/, '');
const LABEL = process.argv[3] || 'after';
const EMAIL = process.env.DEMO_EMAIL || 'rr5-author@example.test';
const PW = fs.readFileSync(process.env.PW_FILE, 'utf8').trim();
const SHOTS = path.join(__dirname, 'screenshots');

const VIEWS = {
  'schedule-c2c101': { url: '/concept2cure/project-home?program=d56ad63d-8530-4cd5-b81f-dc55102a6dea', step: 'Plan', target: '[data-testid="pj-plan-schedule"]' },
  'schedule-lmn201': { url: '/concept2cure/project-home?program=af5db78f-529b-45a2-a1f0-fede3f15181b', step: 'Plan', target: '[data-testid="pj-plan-schedule"]' },
  'cmc-approvals': { url: '/concept2cure/cmc?program=2d6292f3-eeb0-4ae1-9b3c-e68e89c197ad', target: 'section[aria-label="Section approvals"]' },
  'projects-at-risk': { url: '/concept2cure/projects', click: 'button:has-text("Which projects are at risk this week?")', target: '#pj-risk' },
};
const chosen = process.argv.slice(4).length ? process.argv.slice(4) : Object.keys(VIEWS);
const SIZES = [{ width: 1440, height: 900, dark: false }, { width: 1440, height: 900, dark: true },
  { width: 390, height: 844, dark: false }, { width: 390, height: 844, dark: true }]
  .filter((s) => !process.env.ONLY_SIZE || process.env.ONLY_SIZE === `${s.width}-${s.dark ? 'dark' : 'light'}`);

/** A re-shot size or view replaces its earlier entry in the log; the others are kept. */
function mergeLog(file, log) {
  const earlier = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { runs: [] };
  for (const run of log.runs) {
    const old = earlier.runs.find((r) => r.key === run.key);
    const kept = old ? old.views.filter((v) => !run.views.some((n) => n.name === v.name)) : [];
    earlier.runs = earlier.runs.filter((r) => r.key !== run.key).concat({ ...run, views: kept.concat(run.views) });
  }
  return { ...earlier, base: log.base, label: log.label, at: log.at };
}

async function signIn(page, dark) {
  await page.goto(`${BASE}/concept2cure/login`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.evaluate((d) => {
    const prefs = JSON.parse(localStorage.getItem('c2c-v2-prefs') || '{}');
    localStorage.setItem('c2c-v2-prefs', JSON.stringify({ ...prefs, dark: d }));
  }, dark);
  await page.fill('input[type=email], input[name=email]', EMAIL);
  await page.fill('input[type=password]', PW);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL((u) => !/login/.test(String(u)), { timeout: 60000 });
}

async function openView(page, view) {
  await page.goto(BASE + view.url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);
  if (view.step) {
    await page.locator('.pj-lc-stage', { hasText: view.step }).first().click();
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  if (view.click) await page.locator(view.click).first().click();
  await page.waitForTimeout(3500);
}

async function capture(page, key, name) {
  const view = VIEWS[name];
  await openView(page, view);
  const el = page.locator(view.target).first();
  if (!(await el.count())) return { name, error: `no ${view.target}` };
  /* The page scrolls inside its own container, so a section taller than the window is cut in an element shot: the
     window grows to hold it for the shot, at the same width, and is put back. */
  const size = page.viewportSize();
  const height = Math.ceil((await el.boundingBox())?.height ?? 0);
  if (height + 160 > size.height) await page.setViewportSize({ width: size.width, height: height + 240 });
  await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(600);
  const file = `${LABEL}-${name}-${key}.png`;
  await el.screenshot({ path: path.join(SHOTS, file) });
  await page.setViewportSize(size);
  const text = (await el.innerText()).replace(/\s+\n/g, '\n').trim();
  const sideways = await page.evaluate(() => {
    const pg = document.querySelector('.page') || document.scrollingElement;
    return pg.scrollWidth - pg.clientWidth;
  });
  /* A row whose detail or date is squeezed to nothing, or pushed past the section's edge. */
  const squeezed = await el.evaluate((root) => {
    const edge = root.getBoundingClientRect().right + 1;
    const lost = (n) => n && (n.getBoundingClientRect().width < 4 || n.getBoundingClientRect().right > edge);
    return Array.from(root.querySelectorAll('.pj-act'))
      .filter((row) => lost(row.querySelector('.pj-act-t')) || lost(row.querySelector('.pj-act-n')))
      .map((row) => row.querySelector('.pj-act-w')?.textContent.trim());
  });
  return { name, file, sideways, squeezed, text: text.slice(0, 4000) };
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const log = { base: BASE, label: LABEL, at: new Date().toISOString(), runs: [] };
  const browser = await chromium.launch();
  for (const s of SIZES) {
    const key = `${s.width}-${s.dark ? 'dark' : 'light'}`;
    const context = await browser.newContext({ viewport: { width: s.width, height: s.height }, hasTouch: s.width < 500 });
    const page = await context.newPage();
    const failed = [];
    page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });
    const run = { key, views: [], failed };
    try {
      await signIn(page, s.dark);
      for (const name of chosen) run.views.push(await capture(page, key, name).catch((e) => ({ name, error: String(e.message).slice(0, 300) })));
    } catch (error) {
      run.error = String(error && error.message || error).slice(0, 400);
    }
    log.runs.push(run);
    console.info(key, run.error || run.views.map((v) => `${v.name}: ${v.error || v.file}`).join(', '), failed.length ? `failed: ${failed.slice(0, 6).join(', ')}` : '');
    await context.close();
  }
  await browser.close();
  const out = path.join(__dirname, `shots-${LABEL}.json`);
  fs.writeFileSync(out, JSON.stringify(mergeLog(out, log), null, 2));
})();
