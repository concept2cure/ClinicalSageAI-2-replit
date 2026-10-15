/**
 * A market's document shows its own part of the filing (FILING_SPINE F22b), on
 * PGlite with the real schema, the real rule packs and the real add-a-market.
 *
 * An NDA project adds EMA's MAA. The market document's outline is its Module 1
 * and 3.2.R, never the MAA pack's common modules, which are the home filing's.
 * The MAA pack's mandatory sections the home filing does not hold are named as
 * gaps, and nothing is inserted for them. The home filing's outline is the
 * whole pack, as before.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { addProjectMarket } from '../add-project-market';
import { readDocumentOutline } from '../document-outline';
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

/** The home filing as intake scaffolds it: every section of the NDA pack, minus the ones named. */
async function homeFiling(omit: string[]) {
  await jdb.pool.query(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     SELECT 'doc_home', $1, $2, doc_type, agency, version, 'Home', 'draft', 0
       FROM c2c_rule_packs WHERE doc_type = 'nda' AND agency = 'fda' AND superseded_by IS NULL LIMIT 1`,
    [ORG, NDA],
  );
  await jdb.pool.query(
    `INSERT INTO c2c_document_sections (document_id, section_key, parent_key, label, path_order, mandatory, status, content, draft_source, version)
     SELECT 'doc_home', s.key, s.parent_key, s.label, COALESCE(s.path_order, 0), COALESCE(s.mandatory, false), 'todo', '{}'::jsonb, 'template', 1
       FROM c2c_documents d JOIN c2c_rule_packs rp ON rp.doc_type = d.doc_type AND rp.agency = d.agency AND rp.version = d.rule_pack_version,
            jsonb_to_recordset(rp.required_sections) AS s(key text, parent_key text, label text, mandatory boolean, path_order integer)
      WHERE d.id = 'doc_home' AND NOT (s.key = ANY($1::text[]))`,
    [omit],
  );
}

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

/** A mandatory common section of the MAA pack the NDA pack also has (the gap the test opens). */
async function sharedMandatoryCommonKey(): Promise<string> {
  const [maa] = await rows(`SELECT required_sections FROM c2c_rule_packs WHERE doc_type = 'maa' AND agency = 'ema' AND superseded_by IS NULL LIMIT 1`);
  const [nda] = await rows(`SELECT required_sections FROM c2c_rule_packs WHERE doc_type = 'nda' AND agency = 'fda' AND superseded_by IS NULL LIMIT 1`);
  const ndaKeys = new Set((nda.required_sections as Array<{ key: string }>).map((s) => s.key));
  const key = (maa.required_sections as Array<{ key: string; mandatory?: boolean; parent_key?: string | null }>)
    .find((s) => s.mandatory === true && s.parent_key && !isRegionalSectionKey(s.key) && ndaKeys.has(s.key))?.key;
  if (!key) throw new Error('no shared mandatory common section between the MAA and NDA packs');
  return key;
}

describe("a market's document outline (F22b)", () => {
  it('is the market\'s Module 1 and 3.2.R, never the common modules', async () => {
    await homeFiling([]);
    const out = await readDocumentOutline(jdb.pool as never, ORG, await addEma());
    expect(out?.document.filing_scope).toBe('market');
    const keys = out!.outline.map((r) => String(r.key));
    expect(keys).toContain('3.2.R');
    expect(keys.some((k) => k.startsWith('1.'))).toBe(true);
    expect(keys.filter((k) => !isRegionalSectionKey(k)).every((k) => /^M\d$/.test(k))).toBe(true);
    expect(out!.gaps).toEqual([]);
  });

  it('names the common sections the home filing lacks as gaps, and inserts nothing for them', async () => {
    const missing = await sharedMandatoryCommonKey();
    await homeFiling([missing]);
    const doc = await addEma();
    const before = await rows(`SELECT count(*)::int AS n FROM c2c_document_sections`);
    const out = await readDocumentOutline(jdb.pool as never, ORG, doc);
    expect(out!.gaps.map((g) => g.key)).toContain(missing);
    expect(out!.gaps.every((g) => !isRegionalSectionKey(g.key))).toBe(true);
    expect(await rows(`SELECT count(*)::int AS n FROM c2c_document_sections`)).toEqual(before);
  });

  it('the home filing is the whole pack, with no gaps', async () => {
    await homeFiling([]);
    const out = await readDocumentOutline(jdb.pool as never, ORG, 'doc_home');
    expect(out?.document.filing_scope).toBe('home');
    const [nda] = await rows(`SELECT required_sections FROM c2c_rule_packs WHERE doc_type = 'nda' AND agency = 'fda' AND superseded_by IS NULL LIMIT 1`);
    expect(out!.outline).toHaveLength((nda.required_sections as unknown[]).length);
    expect(out!.gaps).toEqual([]);
  });

  it("another organization's document is not read", async () => {
    await homeFiling([]);
    expect(await readDocumentOutline(jdb.pool as never, 8, 'doc_home')).toBeNull();
  });
});
