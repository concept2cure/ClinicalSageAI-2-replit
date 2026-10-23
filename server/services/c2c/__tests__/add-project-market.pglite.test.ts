/**
 * Add a market (docs/design/FILING_SPINE.md F22), on PGlite with the real
 * schema, the real rule packs and the real submission insert.
 *
 * An NDA project filing with FDA adds an MAA with EMA: one transaction writes
 * the market's own Module 1 and 3.2.R (the count read from the pack, not
 * assumed), its anchored EU submission, the market on target_agencies and a
 * governed action with the stated reason. A market the platform does not offer,
 * a device project and a repeat are refused, and nothing is written. The home
 * filing stays the one an authored section binds to.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { addProjectMarket, AddMarketRefusal, marketSubtree } from '../add-project-market';
import { resolveGovernedDocument } from '../governed-document-binding';
import { REGIONAL_DEVICE_APPLICATION_CLASSES, resolveFilingCatalogEntry } from '../../../../shared/regulatory/filing-catalog';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ORG = 7;
const USER = 11;
const NDA = '11111111-1111-4111-8111-111111111111';
const IND = '22222222-2222-4222-8222-222222222222';
const DEVICE = '33333333-3333-4333-8333-333333333333';
const PAS = '44444444-4444-4444-8444-444444444444';
const REASON = 'The EU filing starts this quarter';

let jdb: JourneyDb;
const writes: string[] = [];

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
      // The filing document class packs, so a PAS project has its real home filing.
      'migrations/20261018_filing_class_rule_packs.sql',
      'migrations/20261020_regional_device_application_packs.sql',
    ],
  });
  await jdb.pool.query(`INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES (${ORG}, 'Org', 'org', 'standard', 10)`);
  await jdb.pool.query(`INSERT INTO users (id, email, name, password_hash) VALUES (${USER}, 'ra@example.test', 'RA Lead', 'x')`);
});
afterAll(async () => { await jdb?.close?.(); });

async function program(id: string, type: string, agency: string, productType: string) {
  await jdb.pool.query(
    `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, product_name, primary_agency, target_agencies, status)
     VALUES ($1, $2, $3, $7, $4, $5, 'Vorelinib', $6, '[]'::json, 'active')`,
    [id, ORG, `P-${type}`, type, productType, agency, `P-${type}`],
  );
}

beforeEach(async () => {
  writes.length = 0;
  await jdb.pool.query('DELETE FROM c2c_document_sections');
  await jdb.pool.query('DELETE FROM c2c_documents');
  await jdb.pool.query('DELETE FROM submissions');
  await jdb.pool.query('DELETE FROM regulatory_programs');
  await program(NDA, 'nda', 'FDA', 'drug');
  await program(IND, 'ind', 'FDA', 'drug');
  await program(DEVICE, 'maa', 'EMA', 'device');
  await program(PAS, 'pas', 'FDA', 'biologic');
  // The NDA project's home filing, as intake scaffolds it.
  await jdb.pool.query(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     SELECT 'doc_home', $1, $2, doc_type, agency, version, 'Home', 'draft', 0
       FROM c2c_rule_packs WHERE doc_type = 'nda' AND agency = 'fda' AND superseded_by IS NULL LIMIT 1`,
    [ORG, NDA],
  );
  // The PAS project's home filing, as intake scaffolds a filing document class.
  await jdb.pool.query(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     SELECT 'doc_pas_home', $1, $2, doc_type, agency, version, 'PAS', 'draft', 0
       FROM c2c_rule_packs WHERE doc_type = 'pas' AND agency = 'fda' AND superseded_by IS NULL LIMIT 1`,
    [ORG, PAS],
  );
});

async function add(programId: string, agency: string, applicationType: string) {
  const client = await jdb.pool.connect();
  try {
    await client.query('BEGIN');
    const observed = { query: (sql: string, params?: unknown[]) => {
      if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)) writes.push(sql);
      return client.query(sql, params);
    } };
    const out = await addProjectMarket({ client: observed as never, orgId: ORG, userId: USER, programId, agency, applicationType, reason: REASON });
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

type Row = Record<string, unknown>;
const rows = async (sql: string, params: unknown[] = []) => (await jdb.pool.query(sql, params)).rows as Row[];
const one = async (sql: string, params: unknown[] = []) => (await rows(sql, params))[0];
const count = async (sql: string, params: unknown[] = []) => Number((await one(sql, params)).n);

async function marketState() {
  return {
    documents: await rows('SELECT * FROM c2c_documents ORDER BY id'),
    sections: await rows('SELECT * FROM c2c_document_sections ORDER BY id'),
    submissions: await rows('SELECT * FROM submissions ORDER BY id'),
    audit: await rows('SELECT * FROM audit_logs ORDER BY id'),
    programs: await rows('SELECT * FROM regulatory_programs ORDER BY id'),
  };
}

describe('add a market (F22)', () => {
  it.each(['510k', 'pma', 'de_novo', 'ide', 'mdr', 'ivdr', 'cer', 'device', 'ivd'])(
    'refuses a known %s home pathway with an inconsistent medicinal product before any write', async (programType) => {
      await jdb.pool.query('UPDATE regulatory_programs SET program_type=$1 WHERE id=$2', [programType, NDA]);
      const before = await marketState();
      await expect(add(NDA, 'EMA', 'maa')).rejects.toMatchObject({ status: 422, code: 'DEVICE_PROGRAM' });
      expect(writes).toEqual([]);
      expect(await marketState()).toEqual(before);
    },
  );
  it.each(REGIONAL_DEVICE_APPLICATION_CLASSES)('refuses $docType as a medicinal added market before any write', async regional => {
    expect(await count('SELECT count(*) AS n FROM c2c_rule_packs WHERE doc_type=$1 AND agency=$2', [regional.docType, regional.packAgency])).toBe(1);
    const before = await marketState();
    const agency = resolveFilingCatalogEntry(regional.registryId)!.agency;
    await expect(add(NDA, agency, regional.docType)).rejects.toMatchObject({ status: 422, code: 'DEVICE_APPLICATION' });
    expect(writes).toEqual([]);
    expect(await marketState()).toEqual(before);
  });

  it.each(REGIONAL_DEVICE_APPLICATION_CLASSES)('refuses an inconsistent saved $docType home class before any write', async regional => {
    await jdb.pool.query('UPDATE regulatory_programs SET program_type=$1 WHERE id=$2', [regional.docType, NDA]);
    const before = await marketState();
    await expect(add(NDA, 'EMA', 'maa')).rejects.toMatchObject({ status: 422, code: 'DEVICE_PROGRAM' });
    expect(writes).toEqual([]);
    expect(await marketState()).toEqual(before);
  });
  it("adds EMA's MAA to an NDA project: its Module 1 and 3.2.R, an EU submission, the market, a governed action", async () => {
    const pack = (await one(
      `SELECT required_sections FROM c2c_rule_packs WHERE doc_type = 'maa' AND agency = 'ema' AND superseded_by IS NULL LIMIT 1`,
    )).required_sections;
    const expected = marketSubtree(pack).map((s) => s.key).sort();
    expect(expected).toContain('3.2.R');
    expect(expected.some((k) => String(k).startsWith('1.'))).toBe(true);
    expect(expected).not.toContain('2.5');

    const out = await add(NDA, 'EMA', 'maa');
    const doc = await one(`SELECT doc_type, agency, filing_scope FROM c2c_documents WHERE id = $1`, [out.documentId]);
    expect(doc).toEqual({ doc_type: 'maa', agency: 'ema', filing_scope: 'market' });
    const keys = (await rows(`SELECT section_key FROM c2c_document_sections WHERE document_id = $1 ORDER BY section_key`, [out.documentId])).map((r) => r.section_key);
    expect(keys).toEqual(expected);
    expect(out.sectionCount).toBe(expected.length);

    const sub = await one(`SELECT application_type, primary_region, program_id FROM submissions WHERE id = $1`, [out.submissionId]);
    expect(sub).toEqual({ application_type: 'maa', primary_region: 'eu', program_id: NDA });
    const agencies = (await one(`SELECT target_agencies FROM regulatory_programs WHERE id = $1`, [NDA])).target_agencies;
    expect(agencies).toEqual(['EMA']);
    expect(await count(`SELECT count(*) AS n FROM audit_logs WHERE reason = $1 AND target = $2`, [REASON, `project:${NDA}`])).toBe(1);
  });

  it('the home filing is still the one an authored section binds to', async () => {
    await add(NDA, 'EMA', 'maa');
    const bound = await resolveGovernedDocument({ db: jdb.pool as never, orgId: ORG, projectId: NDA });
    expect(bound.documentId).toBe('doc_home');
  });

  it("a newer market document of the home filing's own class never takes the home binding", async () => {
    // The binding used to take the newest document of the project's class;
    // a market document of that class (another agency) would have won.
    // The IND class has a second agency's pack (ind:mhra), so a same-class
    // market document can exist beside the IND project's home filing.
    for (const [id, agency, scope, at] of [['doc_ind_home', 'fda', 'home', 'now()'], ['doc_ind_market', 'mhra', 'market', "now() + interval '1 day'"]]) {
      await jdb.pool.query(
        `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness, filing_scope, created_at)
         SELECT $1, $2, $3, doc_type, agency, version, 'Doc', 'draft', 0, $4, ${at}
           FROM c2c_rule_packs WHERE doc_type = 'ind' AND agency = $5 AND superseded_by IS NULL LIMIT 1`,
        [id, ORG, IND, scope, agency],
      );
    }
    const bound = await resolveGovernedDocument({ db: jdb.pool as never, orgId: ORG, projectId: IND });
    expect(bound.documentId).toBe('doc_ind_home');
  });

  it("the project's own market with no submission yet gets its submission, and no second document", async () => {
    const out = await add(NDA, 'FDA', 'nda');
    expect(out).toMatchObject({ documentId: 'doc_home', sectionCount: 0 });
    expect(await count(`SELECT count(*) AS n FROM c2c_documents WHERE project_id = $1`, [NDA])).toBe(1);
    const sub = await one(`SELECT application_type, primary_region FROM submissions WHERE id = $1`, [out.submissionId]);
    expect(sub).toEqual({ application_type: 'nda', primary_region: 'fda' });
    await expect(add(NDA, 'FDA', 'nda')).rejects.toMatchObject({ status: 409, code: 'MARKET_EXISTS' });
  });

  it('a project with no filing of its own is refused, so the market never becomes its only document', async () => {
    // The IND project has no home document in this fixture.
    await expect(add(IND, 'EMA', 'cta')).rejects.toMatchObject({ status: 409, code: 'NO_HOME_FILING' });
    expect(await count(`SELECT count(*) AS n FROM c2c_documents WHERE project_id = $1`, [IND])).toBe(0);
  });

  it('a repeat is refused (409), and nothing more is written', async () => {
    await add(NDA, 'EMA', 'maa');
    await expect(add(NDA, 'EMA', 'maa')).rejects.toMatchObject({ status: 409, code: 'MARKET_EXISTS' });
    expect(await count(`SELECT count(*) AS n FROM c2c_documents WHERE filing_scope = 'market'`)).toBe(1);
    expect(await count(`SELECT count(*) AS n FROM submissions`)).toBe(1);
  });

  it.each([
    ['a UK IND (the UK has no IND)', IND, 'MHRA', 'ind', /Nothing was added/],
    ['Health Canada (no outline)', NDA, 'Health_Canada', 'nds', /Nothing was added/],
    ['a device project', DEVICE, 'FDA', 'k510', /Nothing was added/],
    // A filing document class is authored, never sequenced: no spine (2026-10-18).
    // The message names what was asked for, and on an NDA project never calls
    // the project's own filing a document (review finding, 2026-10-18).
    ['a supplement market on an NDA project', NDA, 'FDA', 'pas',
      /^A Prior Approval Supplement is authored as its own project, not added to another as a market\. An FDA supplement is not built as a sequence yet, so this platform sends nothing for the Prior Approval Supplement\. Nothing was added\.$/],
    ['a clinical study report market on an NDA project', NDA, 'ICH / Global', 'csr',
      /^A clinical study report is authored as its own project, not added to another as a market\. The clinical study report is a harmonised \(ICH\) document placed into an application's sequence; this platform sends nothing for it on its own\. Nothing was added\.$/],
    // Review finding, 2026-10-18: the project's own class is read, not only the
    // market's — a PAS project asked for an NDA market was given an NDA spine.
    ['an application market on a project that is a document class (a PAS)', PAS, 'FDA', 'nda',
      /^No market is added to this project: it is a Prior Approval Supplement\. An FDA supplement is not built as a sequence yet, so this platform sends nothing for the Prior Approval Supplement\. Nothing was added\.$/],
  ])('refuses %s with 422, says why, and writes nothing', async (_label, id, agency, type, message) => {
    const before = await count(`SELECT count(*) AS n FROM c2c_documents`);
    const err = await add(id, agency, type).catch((e) => e);
    expect(err).toBeInstanceOf(AddMarketRefusal);
    expect(err.status).toBe(422);
    expect(err.message).toMatch(message);
    expect(await count(`SELECT count(*) AS n FROM c2c_documents`)).toBe(before);
    expect(await count(`SELECT count(*) AS n FROM submissions`)).toBe(0);
  });
});
