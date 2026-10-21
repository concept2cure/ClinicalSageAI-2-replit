/**
 * The Project home feed shows a governed act on the project as what it was,
 * with its recorded reason (21 CFR 11.10(e), "available for review").
 *
 * Adding a market (FILING_SPINE F22) records the person's reason on the audit
 * row and the event on the governed action. The feed read neither: the row read
 * "c2c.work.transition · project" with no reason. On PGlite, with the real
 * schema and the real add-a-market, the feed now carries the reason, the event
 * and the market's agency; another organization's rows are not read.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { addProjectMarket } from '../add-project-market';
import { readProjectActivity } from '../project-activity';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ORG = 7;
const USER = 11;
const NDA = '11111111-1111-4111-8111-111111111111';
const REASON = 'The EU filing starts this quarter';

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
  await jdb.pool.query(`INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES (${ORG}, 'Org', 'org', 'standard', 10)`);
  await jdb.pool.query(`INSERT INTO users (id, email, name, password_hash) VALUES (${USER}, 'ra@example.test', 'Robin RA', 'x')`);
  await jdb.pool.query(
    `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, product_name, primary_agency, target_agencies, status)
     VALUES ($1, $2, 'P-nda', 'P-nda', 'nda', 'drug', 'Vorelinib', 'FDA', '[]'::json, 'active')`,
    [NDA, ORG],
  );
  await jdb.pool.query(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     SELECT 'doc_home', $1, $2, doc_type, agency, version, 'Home', 'draft', 0
       FROM c2c_rule_packs WHERE doc_type = 'nda' AND agency = 'fda' AND superseded_by IS NULL LIMIT 1`,
    [ORG, NDA],
  );
  const client = await jdb.pool.connect();
  try {
    await client.query('BEGIN');
    await addProjectMarket({ client: client as never, orgId: ORG, userId: USER, programId: NDA, agency: 'EMA', applicationType: 'maa', reason: REASON });
    await client.query('COMMIT');
  } finally {
    client.release();
  }
});
afterAll(async () => { await jdb?.close?.(); });

describe('the Project home feed names a governed act and its reason', () => {
  it('a market added reads as that, with the person who added it and their reason', async () => {
    const rows = await readProjectActivity(jdb.pool as never, NDA, ORG, 50);
    const added = rows.find((r) => r.event === 'market_added');
    expect(added).toMatchObject({ reason: REASON, actor_name: 'Robin RA' });
    expect(String(added?.event_agency).toUpperCase()).toBe('EMA');
  });

  it("another organization's feed holds none of it", async () => {
    expect(await readProjectActivity(jdb.pool as never, NDA, 8, 50)).toEqual([]);
  });
});
