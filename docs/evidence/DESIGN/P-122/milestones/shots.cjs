/**
 * P-122 milestones: the Schedule's "Section owners and deadlines" module on C2C-101, before and after "Record a
 * milestone", at 1440 and 390 px, light and dark.
 *
 *   PW_FILE=<file holding the password> node docs/evidence/DESIGN/P-122/milestones/shots.cjs <base-url> <label> [step...]
 *
 * Signs in through the sign-in form as the demo author (the password is read from PW_FILE and never printed), opens
 * C2C-101's Plan step and captures element shots. Steps:
 *   schedule  the module (every label);
 *   form      "Record a milestone" opened, empty (after only);
 *   flow      at 1440 light only: records MILESTONE through the form, moves its date, marks it done, a shot after each;
 *   gate      from the signed-in page, the status of an unclaimed section read and of the claimed milestone list, so the
 *             log shows the instance ran with the launch-scope gate on (the token is read in the page, never printed).
 * MILESTONE is removed from the shared demo database afterwards (README, "Instance").
 * What each shot said, and every /api response of 400 or more, goes to ./shots-<label>.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://localhost:5267').replace(/\/$/, '');
const LABEL = process.argv[3] || 'after';
const STEPS = process.argv.slice(4).length ? process.argv.slice(4) : ['schedule'];
const EMAIL = process.env.DEMO_EMAIL || 'rr5-author@example.test';
const PW = fs.readFileSync(process.env.PW_FILE, 'utf8').trim();
const SHOTS = path.join(__dirname, 'screenshots');
const PAGE = '/concept2cure/project-home?program=d56ad63d-8530-4cd5-b81f-dc55102a6dea';
const MODULE = '[data-testid="pj-schedule-sections"]';
const DIALOG = '[role="dialog"]';
const MILESTONE = 'Pre-IND briefing package sent';
const SIZES = [{ width: 1440, height: 900, dark: false }, { width: 1440, height: 900, dark: true },
  { width: 390, height: 844, dark: false }, { width: 390, height: 844, dark: true }]
  .filter((s) => !process.env.ONLY_SIZE || process.env.ONLY_SIZE === `${s.width}-${s.dark ? 'dark' : 'light'}`);

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

async function openPlan(page) {
  await page.goto(BASE + PAGE, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.locator('.pj-lc-stage', { hasText: 'Plan' }).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);
}

/** An element shot; the window grows to hold a tall element, at the same width, and is put back. */
async function shoot(page, key, name, selector) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  if (!(await el.count())) return { name, error: `no ${selector}` };
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
  return { name, file, sideways, text: text.slice(0, 4000) };
}

/** The open milestone row named MILESTONE, and its "Update" button. */
const rowOf = (page) => page.locator(`${MODULE} [role="listitem"]`, { hasText: MILESTONE }).first();

async function recordThroughForm(page, key, out) {
  await page.locator(`${MODULE} button`, { hasText: 'Record a milestone' }).first().click();
  const dialog = page.locator(DIALOG).first();
  await dialog.getByLabel('Name').fill(MILESTONE);
  await dialog.getByLabel('Due date').fill('2027-01-08');
  await dialog.getByLabel('Linked CTD sections').fill('1.2, 2.5');
  await page.waitForTimeout(400);
  out.push(await shoot(page, key, 'form-filled', DIALOG));
  await dialog.locator('button', { hasText: 'Record milestone' }).click();
  await page.waitForTimeout(2500);
  out.push(await shoot(page, key, 'recorded', MODULE));
}

async function updateThroughForm(page, key, out, choose) {
  await rowOf(page).locator('button', { hasText: 'Update' }).click();
  const dialog = page.locator(DIALOG).first();
  await choose(dialog);
  await page.waitForTimeout(400);
  out.push(await shoot(page, key, choose.shotName, DIALOG));
  await dialog.locator('button', { hasText: 'Save' }).click();
  await page.waitForTimeout(2500);
  out.push(await shoot(page, key, choose.afterName, MODULE));
}

const moveDate = Object.assign(async (dialog) => { await dialog.getByLabel('Due date').fill('2027-01-22'); },
  { shotName: 'move-date-form', afterName: 'date-moved' });
const markDone = Object.assign(async (dialog) => { await dialog.getByRole('radio', { name: 'Done' }).click(); },
  { shotName: 'mark-done-form', afterName: 'done' });

/** What the instance's gate answers, read in the page with the session's own token. */
async function gateProbe(page) {
  return page.evaluate(async () => {
    const headers = { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token') || ''}` };
    const probe = async (p) => {
      const res = await fetch(p, { headers });
      const body = await res.json().catch(() => ({}));
      return `${res.status} ${(body.error && body.error.code) || body.code || ''}`.trim();
    };
    return {
      unclaimed: await probe('/api/project-sections?project_id=2'),
      claimed: await probe('/api/project-sections/milestones?project_id=2'),
    };
  });
}

async function runSize(browser, s, log) {
  const key = `${s.width}-${s.dark ? 'dark' : 'light'}`;
  const context = await browser.newContext({ viewport: { width: s.width, height: s.height }, hasTouch: s.width < 500 });
  const page = await context.newPage();
  const failed = [];
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });
  const run = { key, views: [], failed };
  try {
    await signIn(page, s.dark);
    await openPlan(page);
    for (const step of STEPS) await runStep(page, key, step, run);
  } catch (error) {
    run.error = String((error && error.message) || error).slice(0, 400);
  }
  log.runs.push(run);
  console.info(key, run.error || run.views.map((v) => `${v.name}: ${v.error || v.file}`).join(', '), failed.length ? `failed: ${failed.slice(0, 6).join(', ')}` : '');
  await context.close();
}

async function runStep(page, key, step, run) {
  if (step === 'schedule') run.views.push(await shoot(page, key, 'schedule', MODULE));
  if (step === 'form') {
    await page.locator(`${MODULE} button`, { hasText: 'Record a milestone' }).first().click();
    run.views.push(await shoot(page, key, 'form', DIALOG));
    await page.locator(DIALOG).first().locator('button', { hasText: 'Cancel' }).click();
  }
  if (step === 'gate') run.views.push({ name: 'gate', file: JSON.stringify(await gateProbe(page)) });
  if (step === 'flow' && key === '1440-light') {
    await recordThroughForm(page, key, run.views);
    await updateThroughForm(page, key, run.views, moveDate);
    await updateThroughForm(page, key, run.views, markDone);
  }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const log = { base: BASE, label: LABEL, steps: STEPS, at: new Date().toISOString(), runs: [] };
  const browser = await chromium.launch();
  for (const s of SIZES) await runSize(browser, s, log);
  await browser.close();
  const out = path.join(__dirname, `shots-${LABEL}.json`);
  const earlier = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { runs: [] };
  fs.writeFileSync(out, JSON.stringify({ ...log, runs: earlier.runs.concat(log.runs) }, null, 2));
})();
