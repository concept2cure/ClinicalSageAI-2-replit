/**
 * The data room catalog, graded and subscribed, walked in the running app (S2, 2026-11-06).
 *
 *   node docs/evidence/SPINE/S2/2026-11-06/walk.cjs <base-url> <phase> [programA] [programB]
 *
 *   phase setup   captures a few small fictional files into two projects through the product's own upload
 *                 (POST /api/chat/upload with the project open), as a person dropping files on the Evidence step;
 *                 one is re-captured, so a supersession is in the room. Writes ./setup-state.json.
 *   phase before  the Data room lane as it was: shots before-*.png.
 *   phase catalog step 1 and 2: "All my projects", organized by study / kind / CTD / folder, each item graded
 *                 with its basis. Shots catalog-*.png.
 *   phase reach   where a person finds it: the project page's "Open the data catalog" and the Vault's "Data catalog"
 *                 tab. Shots reach-*.png.
 *   phase use     step 3: "Use in this project" on a capture of the other project, listed under "Used in this
 *                 project" first, then "Remove". Shots use-*.png.
 *
 * One dev-login per width; each context signs out at the end (five concurrent sessions per account).
 * No CDISC data is written here: the files are fictional and made by this script.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PHASE = process.argv[3] || 'before';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const SETUP = path.join(HERE, 'setup-state.json');
const EMAIL = process.env.DEMO_SEED_EMAIL || 'ana.author@concept2cure.pro';
const log = { base: BASE, phase: PHASE, startedAt: new Date().toISOString(), steps: [], apiErrors: [] };
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
  expect(who.status === 200 && who.email === EMAIL, `dev-login as ${EMAIL}`);
}

async function signOut(page) {
  await page.evaluate(async () => {
    const token = localStorage.getItem('trialsage_access_token');
    await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
  }).catch(() => undefined);
}

function api(page, method, url, body) {
  return page.evaluate(async ([m, u, b]) => {
    const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` },
      body: b === undefined ? undefined : JSON.stringify(b) });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json, text: json ? undefined : text.slice(0, 300) };
  }, [method, url, body]);
}

/** One file captured into a project, as the Evidence step's drop zone sends it. */
function upload(page, programId, name, mime, content) {
  return page.evaluate(async ([pid, n, m, c]) => {
    const fd = new FormData();
    fd.append('file', new File([c], n, { type: m }));
    fd.append('projectId', pid);
    const r = await fetch('/api/chat/upload', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` }, body: fd });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, [programId, name, mime, content]);
}

const FILES = {
  a: [
    ['zx-201-protocol-synopsis.txt', 'text/plain', 'Protocol ZX-201. A randomized, double-blind, placebo-controlled Phase 2 study of zelatinib in moderate plaque psoriasis. Primary endpoint: PASI 75 at week 16. Clinical study protocol synopsis, version 1.0, dated 2026-03-01.'],
    ['zx-201-adsl-extract.csv', 'text/csv', 'STUDYID,USUBJID,SUBJID,SITEID,ARM,TRT01P,TRT01A,AGE,SEX,RACE,SAFFL,ITTFL\nZX-201,ZX-201-001,001,01,Zelatinib,Zelatinib 20 mg,Zelatinib 20 mg,44,F,WHITE,Y,Y\nZX-201,ZX-201-002,002,01,Placebo,Placebo,Placebo,51,M,ASIAN,Y,Y\n'],
    ['zx-201-statistical-analysis-plan.txt', 'text/plain', 'Statistical analysis plan for protocol ZX-201, version 1.0. The primary analysis compares PASI 75 response at week 16 using a Cochran-Mantel-Haenszel test stratified by region.'],
  ],
  b: [
    ['zx-102-clinical-study-report-synopsis.txt', 'text/plain', 'Clinical study report synopsis, protocol ZX-102, a Phase 1 single ascending dose study of zelatinib in healthy volunteers. Data cut-off 2026-01-15. No serious adverse events.'],
  ],
  revised: ['zx-201-statistical-analysis-plan.txt', 'text/plain', 'Statistical analysis plan for protocol ZX-201, version 2.0. Amended: the primary analysis compares PASI 75 response at week 16 using a Cochran-Mantel-Haenszel test stratified by region and prior biologic use.'],
};

async function setup(page, a, b) {
  const out = { a, b, captures: [] };
  for (const [pid, files] of [[a, FILES.a], [b, FILES.b]]) {
    for (const [n, m, c] of files) {
      const r = await upload(page, pid, n, m, c);
      expect(r.status < 300 && r.json?.sourceId, `upload ${n} (${r.status} ${JSON.stringify(r.json).slice(0, 200)})`);
      out.captures.push({ project: pid, name: n, sourceId: r.json.sourceId });
      step(`captured ${n}`, { sourceId: r.json.sourceId, dataRoom: r.json.dataRoom });
    }
  }
  const [n, m, c] = FILES.revised;
  const r = await upload(page, a, n, m, c);
  expect(r.status < 300 && r.json?.sourceId, `re-capture ${n} (${r.status})`);
  out.captures.push({ project: a, name: `${n} (v2)`, sourceId: r.json.sourceId });
  step(`re-captured ${n}`, { sourceId: r.json.sourceId });
  fs.writeFileSync(SETUP, JSON.stringify(out, null, 2) + '\n');
}

/** The Data room lane of Project files, on the project page's Evidence step. */
async function openDataRoom(page, programId) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${programId}`, { waitUntil: 'networkidle' });
  const steps = page.getByRole('navigation', { name: 'Project lifecycle' });
  await steps.getByRole('button', { name: /^Evidence/ }).click();
  await page.locator('#pj-evidence-h').waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Data room', exact: true }).click();
  const room = page.getByTestId('editor-data-room');
  await room.waitFor({ timeout: 30000 });
  await room.scrollIntoViewIfNeeded();
  return room;
}

const shoot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

async function phaseBefore(page, width, a) {
  const room = await openDataRoom(page, a);
  await room.getByText('zx-201-protocol-synopsis.txt').first().waitFor({ timeout: 30000 });
  await shoot(page, `before-${width}`);
  step(`${width}: before, the lane lists only this project's captures, ungraded`, { text: (await room.innerText()).replace(/\s+/g, ' ').slice(0, 400) });
}

async function phaseCatalog(page, width, a, b) {
  const room = await openDataRoom(page, a);
  await room.getByRole('button', { name: 'All my projects' }).click();
  await room.getByTestId('data-room-catalog-controls').waitFor({ timeout: 30000 });
  await room.getByText('zx-102-clinical-study-report-synopsis.txt').first().waitFor({ timeout: 30000 });
  const text = (await room.innerText()).replace(/\s+/g, ' ');
  expect(/Grade [ABCD] · \d+/.test(text), 'every row shows its grade');
  await room.getByTestId('data-room-catalog-controls').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 250);
  await shoot(page, `catalog-${width}-by-study`);
  step(`${width}: the catalog across projects, organized by study`, { text: text.slice(0, 600) });
  for (const [value, name] of [['kind', 'kind'], ['ctd', 'ctd'], ['folder', 'folder'], ['project', 'project']]) {
    await room.getByLabel('Organize by').selectOption(value);
    await room.getByTestId('data-room-group').first().waitFor({ timeout: 10000 });
    const groups = await room.getByTestId('data-room-group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    step(`${width}: organized by ${name}`, { groups });
    await room.getByTestId('data-room-group').first().scrollIntoViewIfNeeded();
    if (width === 1440) await shoot(page, `catalog-${width}-by-${name}`);
  }
  // The grade's basis, opened on the superseded capture and on a dataset.
  const sap = room.getByTestId('data-room-entry').filter({ hasText: 'zx-201-statistical-analysis-plan.txt' });
  await sap.first().locator('summary').click();
  await sap.first().getByTestId('source-grade-basis').waitFor({ timeout: 10000 });
  const basis = (await sap.first().getByTestId('source-grade-basis').innerText()).replace(/\s+/g, ' ');
  step(`${width}: a grade's basis, criterion by criterion`, { basis });
  await shoot(page, `catalog-${width}-grade-basis`);
  const csv = room.getByTestId('data-room-entry').filter({ hasText: 'zx-201-adsl-extract.csv' });
  await csv.first().locator('summary').click();
  const csvBasis = (await csv.first().getByTestId('source-grade-basis').innerText()).replace(/\s+/g, ' ');
  step(`${width}: a dataset's grade reads the CDISC validator`, { basis: csvBasis });
  expect(/Conformance/.test(csvBasis), 'the dataset is graded on conformance');
  if (width === 1440) await shoot(page, `catalog-${width}-dataset-basis`);
  void b;
}

/**
 * Where a person finds it (2026-11-10, the founder: "I can not see the data catalog / data room from anywhere in the UI").
 * (1) The rail's Vault, with a project open: its "Data catalog" tab. (2) The project page's Data room section:
 * "Open the data catalog", which lands on that tab.
 */
async function phaseReach(page, width, a) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${a}`, { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Evidence/ }).click();
  const open = page.getByTestId('open-data-catalog');
  await open.waitFor({ timeout: 30000 });
  await open.scrollIntoViewIfNeeded();
  await shoot(page, `reach-${width}-project-page-link`);
  await open.click();
  const tab = page.getByRole('tab', { name: 'Data catalog' });
  await tab.waitFor({ timeout: 30000 });
  expect(await tab.getAttribute('aria-selected') === 'true', 'the project page lands on the Vault\'s Data catalog view');
  const room = page.getByTestId('editor-data-room');
  await room.getByTestId('data-room-catalog-controls').waitFor({ timeout: 30000 });
  await room.getByTestId('source-grade').first().waitFor({ timeout: 30000 });
  await shoot(page, `reach-${width}-vault-data-catalog`);
  step(`${width}: the project page's "Open the data catalog" opens Vault on the Data catalog, graded`, {
    text: (await room.innerText()).replace(/\s+/g, ' ').slice(0, 500),
  });
  // From the Vault's own tabs: away to the library and back.
  await page.getByRole('tab', { name: 'Library' }).click();
  await tab.click();
  await room.getByTestId('source-grade').first().waitFor({ timeout: 30000 });
  step(`${width}: the Vault's Data catalog tab, from its own tabs`);
}

async function phaseUse(page, width, a, b) {
  const room = await openDataRoom(page, a);
  await room.getByRole('button', { name: 'All my projects' }).click();
  const other = room.getByTestId('data-room-entry').filter({ hasText: 'zx-102-clinical-study-report-synopsis.txt' }).first();
  await other.waitFor({ timeout: 30000 });
  await other.locator('summary').click();
  await other.getByRole('button', { name: 'Use in this project' }).click();
  await other.getByText('Used in this project').first().waitFor({ timeout: 15000 });
  await shoot(page, `use-${width}-subscribed`);
  step(`${width}: "Use in this project" on the other project's capture`);
  await room.getByRole('button', { name: 'This project' }).click();
  const used = room.getByTestId('data-room-used');
  await used.waitFor({ timeout: 15000 });
  const usedText = (await used.innerText()).replace(/\s+/g, ' ');
  expect(/zx-102-clinical-study-report-synopsis/.test(usedText), 'the subscribed capture is listed first, under Used in this project');
  await shoot(page, `use-${width}-listed-first`);
  step(`${width}: this project's Data room lists what it uses first`, { text: usedText.slice(0, 400) });
  const pins = await api(page, 'GET', `/api/c2c/projects/${a}/evidence`);
  step(`${width}: recorded on the project`, { evidence: (pins.json?.evidence ?? []).map((e) => ({ kind: e.evidence_kind, ref: e.evidence_ref, title: e.title, dataRoom: e.data_room })) });
  await used.getByRole('button', { name: /^Remove/ }).first().click();
  await used.waitFor({ state: 'detached', timeout: 15000 }).catch(() => undefined);
  const after = await api(page, 'GET', `/api/c2c/projects/${a}/evidence`);
  expect(!(after.json?.evidence ?? []).some((e) => e.evidence_kind === 'data_room'), 'Remove takes it off the project');
  await shoot(page, `use-${width}-removed`);
  step(`${width}: Remove takes it off the project`);
  void b;
}

const PHASES = {
  setup: (page, _width, a, b) => setup(page, a, b),
  before: (page, width, a) => phaseBefore(page, width, a),
  catalog: phaseCatalog,
  use: phaseUse,
  reach: (page, width, a) => phaseReach(page, width, a),
};
function runPhase(page, width, a, b) {
  const run = PHASES[PHASE];
  expect(run, `a phase: ${Object.keys(PHASES).join(', ')}`);
  return run(page, width, a, b);
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const setupState = fs.existsSync(SETUP) ? JSON.parse(fs.readFileSync(SETUP, 'utf8')) : {};
  const a = process.argv[4] || setupState.a;
  const b = process.argv[5] || setupState.b;
  expect(a && b, 'two project ids');
  const browser = await chromium.launch();
  try {
    for (const width of PHASE === 'setup' ? [1440] : [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) log.apiErrors.push(`${width} ${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });
      await signIn(page);
      try {
        await runPhase(page, width, a, b);
      } catch (e) {
        await shoot(page, `${PHASE}-${width}-FAILED`).catch(() => undefined);
        throw e;
      } finally {
        await signOut(page);
        await context.close();
      }
    }
    log.ok = true;
  } catch (err) {
    log.ok = false;
    log.error = String(err && err.message || err);
    console.error(log.error);
    process.exitCode = 1;
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, `walk-${PHASE}.json`), JSON.stringify(log, null, 2) + '\n');
    await browser.close();
  }
})();
