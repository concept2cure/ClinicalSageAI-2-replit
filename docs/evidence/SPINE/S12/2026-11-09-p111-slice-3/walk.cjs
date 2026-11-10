/**
 * P-111 slice 3 in the running app: a task made anywhere in a work area bound to a work project starts on that work
 * project. On C2C-101 at 1440 light: the CMC area is opened from the "Drug substance CMC" work project's door; the
 * shell's own Task ("New task from this screen") opens its form on that work project, and the task is filed on it
 * (POST /api/tasks/tasks projectId = the work project); after "Show the whole project", the same form opens on the
 * filing project again.
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-p111-slice-3/walk.cjs [base-url] [programId]
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

async function openTaskForm(page) {
  await page.getByRole('button', { name: 'New task from this screen' }).click();
  const select = page.getByLabel('Project', { exact: true });
  await select.waitFor({ timeout: 20000 });
  await page.waitForFunction(() => { const s = document.querySelector('#cl-project'); return s && s.value !== ''; }, null, { timeout: 20000 });
  return select;
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
    expect(wp.id && wp.anchor, `the CMC work project and its filing project (${JSON.stringify(wp)})`);
    const card = await openCard(page);
    await card.locator('button.pj-work-project-door').filter({ has: page.locator('.pj-work-project-n', { hasText: /^Drug substance CMC$/ }) }).first().click();
    await page.waitForURL((u) => /\/concept2cure\/cmc/.test(u.pathname), { timeout: 20000 });
    await page.getByTestId('work-project-tasks').or(page.getByText('No tasks in this work project yet.')).first().waitFor({ timeout: 30000 });
    ok('CMC opened from the work project\'s door, bound', { workProject: wp.id });

    const select = await openTaskForm(page);
    const chosen = await select.inputValue();
    const label = await select.locator('option:checked').textContent();
    expect(chosen === String(wp.id), `the form starts on the work project (${chosen} ${label})`);
    const title = `Reconcile the batch analyses ${new Date().toISOString().slice(11, 19)}`;
    await page.locator('#cl-task').fill(title);
    await page.screenshot({ path: path.join(SHOTS, 'task-form-bound-1440-light.png') });
    const posted = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/tasks\/tasks$/.test(r.url()));
    await page.getByRole('button', { name: /Create task$/ }).click();
    const res = await posted;
    const sent = res.request().postDataJSON();
    log.requests.push({ post: '/api/tasks/tasks', status: res.status(), projectId: sent.projectId });
    expect(res.status() < 300 && sent.projectId === wp.id, `filed on the work project (${res.status()} ${sent.projectId})`);
    ok('the shell\'s Task form starts on the work project and files the task there', { projectId: sent.projectId, label });
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('work-project-tasks').getByText(title, { exact: false }).waitFor({ timeout: 30000 });
    await page.screenshot({ path: path.join(SHOTS, 'task-listed-1440-light.png') });
    ok('the task is listed in the work project\'s band, read back');

    await page.getByRole('button', { name: 'Show the whole project' }).click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.get('workProject'), null, { timeout: 10000 });
    const again = await openTaskForm(page);
    const unbound = await again.inputValue();
    expect(unbound === String(wp.anchor), `unbound, the form starts on the filing project (${unbound} vs ${wp.anchor})`);
    await page.screenshot({ path: path.join(SHOTS, 'task-form-unbound-1440-light.png') });
    ok('unbound, the same form starts on the filing project', { projectId: unbound });
    await ctx.close();
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
