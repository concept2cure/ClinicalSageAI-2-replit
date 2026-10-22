/**
 * AnA's outline read states the denominator the readiness figure uses
 * (F23 hand-on, `docs/evidence/D2-ONE-ANA/2026-10-22/f23-one-dossier-read/`).
 *
 * `read_governed_document` returned the document's readiness beside "Outline
 * with N sections", N counting every row. Since F23 the figure leaves out a
 * heading that holds other sections and has not been worked
 * (c2c_document_counted_readiness, markCountedSections), so a model narrating
 * the two together said "R% of N sections" over the wrong N. Each row now says
 * whether it is counted, and the message states the counted denominator; the
 * trigger's figure is approved-or-locked over exactly those rows.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../../tests/golden-journeys/harness';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const h = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock('../../../db.js', () => ({
  get pool() { return h.pool; },
  getPool: () => h.pool,
  get db() { return null; },
}));

import { getToolHandler } from '../AnaToolExecutor.js';

const ORG = 7;
const PROJECT = '11111111-1111-4111-8111-111111111111';
let jdb: JourneyDb;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: extractTableDdl('migrations/0000_sweet_joseph.sql', ['organizations', 'users', 'organization_users', 'audit_logs']),
    migrations: [
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260929_actor_names.sql',
      'migrations/20260609_audit_hmac_seal.sql',
      'migrations/20260524_program_workbench_schema.sql',
      'migrations/20260528_phase9_document_schema.sql',
      'migrations/20260804_phase9_rule_pack_outlines.sql',
    ],
  });
  h.pool = jdb.pool;
  await jdb.pool.query(`INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES (${ORG}, 'Org', 'org', 'standard', 10)`);
  await jdb.pool.query(
    `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, product_name, primary_agency, target_agencies, status)
     VALUES ($1, $2, 'P-ind', 'P-ind', 'ind', 'drug', 'Vorelinib', 'FDA', '[]'::json, 'active')`,
    [PROJECT, ORG],
  );
  await jdb.pool.query(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     SELECT 'doc_a', $1, $2, doc_type, agency, version, 'IND', 'draft', 0
       FROM c2c_rule_packs WHERE doc_type = 'ind' AND agency = 'fda' AND superseded_by IS NULL LIMIT 1`,
    [ORG, PROJECT],
  );
  // M2 and M3 are headings. M2 has not been worked, so it is not counted;
  // M3 has been written in, so it is. Five counted rows, two approved: 40%.
  const rows: Array<[string, string | null, string, number]> = [
    ['M2', null, 'todo', 1], ['2.5', 'M2', 'approved', 2], ['2.7', 'M2', 'drafted', 3],
    ['M3', null, 'drafted', 4], ['3.2.S', 'M3', 'approved', 5], ['3.2.P', 'M3', 'todo', 6],
  ];
  for (const [key, parent, status, order] of rows) {
    await jdb.pool.query(
      `INSERT INTO c2c_document_sections (document_id, section_key, parent_key, label, path_order, mandatory, status, content, draft_source, version)
       VALUES ('doc_a', $1, $2, $1, $3, true, $4, '{}'::jsonb, 'template', 1)`,
      [key, parent, order, status],
    );
  }
});
afterAll(async () => { await jdb?.close?.(); });

const read = async () => JSON.parse(String(await getToolHandler('read_governed_document')!({ document_id: 'doc_a' }, { organizationId: ORG } as never)));

describe("AnA's outline read states the readiness denominator", () => {
  it('marks each row counted by the trigger\'s rule, and the figure is approved over exactly those', async () => {
    const out = await read();
    expect(out.document.readiness).toBe(40);
    const counted = out.outline.filter((r: { counted: boolean }) => r.counted).map((r: { section_key: string }) => r.section_key);
    expect(counted).toEqual(['2.5', '2.7', 'M3', '3.2.S', '3.2.P']);
    expect(out.outline.find((r: { section_key: string }) => r.section_key === 'M2').counted).toBe(false);
  });

  it('the message names the counted denominator, not every row', async () => {
    const out = await read();
    expect(out.message).toMatch(/^Outline with 6 sections; readiness 40% counts 5 of them \(2 approved or locked\)\. 1 heading not yet worked is not counted\./);
  });
});
