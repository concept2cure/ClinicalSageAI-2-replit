/**
 * S11 in the running app (CLAUDE.md RULE 4: opened and used), at 1440 and 390:
 *  - the Plan step opens with the project's regulatory strategy: none said as none; stated through the objective's
 *    governed form; shown after a reload; the objective stays under the project's name;
 *  - "Use the schedule's date": an owner's task due on another day is moved to the plan's date with a reason, and
 *    tasking's own read shows the new date.
 *
 *   node docs/evidence/SPINE/S11/2026-11-10-strategy-and-reschedule/walk.cjs [base-url]
 *
 * A local server with ALLOW_DEV_AUTH=1. It makes WALK-IND-501 (target Jun 4, 2027) through the product's create,
 * once, and assigns "Submit IND" a week early through tasking's create, so the schedule's date differs. Log: walk.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5100').replace(/\/$/, '');
const EMAIL = process.env.WALK_EMAIL || 'walk.owner@example.com';
const NAME = 'WALK-IND-501';
const STRATEGY = '505(b)(1) IND for a first-in-human study. Pre-IND meeting first; CMC and nonclinical packages in parallel; file once the 28-day toxicology report is final.';
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
  expect(who.status === 200, `dev-login (${JSON.stringify(who)})`);
  step('sign in (one dev-login)', who);
  return who;
}

async function openPlan(page, programId) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${programId}`, { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Plan/ }).click();
  const plan = page.getByTestId('pj-plan');
  await plan.getByTestId('pj-program-plan').waitFor({ timeout: 30000 });
  return plan;
}

async function openSubmitSheet(page, plan) {
  const ws = plan.locator('details.py-ws-row').last();
  if (!(await ws.evaluate((e) => e.open))) await ws.locator('summary').click();
  const row = ws.locator('.py-row', { hasText: 'Submit IND' }).first();
  await row.locator('.py-row-main').waitFor({ timeout: 10000 });
  await row.locator('.py-row-main').click();
  const sheet = page.getByRole('dialog', { name: 'Submit IND' });
  await sheet.waitFor();
  return sheet;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) log.apiErrors.push(`${r.status()} ${r.url()}`); });
  try {
    const me = await signIn(page);
    const list = await api(page, 'GET', '/api/c2c/projects?limit=100');
    let id = (list.json?.data ?? []).find((p) => p.title === NAME)?.id;
    const fresh = !id;
    if (!id) {
      const made = await api(page, 'POST', '/api/c2c/projects', { name: NAME, productName: NAME, programType: 'ind', productType: 'drug',
        primaryAgency: 'FDA', indication: 'Walk indication', targetSubmissionDate: '2027-06-04',
        objective: 'Study may proceed on the IND for WALK-501, with the first-in-human protocol as filed.' });
      expect(made.status < 300 && made.json?.data?.id, `${NAME} created (${made.status} ${JSON.stringify(made.json).slice(0, 300)})`);
      id = made.json.data.id;
    }
    const pyr = (await api(page, 'GET', `/api/v1/pyramids/by-project/${id}`)).json.data;
    const scheduled = pyr.schedule.tasks['phase8.submit'].due;
    step('project', { id, fresh, scheduledDue: scheduled });

    // 1. No strategy yet: said as none, first in the Plan step; the objective is under the name.
    let plan = await openPlan(page, id);
    let strategy = plan.getByTestId('pj-plan-strategy');
    const first = await plan.evaluate((el) => el.firstElementChild?.getAttribute('data-testid'));
    expect(first === 'pj-plan-strategy', `the strategy opens the Plan step (${first})`);
    const objective = await page.locator('.pj-objective .pj-objective-t').first().innerText();
    const before = await strategy.innerText();
    if (fresh) expect(/No regulatory strategy is recorded yet/.test(before), `none is said as none (${before})`);
    await strategy.scrollIntoViewIfNeeded();
    await shot(page, 'desk-01-strategy-none.png');
    step('1. the Plan step opens with the strategy; the objective is under the name', { strategy: before, objective });

    // 2. State it, through the objective's governed form.
    if (!before.includes(STRATEGY.slice(0, 30))) {
      await strategy.getByRole('button', { name: /State the strategy|Edit/ }).click();
      const drawer = page.getByRole('dialog').last();
      await drawer.getByLabel(/Regulatory strategy/).fill(STRATEGY);
      await drawer.getByLabel(/^Reason/).fill('Agreed at the program kickoff');
      await shot(page, 'desk-02-strategy-form.png');
      const put = page.waitForResponse((r) => r.url().includes('/objectives') && r.request().method() === 'PUT');
      await drawer.getByRole('button', { name: 'Record objective' }).click();
      const res = await put;
      expect(res.status() < 300, `the strategy was recorded (${res.status()})`);
      await strategy.locator('.pj-strategy-t').waitFor({ timeout: 15000 });
      step('2. stated through the governed form', { status: res.status() });
    } else step('2. already stated on an earlier run');

    // 3. After a reload: the strategy, its version; the route's own read; the objective unchanged under the name.
    plan = await openPlan(page, id);
    strategy = plan.getByTestId('pj-plan-strategy');
    await strategy.locator('.pj-strategy-t').waitFor({ timeout: 15000 });
    const after = await strategy.innerText();
    const read = (await api(page, 'GET', `/api/charters/by-project/${id}/objectives`)).json.data;
    expect(read.current.content.strategy === STRATEGY, 'the route reads the strategy back');
    expect((await page.locator('.pj-objective .pj-objective-t').first().innerText()) === objective, 'the objective is unchanged');
    await strategy.scrollIntoViewIfNeeded();
    await shot(page, 'desk-03-strategy-stated.png');
    step('3. after a reload', { strategy: after, version: read.current.version, history: read.history.map((h) => [h.version, h.reason]) });

    // 4. An owner's task due a week early; the sheet offers the schedule's date.
    const tasks = (await api(page, 'GET', '/api/tasks/tasks/by-module/Plan')).json.data ?? [];
    let task = tasks.find((t) => t.sourceEntityType === 'pyramid_task' && t.sourceEntityId === `${id}:phase8.submit` && t.status !== 'cancelled');
    if (!task) {
      const team = (await api(page, 'GET', `/api/c2c/projects/${id}/team`)).json;
      const projectId = team?.data?.project_id ?? team?.project_id;
      expect(projectId, `the project's id (${JSON.stringify(team).slice(0, 200)})`);
      const early = new Date(`${scheduled}T17:00:00Z`); early.setUTCDate(early.getUTCDate() - 7);
      const made = await api(page, 'POST', '/api/tasks/tasks', { title: 'Submit IND', moduleType: 'Plan', moduleSource: 'program-plan', category: 'program-plan',
        taskType: 'program-plan', priority: 'high', projectId, assigneeId: Number(me.id), dueDate: early.toISOString(),
        sourceEntityType: 'pyramid_task', sourceEntityId: `${id}:phase8.submit`, regulatoryImpact: true, tags: ['plan', 'program-plan'] });
      expect(made.status < 300, `the owner's task was created (${made.status} ${JSON.stringify(made.json).slice(0, 200)})`);
      task = made.json.data;
      plan = await openPlan(page, id);
    }
    const taskId = task.taskId;
    let sheet = await openSubmitSheet(page, plan);
    const sheetBefore = await sheet.getByTestId('py-task-plan').innerText();
    const offered = await sheet.getByRole('button', { name: /Use the schedule.s date/ }).count();
    await shot(page, 'desk-04-sheet-date-differs.png');
    step('4. the sheet says the dates differ', { sheet: sheetBefore, offered });

    // 5. Use the schedule's date, with a reason.
    if (offered) {
      await sheet.getByRole('button', { name: /Use the schedule.s date/ }).click();
      const drawer = page.getByRole('dialog').last();
      await drawer.getByLabel(/^Reason/).fill('Aligned to the back-scheduled plan');
      await shot(page, 'desk-05-reschedule-form.png');
      const patch = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/tasks/${taskId}`) && r.request().method() === 'PATCH');
      await drawer.getByRole('button', { name: 'Change the due date' }).click();
      const res = await patch;
      const body = await res.json().catch(() => null);
      expect(res.status() === 200, `rescheduled (${res.status()} ${JSON.stringify(body).slice(0, 200)})`);
      await sheet.getByText(/The task is now due/).waitFor({ timeout: 15000 });
      await shot(page, 'desk-06-rescheduled.png');
      step('5. moved to the schedule\'s date', { status: res.status(), data: body.data });
    } else step('5. already on the schedule\'s date');

    // 6. Tasking's own read has the new date; the sheet no longer offers the move.
    const work = await api(page, 'GET', '/api/tasks/my-work');
    const mine = (Array.isArray(work.json.data) ? work.json.data : (work.json.data.items ?? work.json.data.tasks ?? [])).find?.((t) => t.taskId === taskId) ?? null;
    expect(mine && String(mine.dueDate).slice(0, 10) >= scheduled, `my-work has the schedule's date (${JSON.stringify(mine)?.slice(0, 200)})`);
    plan = await openPlan(page, id);
    sheet = await openSubmitSheet(page, plan);
    const sheetAfter = await sheet.getByTestId('py-task-plan').innerText();
    expect((await sheet.getByRole('button', { name: /Use the schedule.s date/ }).count()) === 0, 'the move is no longer offered');
    await shot(page, 'desk-07-sheet-after.png');
    step('6. tasking has the new date; the move is no longer offered', { myWork: { dueDate: mine.dueDate }, sheet: sheetAfter });
    await page.keyboard.press('Escape');

    // 7. Phone width.
    await page.setViewportSize({ width: 390, height: 844 });
    plan = await openPlan(page, id);
    await plan.getByTestId('pj-plan-strategy').scrollIntoViewIfNeeded();
    await shot(page, 'phone-01-strategy.png');
    sheet = await openSubmitSheet(page, plan);
    await shot(page, 'phone-02-sheet.png');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow <= 0, `no horizontal scroll at 390 (${overflow})`);
    step('7. 390 wide, no horizontal scroll', { overflow });
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
