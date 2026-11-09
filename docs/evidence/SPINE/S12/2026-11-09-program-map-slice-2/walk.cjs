/**
 * S12 gap 5, slice 2, item 3, in the running app: a work project is assigned to produce a Vault document, through the
 * Plan's one assign path (no new column, route or store), and its row says so, re-checked on every read.
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-program-map-slice-2/walk.cjs [base-url] [programId]
 *
 * On C2C-101 at 1440 light: a fresh CMC work project is added through the one intake; its row offers "Vault document it
 * produces", listing the program's current families by title, code and version; one is chosen and Assign posts the
 * Plan's task with moduleData.vaultDocumentCode; the row then says "Assigned to produce <title> (current v<n>)". A
 * code that is not in the program is refused by POST /api/tasks/tasks (409, nothing written). Then 390 dark.
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

/** The filing project's verified id and a fresh CMC work project under it, through the one intake. */
async function addWorkProject(page, name) {
  const res = await page.evaluate(async ({ program, name }) => {
    const auth = { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}`, 'Content-Type': 'application/json' };
    const team = await (await fetch(`/api/c2c/projects/${program}/team`, { headers: auth })).json();
    const anchor = team?.data?.project_id ?? team?.project_id;
    const r = await fetch('/api/c2c/projects', { method: 'POST', headers: auth, body: JSON.stringify({ parentProjectId: anchor, name, workKind: 'cmc' }) });
    return { anchor, status: r.status, body: await r.json() };
  }, { program: PROGRAM, name });
  expect(res.status === 201, `the work project is added (${res.status})`);
  return { anchor: res.anchor, id: res.body.data.projectId };
}

/** A task naming a code that is not in the program: refused by the server, nothing written. */
async function postForeignCode(page, anchor, id) {
  return page.evaluate(async ({ program, anchor, id }) => {
    const auth = { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}`, 'Content-Type': 'application/json' };
    const r = await fetch('/api/tasks/tasks', { method: 'POST', headers: auth, body: JSON.stringify({
      title: 'Deliver: walk refusal', moduleType: 'Plan', moduleSource: 'project-work-projects', category: 'work-project', taskType: 'work-project',
      priority: 'medium', projectId: anchor, assigneeId: 1, sourceEntityType: 'work_project', sourceEntityId: `${program}:${id}`,
      moduleData: { programId: program, workProjectId: id, workKind: 'cmc', vaultDocumentCode: 'NOT-IN-THIS-PROGRAM' } }) });
    return { status: r.status, body: await r.json() };
  }, { program: PROGRAM, anchor, id });
}

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page, false);
    const name = `Drug substance CMC ${new Date().toISOString().slice(0, 19)}`;
    const { anchor, id } = await addWorkProject(page, name);
    ok('a fresh work project, through the one intake', { id, name });

    const refused = await postForeignCode(page, anchor, id);
    log.requests.push({ post: '/api/tasks/tasks (foreign code)', status: refused.status, body: refused.body });
    expect(refused.status === 409 && refused.body?.code === 'VAULT_FAMILY_NOT_IN_PROGRAM', `a code not in the program is refused (${refused.status} ${JSON.stringify(refused.body)})`);
    ok('a code not in the program\'s Vault is refused, nothing assigned', { status: refused.status, message: refused.body?.error });

    const card = await openCard(page);
    const row = card.locator('li', { hasText: name });
    await row.getByText('No one is assigned to deliver it yet.').waitFor({ timeout: 20000 });
    expect(await row.getByTestId('pj-work-project-produces').count() === 0, 'nothing is said about a family before one is named');
    const picker = row.getByLabel(/Vault document it produces/);
    await picker.waitFor({ timeout: 20000 });
    const options = await picker.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, label: o.textContent })));
    expect(options[0].label === 'Not named' && options.length > 1, 'the picker lists the program\'s families, none chosen');
    const chosen = options[1];
    await picker.selectOption(chosen.value);
    ok('the picker lists the program\'s current families by title, code and version', { count: options.length - 1, chosen });

    await row.getByRole('button', { name: /^Assign$/ }).click();
    const person = page.getByLabel(/^Person/);
    await person.waitFor({ timeout: 20000 });
    const people = await person.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, label: o.textContent })).filter((o) => o.value));
    await person.selectOption(people[0].value);
    await page.getByLabel(/^Due date/).fill('2026-11-30');
    await page.screenshot({ path: path.join(SHOTS, 'family-picker-1440-light.png') });
    const posted = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/tasks\/tasks$/.test(r.url()));
    await page.locator('.de-btn.primary').click();
    const res = await posted;
    const sent = res.request().postDataJSON();
    log.requests.push({ post: res.url().replace(BASE, ''), status: res.status(), moduleData: sent?.moduleData });
    expect(res.status() < 300 && sent?.moduleData?.vaultDocumentCode === chosen.value, `the task names the chosen family (${res.status()} ${JSON.stringify(sent?.moduleData)})`);
    ok('Assign posts the Plan\'s task with the chosen family', { status: res.status(), vaultDocumentCode: sent.moduleData.vaultDocumentCode });

    const produces = row.getByTestId('pj-work-project-produces');
    await produces.waitFor({ timeout: 20000 });
    const words = (await produces.textContent()).trim();
    expect(/^Assigned to produce .+ \(current v.+\)$/.test(words), `the row says what it was assigned to produce (${words})`);
    const line = (await row.getByTestId('plan-assignment').textContent()).trim();
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'assigned-to-produce-1440-light.png') });
    ok('the row says who delivers it, when, and what it was assigned to produce, read back', { line, words });
    await ctx.close();

    const small = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const p2 = await small.newPage();
    await signIn(p2, true);
    const c2 = await openCard(p2);
    const r2 = c2.locator('li', { hasText: name });
    await r2.getByTestId('pj-work-project-produces').waitFor({ timeout: 20000 });
    const kept = await r2.getByLabel(/Vault document it produces/).inputValue();
    expect(kept === chosen.value, `read again, the picker starts from the assigned family (${kept})`);
    await r2.scrollIntoViewIfNeeded();
    await p2.screenshot({ path: path.join(SHOTS, 'assigned-to-produce-390-dark.png') });
    const hScroll = await p2.evaluate(() => { const i = document.querySelector('.page-inner.pj'); return i ? i.scrollWidth - i.clientWidth : null; });
    expect(hScroll === null || hScroll <= 1, `no sideways scroll at 390 (${hScroll})`);
    ok('the same at 390 dark, the picker starting from the assigned family', { hScroll, kept });
    await small.close();
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
