/**
 * S11 step 3 in the running app: each program-plan task's owner and back-scheduled due date
 * (CLAUDE.md RULE 4: a screen is not done until it was opened and used).
 *
 *   node docs/evidence/SPINE/S11/2026-11-05-owners-and-due-dates/walk.cjs [base-url]
 *
 * One dev-login (a local server with ALLOW_DEV_AUTH=1; WALK_EMAIL names a user in that database). Two IND projects
 * are made through the product's own create (POST /api/c2c/projects), once: WALK-IND-301 with a target submission
 * date, WALK-IND-302 without. Then: the Plan step's program plan says the schedule; the rows carry owner and due
 * date; a task's sheet gives its schedule; Assign makes it the signed-in person's task, due on the schedule's date;
 * it reads back after a reload and is in that person's work (GET /api/tasks/my-work) and on Tasks; the project with
 * no target says so; 390 wide. Log: ./walk.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5100').replace(/\/$/, '');
const EMAIL = process.env.WALK_EMAIL || 'walk.owner@example.com';
const TARGET = '2027-06-04';
const TASK = 'Submit IND';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [], apiErrors: [] };
const step = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: false });

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
    return { status: r.status, email: j.user?.email ?? null, id: j.user?.id ?? null };
  }, EMAIL);
  expect(who.status === 200 && who.email === EMAIL, `dev-login as ${EMAIL} (got ${JSON.stringify(who)})`);
  step('sign in (one dev-login)', who);
  return who;
}

/** The walk's project by name, made through the product's create the first time. */
async function project(page, name, target) {
  const list = await api(page, 'GET', '/api/c2c/projects?limit=100');
  const found = (list.json?.data ?? []).find((p) => String(p.title ?? p.name ?? '') === name);
  if (found) return found.id;
  const made = await api(page, 'POST', '/api/c2c/projects', {
    name, productName: name, programType: 'ind', productType: 'drug', primaryAgency: 'FDA', indication: 'Walk indication',
    ...(target ? { targetSubmissionDate: target } : {}),
  });
  expect(made.status < 300, `project ${name} created (${made.status} ${JSON.stringify(made.json).slice(0, 300)})`);
  const id = made.json?.data?.id ?? made.json?.id ?? made.json?.data?.programId;
  expect(id, `project ${name} has an id (${JSON.stringify(made.json).slice(0, 300)})`);
  return id;
}

async function openPlan(page, programId) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${programId}`, { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Plan/ }).click();
  const plan = page.getByTestId('pj-program-plan');
  await plan.waitFor({ timeout: 30000 });
  await plan.scrollIntoViewIfNeeded();
  return plan;
}

/** Opens every workstream (S11's later step replaced the one "work breakdown" block with a row per workstream). */
async function openBreakdown(plan) {
  for (const d of await plan.locator('details.py-ws-row').all()) {
    if (!(await d.evaluate((e) => e.open))) await d.locator('summary').click();
  }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) log.apiErrors.push(`${r.status()} ${r.url()}`); });
  try {
    const me = await signIn(page);
    const withTarget = await project(page, 'WALK-IND-301', TARGET);
    const noTarget = await project(page, 'WALK-IND-302', null);
    step('projects', { withTarget, noTarget });

    // 1. The schedule's sentence, from the route's back-schedule.
    const read = await api(page, 'GET', `/api/v1/pyramids/by-project/${withTarget}`);
    expect(read.status === 200 && read.json.data.schedule, `the route gives a schedule (${read.status})`);
    const s = read.json.data.schedule;
    let plan = await openPlan(page, withTarget);
    const sentence = await plan.getByTestId('pj-program-schedule').innerText();
    expect(/^Scheduled back from the target submission date, Jun 4, 2027: the work starts by /.test(sentence), `the schedule sentence (${sentence})`);
    step('1. the plan says its schedule', { sentence, route: { target: s.target, start: s.start, anchor: s.anchorTaskId, submit: s.tasks['phase8.submit'] } });
    await shot(page, '01-schedule-sentence.png');

    // 2. Rows carry owner and due date.
    await openBreakdown(plan);
    const row = plan.locator('.py-row', { hasText: TASK }).first();
    const rowText = await row.locator('.py-row-plan').innerText();
    step('2. the task row carries owner and due date', { row: rowText });
    await row.scrollIntoViewIfNeeded();
    await shot(page, '02-rows-owner-due.png');

    // 3. The task's sheet: schedule; Assign, due on the schedule's date.
    await row.locator('.py-row-main').click();
    const sheet = page.getByRole('dialog', { name: TASK });
    await sheet.waitFor();
    const sched = await sheet.getByTestId('py-task-plan').innerText();
    step('3. the sheet gives the schedule', { sheet: sched });
    await shot(page, '03-task-sheet.png');
    const already = await sheet.getByRole('button', { name: /Assign another person/ }).count();
    if (!already) {
      await sheet.getByRole('button', { name: /Assign$/ }).click();
      const drawer = page.getByRole('dialog').last();
      const person = drawer.getByLabel(/Person/);
      await person.waitFor();
      await person.selectOption(String(me.id));
      const due = await drawer.getByLabel(/Due date/).inputValue();
      expect(due === s.tasks['phase8.submit'].due, `the form starts from the schedule's date (${due} vs ${s.tasks['phase8.submit'].due})`);
      await shot(page, '04-assign-drawer.png');
      const posted = page.waitForResponse((r) => r.url().endsWith('/api/tasks/tasks') && r.request().method() === 'POST');
      await drawer.getByRole('button', { name: 'Assign' }).click();
      const res = await posted;
      step('4. Assign, due on the schedule\'s date', { due, status: res.status() });
      expect(res.status() < 300, `the task was created (${res.status()})`);
      await sheet.getByText(/The task is in their tasks/).waitFor({ timeout: 15000 });
      await shot(page, '05-assigned.png');
    } else step('4. already assigned on an earlier run');

    // 5. Reload: the row reads the owner from the task store.
    plan = await openPlan(page, withTarget);
    await openBreakdown(plan);
    const after = await plan.locator('.py-row', { hasText: TASK }).first().locator('.py-row-plan').innerText();
    const ownedLine = await plan.getByTestId('pj-program-schedule').innerText();
    expect(!/No owner/.test(after), `the row names the owner after a reload (${after})`);
    step('5. after a reload, the row names its owner', { row: after, sentence: ownedLine });
    await plan.locator('.py-row', { hasText: TASK }).first().scrollIntoViewIfNeeded();
    await shot(page, '06-after-reload.png');

    // 6. It is the person's work: tasking's own read, and Tasks.
    const work = await api(page, 'GET', '/api/tasks/my-work');
    const items = JSON.stringify(work.json?.data ?? '');
    expect(work.status === 200 && items.includes(TASK), `my-work lists "${TASK}" (${work.status})`);
    const mine = (Array.isArray(work.json.data) ? work.json.data : (work.json.data.items ?? work.json.data.tasks ?? []))
      .find?.((t) => t.title === TASK) ?? null;
    step('6. it is in the person\'s work (GET /api/tasks/my-work)', { task: mine });
    await page.goto(`${BASE}/concept2cure/tasks`, { waitUntil: 'networkidle' });
    await page.getByText(TASK).first().waitFor({ timeout: 20000 });
    await shot(page, '07-tasks.png');
    step('6b. on Tasks');

    // 7. No target recorded: said, no dates.
    plan = await openPlan(page, noTarget);
    const none = await plan.getByTestId('pj-program-schedule').innerText();
    expect(/^No target submission date is recorded/.test(none), `the no-target sentence (${none})`);
    step('7. a project with no target date says so', { sentence: none });
    await shot(page, '08-no-target.png');

    // 8. Phone width.
    await page.setViewportSize({ width: 390, height: 844 });
    plan = await openPlan(page, withTarget);
    await openBreakdown(plan);
    await plan.locator('.py-row', { hasText: TASK }).first().scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scroll <= 0, `no horizontal scroll at 390 (${scroll})`);
    step('8. 390 wide, no horizontal scroll', { overflow: scroll });
    await shot(page, '09-phone.png');
  } catch (err) {
    log.error = err instanceof Error ? err.message : String(err);
    console.error(log.error);
    await shot(page, 'zz-failure.png').catch(() => {});
    process.exitCode = 1;
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2) + '\n');
    await browser.close();
  }
})();
