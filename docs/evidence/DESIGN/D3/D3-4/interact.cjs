/**
 * D3-4's doors, used in the running app on one project (C2C-101), at 1440 light (D3.md §6 items 8, 9 and 11).
 *
 *   node docs/evidence/DESIGN/D3/D3-4/interact.cjs [base-url] [programId]
 *
 * 1. Evidence → Protocol: "Open in Study & Protocol Design" and "Open Biostatistics" each open their work area.
 * 2. The Tasks handoff: the project page is left for Tasks, the handoff is stashed as TaskBoard stashes it (stage
 *    'review' and a workId from the project's own work read), and the top bar's project crumb brings the page back:
 *    it opens Plan with that row first and focused.
 * 3. Respond: a commitment is recorded against the project's open agency letter through the project's own route
 *    (local, disposable data), the page lists it under "Commitments to the agency", and "Record fulfilment" opens the
 *    existing fulfilment dialog on the project's door. The dialog is closed without recording anything.
 * Log: ./interact.json; shots: ./screenshots/interact-*.png.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PROGRAM = process.argv[3];
const EMAIL = process.env.DEMO_SEED_EMAIL || 'jm.smith@concept2cure.pro';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const log = { base: BASE, program: PROGRAM, startedAt: new Date().toISOString(), steps: [], requests: [] };
const ok = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };
const shot = async (page, name) => { await page.screenshot({ path: path.join(SHOTS, `interact-${name}.png`) }); return `screenshots/interact-${name}.png`; };

async function signIn(page) {
  await page.goto(BASE + '/');
  return page.evaluate(async ({ email }) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json();
    const exp = new Date(Date.now() + 86_400_000).toISOString();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken);
      s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', exp);
      s.setItem('trialsage_user', JSON.stringify(j.user));
    }
    return j.accessToken;
  }, { email: EMAIL });
}

const api = (page, method, url, body) => page.evaluate(async ({ method, url, body }) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* no body */ }
  return { status: r.status, json };
}, { method, url, body });

async function openProject(page) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  await page.locator('h1.pj-title').waitFor({ timeout: 30000 });
}
const openStep = async (page, label) => { await page.locator('.pj-lc-stage', { hasText: label }).click(); await page.waitForTimeout(800); };
const activeStep = (page) => page.locator('.pj-lc-stage[aria-current="step"]').textContent().then((t) => t.trim());

async function protocolDoors(page) {
  for (const [door, surface] of [[/^Open in Study & Protocol Design/, /protocol-dev/], [/^Open Biostatistics/, /biostatistics/]]) {
    await openProject(page);
    await openStep(page, 'Evidence');
    const protocol = page.getByRole('region', { name: 'Protocol', exact: true });
    await protocol.getByRole('button', { name: door }).click();
    await page.waitForURL(surface, { timeout: 15000 });
    ok(`Protocol door ${door} opens ${page.url().replace(BASE, '')}`, { img: await shot(page, `protocol-${surface.source}`) });
  }
}

async function tasksHandoff(page) {
  const work = await api(page, 'GET', `/api/concept2cure/projects/${PROGRAM}/unified-work`);
  const items = (work.json?.items ?? []).filter((w) => w.status !== 'done');
  expect(items.length > 1, 'open work on the project');
  const target = items[items.length - 1];
  await openProject(page);
  await page.locator('nav').getByRole('link', { name: /^Tasks$/ }).or(page.getByRole('button', { name: /^Tasks$/ })).first().click();
  await page.waitForURL(/\/tasks/, { timeout: 15000 });
  await page.evaluate(({ id }) => {
    window.C2C_NAV_PARAMS = { surfaceId: 'project-home', params: { stage: 'review', workId: id }, setAt: Date.now() };
  }, { id: target.id });
  await page.locator('header.topbar button').filter({ hasText: /C2C-101/ }).first().click();
  await page.locator('h1.pj-title').waitFor({ timeout: 20000 });
  const row = page.locator('[data-work-target]');
  await row.waitFor({ timeout: 20000 }).catch(async (e) => {
    log.debug = { url: page.url(), step: await activeStep(page).catch(() => null), params: await page.evaluate(() => window.C2C_NAV_PARAMS ?? null), img: await shot(page, 'tasks-handoff-failed') };
    throw e;
  });
  await page.waitForTimeout(600);
  const first = await page.locator('section[aria-label="Tasks and approvals"] .pj-file-n').first().textContent();
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-work-target'));
  expect((await activeStep(page)) === 'Plan', 'the handoff opens Plan');
  expect(first === target.title, `the requested row first (${first})`);
  expect(focused === 'true', 'the requested row has focus');
  ok('Tasks handoff (stage review + workId) opens Plan with the requested row first and focused', { workId: target.id, title: target.title, img: await shot(page, 'tasks-handoff') });
}

async function respondFulfil(page) {
  const team = await api(page, 'GET', `/api/c2c/projects/${PROGRAM}/team`);
  const projectId = team.json?.project_id;
  expect(Number.isInteger(projectId), `the project's verified integer id (${JSON.stringify(team.json?.project_id)})`);
  const letters = await api(page, 'GET', `/api/concept2cure/projects/${PROGRAM}/agency-communications`);
  const rows = Array.isArray(letters.json) ? letters.json : letters.json?.data ?? [];
  const letter = rows.find((c) => c.closureStatus !== 'closed');
  expect(letter, `an open agency letter (${letters.status})`);
  const description = `D3-4 walk: confirm the 12-month stability pull (${new Date().toISOString().slice(0, 16)})`;
  const made = await api(page, 'POST', `/api/concept2cure/projects/${projectId}/agency-communications/${letter.id}/commitments`,
    { commitmentType: 'pmc', description, dueDate: '2027-03-01', reason: 'Recorded by the D3-4 running-app walk on local, disposable data.' });
  log.requests.push({ create: made.status, body: made.json });
  expect(made.status < 300, `the commitment recorded (${made.status} ${JSON.stringify(made.json)?.slice(0, 200)})`);
  await openProject(page);
  await openStep(page, 'Respond');
  const section = page.getByRole('region', { name: 'Commitments to the agency' });
  await section.getByText(description).waitFor({ timeout: 20000 });
  const row = section.locator('.cc-row', { hasText: description });
  await row.scrollIntoViewIfNeeded();
  const listed = await shot(page, 'respond-commitment');
  await row.getByRole('button', { name: 'Record fulfilment' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 15000 });
  await page.waitForTimeout(600); /* the drawer's entrance */
  const options = log.requests.length;
  const opened = await shot(page, 'respond-fulfil-dialog');
  ok('Respond lists the commitment; "Record fulfilment" opens the fulfilment dialog', { projectId, letter: letter.id, listed, opened, options });
  await page.keyboard.press('Escape');
}

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const failed = [];
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) failed.push(`${r.status()} ${r.url().replace(BASE, '')}`); });
  page.on('pageerror', (e) => failed.push(`pageerror ${e.message}`));
  page.on('request', (r) => { if (/fulfilment-options/.test(r.url())) log.requests.push({ fulfilmentOptions: r.url().replace(BASE, '') }); });
  try {
    await signIn(page);
    await protocolDoors(page);
    await tasksHandoff(page);
    await respondFulfil(page);
  } finally {
    log.failed = failed;
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'interact.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
