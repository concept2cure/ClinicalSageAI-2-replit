/**
 * P-122 §3.3 and §3.5, the project page: before-and-after screenshots at 1440 and 390, light and dark.
 *
 *   PW_FILE=<file holding the password> node docs/evidence/DESIGN/P-122/project-page/shots.cjs <base-url> <programId> <before|after>
 *
 * Signs in through the sign-in form as the demo author (the password is read from PW_FILE and never printed),
 * opens the project page of one demo project and captures, for each width and theme: the step control with what
 * sits under it (Plan), the Plan step's lower sections, the Review step, and the Project knowledge column's Records
 * and Activity. Facts read in the page go to ./shots-<label>.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://localhost:5262').replace(/\/$/, '');
const PROGRAM = process.argv[3];
const LABEL = process.argv[4] || 'after';
const EMAIL = process.env.DEMO_EMAIL || 'rr5-author@example.test';
const PW = fs.readFileSync(process.env.PW_FILE, 'utf8').trim();
const SHOTS = path.join(__dirname, 'screenshots');
const log = { base: BASE, program: PROGRAM, label: LABEL, at: new Date().toISOString(), runs: [] };

async function signIn(page, dark) {
  await page.goto(BASE + '/concept2cure/login', { waitUntil: 'networkidle', timeout: 90000 });
  await page.evaluate((d) => {
    const prefs = JSON.parse(localStorage.getItem('c2c-v2-prefs') || '{}');
    localStorage.setItem('c2c-v2-prefs', JSON.stringify({ ...prefs, dark: d }));
  }, dark);
  await page.fill('input[type=email], input[name=email]', EMAIL);
  await page.fill('input[type=password]', PW);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL((u) => !/login/.test(String(u)), { timeout: 60000 });
}

async function openProject(page) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${PROGRAM}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('h1.pj-title').waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
}

async function openStep(page, label) {
  await page.locator('.pj-lc-stage', { hasText: label }).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
}

async function shotAt(page, selector, name) {
  const el = page.locator(selector).first();
  if (await el.count()) await el.evaluate((n) => n.scrollIntoView({ block: 'start' }));
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  const file = `${LABEL}-${name}.png`;
  await page.screenshot({ path: path.join(SHOTS, file) });
  return file;
}

const facts = () => {
  const text = (sel) => Array.from(document.querySelectorAll(sel)).map((n) => n.textContent.replace(/\s+/g, ' ').trim());
  const step = document.querySelector('.pj-lc-stage[aria-current="step"]');
  return {
    step: step ? step.textContent.trim() : null,
    underSteps: text('.pj-step-blurb, .pj-step-next'),
    mainHeadings: text('.pj-main h2'),
    sideHeadings: text('.pj-side h3'),
    closedDisclosuresInSide: Array.from(document.querySelectorAll('.pj-side details:not([open]) > summary')).map((s) => s.textContent.trim()),
    hScroll: (() => { const inner = document.querySelector('.page-inner.pj'); return inner ? inner.scrollWidth - inner.clientWidth : null; })(),
  };
};

(async () => {
  const browser = await chromium.launch();
  const sizes = [{ width: 1440, height: 900, dark: false }, { width: 1440, height: 900, dark: true },
    { width: 390, height: 844, dark: false }, { width: 390, height: 844, dark: true }];
  for (const s of sizes) {
    const key = `${s.width}-${s.dark ? 'dark' : 'light'}`;
    const context = await browser.newContext({ viewport: { width: s.width, height: s.height }, hasTouch: s.width < 500 });
    const page = await context.newPage();
    const failed = [];
    page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });
    const run = { key, shots: [], facts: {}, failed };
    try {
      await signIn(page, s.dark);
      await openProject(page);
      await openStep(page, 'Plan');
      run.facts.plan = await page.evaluate(facts);
      run.shots.push(await shotAt(page, '.pj-lc', `${key}-plan-steps`));
      run.shots.push(await shotAt(page, LABEL === 'before' ? '[aria-label="Tasks and approvals"]' : '[data-testid="pj-plan-schedule"]', `${key}-plan-schedule`));
      await openStep(page, 'Review');
      run.facts.review = await page.evaluate(facts);
      run.shots.push(await shotAt(page, '.pj-lc', `${key}-review`));
      run.shots.push(await shotAt(page, '#pj-records-h', `${key}-records`));
      run.shots.push(await shotAt(page, '[data-records-section="activity"], #pj-activity-h', `${key}-activity`));
    } catch (error) {
      run.error = String(error && error.message || error).slice(0, 400);
    }
    log.runs.push(run);
    console.info(key, run.error ? `error: ${run.error}` : `${run.shots.length} shots`, failed.length ? `failed: ${failed.slice(0, 6).join(', ')}` : '');
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, `shots-${LABEL}.json`), JSON.stringify(log, null, 2));
})();
