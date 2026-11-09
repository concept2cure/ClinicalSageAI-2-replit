/**
 * S12 (P-83, P-109): a new version of a data-room source flags the sections written from the old one, in the
 * running app.
 *
 *   node docs/evidence/SPINE/S12/2026-11-08-superseded-source-flags-sections/walk.cjs [base-url] [programId] [protocolId]
 *
 * 1. Upload a text file to the project's data room (the composer's upload, POST /api/chat/upload).
 * 2. Cite it in one of the project's sections (the editor's cite, POST /api/authoring/sections/:id/cite-source).
 * 3. Upload a changed file under the same name: the capture records it as the next version.
 * 4. On Evidence, the data room says a citation points to a source that has since changed, and names the section.
 * Local, disposable data. Log: ./walk.json; shots: ./screenshots/.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PROGRAM = process.argv[3];
/* The study the data is from. A new capture is the next version of an earlier one only within one study (the capture
   matches the study by the protocol number on its title page, catalog-facts.ts matchStudy). The seeded C2C-101 study's
   ids cannot be named in text, so the walk's local database registers a study with this protocol id (README). */
const PROTOCOL = process.argv[4] || 'C2C-101-201W';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const log = { base: BASE, program: PROGRAM, startedAt: new Date().toISOString(), steps: [] };
const ok = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

const call = (page, method, url, body) => page.evaluate(async ({ method, url, body }) => {
  const headers = { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` };
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* no body */ }
  return { status: r.status, json };
}, { method, url, body });

const upload = (page, name, text) => page.evaluate(async ({ name, text, program }) => {
  const form = new FormData();
  form.append('file', new File([text], name, { type: 'text/plain' }));
  form.append('projectId', program);
  const r = await fetch('/api/chat/upload', { method: 'POST', body: form, headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } });
  let json = null; try { json = await r.json(); } catch { /* no body */ }
  return { status: r.status, json };
}, { name, text, program: PROGRAM });

const sourceIdOf = (res) => res.json?.sourceId ?? null;
/* A list in a reply, at its top level or under `data`. */
const listOf = (res, key) => res.json?.[key] ?? res.json?.data?.[key] ?? [];

async function aSection(page) {
  const docs = await call(page, 'GET', `/api/authoring/docs?programId=${PROGRAM}`);
  for (const doc of listOf(docs, 'documents')) {
    const sections = listOf(await call(page, 'GET', `/api/authoring/docs/${doc.id}/sections`), 'sections');
    if (sections.length) return { doc, section: sections[0] };
  }
  return null;
}

async function signIn(page) {
  await page.goto(BASE + '/');
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) });
    const j = await r.json();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', new Date(Date.now() + 864e5).toISOString()); s.setItem('trialsage_user', JSON.stringify(j.user));
    }
  });
}

const dataCut = (run, months, assay) => `Protocol No.: ${PROTOCOL}\nStability data cut ${run}, ${months} months: assay ${assay}%.`;

async function citeFirstVersion(page, name, run) {
  const v1 = await upload(page, name, dataCut(run, 6, '99.1'));
  const v1Id = sourceIdOf(v1);
  log.v1 = { status: v1.status, sourceId: v1Id };
  expect(v1.status < 300 && v1Id, `the first upload records a source (${v1.status} ${JSON.stringify(v1.json)?.slice(0, 300)})`);
  ok('uploaded version 1', { sourceId: v1Id });
  const target = await aSection(page);
  expect(target, 'a section in one of the project\'s documents');
  const cite = await call(page, 'POST', `/api/authoring/sections/${target.section.id}/cite-source`, { source_id: v1Id });
  log.cite = { status: cite.status, body: cite.json };
  expect(cite.status < 300, `the section cites version 1 (${cite.status} ${JSON.stringify(cite.json)?.slice(0, 300)})`);
  ok('cited version 1', { document: target.doc.title, section: target.section.code ?? target.section.title });
  return { v1Id, target };
}

async function uploadSecondVersion(page, name, run, v1Id) {
  const v2 = await upload(page, name, dataCut(run, 12, '98.7'));
  const v2Id = sourceIdOf(v2);
  log.v2 = { status: v2.status, sourceId: v2Id };
  expect(v2.status < 300 && v2Id && v2Id !== v1Id, `the second upload records a new source (${v2.status})`);
  ok('uploaded version 2 under the same name', { sourceId: v2Id });
}

async function changesListTheSection(page, v1Id, target) {
  const changes = await call(page, 'GET', `/api/c2c/projects/${PROGRAM}/source-changes`);
  const mine = listOf(changes, 'changes').filter((c) => c.sourceId === v1Id);
  log.changes = { status: changes.status, mine };
  expect(mine.length === 1 && mine[0].sectionId === String(target.section.id), `the project's changes list the section (${JSON.stringify(log.changes).slice(0, 400)})`);
  ok('the project lists the section as written from a superseded version', { currentChecksum: mine[0].currentChecksum, citedChecksum: mine[0].citedChecksum });
}

async function evidenceSaysSo(page) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  await page.locator('.pj-lc-stage', { hasText: 'Evidence' }).click();
  const note = page.getByText(/point(s)? to a source that has since changed/);
  await note.waitFor({ timeout: 20000 });
  await note.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, 'evidence-changed-sources.png') });
  ok('Evidence\'s data room says a citation points to a source that has since changed', { text: (await note.textContent()).trim() });
}

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  try {
    await signIn(page);
    const run = Date.now(); /* a capture with the same bytes is reused whatever its name, so each run's are its own */
    const name = `stability-data-cut-${run}.txt`;
    const { v1Id, target } = await citeFirstVersion(page, name, run);
    await uploadSecondVersion(page, name, run, v1Id);
    await changesListTheSection(page, v1Id, target);
    await evidenceSaysSo(page);
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
