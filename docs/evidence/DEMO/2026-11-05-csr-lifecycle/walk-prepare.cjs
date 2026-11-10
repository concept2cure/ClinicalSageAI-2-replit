/**
 * The runbook's "Before the demo" steps 5–15, as a person does them in the app (walk.cjs runs them).
 */
const {
  fs, path, crypto, BASE, DATA, PROJECT_TITLE, CSR_TITLE, PEOPLE, DATASETS, DEFINE, EFFICACY, MANIFEST, APPROVE, CSR_ENTRY,
  state, expect, sleep, saveState, shot, toTop, step, api, retrying, waitFor,
  openNewDocument, csrEntries, openCsr, checkCsrCatalog, openVersions,
} = require('./walk-common.cjs');

// ---------------------------------------------------------------- prepare: project

async function findProject(page) {
  const r = await api(page, 'GET', '/api/c2c/projects?limit=100');
  return (r.body?.data ?? []).find((p) => String(p.title ?? p.name ?? '') === PROJECT_TITLE)?.id ?? null;
}

async function createProject(page) {
  await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /New project/ }).first().click();
  await page.getByText('Investigational New Drug Application', { exact: true }).first().click();
  await page.getByRole('button', { name: /^Continue/ }).click();
  const s = page.locator('section.npw');
  await s.locator('#npw-client-workspace').selectOption({ index: 1 });
  await s.getByLabel('Project name').fill(PROJECT_TITLE);
  await s.getByLabel('Product name').fill('Xanomeline TTS');
  await s.getByLabel('Indication').fill('Mild to moderate Alzheimer’s disease');
  await s.getByLabel('Product type').selectOption({ label: 'Drug' });
  await page.getByRole('button', { name: /^Continue/ }).click();
  const created = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/c2c/projects'));
  await page.getByRole('button', { name: /^Create project/ }).click();
  expect((await created).status() === 201, 'POST /api/c2c/projects answered 201');
  await page.waitForURL(/project-home\?program=/);
  return new URL(page.url()).searchParams.get('program');
}

async function prepareProject() {
  const page = PEOPLE.author.page;
  let id = state.data.programId || await findProject(page);
  const made = !id;
  if (!id) id = await createProject(page);
  state.data.programId = id;
  saveState();
  await page.goto(`${BASE}/concept2cure/project-home?program=${id}`, { waitUntil: 'networkidle' });
  return { outcome: made ? 'pass' : 'skipped', programId: id, screenshot: await shot(page, '00-project.png') };
}

// ---------------------------------------------------------------- prepare: Vault upload (the runbook's API path)

const sha256Of = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(DATA, file))).digest('hex');
const mimeOf = (name) => (name.endsWith('.json') ? 'application/json' : name.endsWith('.xml') ? 'application/xml' : 'application/octet-stream');

async function ingest(page, name, code) {
  const token = await page.evaluate(() => localStorage.getItem('trialsage_access_token'));
  const r = await page.request.post(`${BASE}/api/vault/ingest`, {
    headers: { Authorization: `Bearer ${token}` }, timeout: 300_000,
    multipart: { file: { name, mimeType: mimeOf(name), buffer: fs.readFileSync(path.join(DATA, name)) }, programId: state.data.programId,
      documentCode: `CDISCPILOT01-${code}`, documentTitle: name, documentType: 'MODULE_5', version: '1.0', classification: 'CONFIDENTIAL' },
  });
  const j = await r.json().catch(() => null);
  expect(r.status() === 201 && j?.document?.id, `ingest ${name} answered 201 (got ${r.status()} ${JSON.stringify(j).slice(0, 200)})`);
  state.data.files[name] = j.document.id;
  saveState();
}

/** The study's manifest: title-page metadata and define.xml declarations; the datasets by Vault id and SHA-256. */
function writeManifest() {
  const sel = (f) => ({ documentId: state.data.files[f], expectedSha256: sha256Of(f) });
  const hasEfficacy = Boolean(state.data.files[EFFICACY]);
  const manifest = {
    format: 'concept2cure.csr-adam-bundle.v1', dataCutDate: '2015-03-05',
    studyInfo: { title: 'Safety and Efficacy of the Xanomeline Transdermal Therapeutic System (TTS) in Patients with Mild to Moderate Alzheimer’s Disease',
      protocolNumber: 'CDISCPILOT01', phase: 'Phase 2', indication: 'Mild to moderate Alzheimer’s disease', sponsor: 'CDISC Pilot Project',
      investigationalProduct: 'Xanomeline Transdermal Therapeutic System (TTS)', comparator: 'Placebo',
      studyDesign: 'Prospective, randomized, multi-center, double-blind, placebo-controlled, parallel-group study',
      primaryEndpoint: 'ADAS-Cog (11) change from baseline to Week 24 (LOCF)',
      secondaryEndpoints: ['ADAS-Cog (11) at Weeks 8 and 16', 'CIBIC+ at Weeks 8 and 16', 'Mean Revised Neuropsychiatric Inventory (NPI-X) from Week 4 to Week 24'],
      sampleSize: 254, treatmentDuration: '26 weeks', targetAgencies: ['FDA'] },
    arms: [{ treatment: 'Placebo', armId: 'PBO', armName: 'Placebo' }, { treatment: 'Xanomeline Low Dose', armId: 'XANLOW', armName: 'Xanomeline Low Dose' },
      { treatment: 'Xanomeline High Dose', armId: 'XANHIGH', armName: 'Xanomeline High Dose' }],
    randomizedFlag: 'ITTFL',
    datasets: Object.fromEntries(DATASETS.map(([f, code]) => [code, sel(f)])),
    ...(hasEfficacy ? { efficacyResults: sel(EFFICACY) } : {}),
    conventions: { disposition: 'DCDECOD', aeDiscontinuationFlag: 'DSRAEFL', aeDiscontinuationDate: 'RFENDT', causality: { REMOTE: 'not related' },
      rangeIndicator: { N: 'NORMAL', H: 'HIGH', L: 'LOW' }, lastOnTreatment: { variable: 'AVISIT', value: 'End of Treatment' },
      exposure: { durationDays: 'TRTDUR', averageDailyDose: { variable: 'AVGDD', unit: 'mg' } },
      populations: [{ flag: 'EFFFL', label: 'Efficacy Population Flag' }, { flag: 'COMP24FL', label: 'Completers of Week 24 Population Flag' }],
      demographics: { presentation: 'descriptive', characteristics: [
        { variable: 'MMSETOT', label: 'MMSE Total', kind: 'continuous' }, { variable: 'EDUCLVL', label: 'Years of Education', kind: 'continuous' },
        { variable: 'DURDIS', label: 'Duration of Disease (Months)', kind: 'continuous' },
        { variable: 'DURDSGR1', label: 'Pooled Disease Duration Group 1', kind: 'categorical', categories: ['<12', '>=12'] },
        { variable: 'BMIBLGR1', label: 'Pooled Baseline BMI Group 1', kind: 'categorical', categories: ['<25', '25-<30', '>=30'] }] } },
  };
  fs.writeFileSync(path.join(DATA, MANIFEST), JSON.stringify(manifest, null, 2));
}

async function prepareUploads() {
  const page = PEOPLE.author.page;
  const wanted = [...DATASETS, [DEFINE, 'DEFINE'], ...(fs.existsSync(path.join(DATA, EFFICACY)) ? [[EFFICACY, 'EFFICACY']] : [])];
  let uploaded = 0;
  for (const [name, code] of wanted) {
    if (state.data.files[name]) continue;
    await ingest(page, name, code);
    uploaded++;
  }
  if (!state.data.files[MANIFEST]) {
    writeManifest();
    await ingest(page, MANIFEST, 'ADAM-BUNDLE');
    uploaded++;
  }
  return { outcome: uploaded ? 'pass' : 'skipped', uploaded, files: Object.keys(state.data.files) };
}

// ---------------------------------------------------------------- prepare: the Vault review and approval ceremony

async function stageOf(page, file) {
  const r = await api(page, 'GET', `/api/c2c/project-vault/${state.data.programId}/documents/${state.data.files[file]}/versions`);
  const v = (r.body?.data?.versions ?? []).find((x) => x.current);
  const round = v?.lifecycle?.round;
  const reviewed = (round?.members ?? []).some((m) => m.role === 'reviewer' && m.outcome === 'signed');
  return { stage: v?.lifecycle?.stage ?? 'not_sent', reviewed };
}

/** The version's action button (Send for review, Sign review, Approve), in its open Versions section. */
async function openVersionAction(page, file, label) {
  await openVersions(page, file);
  const button = page.locator(`button[aria-label^="${label}: ${file} v"]`);
  await button.scrollIntoViewIfNeeded();
  return button;
}

async function sendForReview(file, shotName) {
  const page = PEOPLE.author.page;
  await (await openVersionAction(page, file, 'Send for review')).click();
  const dlg = page.getByRole('dialog').last();
  await dlg.locator('fieldset').nth(0).getByRole('checkbox', { name: PEOPLE.reviewer.name }).check();
  await dlg.locator('fieldset').nth(1).getByRole('checkbox', { name: PEOPLE.approver.name }).check();
  const due = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  await dlg.locator('#vr-review-due').fill(due(14));
  await dlg.locator('#vr-approval-due').fill(due(21));
  await dlg.locator('#vr-reason').fill('Study data for the CDISCPILOT01 CSR: review and approve this exact version.');
  if (shotName) await shot(page, shotName);
  await dlg.getByRole('button', { name: 'Send for review', exact: true }).click();
  await dlg.waitFor({ state: 'detached', timeout: 30_000 });
}

async function signVersion(who, file, label, reason, shotName) {
  const person = PEOPLE[who];
  const page = person.page;
  await (await openVersionAction(page, file, label)).click();
  const dlg = page.getByRole('dialog').last();
  await dlg.getByLabel('Reason for this action').fill(reason);
  await dlg.getByLabel(/Password/).fill(person.password);
  if (shotName) await shot(page, shotName);
  await dlg.getByRole('button', { name: 'Sign and commit' }).click();
  await page.getByText('Signature applied').waitFor({ timeout: 60_000 });
  if (shotName) await shot(page, shotName.replace('.png', '-applied.png'));
  await page.getByRole('button', { name: 'Done' }).click();
}

/** The stage of the file a moment after a step (the route commits after the dialog closes). */
async function waitStage(file, done, ms = 20_000) {
  const until = Date.now() + ms;
  for (;;) {
    const s = await stageOf(PEOPLE.author.page, file);
    if (done(s) || Date.now() > until) return s;
    await sleep(1000);
  }
}

/** The next step a file needs, from its recorded stage: who acts, and how. */
function nextVaultStep(s, file, first) {
  if (s.stage === 'not_sent' || s.stage === 'draft') return { did: 'sent', run: () => sendForReview(file, first ? '01-vault-send-for-review.png' : null) };
  if (s.stage === 'in_review' && !s.reviewed) {
    return { did: 'reviewed', run: () => signVersion('reviewer', file, 'Sign review', 'Reviewed this dataset against define.xml for the CSR.', first ? '02-vault-review-signature.png' : null) };
  }
  if (s.stage === 'in_review') {
    return { did: 'approved', run: () => signVersion('approver', file, 'Approve', 'Approved as the study data for the CDISCPILOT01 CSR.', first ? '03-vault-approval-signature.png' : null) };
  }
  return null;
}

/** One file through the three people: sent, review signed, approved. Each attempt re-reads the stage, so a step a
 * reload interrupted after it landed is never repeated. */
async function approveFile(file, first) {
  const did = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = await stageOf(PEOPLE.author.page, file);
    if (s.stage === 'approved') return did;
    const next = nextVaultStep(s, file, first);
    expect(next, `${file} can be moved on from stage ${s.stage}`);
    try { await next.run(); did.push(next.did); } catch (err) { console.info(`        ${file} ${next.did}: ${err.message.split('\n')[0]}`); }
    await waitStage(file, (x) => x.stage !== s.stage || x.reviewed !== s.reviewed);
  }
  throw new Error(`${file} did not reach approved`);
}

async function prepareApprovals() {
  expect(PEOPLE.reviewer.password && PEOPLE.approver.password, 'DEMO_SIGNER_PASSWORD (or the two per-person passwords) is set');
  const done = {};
  let first = true;
  for (const file of APPROVE) {
    if (!state.data.files[file]) continue;
    done[file] = await approveFile(file, first);
    if (done[file].length) first = false;
  }
  const page = PEOPLE.author.page;
  await (await openVersions(page, MANIFEST)).scrollIntoViewIfNeeded();
  const acted = Object.values(done).some((d) => d.length);
  return { outcome: acted ? 'pass' : 'skipped', done, screenshot: await shot(page, '04-vault-manifest-approved.png') };
}

// ---------------------------------------------------------------- prepare: the CSR document in the one editor

const BUILD_WAIT_MS = Number(process.env.DEMO_BUILD_WAIT_MS || 90 * 60_000);

async function createCsr(page) {
  const select = await openNewDocument(page);
  const entries = await csrEntries(select);
  await select.selectOption({ label: CSR_ENTRY });
  await page.getByPlaceholder(/2\.6\.6 Toxicology/).fill(CSR_TITLE);
  const shotPath = await shot(page, '05-new-document-csr.png');
  const created = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/authoring\/docs$/.test(r.url()));
  await page.getByRole('button', { name: 'Create document' }).click();
  const res = await created;
  const j = await res.json();
  expect(res.status() === 201 && j?.document?.id, `POST /api/authoring/docs answered 201 (got ${res.status()})`);
  return { id: j.document.id, entries, shotPath };
}

async function prepareCsrDocument() {
  const page = PEOPLE.author.page;
  let made = null;
  if (!state.data.documentId) {
    made = await retrying(page, () => createCsr(page));
    state.data.documentId = made.id;
    saveState();
  }
  const panel = await retrying(page, () => openCsr(page));
  await panel.scrollIntoViewIfNeeded();
  return { outcome: made ? 'pass' : 'skipped', documentId: state.data.documentId, csrCatalogEntries: made?.entries.length,
    buildFromStudyData: (await panel.count()) === 1, screenshot: await shot(page, '06-csr-in-the-editor.png') };
}

// ---------------------------------------------------------------- prepare: the study data, frozen in the document

async function studyDataOf(page) {
  const r = await api(page, 'GET', `/api/submission-orchestrator/csr/study-data?programId=${state.data.programId}&documentId=${state.data.documentId}`);
  expect(r.status === 200 && Array.isArray(r.body?.studyData), `the document's study data can be read (GET /csr/study-data answered ${r.status})`);
  return r.body.studyData;
}

async function freeze(page) {
  const panel = await openCsr(page);
  const pick = panel.locator('select[aria-label="Clinical source"]');
  await pick.waitFor();
  const options = await pick.evaluate((e) => [...e.options].map((o) => o.textContent));
  await pick.selectOption({ label: options.find((o) => o.startsWith(MANIFEST)) });
  const t0 = Date.now();
  await panel.getByRole('button', { name: 'Preview clinical tables' }).click();
  const preview = panel.locator('[aria-label="Clinical table preview"]');
  await preview.waitFor({ timeout: 180_000 });
  const previewMs = Date.now() - t0;
  const tables = await preview.locator('summary').allInnerTexts();
  await preview.scrollIntoViewIfNeeded();
  const previewShot = await shot(page, '07-clinical-tables-preview.png');
  const t1 = Date.now();
  await panel.getByRole('button', { name: 'Freeze as this document’s study data' }).click();
  const frozen = await waitFor(async () => (await studyDataOf(page)).length > 0, 180_000);
  expect(frozen, 'the study data is frozen');
  return { efficacyFileOfferedAsClinicalSource: options.some((o) => o.startsWith(EFFICACY)), previewMs, freezeMs: Date.now() - t1,
    tables: tables.filter((t) => t.startsWith('§')), previewShot };
}

async function prepareFreeze() {
  const page = PEOPLE.author.page;
  let detail = { outcome: 'skipped' };
  if ((await studyDataOf(page)).length === 0) detail = await freeze(page);
  state.data.studyDataId = (await studyDataOf(page))[0].studyDataId;
  saveState();
  const panel = await openCsr(page);
  await panel.scrollIntoViewIfNeeded();
  return { ...detail, studyDataId: state.data.studyDataId, screenshot: await shot(page, '08-study-data-frozen.png') };
}

// ---------------------------------------------------------------- prepare: the build

async function buildsOf(page) {
  const r = await api(page, 'GET', `/api/csr/jobs?programId=${state.data.programId}&runId=${state.data.studyDataId}`);
  expect(r.status === 200 && Array.isArray(r.body?.jobs), `the builds can be read (GET /api/csr/jobs answered ${r.status})`);
  return r.body.jobs;
}

// The build list states a finished build as 'complete' (csr_build_jobs.status). Until 2026-11-10 no walk had seen one:
// this read 'completed' only, and would have waited out its whole limit on the first build that finished.
const finished = (job) => job && ['complete', 'completed'].includes(job.status);
const terminal = (job) => job && (finished(job) || ['failed', 'cancelled'].includes(job.status));

async function startBuild(page) {
  const panel = await openCsr(page);
  const button = panel.getByRole('button', { name: /Build CSR draft · / });
  await button.waitFor({ timeout: 60_000 });
  await button.scrollIntoViewIfNeeded();
  await shot(page, '09-build-csr-draft.png');
  await button.click();
  await panel.getByText(/CSR build \d+ is queued/).waitFor({ timeout: 60_000 });
}

async function prepareBuild() {
  const page = PEOPLE.author.page;
  let jobs = await buildsOf(page);
  // DEMO_REBUILD=1 starts a new build when the newest one failed (for example after a model key was set).
  const started = jobs.length === 0 || (process.env.DEMO_REBUILD === '1' && jobs[0].status === 'failed' && jobs[0].jobId === state.data.jobId);
  if (started) await retrying(page, () => startBuild(page));
  const t0 = Date.now();
  const job = await waitFor(async () => { jobs = await buildsOf(page); return terminal(jobs[0]) ? jobs[0] : null; }, BUILD_WAIT_MS, 15_000) || jobs[0];
  state.data.jobId = job.jobId;
  saveState();
  const panel = await openCsr(page);
  await panel.getByText(new RegExp(`CSR build ${job.jobId} · `)).first().scrollIntoViewIfNeeded().catch(() => {});
  const blocked = !finished(job);
  return { outcome: blocked ? 'blocked' : started ? 'pass' : 'skipped', blockedBy: blocked ? (job.failure || 'the build did not finish') : undefined,
    jobId: job.jobId, status: job.status, progress: job.progress, failure: job.failure, waitedMs: Date.now() - t0, screenshot: await shot(page, '10-build-finished.png') };
}

// ---------------------------------------------------------------- prepare: section review, import, narratives, assembly

async function headingsOf(page) {
  const r = await api(page, 'GET', `/api/csr/jobs/${state.data.jobId}/headings`);
  expect(r.status === 200 && Array.isArray(r.body?.headings), `the build's headings can be read (answered ${r.status})`);
  return r.body.headings;
}

const HEADING_PACE_MS = Number(process.env.DEMO_HEADING_PACE_MS || 5000);
const reviewable = (h) => !h.placeholder && !h.integrityFailure;
const headingRow = (panel, num) => panel.locator(`section[aria-label="Section review"] li:has(span.mono:text-is("${num}"))`).first();

/** The requester sends each drafted heading (no data placeholder) for review on the build board. */
async function sendHeadings(page, nums) {
  const panel = await openCsr(page);
  for (const num of nums) {
    const row = headingRow(panel, num);
    await row.scrollIntoViewIfNeeded();
    await row.getByRole('button', { name: /Send for review/ }).click();
    await row.getByRole('button', { name: /Approve/ }).or(row.getByText('In review')).first().waitFor({ timeout: 30_000 }).catch(() => {});
    await sleep(HEADING_PACE_MS / 2);
  }
  return shot(page, '11-headings-sent-for-review.png');
}

/** The approver (not the build's requester) reads each heading's saved text, then approves its hash. */
async function approveHeadings(page, nums) {
  const panel = await openCsr(page);
  let readShot = null;
  for (const num of nums) {
    const row = headingRow(panel, num);
    await row.scrollIntoViewIfNeeded();
    await row.getByRole('button', { name: 'Read saved section text' }).click();
    await row.locator(`pre[aria-label="Saved text for §${num}"]`).waitFor({ timeout: 30_000 });
    if (!readShot) readShot = await shot(page, '12-heading-saved-text-read.png');
    await row.getByRole('button', { name: /Approve/ }).click();
    await waitFor(async () => (await headingsOf(page)).find((h) => h.num === num)?.state === 'approved', 30_000, 1000);
    // A person reads a heading before approving it. Unpaced, 69 headings in under a minute spent the API's
    // per-minute limit (2026-11-10: 429 on the approver's reads), which no reader would.
    await sleep(HEADING_PACE_MS);
  }
  return readShot;
}

async function prepareHeadingReview() {
  let heads = await headingsOf(PEOPLE.author.page);
  const toSend = heads.filter((h) => h.state === 'draft' && reviewable(h)).map((h) => h.num);
  // Each attempt reads what is still to do: a retry that began again from the first heading waited 30 s on a
  // button the first attempt had already pressed (2026-11-10, after a dev reload interrupted the first attempt).
  const still = async (page, state) => (await headingsOf(page)).filter((h) => h.state === state && reviewable(h)).map((h) => h.num);
  if (toSend.length) await retrying(PEOPLE.author.page, async () => sendHeadings(PEOPLE.author.page, await still(PEOPLE.author.page, 'draft')));
  heads = await headingsOf(PEOPLE.author.page);
  const toApprove = heads.filter((h) => h.state === 'in_review' && reviewable(h)).map((h) => h.num);
  const readShot = toApprove.length ? await retrying(PEOPLE.approver.page, async () => approveHeadings(PEOPLE.approver.page, await still(PEOPLE.approver.page, 'in_review'))) : null;
  heads = await headingsOf(PEOPLE.author.page);
  const count = (f) => heads.filter(f).length;
  const panel = await openCsr(PEOPLE.approver.page);
  await panel.locator('section[aria-label="Section review"]').scrollIntoViewIfNeeded();
  const approved = count((h) => h.state === 'approved');
  return { outcome: approved ? (toSend.length || toApprove.length ? 'pass' : 'skipped') : 'blocked', blockedBy: approved ? undefined : 'no heading drafted without a model key',
    headings: heads.length, drafted: count((h) => h.state !== 'not_drafted' && reviewable(h)), templateWithDataMissing: count((h) => h.placeholder),
    notDrafted: count((h) => h.state === 'not_drafted'), approved, approvedNums: heads.filter((h) => h.state === 'approved').map((h) => h.num),
    readShot, screenshot: await shot(PEOPLE.approver.page, '13-headings-approved.png') };
}

/**
 * F6 (2026-11-05): the author imports the approved headings into the CSR document itself, by ICH E3 number.
 * The panel previews what it will write, asks the reason, writes, and shows its receipt in place; no other
 * document is created, and the editor shows the imported text without being reopened.
 */
async function importApproved(page) {
  const panel = await openCsr(page);
  const button = panel.getByRole('button', { name: /Import approved sections into this document/ });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const box = panel.locator('section[aria-label="Import into this document"]');
  await box.getByRole('list', { name: 'What the import will do' }).waitFor({ timeout: 120_000 });
  const preview = await box.innerText();
  await shot(page, '14-import-preview.png');
  await box.getByLabel(/Reason for importing/).fill('Approved CSR sections imported into the CSR for medical writing and review.');
  await box.getByRole('button', { name: 'Import into this document' }).click();
  await box.getByText(/^Imported\. \d+ section\(s\) written into this document\./).waitFor({ timeout: 120_000 });
  const receipt = await box.innerText();
  const shotPath = await shot(page, '14-import-receipt.png');
  const written = Number((receipt.match(/Imported\. (\d+) section/) || [])[1] || 0);
  return { preview: preview.split('\n').slice(0, 12), receipt: receipt.split('\n').slice(0, 14), written, shotPath };
}

async function prepareImport() {
  const page = PEOPLE.author.page;
  // A later build's approved headings are imported too: the skip holds only for the build already imported.
  if (state.data.importedIntoCsr && (state.data.importedFromJob ?? state.data.jobId) === state.data.jobId) return { outcome: 'skipped', written: state.data.importedIntoCsr };
  const approved = (await headingsOf(page)).filter((h) => h.state === 'approved');
  if (!approved.length) return { outcome: 'blocked', blockedBy: 'no approved heading to import (no model key)' };
  const r = await retrying(page, () => importApproved(page), 1);
  state.data.importedIntoCsr = r.written;
  state.data.importedFromJob = state.data.jobId;
  saveState();
  // The documents in the project: the import created none (RULE 4: one document for one CSR).
  const docs = await api(page, 'GET', `/api/authoring/docs?programId=${state.data.programId}`);
  const csrs = (docs.body?.documents ?? []).filter((d) => /Clinical Study Report|CSR/i.test(String(d.title ?? '')));
  return { ...r, csrDocumentsInProject: csrs.length, screenshot: await shot(page, '15-imported-text-in-the-csr.png') };
}

async function narrativeRun(page) {
  const r = await api(page, 'GET', `/api/csr/jobs/${state.data.jobId}/narratives/status`);
  return r.body?.run ?? null;
}

async function prepareNarratives() {
  const page = PEOPLE.author.page;
  let run = await narrativeRun(page);
  const started = !run || ['failed', 'cancelled'].includes(run.status);
  if (started) {
    const panel = await openCsr(page);
    const button = panel.locator('section[aria-label="Patient safety narratives"]').getByRole('button', { name: /Build narratives/ });
    await button.scrollIntoViewIfNeeded();
    await button.click();
  }
  const t0 = Date.now();
  run = await waitFor(async () => { const x = await narrativeRun(page); return x && !['queued', 'running'].includes(x.status) ? x : null; }, 15 * 60_000, 3000);
  const panel = await openCsr(page);
  const section = panel.locator('section[aria-label="Patient safety narratives"]');
  await toTop(section);
  const result = run?.result;
  return { outcome: run?.status === 'complete' ? (started ? 'pass' : 'skipped') : 'fail', status: run?.status, waitedMs: Date.now() - t0,
    composed: result?.composed, selected: result?.selected, refused: result?.refused, sectionsWritten: result?.sections?.written,
    statusLine: (await section.locator('p[role=status], p[role=alert]').first().innerText().catch(() => null)),
    screenshot: await shot(page, '16-narratives.png') };
}

async function assemblyOf(page) {
  const r = await api(page, 'GET', `/api/csr/jobs/${state.data.jobId}/assembly`);
  return r.body?.assembly ?? null;
}

/** What an assembly run recorded: its verdict, files, gaps and the appendices it still needs. */
function assemblySummary(run) {
  const res = run.result || {};
  const structure = res.structure || {};
  return { status: run.status, resultStatus: res.status, leaves: (res.leaves || []).length, missingAppendices: (res.missing || []).map((m) => m.number),
    placeholderSections: (res.placeholderSections || []).length, linksChecked: structure.linksChecked, structureFindings: (structure.findings || []).length,
    bodyOutlineDepth: structure.bodyOutlineDepth, bodyGaps: (res.bodyGaps || []).length, error: run.error ? run.error.message : undefined };
}

async function prepareAssembly() {
  const page = PEOPLE.author.page;
  let run = await assemblyOf(page);
  const started = !run || run.status === 'failed';
  if (started) {
    const panel = await openCsr(page);
    const button = panel.getByRole('button', { name: /Assemble CSR files/ });
    await button.scrollIntoViewIfNeeded();
    await button.click();
  }
  const t0 = Date.now();
  run = await waitFor(async () => { const x = await assemblyOf(page); return x && !['queued', 'assembling'].includes(x.status) ? x : null; }, 20 * 60_000, 3000);
  expect(run, 'the assembly finished within 20 minutes');
  const panel = await openCsr(page);
  const section = panel.locator('section[aria-label="CSR assembly"]');
  await toTop(section);
  const verdict = (await section.innerText()).split('\n').filter((l) => /^(Assembled|Section .* placeholder|Gap:|Contents|Unlinked|Listing)/.test(l));
  const outcome = run.status === 'failed' ? 'fail' : started ? 'pass' : 'skipped';
  return { outcome, waitedMs: Date.now() - t0, ...assemblySummary(run), verdict: verdict.slice(0, 8), screenshot: await shot(page, '17-assembly.png') };
}

// ---------------------------------------------------------------- prepare: send for review, sequence 0000, compile

/** The CSR document itself goes for review (F6: the imported sections are in it). */
async function sendCsrForReview(page) {
  await openCsr(page);
  await page.getByRole('button', { name: 'More document actions' }).click();
  await page.getByRole('menuitem', { name: /Send for review/ }).click();
  const dlg = page.getByRole('dialog').last();
  await dlg.getByRole('checkbox', { name: PEOPLE.reviewer.name }).check();
  await dlg.locator('#sfr-reason').fill('The CSR with its imported sections, for scientific review against the study data.');
  await dlg.locator('#sfr-due').fill(new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10));
  await shot(page, '18-send-the-csr-for-review.png');
  await dlg.locator('[data-testid="sfr-submit"]').click();
  await page.locator('[data-testid="sfr-done"]').waitFor({ timeout: 60_000 });
  const receipt = await page.getByRole('dialog').last().innerText();
  const shotPath = await shot(page, '19-sent-for-review.png');
  await page.locator('[data-testid="sfr-done"]').click();
  return { receipt: receipt.split('\n').slice(0, 8), screenshot: shotPath };
}

async function prepareSendForReview() {
  const page = PEOPLE.author.page;
  if (!state.data.importedIntoCsr) return { outcome: 'blocked', blockedBy: 'nothing imported into the CSR (nothing approved to import)' };
  if (state.data.csrSentForReview) return { outcome: 'skipped' };
  const r = await retrying(page, () => sendCsrForReview(page), 1);
  state.data.csrSentForReview = true;
  saveState();
  return r;
}

async function prepareSequence() {
  const page = PEOPLE.author.page;
  await page.goto(`${BASE}/concept2cure/submission-center?program=${state.data.programId}`, { waitUntil: 'networkidle' });
  // B4: the Submissions tab of a drug IND also shows the device eSTAR card.
  const device = page.getByText('Device filings').first();
  const deviceCard = await device.isVisible({ timeout: 10_000 }).catch(() => false);
  if (deviceCard) await device.scrollIntoViewIfNeeded();
  const centerShot = await shot(page, '20a-submission-center-device-card.png');
  await page.getByRole('tab', { name: 'Sequences', exact: true }).or(page.getByRole('button', { name: 'Sequences', exact: true })).first().click();
  const start = page.getByRole('button', { name: 'Start sequence 0000' });
  const made = await start.isVisible({ timeout: 15_000 }).catch(() => false);
  if (made) {
    const created = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/submissions\/\d+\/sequences$/.test(r.url()));
    await start.click();
    expect((await created).status() === 201, 'POST /api/submissions/:id/sequences answered 201');
  }
  await page.getByText('Original Sequence').first().waitFor({ timeout: 30_000 });
  await page.getByText('Original Sequence').first().scrollIntoViewIfNeeded();
  return { outcome: made ? 'pass' : 'skipped', deviceCardOnThisIndProject: deviceCard, centerShot, screenshot: await shot(page, '20-sequence-0000.png') };
}

/** Runbook step 15: the compile must refuse. Records the reasons it gives, first ones first. */
async function prepareCompile() {
  const page = PEOPLE.author.page;
  await page.goto(`${BASE}/concept2cure/ectd-compile?program=${state.data.programId}`, { waitUntil: 'networkidle' });
  const compiled = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/ectd-compile\/[^/]+\/compile$/.test(r.url()), { timeout: 120_000 });
  await page.getByRole('button', { name: 'Compile eCTD' }).click();
  const res = await compiled;
  const body = await res.json().catch(() => ({}));
  const blocked = page.getByText('Compilation blocked');
  await blocked.waitFor({ timeout: 30_000 });
  await blocked.scrollIntoViewIfNeeded();
  const reasons = (await page.locator('main').innerText()).split('\n').filter((l) => /legacy numeric|application number|D-U-N-S|sponsor|is missing/i.test(l));
  return { outcome: body.status === 'failed' ? 'pass' : 'fail', compileStatus: body.status, firstReasons: reasons.slice(0, 4), reasonCount: reasons.length,
    screenshot: await shot(page, '21-compile-refused.png') };
}

async function prepare() {
  await step('project: found or created through New project', prepareProject, { critical: true, page: PEOPLE.author.page });
  await step('Vault: upload the study files and the manifest (POST /api/vault/ingest)', prepareUploads, { critical: true, page: PEOPLE.author.page });
  await step('Vault: send, review-sign and approve each of the seven files (three people)', prepareApprovals, { critical: true, page: PEOPLE.author.page });
  await step('Editor: New document → M5 lists the CSR once (F1)', checkCsrCatalog, { page: PEOPLE.author.page });
  await step('Editor: the CSR created from New document shows "Build from the study’s data"', prepareCsrDocument, { critical: true, page: PEOPLE.author.page });
  await step('Study data: manifest chosen, tables previewed, frozen in the document', prepareFreeze, { critical: true, page: PEOPLE.author.page });
  // DEMO_PREPARE_UNTIL=freeze stops here: the study is ready for its CSR build, which a person starts with their own
  // model key (the Codespace's setup, .devcontainer/post-start.sh, never spends that key by itself).
  if (process.env.DEMO_PREPARE_UNTIL === 'freeze') return;
  await step('Build CSR draft, waited to its end', prepareBuild, { critical: true, page: PEOPLE.author.page });
  await step('Section review: the requester sends drafted headings, the approver reads and approves them', prepareHeadingReview, { page: PEOPLE.approver.page });
  await step('Import approved sections into this CSR document (F6)', prepareImport, { page: PEOPLE.author.page });
  await step('Build narratives', prepareNarratives, { page: PEOPLE.author.page });
  await step('Assemble CSR files', prepareAssembly, { page: PEOPLE.author.page });
  await step('Send the CSR for review (author → reviewer)', prepareSendForReview, { page: PEOPLE.author.page });
  await step('Submission Center: sequence 0000', prepareSequence, { page: PEOPLE.author.page });
  await step('Compile eCTD: refused, and why', prepareCompile, { page: PEOPLE.author.page });
}

module.exports = { prepare };
