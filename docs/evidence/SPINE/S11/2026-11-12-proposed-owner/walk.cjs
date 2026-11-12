/**
 * S11, P-119 reached: the Assign form of a work-breakdown task names the task's job role and lists the people who
 * hold it first (CLAUDE.md RULE 4: opened and used, at 1440 and 390).
 *
 *   node docs/evidence/SPINE/S11/2026-11-12-proposed-owner/walk.cjs [base-url]
 *
 * Runs after ../2026-11-05-owners-and-due-dates/walk.cjs (WALK-IND-301). Through the product's own API it makes,
 * once, the job role "Regulatory affairs lead" (POST /api/mdx/qms/job-roles) and adds the signed-in person to it.
 * Log: ./walk.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5100').replace(/\/$/, '');
const EMAIL = process.env.WALK_EMAIL || 'walk.owner@example.com';
const ROLE = 'Regulatory affairs lead';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [], apiErrors: [] };
const step = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

async function api(page, method, url, body) {
  return page.evaluate(async ({ method, url, body }) => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` },
      body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, { method, url, body });
}

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
    return { status: r.status, id: j.user?.id ?? null };
  }, EMAIL);
  expect(who.status === 200 && who.id, `dev-login (${JSON.stringify(who)})`);
  return who;
}

/** The job role and whether the person holds it, made through the product's routes the first time. */
async function holdRole(page, userId) {
  const read = async () => (await api(page, 'GET', '/api/mdx/qms/job-roles')).json?.data?.roles ?? [];
  let role = (await read()).find((r) => r.name === ROLE);
  if (!role) {
    const made = await api(page, 'POST', '/api/mdx/qms/job-roles', { name: ROLE, reason: 'Walk: the standard job role, to propose task owners' });
    expect(made.status === 201, `job role created (${made.status} ${JSON.stringify(made.json).slice(0, 200)})`);
    role = (await read()).find((r) => r.name === ROLE);
  }
  if (!role.members.some((m) => m.userId === userId)) {
    const added = await api(page, 'POST', `/api/mdx/qms/job-roles/${role.id}/members`, { userId, reason: 'Walk: the signed-in person holds this job role' });
    expect(added.status === 201, `member added (${added.status} ${JSON.stringify(added.json).slice(0, 200)})`);
  }
  return role.id;
}

async function openAssign(page, programId, task) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${programId}`, { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Plan/ }).click();
  const plan = page.getByTestId('pj-program-plan');
  await plan.waitFor({ timeout: 30000 });
  for (const d of await plan.locator('details.py-ws-row').all()) {
    if (!(await d.evaluate((e) => e.open))) await d.locator('summary').click();
  }
  await plan.locator('.py-row', { hasText: task }).first().locator('.py-row-main').click();
  const sheet = page.getByRole('dialog', { name: task });
  await sheet.getByRole('button', { name: /Assign( another person)?$/ }).click();
  const drawer = page.getByRole('dialog').last();
  const person = drawer.getByLabel(/Person/);
  await person.waitFor();
  return { drawer, person };
}

async function formSays(page, programId, task, width) {
  const { drawer, person } = await openAssign(page, programId, task);
  await drawer.getByText(/job role/).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  const options = await person.locator('option').allInnerTexts();
  const words = (await drawer.locator('.de-field', { has: person }).first().innerText().catch(() => drawer.innerText())).replace(/\s+/g, ' ');
  await page.screenshot({ path: path.join(SHOTS, `${width}-${task.toLowerCase().replace(/\W+/g, '-')}.png`) });
  return { options, words };
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) log.apiErrors.push(`${r.status()} ${r.url()}`); });
  try {
    const me = await signIn(page);
    const list = await api(page, 'GET', '/api/c2c/projects?limit=100');
    const programId = (list.json?.data ?? []).find((p) => p.title === 'WALK-IND-301')?.id;
    expect(programId, 'WALK-IND-301 exists');
    const roleId = await holdRole(page, Number(me.id));
    step('the job role and its holder, through the product\'s routes', { roleId, userId: me.id });

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const pyr = (await api(page, 'GET', `/api/v1/pyramids/by-project/${programId}`)).json.data.pyramid;
      // 1. A task the work breakdown gives to the regulatory affairs lead: the holder is first, and named so.
      const mine = pyr.tasks.find((t) => t.role === 'ra_lead');
      const held = await formSays(page, programId, mine.name, width);
      expect(/\(Regulatory affairs lead\)$/.test(held.options.filter((o) => !/^Select/.test(o))[0] ?? ''), `the holder is listed first (${held.options}; ${held.words})`);
      expect(/gives this task to the Regulatory affairs lead\..*Listed first/.test(held.words), `the form says so (${held.words})`);
      step(`${width}: 1. the holder is listed first`, { task: mine.name, role: mine.role, ...held });
      // 2. A task for a job role no one holds (Submit IND: the regulatory operations lead): said, nobody moved up.
      const none = await formSays(page, programId, 'Submit IND', width);
      expect(/gives this task to the Regulatory operations lead\. No one in your organisation holds that job role yet\./.test(none.words), `no holder is said (${none.words})`);
      expect(!none.options.some((o) => /\)$/.test(o.trim())), `nobody is marked (${none.options})`);
      step(`${width}: 2. a job role no one holds`, { task: 'Submit IND', ...none });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow <= 0, `no horizontal scroll at ${width} (${overflow})`);
    }
  } catch (err) {
    log.error = err instanceof Error ? err.message : String(err);
    console.error(log.error);
    await page.screenshot({ path: path.join(SHOTS, 'zz-failure.png') }).catch(() => {});
    process.exitCode = 1;
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2) + '\n');
    await browser.close();
  }
})();
