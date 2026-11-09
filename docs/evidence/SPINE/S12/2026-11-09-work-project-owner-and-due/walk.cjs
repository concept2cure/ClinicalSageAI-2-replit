/**
 * S12 in the running app: a work project gets its owner and due date through the Plan's one assign path (P-83, P-109;
 * no new column, route or store). On C2C-101 at 1440 light: in Project knowledge's Work areas card, a work project
 * says "No one is assigned to deliver it yet."; Assign opens the Plan's form; a person and a due date are chosen; the
 * row then says "Assigned to <person>, due <date>", read back from the Plan's task read. Then 390 dark.
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-work-project-owner-and-due/walk.cjs [base-url] [programId]
 *
 * A fresh work project is added first (through the one intake), so the run starts unassigned. Log: ./walk.json;
 * shots: ./screenshots/.
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

async function addWorkProject(page, name) {
  const res = await page.evaluate(async ({ program, name }) => {
    const auth = { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}`, 'Content-Type': 'application/json' };
    const team = await (await fetch(`/api/c2c/projects/${program}/team`, { headers: auth })).json();
    const anchor = team?.data?.project_id ?? team?.project_id;
    const r = await fetch('/api/c2c/projects', { method: 'POST', headers: auth, body: JSON.stringify({ parentProjectId: anchor, name, workKind: 'cmc' }) });
    return { status: r.status, body: await r.json() };
  }, { program: PROGRAM, name });
  expect(res.status === 201, `the work project is added (${res.status})`);
  return res.body.data.projectId;
}

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page, false);
    const name = `Drug product CMC ${new Date().toISOString().slice(0, 16)}`;
    const id = await addWorkProject(page, name);
    ok('a fresh work project, through the one intake', { id, name });
    const card = await openCard(page);
    const row = card.locator('li', { hasText: name });
    await row.getByText('No one is assigned to deliver it yet.').waitFor({ timeout: 20000 });
    ok('it says no one is assigned to deliver it yet');
    await row.getByRole('button', { name: /^Assign$/ }).click();
    const person = page.getByLabel(/^Person/);
    await person.waitFor({ timeout: 20000 });
    const options = await person.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, label: o.textContent })).filter((o) => o.value));
    expect(options.length > 0, 'the form lists the organisation\'s members');
    await person.selectOption(options[0].value);
    await page.getByLabel(/^Due date/).fill('2026-11-30');
    await page.screenshot({ path: path.join(SHOTS, 'assign-form-1440-light.png') });
    const posted = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/tasks\/tasks$/.test(r.url()));
    await page.locator('.de-btn.primary').click();
    const res = await posted;
    const body = await res.json();
    log.requests.push({ post: res.url().replace(BASE, ''), status: res.status(), sourceEntityType: body?.data?.sourceEntityType, sourceEntityId: body?.data?.sourceEntityId });
    expect(res.status() < 300 && body?.data?.sourceEntityType === 'work_project' && body?.data?.sourceEntityId === `${PROGRAM}:${id}`, `the task is the work project's (${res.status()} ${JSON.stringify(body).slice(0, 200)})`);
    const line = row.getByTestId('plan-assignment');
    await line.waitFor({ timeout: 20000 });
    const words = (await line.textContent()).trim();
    expect(/^Assigned to .+, due Nov 30, 2026$/.test(words), `the row says who and when (${words})`);
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'assigned-1440-light.png') });
    ok('the row says who delivers it and when, read back from the Plan\'s tasks', { words, person: options[0].label });
    await ctx.close();
    const small = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const p2 = await small.newPage();
    await signIn(p2, true);
    const c2 = await openCard(p2);
    const r2 = c2.locator('li', { hasText: name });
    await r2.getByTestId('plan-assignment').waitFor({ timeout: 20000 });
    await r2.scrollIntoViewIfNeeded();
    await p2.screenshot({ path: path.join(SHOTS, 'assigned-390-dark.png') });
    const hScroll = await p2.evaluate(() => { const i = document.querySelector('.page-inner.pj'); return i ? i.scrollWidth - i.clientWidth : null; });
    expect(hScroll === null || hScroll <= 1, `no sideways scroll at 390 (${hScroll})`);
    ok('the same at 390 dark', { hScroll });
    await small.close();
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
