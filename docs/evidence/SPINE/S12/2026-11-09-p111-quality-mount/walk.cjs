/**
 * P-111 slice 2 in the running app: a Quality work project's door opens the Quality area bound to it, with its own
 * tasks above the whole project's records. On C2C-101 at 1440 light: the "Drug product QA" work project (added through
 * the one intake if missing) is opened from Project knowledge's Work areas card; Quality shows its name and owner, says
 * the records below are the whole project's, and lists its tasks; a task is added through the one task create, filed
 * on the work project, and read back; a reload stays bound; "Show the whole project" unbinds. Then 390 dark.
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-p111-quality-mount/walk.cjs [base-url] [programId]
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


async function ensureQuality(page) {
  return page.evaluate(async (program) => {
    const auth = { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}`, 'Content-Type': 'application/json' };
    const team = await (await fetch(`/api/c2c/projects/${program}/team`, { headers: auth })).json();
    const anchor = team?.data?.project_id ?? team?.project_id;
    const r = await fetch('/api/c2c/projects', { method: 'POST', headers: auth, body: JSON.stringify({ parentProjectId: anchor, name: 'Drug product QA', workKind: 'quality' }) });
    return { status: r.status, id: (await r.json())?.data?.projectId };
  }, PROGRAM);
}

const band = (page) => page.getByTestId('work-project-bound');

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page, false);
    const wp = await ensureQuality(page);
    expect((wp.status === 201 || wp.status === 200) && wp.id, `the Quality work project exists (${JSON.stringify(wp)})`);
    ok('the Quality work project, through the one intake', wp);
    const card = await openCard(page);
    await card.locator('button.pj-work-project-door', { hasText: /Drug product QA/ }).first().click();
    await page.waitForURL((u) => /\/concept2cure\/quality/.test(u.pathname), { timeout: 20000 });
    await band(page).waitFor({ timeout: 30000 });
    await page.getByText('Its tasks are listed here. The records below are the whole project’s.').waitFor({ timeout: 20000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('workProject') === String(wp.id), `the URL keeps the binding (${page.url()})`);
    const heading = (await band(page).locator('.pj-work-project-n').textContent()).trim();
    expect(/^Drug product QA · /.test(heading), `the band names the work project and its owner (${heading})`);
    expect(await page.locator('.qms-tabbar').count() === 1, 'the Quality area itself is open');
    await page.screenshot({ path: path.join(SHOTS, 'quality-bound-1440-light.png') });
    ok('the door opens Quality bound to the work project, its records the whole project\'s', { url: url.pathname + url.search, heading });

    const title = `Review the CAPA effectiveness check ${new Date().toISOString().slice(11, 19)}`;
    await band(page).getByRole('button', { name: /Add a task/ }).click();
    await page.getByLabel(/^Task/).fill(title);
    const person = page.getByLabel(/^Person/);
    const people = await person.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    await person.selectOption(people[0]);
    await page.getByLabel(/^Due date/).fill('2026-12-04');
    await page.screenshot({ path: path.join(SHOTS, 'add-task-1440-light.png') });
    const posted = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/tasks\/tasks$/.test(r.url()));
    await page.locator('.de-btn.primary').click();
    const res = await posted;
    const sent = res.request().postDataJSON();
    log.requests.push({ post: '/api/tasks/tasks', status: res.status(), projectId: sent.projectId, sourceEntityType: sent.sourceEntityType, moduleType: sent.moduleType });
    expect(res.status() < 300 && sent.projectId === wp.id && sent.sourceEntityType === 'work_project_task', `the task is filed on the work project (${res.status()} ${JSON.stringify(sent).slice(0, 200)})`);
    await band(page).getByText(title, { exact: false }).waitFor({ timeout: 20000 });
    const line = (await band(page).locator('[data-testid="work-project-tasks"] li', { hasText: title }).textContent()).trim();
    await page.screenshot({ path: path.join(SHOTS, 'task-added-1440-light.png') });
    ok('a task is added on the work project and read back', { status: res.status(), line });

    await page.reload({ waitUntil: 'networkidle' });
    await band(page).getByText(title, { exact: false }).waitFor({ timeout: 30000 });
    ok('a reload stays bound');
    await band(page).getByRole('button', { name: 'Show the whole project' }).click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.get('workProject'), null, { timeout: 10000 });
    expect(await band(page).count() === 0, 'unbound, the band is gone');
    ok('"Show the whole project" unbinds');
    await ctx.close();

    const small = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const p2 = await small.newPage();
    await signIn(p2, true);
    await p2.goto(`${BASE}/concept2cure/quality?program=${PROGRAM}&workProject=${wp.id}`, { waitUntil: 'networkidle' });
    await band(p2).getByText(title, { exact: false }).waitFor({ timeout: 30000 });
    await band(p2).scrollIntoViewIfNeeded();
    await p2.screenshot({ path: path.join(SHOTS, 'quality-bound-390-dark.png') });
    const hScroll = await p2.evaluate(() => { const el = document.querySelector('.qms-page') || document.scrollingElement; return el.scrollWidth - el.clientWidth; });
    expect(hScroll <= 1, `no sideways scroll at 390 (${hScroll})`);
    ok('the same at 390 dark, from a copied link', { hScroll });
    await small.close();
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
