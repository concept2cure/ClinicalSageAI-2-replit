/**
 * P-111 slice 5 in the running app: a work project's task has one level of subtasks. On C2C-101 at 1440 light: the
 * CMC area is opened from the "Drug substance CMC" work project's door; a task is added in its band, then "Add a
 * subtask" under it; POST /api/tasks/tasks carries parentTaskId = the task's own row; the subtask is listed under its
 * task, indented; a subtask offers no "Add a subtask" of its own (one level). A parent from another project is
 * refused by the server (409 PARENT_TASK_REFUSED, nothing written). Then 390 dark.
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-p111-slice-5/walk.cjs [base-url] [programId]
 *
 * Log: ./walk.json; shots: ./screenshots/.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PROGRAM = process.argv[3];
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const log = { base: BASE, program: PROGRAM, startedAt: new Date().toISOString(), steps: [], requests: [] };
const ok = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

async function signIn(page, dark) {
  await page.goto(BASE + '/');
  await page.evaluate(async (dark) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) });
    const j = await r.json();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', new Date(Date.now() + 864e5).toISOString()); s.setItem('trialsage_user', JSON.stringify(j.user));
    }
    localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark }));
  }, dark);
}

async function openCard(page) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  const card = page.getByTestId('pj-work-projects');
  await card.waitFor({ timeout: 30000 });
  await page.waitForFunction(() => !/Reading this project/.test(document.querySelector('[data-testid="pj-work-projects"]')?.textContent ?? ''), null, { timeout: 20000 });
  await card.scrollIntoViewIfNeeded();
  return card;
}


async function ensureCmc(page) {
  return page.evaluate(async (program) => {
    const auth = { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}`, 'Content-Type': 'application/json' };
    const team = await (await fetch(`/api/c2c/projects/${program}/team`, { headers: auth })).json();
    const anchor = team?.data?.project_id ?? team?.project_id;
    const r = await fetch('/api/c2c/projects', { method: 'POST', headers: auth, body: JSON.stringify({ parentProjectId: anchor, name: 'Drug substance CMC', workKind: 'cmc' }) });
    return { status: r.status, id: (await r.json())?.data?.projectId, anchor };
  }, PROGRAM);
}

async function fillAndSubmit(page, title) {
  await page.getByLabel(/^Task/).fill(title);
  const person = page.getByLabel(/^Person/);
  const people = await person.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  await person.selectOption(people[0]);
  await page.getByLabel(/^Due date/).fill('2026-12-04');
  const posted = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/tasks\/tasks$/.test(r.url()));
  await page.locator('.de-btn.primary').click();
  const res = await posted;
  return { status: res.status(), sent: res.request().postDataJSON(), body: await res.json() };
}

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page, false);
    const wp = await ensureCmc(page);
    expect(wp.id && wp.anchor, `the CMC work project (${JSON.stringify(wp)})`);
    await page.goto(`${BASE}/concept2cure/cmc?program=${PROGRAM}&workProject=${wp.id}`, { waitUntil: 'networkidle' });
    const band = page.getByTestId('work-project-bound');
    await band.getByRole('button', { name: /^.?Add a task$/ }).last().waitFor({ timeout: 30000 });
    const stamp = new Date().toISOString().slice(11, 19);
    const parentTitle = `Qualify the drug substance supplier ${stamp}`;
    await band.getByRole('button', { name: /Add a task$/ }).last().click();
    const top = await fillAndSubmit(page, parentTitle);
    expect(top.status < 300 && top.sent.projectId === wp.id && top.sent.parentTaskId === undefined, `the task (${top.status})`);
    const parentItem = band.locator('[data-testid="work-project-tasks"] > li', { hasText: parentTitle });
    await parentItem.waitFor({ timeout: 20000 });
    ok('a task is added in the work project', { status: top.status });

    await parentItem.getByRole('button', { name: /Add a subtask/ }).click();
    await page.getByText(`Add a subtask to ${parentTitle}`).waitFor({ timeout: 10000 });
    await page.screenshot({ path: path.join(SHOTS, 'add-subtask-1440-light.png') });
    const subTitle = `Audit the supplier's GMP certificate ${stamp}`;
    const sub = await fillAndSubmit(page, subTitle);
    log.requests.push({ post: '/api/tasks/tasks (subtask)', status: sub.status, projectId: sub.sent.projectId, parentTaskId: sub.sent.parentTaskId });
    expect(sub.status < 300 && sub.sent.projectId === wp.id && Number.isInteger(sub.sent.parentTaskId), `the subtask names its parent (${sub.status} ${JSON.stringify(sub.sent).slice(0, 160)})`);
    const nested = parentItem.getByTestId('work-project-subtasks');
    await nested.getByText(subTitle, { exact: false }).waitFor({ timeout: 20000 });
    expect(await nested.getByRole('button', { name: /Add a subtask/ }).count() === 0, 'a subtask offers no subtask of its own');
    await parentItem.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'subtask-listed-1440-light.png') });
    ok('the subtask is filed with its parent and listed under it, one level only', { parentTaskId: sub.sent.parentTaskId });

    const refused = await page.evaluate(async ({ anchor, parentTaskId }) => {
      const auth = { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}`, 'Content-Type': 'application/json' };
      const r = await fetch('/api/tasks/tasks', { method: 'POST', headers: auth,
        body: JSON.stringify({ title: 'Walk: a parent from another project', moduleType: 'CMC', projectId: anchor, parentTaskId }) });
      return { status: r.status, body: await r.json() };
    }, { anchor: wp.anchor, parentTaskId: sub.sent.parentTaskId });
    log.requests.push({ post: '/api/tasks/tasks (foreign parent)', status: refused.status, code: refused.body?.code });
    expect(refused.status === 409 && refused.body?.code === 'PARENT_TASK_REFUSED', `a parent from another project is refused (${JSON.stringify(refused)})`);
    ok('a parent from another project is refused, nothing written', refused);
    await ctx.close();

    const small = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const p2 = await small.newPage();
    await signIn(p2, true);
    await p2.goto(`${BASE}/concept2cure/cmc?program=${PROGRAM}&workProject=${wp.id}`, { waitUntil: 'networkidle' });
    const n2 = p2.getByTestId('work-project-subtasks').filter({ hasText: subTitle });
    await n2.waitFor({ timeout: 30000 });
    await n2.scrollIntoViewIfNeeded();
    await p2.screenshot({ path: path.join(SHOTS, 'subtask-390-dark.png') });
    const hScroll = await p2.evaluate(() => { const el = document.querySelector('.page-inner') || document.scrollingElement; return el.scrollWidth - el.clientWidth; });
    expect(hScroll <= 1, `no sideways scroll at 390 (${hScroll})`);
    ok('the same at 390 dark', { hScroll });
    await small.close();
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
