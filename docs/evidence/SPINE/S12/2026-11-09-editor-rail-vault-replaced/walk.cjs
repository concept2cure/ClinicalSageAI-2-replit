/**
 * S12 in the running app: the editor's Sources rail names a Vault version this section was drafted from that a later
 * approved version replaced, and opens the approved version in the Vault (D4's rail; P-83, P-109).
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-editor-rail-vault-replaced/walk.cjs [base-url] [programId] [owner-db-url] [sectionCode]
 *
 * Seeded on the local, disposable database as ../2026-11-09-vault-deliverable-flags-sections/walk.cjs seeds it (that
 * README says why): a Vault document's v1, v2 in review, v3 approved, and a figure in section 2.5.3 of the Module 2.5
 * Clinical Overview drafted from v1. Then, in the running app at 1440 light:
 * 1. The editor opens the document and the section; More → Sources opens the rail.
 * 2. Under the section's citations: the Vault document, "Source has been replaced since cited", "Drafted from v1.0 ·
 *    v3.0 is approved", and Open in Vault.
 * 3. Open in Vault opens the Vault on the project.
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

async function openSectionSources(page, docTitle, code) {
  await page.goto(`${BASE}/concept2cure/document-authoring?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  await page.getByText(docTitle, { exact: false }).first().click({ timeout: 60000 });
  /* A section's button reads its code then its title ("2.5.3Overview of …"): the code, not followed by more of a code. */
  await page.getByRole('button', { name: new RegExp(`^${code.replace(/\./g, '\\.')}(?![.\\d])`) }).first().click({ timeout: 30000 });
  await page.getByTestId('ed-more').click();
  await page.getByTestId('sources-rail-open').click();
}

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const db = new Client({ connectionString: DB });
  await db.connect();
  const browser = await chromium.launch();
  try {
    /* Earlier runs' seeded spans are retired (deleted_at, as the lineage gate retires one), so the rail shows this run's. */
    const retired = await db.query(`UPDATE document_span_lineage SET deleted_at = now() WHERE provenance_kind = 'vault_document'
      AND deleted_at IS NULL AND reference_id IN (SELECT id::text FROM vault.documents WHERE document_code LIKE 'S12-WALK-%')`);
    ok('earlier walk runs\' seeded spans retired on the local database', { retired: retired.rowCount });
    const run = Date.now();
    const { section, approveThird } = await seed(db, run);
    const v3 = await approveThird();
    ok('version 3 approved (seeded at that stage; see the README)', { v3 });
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await signIn(page, false);
    await openSectionSources(page, 'Module 2.5 Clinical Overview', section.code);
    const rail = page.getByTestId('section-vault-replacements');
    await rail.waitFor({ timeout: 30000 });
    expect(await rail.locator('.cmt').count() === 1, 'one row: this run\'s');
    const row = rail.locator('.cmt').first();
    const text = (await row.textContent()).trim();
    expect(/Source has been replaced since cited/.test(text) && /Drafted from v1\.0 · v3\.0 is approved/.test(text), `the rail names it (${text})`);
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'sources-rail-1440-light.png') });
    ok('the Sources rail says the section\'s Vault source was replaced since cited, and which version is approved', { text });
    await row.getByRole('button', { name: /Open in Vault/ }).click();
    await page.waitForURL((u) => /\/concept2cure\/vault/.test(u.pathname), { timeout: 20000 });
    await page.waitForLoadState('networkidle');
    /* The Vault's own read, not its loading lines ("Loading…", "Loading the project vault…"). */
    await page.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText ?? document.body.innerText), null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'open-in-vault-1440-light.png') });
    const detail = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    expect(detail.includes(`ds-spec-${run}-v3.pdf`) && /Approved v3\.0 · 3 versions/.test(detail), 'the Vault opens on this run\'s approved v3.0');
    ok('Open in Vault opens the Vault on the approved version: its detail names v3.0, approved, of 3 versions', { url: page.url().replace(BASE, ''), file: `ds-spec-${run}-v3.pdf` });
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
    await db.end();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
