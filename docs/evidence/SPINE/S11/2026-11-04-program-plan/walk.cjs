/**
 * S11 step 2 in the running app: the project's program plan in its Plan step
 * (CLAUDE.md RULE 4: a screen is not done until it was opened and used).
 *
 *   node docs/evidence/SPINE/S11/2026-11-04-program-plan/walk.cjs [base-url]
 *
 * One dev-login (local server with dev auth). C2C-101 (IND): the Plan step's
 * Program plan, its work breakdown, one task set to In progress, read again
 * after a reload. LMN-201 (IND): the same task is its own, still To do.
 * NeuroPanel-Dx (510(k)) and ONC-221 (NDA): each has its filing's plan. 390
 * wide: the section at phone width. The task is set back to To do at the end,
 * so a re-run starts from the same state. Log: ./walk.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const EMAIL = process.env.DEMO_SEED_EMAIL || 'jm.smith@concept2cure.pro';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
/** The walk's projects, found by name in the signed-in tenant (ids differ between databases). */
const P = {};
const NAMES = { c2c101: 'C2C-101', lmn201: 'LMN-201', device: 'NeuroPanel-Dx', nda: 'ONC-221' };
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [], apiErrors: [] };
const step = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

async function signIn(page) {
  await page.goto(BASE + '/');
  const who = await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json();
    const exp = new Date(Date.now() + 86_400_000).toISOString();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken);
      s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', exp);
      s.setItem('trialsage_user', JSON.stringify(j.user));
    }
    return { status: r.status, email: j.user?.email ?? null };
  }, EMAIL);
  expect(who.status === 200 && who.email === EMAIL, `dev-login as ${EMAIL} (got ${JSON.stringify(who)})`);
  const rows = await page.evaluate(async () => {
    const r = await fetch('/api/c2c/projects?limit=100', { headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } });
    return ((await r.json()).data ?? []).map((x) => ({ id: x.id, title: String(x.title ?? x.name ?? '') }));
  });
  for (const [key, name] of Object.entries(NAMES)) P[key] = rows.find((row) => row.title.includes(name))?.id;
  expect(P.c2c101 && P.lmn201 && P.device, `C2C-101, LMN-201 and NeuroPanel-Dx are in this tenant (${JSON.stringify(P)})`);
  step('sign in (one dev-login)', { email: who.email, projects: P });
}

/** The project's Plan step, and its Program plan section. Returns the section. */
async function openPlan(page, programId) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${programId}`, { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Plan/ }).click();
  const plan = page.getByTestId('pj-program-plan');
  await plan.waitFor({ timeout: 20000 });
  await plan.scrollIntoViewIfNeeded();
  return plan;
}

async function summaryOf(plan) {
  return (await plan.locator('.pj-desc').first().innerText()).replace(/\s+/g, ' ');
}

/** The work breakdown, opened; returns the first task's status control and the task's name. */
async function firstTask(plan) {
  const details = plan.locator('details.pj-more');
  if (!(await details.evaluate((d) => d.open))) await details.locator('summary').click();
  const select = plan.locator('select.py-row-status').first();
  await select.waitFor();
  const label = await select.getAttribute('aria-label');
  return { select, task: label.replace(/^Status of /, '') };
}

async function setStatus(page, select, value) {
  const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/api/v1/pyramids/by-project/'));
  await select.selectOption(value);
  const res = await saved;
  expect(res.status() === 200, `PATCH answered 200 (got ${res.status()})`);
}

async function c2c101(page, shot) {
  const plan = await openPlan(page, P.c2c101);
  const before = await summaryOf(plan);
  expect(/^\d+ of \d+ tasks done · critical path \d+% done/.test(before), `a progress line (got "${before}")`);
  step('C2C-101 Plan: the Program plan states its progress', { summary: before, screenshot: await shot('01-c2c101-program-plan.png') });
  const { select, task } = await firstTask(plan);
  expect((await select.inputValue()) === 'todo', `"${task}" starts To do`);
  await setStatus(page, select, 'in-progress');
  step(`C2C-101: "${task}" set to In progress, recorded on this project`, { task, screenshot: await shot('02-c2c101-task-in-progress.png') });
  await page.reload({ waitUntil: 'networkidle' });
  const again = await openPlan(page, P.c2c101);
  const { select: s2 } = await firstTask(again);
  expect((await s2.inputValue()) === 'in-progress', `"${task}" reads In progress after a reload`);
  step(`C2C-101 after a reload: "${task}" still In progress`, { screenshot: await shot('03-c2c101-after-reload.png') });
  return task;
}

async function lmn201(page, shot, task) {
  const plan = await openPlan(page, P.lmn201);
  const { select, task: same } = await firstTask(plan);
  expect(same === task, `the same IND task first (${same})`);
  expect((await select.inputValue()) === 'todo', `"${task}" is To do on LMN-201: the progress is each project's own`);
  step(`LMN-201 (another IND): "${task}" is To do here; the progress is the project's, not the filing type's`, { screenshot: await shot('04-lmn201-own-progress.png') });
}

async function otherFilings(page, shot) {
  for (const [key, name, file] of [['device', 'NeuroPanel-Dx 510(k)', '05-device-510k-plan.png'], ['nda', 'ONC-221 NDA', '06-onc221-nda-plan.png']]) {
    if (!P[key]) { step(`${name}: not in this tenant, so not walked`); continue; }
    const plan = await openPlan(page, P[key]);
    const sub = await plan.locator('.sec-sub').first().innerText();
    step(`${name}: the Program plan is its filing's (${sub})`, { summary: await summaryOf(plan), screenshot: await shot(file) });
  }
}

async function narrow(page, shot) {
  await page.setViewportSize({ width: 390, height: 844 });
  const plan = await openPlan(page, P.c2c101);
  await firstTask(plan);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  step('390 wide: the Program plan and its work breakdown', { horizontalOverflowPx: overflow, screenshot: await shot('07-c2c101-390.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function reset(page) {
  const plan = await openPlan(page, P.c2c101);
  const { select } = await firstTask(plan);
  await setStatus(page, select, 'todo');
  step('C2C-101: the task set back to To do, so a re-run starts from the same state');
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) log.apiErrors.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });
  const shot = async (file) => { await page.screenshot({ path: path.join(SHOTS, file) }); return `screenshots/${file}`; };
  try {
    await signIn(page);
    const task = await c2c101(page, shot);
    await lmn201(page, shot, task);
    await otherFilings(page, shot);
    await narrow(page, shot);
    await reset(page);
    log.outcome = 'passed';
  } catch (err) {
    log.outcome = 'failed';
    log.error = err.message;
    console.error(`FAILED: ${err.message}`);
    await shot('failure.png').catch(() => {});
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
    process.exit(log.outcome === 'passed' ? 0 : 1);
  }
})();
