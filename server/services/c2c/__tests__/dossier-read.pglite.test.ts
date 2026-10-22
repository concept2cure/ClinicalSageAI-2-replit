/**
 * The project's dossier, read once (FILING_SPINE F23), on PGlite with the real
 * schema, the real rule packs and the real add-a-market.
 *
 * At head Project home drew two figures for one dossier that disagreed:
 * "Dossier readiness" pooled every document (so adding EMA lowered the FDA
 * filing's figure), and "Module completion" weighted review as 75, drafted as
 * 50 and locked as 0, and split "M1" from "1.1". These pin the one read that
 * replaces both: one definition of complete, the home filing on its own, each
 * market on its own line, one row per module, and no measured-looking 0 for a
 * store that cannot be read.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { addProjectMarket } from '../add-project-market';
import { readDocumentOutline } from '../document-outline';
import { readDossier, readDossierFigures } from '../dossier-read';
import { isRegionalSectionKey } from '../../../../shared/regulatory/filing-scope';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ORG = 7;
const USER = 11;
const NDA = '11111111-1111-4111-8111-111111111111';

let jdb: JourneyDb;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: extractTableDdl('migrations/0000_sweet_joseph.sql', ['organizations', 'users', 'organization_users', 'audit_logs']),
    migrations: [
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260929_actor_names.sql',
      'migrations/20260609_audit_hmac_seal.sql',
      'migrations/20260524_program_workbench_schema.sql',
      'migrations/20260907_regulatory_programs_application_number.sql',
      'migrations/20260903_regulatory_programs_estar_device_fields.sql',
      'migrations/20260528_phase9_document_schema.sql',
      'migrations/20260804_phase9_rule_pack_outlines.sql',
      'migrations/20260604_submission_core_canonical.sql',
      'migrations/20260925b_submissions_program_anchor.sql',
      'migrations/20261015e_c2c_documents_filing_scope.sql',
    ],
  });
  await jdb.pool.query(`INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES (${ORG}, 'Org', 'org', 'standard', 10), (8, 'Other', 'other', 'standard', 10)`);
  await jdb.pool.query(`INSERT INTO users (id, email, name, password_hash) VALUES (${USER}, 'ra@example.test', 'RA Lead', 'x')`);
});
afterAll(async () => { await jdb?.close?.(); });

const rows = async (sql: string, params: unknown[] = []) => (await jdb.pool.query(sql, params)).rows as Array<Record<string, unknown>>;

/** A document of `docType`/`agency`, scaffolded with every section of its current pack. */
async function scaffold(id: string, docType: string, agency: string, status = 'todo') {
  await jdb.pool.query(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     SELECT $1, $2, $3, doc_type, agency, version, $1, 'draft', 0
       FROM c2c_rule_packs WHERE doc_type = $4 AND agency = $5 AND superseded_by IS NULL LIMIT 1`,
    [id, ORG, NDA, docType, agency],
  );
  await jdb.pool.query(
    `INSERT INTO c2c_document_sections (document_id, section_key, parent_key, label, path_order, mandatory, status, content, draft_source, version)
     SELECT $1, s.key, s.parent_key, s.label, COALESCE(s.path_order, 0), COALESCE(s.mandatory, false), $2, '{}'::jsonb, 'template', 1
       FROM c2c_documents d JOIN c2c_rule_packs rp ON rp.doc_type = d.doc_type AND rp.agency = d.agency AND rp.version = d.rule_pack_version,
            jsonb_to_recordset(rp.required_sections) AS s(key text, parent_key text, label text, mandatory boolean, path_order integer)
      WHERE d.id = $1`,
    [id, status],
  );
}

const setStatus = (doc: string, status: string, where = 'TRUE') =>
  jdb.pool.query(`UPDATE c2c_document_sections SET status = $2 WHERE document_id = $1 AND ${where}`, [doc, status]);

async function addEma() {
  const client = await jdb.pool.connect();
  try {
    await client.query('BEGIN');
    const out = await addProjectMarket({ client: client as never, orgId: ORG, userId: USER, programId: NDA, agency: 'EMA', applicationType: 'maa', reason: 'The EU filing starts this quarter' });
    await client.query('COMMIT');
    return out.documentId;
  } finally {
    client.release();
  }
}

beforeEach(async () => {
  await jdb.pool.query('DELETE FROM c2c_document_sections');
  await jdb.pool.query('DELETE FROM c2c_documents');
  await jdb.pool.query('DELETE FROM submissions');
  await jdb.pool.query('DELETE FROM regulatory_programs');
  await jdb.pool.query(
    `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, product_name, primary_agency, target_agencies, status)
     VALUES ($1, $2, 'P-nda', 'P-nda', 'nda', 'drug', 'Vorelinib', 'FDA', '[]'::json, 'active')`,
    [NDA, ORG],
  );
});

const pctOf = (f: { state: string; pct: number | null }) => (f.state === 'measured' ? f.pct : f.state);

describe('one definition of complete, for the header and every module row', () => {
  it('every section locked reads 100 on the header and on every row (at head: 100 beside 0)', async () => {
    await scaffold('doc_home', 'nda', 'fda', 'locked');
    const d = await readDossier(jdb.pool as never, ORG, NDA);
    expect(pctOf(d.home)).toBe(100);
    expect(d.rows.length).toBeGreaterThan(1);
    for (const r of d.rows) expect(pctOf(r.figure)).toBe(100);
  });

  it('every section in review reads 0 approved on both, with the review counted beside it (at head: 0 beside 75)', async () => {
    await scaffold('doc_home', 'nda', 'fda', 'review');
    const d = await readDossier(jdb.pool as never, ORG, NDA);
    expect(pctOf(d.home)).toBe(0);
    for (const r of d.rows) {
      expect(pctOf(r.figure)).toBe(0);
      expect(r.inReview).toBe(r.counted);
    }
  });

  it('a module is one row: "M1" and its sections are Module 1, named by the pack (at head: two rows)', async () => {
    await scaffold('doc_home', 'nda', 'fda');
    const d = await readDossier(jdb.pool as never, ORG, NDA);
    const modules = d.rows.filter((r) => r.group === 'module').map((r) => r.module);
    expect(modules).toEqual([...new Set(modules)]);
    expect(modules).toContain('1');
    const m1 = d.rows.find((r) => r.module === '1')!;
    const [pack] = await rows(`SELECT required_sections FROM c2c_rule_packs WHERE doc_type = 'nda' AND agency = 'fda' AND superseded_by IS NULL LIMIT 1`);
    const sections = pack.required_sections as Array<{ key: string; label: string }>;
    expect(m1.counted).toBe(sections.filter((s) => s.key === 'M1' || s.key.startsWith('1.')).length);
    expect(m1.label).toBe(sections.find((s) => s.key === 'M1')!.label);
    expect(d.rows.reduce((n, r) => n + r.counted, 0)).toBe(sections.length);
  });

  it('a one-document home reads what the readiness trigger stores on the document', async () => {
    await scaffold('doc_home', 'nda', 'fda');
    await setStatus('doc_home', 'approved', `section_key LIKE '2.%'`);
    const d = await readDossier(jdb.pool as never, ORG, NDA);
    const [doc] = await rows(`SELECT readiness FROM c2c_documents WHERE id = 'doc_home'`);
    expect(pctOf(d.home)).toBe(Number(doc.readiness));
    expect(Number(doc.readiness)).toBeGreaterThan(0);
    expect((await readDossierFigures(jdb.pool as never, ORG, [NDA])).get(NDA)).toEqual(d.home);
  });
});

describe('each market on its own line (F22)', () => {
  it('adding EMA leaves the home figure where it was (at head the pooled figure fell)', async () => {
    await scaffold('doc_home', 'nda', 'fda');
    await setStatus('doc_home', 'approved', `section_key LIKE '2.%' OR section_key LIKE '3.%'`);
    const before = await readDossier(jdb.pool as never, ORG, NDA);
    const marketDoc = await addEma();
    const after = await readDossier(jdb.pool as never, ORG, NDA);
    expect(after.home).toEqual(before.home);
    expect((await readDossierFigures(jdb.pool as never, ORG, [NDA])).get(NDA)).toEqual(before.home);

    const ema = after.markets.find((m) => m.scope === 'market')!;
    expect(ema.agency.toLowerCase()).toBe('ema');
    // The home filing's common sections plus EMA's own Module 1 and 3.2.R.
    const home = await rows(`SELECT section_key, status FROM c2c_document_sections WHERE document_id = 'doc_home'`);
    const own = await rows(`SELECT section_key, status FROM c2c_document_sections WHERE document_id = $1`, [marketDoc]);
    const counted = [...home.filter((r) => !isRegionalSectionKey(String(r.section_key))), ...own.filter((r) => isRegionalSectionKey(String(r.section_key)))];
    const complete = counted.filter((r) => ['approved', 'locked'].includes(String(r.status))).length;
    expect(ema.figure).toEqual({ state: 'measured', pct: Math.round((100 * complete) / counted.length), counted: counted.length, complete });
    expect(ema.notHeld).toEqual((await readDocumentOutline(jdb.pool as never, ORG, marketDoc))!.gaps);

    // EMA's rows are its own regional part only: Module 1, and Module 3 for 3.2.R.
    const emaRows = after.rows.filter((r) => r.documentId === marketDoc);
    expect(emaRows.map((r) => r.module).sort()).toEqual(['1', '3']);
    expect(emaRows.every((r) => r.agency?.toLowerCase() === 'ema')).toBe(true);
  });

  it('with two home applications a market says why it has no figure', async () => {
    await scaffold('doc_home', 'nda', 'fda');
    await addEma();
    await scaffold('doc_home_2', 'nda', 'fda');
    const d = await readDossier(jdb.pool as never, ORG, NDA);
    const ema = d.markets.find((m) => m.scope === 'market')!;
    expect(ema.figure).toEqual({ state: 'unavailable', pct: null, reason: 'The project has 2 home filings, so the common modules cannot be attributed to one market.' });
  });
});

describe('documents that are not CTD applications', () => {
  it("a clinical study report is one row; its '1'…'13' are not CTD modules", async () => {
    await scaffold('doc_home', 'nda', 'fda');
    await scaffold('doc_csr', 'csr', 'ich');
    const d = await readDossier(jdb.pool as never, ORG, NDA);
    const csr = d.rows.filter((r) => r.documentId === 'doc_csr');
    expect(csr).toHaveLength(1);
    expect(csr[0]).toMatchObject({ group: 'document', module: null });
    expect(d.rows.filter((r) => r.documentId === 'doc_home').every((r) => r.group === 'module')).toBe(true);
  });

  it("a 510(k)'s top-level headings are its rows, named by its pack", async () => {
    await scaffold('doc_k', 'k510', 'fda');
    const d = await readDossier(jdb.pool as never, ORG, NDA);
    const labels = d.rows.map((r) => r.label);
    expect(labels).toContain('Administrative');
    expect(labels).toContain('Substantial equivalence');
    expect(d.rows.every((r) => r.module === null)).toBe(true);
  });
});

describe('a figure is measured, empty or unavailable, never a made-up 0', () => {
  it('a project with no governed sections has no figure', async () => {
    const d = await readDossier(jdb.pool as never, ORG, NDA);
    expect(d.home).toEqual({ state: 'no_sections', pct: null });
    expect((await readDossierFigures(jdb.pool as never, ORG, [NDA])).get(NDA)).toEqual({ state: 'no_sections', pct: null });
  });

  it("another organization's documents are not read", async () => {
    await scaffold('doc_home', 'nda', 'fda', 'approved');
    expect((await readDossier(jdb.pool as never, 8, NDA)).home).toEqual({ state: 'no_sections', pct: null });
  });

  it('a store this environment has not provisioned is unavailable, with the reason, and no 0 anywhere', async () => {
    const failing = { query: async () => { throw Object.assign(new Error('relation "c2c_document_sections" does not exist'), { code: '42P01' }); } };
    const d = await readDossier(failing as never, ORG, NDA);
    expect(d.home).toEqual({ state: 'unavailable', pct: null, reason: 'The governed section store is not provisioned in this environment.' });
    expect(JSON.stringify(d)).not.toMatch(/"pct":0\b/);
    expect((await readDossierFigures(failing as never, ORG, [NDA])).get(NDA)?.state).toBe('unavailable');
  });

  it('any other failure is thrown, not answered', async () => {
    const failing = { query: async () => { throw Object.assign(new Error('connection reset'), { code: '08006' }); } };
    await expect(readDossier(failing as never, ORG, NDA)).rejects.toThrow('connection reset');
    await expect(readDossierFigures(failing as never, ORG, [NDA])).rejects.toThrow('connection reset');
  });
});
