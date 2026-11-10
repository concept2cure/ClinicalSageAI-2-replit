/**
 * S12 in the running app: a section drafted from a Vault version is flagged once a later version is approved.
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-vault-deliverable-flags-sections/walk.cjs [base-url] [programId] [owner-db-url] [sectionCode]
 *
 * Seeded on the local, disposable database (README "In the running app"): a Vault document's version 1, its version
 * 2 superseding it, version 2's lifecycle record in review, and a figure in one of C2C-101's sections drafted from
 * version 1 (the row span-lineage-vault.ts writes). Then, through the running app:
 * 1. The project's changes do not list the section while version 2 is in review: a draft is not yet a reason.
 * 2. A version 3 supersedes version 2 with its lifecycle record approved (seeded at that stage: the lifecycle guard
 *    refuses a stage change without its own lifecycle event, and this walk fabricates none). The changes list the
 *    section, naming version 1 and the approved 3.0; version 2, still in review, is passed over.
 * 3. Evidence's data room says so, at 1440 light and 390 dark.
 * Log: ./walk.json; shots: ./screenshots/.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PROGRAM = process.argv[3];
const DB = process.argv[4] || 'postgresql://postgres@localhost/clinicalsage?host=/tmp';
const SECTION_CODE = process.argv[5] || '2.5.3';
const { Client } = require('pg');
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

const changesRead = (page) => page.evaluate(async (program) => {
  const r = await fetch(`/api/c2c/projects/${program}/source-changes`, { headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } });
  return { status: r.status, body: await r.json() };
}, PROGRAM);

async function seed(db, run) {
  const section = (await db.query(`SELECT s.id::text, s.code, d.title FROM authoring_sections s JOIN authoring_documents d ON d.id = s.doc_id
    WHERE d.client_program_id = $1 AND s.code = $2 ORDER BY d.title LIMIT 1`, [PROGRAM, SECTION_CODE])).rows[0];
  expect(section, `a ${SECTION_CODE} section in the project`);
  const org = (await db.query('SELECT organization_id FROM regulatory_programs WHERE id = $1', [PROGRAM])).rows[0].organization_id;
  const code = `S12-WALK-${run}`;
  const hash = (n) => require('crypto').createHash('sha256').update(`${code}-v${n}`).digest('hex');
  const insert = (version, after) => db.query(`INSERT INTO vault.documents (program_id, organization_id, content_hash, document_code, version,
      document_title, file_name, supersedes_id, status) VALUES ($1, $2, $3, $4, $5, 'Drug substance specification', $6, $7, 'completed') RETURNING id::text`,
  [PROGRAM, org, hash(version), code, `${version}.0`, `ds-spec-${run}-v${version}.pdf`, after]);
  const v1 = (await insert(1, null)).rows[0].id;
  const v2 = (await insert(2, v1)).rows[0].id;
  await db.query(`INSERT INTO document_span_lineage (document_table, document_id, char_start, char_end, span_text_sha256, provenance_kind,
      source, reference_id, payload_sha256, usage, organization_id) VALUES ('authoring_sections', $1, 0, 5, $2, 'vault_document',
      'vault_document', $3, $4, 'derived', $5)`, [section.id, hash('span'), v1, hash(1), org]);
  const canonical = `s12-walk-${run}`;
  await db.query(`INSERT INTO canonical_documents (canonical_id, organization_id, title, document_type, stage, source_refs)
    VALUES ($1, $2, 'Drug substance specification', 'specification', 'in_review', jsonb_build_object('vault_documents', jsonb_build_object('nativeId', $3::text)))`,
  [canonical, org, v2]);
  log.seed = { section, org, documentCode: code, v1, v2, canonical };
  ok('seeded on the local database: v1, v2 superseding it in review, and a span in the section drafted from v1', log.seed);
  /* Version 3, approved, seeded only when step 2 runs. */
  const approveThird = async () => {
    const v3 = (await insert(3, v2)).rows[0].id;
    await db.query(`INSERT INTO canonical_documents (canonical_id, organization_id, title, document_type, stage, source_refs)
      VALUES ($1, $2, 'Drug substance specification', 'specification', 'approved', jsonb_build_object('vault_documents', jsonb_build_object('nativeId', $3::text)))`,
    [`${canonical}-v3`, org, v3]);
    log.seed.v3 = v3;
    return v3;
  };
  return { section, v1, approveThird };
}

async function evidenceSaysSo(page, shot) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  await page.locator('.pj-lc-stage', { hasText: 'Evidence' }).click();
  const note = page.getByTestId('data-room-vault-changes');
  await note.waitFor({ timeout: 30000 });
  await note.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, shot) });
  return (await note.textContent()).trim();
}

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const db = new Client({ connectionString: DB });
  await db.connect();
  const browser = await chromium.launch();
  try {
    const run = Date.now();
    const { section, v1, approveThird } = await seed(db, run);
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await signIn(page, false);
    const before = await changesRead(page);
    const mineBefore = (before.body.vaultChanges ?? []).filter((c) => c.citedVaultId === v1);
    expect(before.status === 200 && Array.isArray(before.body.vaultChanges) && mineBefore.length === 0, `not listed while v2 is in review (${JSON.stringify(before).slice(0, 300)})`);
    ok('while version 2 is in review, the section is not listed', { status: before.status, vaultCount: before.body.vaultCount });
    const v3 = await approveThird();
    const after = await changesRead(page);
    const mine = (after.body.vaultChanges ?? []).filter((c) => c.citedVaultId === v1);
    expect(mine.length === 1 && mine[0].sectionId === section.id && mine[0].approvedVaultId === v3, `listed once v3 is approved (${JSON.stringify(after.body).slice(0, 400)})`);
    ok('once version 3 is approved, the project lists the section, naming 3.0 and passing over 2.0 in review', { change: mine[0] });
    const text = await evidenceSaysSo(page, 'evidence-vault-changes-1440-light.png');
    expect(text.includes(`drafted from Drug substance specification v1.0; v3.0 is approved`), `Evidence names it (${text})`);
    ok('Evidence\'s data room names the section, the version it was drafted from and the approved one', { text });
    const small = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
    await signIn(small, true);
    await evidenceSaysSo(small, 'evidence-vault-changes-390-dark.png');
    const hScroll = await small.evaluate(() => { const i = document.querySelector('.page-inner.pj'); return i ? i.scrollWidth - i.clientWidth : null; });
    expect(hScroll === null || hScroll <= 1, `no sideways scroll at 390 (${hScroll})`);
    ok('the same at 390 dark', { hScroll });
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
    await db.end();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
