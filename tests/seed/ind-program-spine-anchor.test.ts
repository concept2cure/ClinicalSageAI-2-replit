/**
 * The IND demo seed keeps ONE submission per program across the program-anchor
 * migration. 2026-09-28 (W5/D7, WO-9).
 *
 * 1706c05b6 anchored every submission to its program (submissions.program_id,
 * migrations/20260925b) and taught this seed to find the program's submission
 * by that anchor. The migration backfills the anchor only from product-created
 * projects' audit rows, so the submission this seed itself created before the
 * column existed stayed unanchored — and every later run inserted a second,
 * empty IND submission for the same program. The spine resolver then preferred
 * the anchored, empty one: the demo program's filed 1571 and its compiled
 * sequence 0000 disappeared from compile, readiness and the checklist.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
// @ts-expect-error — a plain .mjs seed module, no declarations.
import seedIndProgramNumbers from '../../scripts/seed/ga-demo.d/111-ind-program.mjs';

const ORG = 1;
const PROGRAM_ID = '709edd20-9af6-41e7-a206-c00ecb4671b9';
let pg: PGlite;
const client = () => ({ query: (sql: string, params?: unknown[]) => pg.query(sql, params) });

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE regulatory_programs (
      id UUID PRIMARY KEY, organization_id INTEGER, name TEXT, code TEXT, product_name TEXT,
      application_number TEXT, program_type TEXT, deleted_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
    );
    CREATE TABLE organization_users (organization_id INTEGER, user_id INTEGER);
    CREATE TABLE submissions (
      id SERIAL PRIMARY KEY, title TEXT, product_name TEXT, application_type TEXT, client_type TEXT,
      primary_region TEXT, status TEXT, lifecycle_stage TEXT, organization_id INTEGER, created_by INTEGER,
      program_id UUID, deleted_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE ectd_sequences (
      id SERIAL PRIMARY KEY, submission_id INTEGER, region TEXT, sequence_number TEXT, type TEXT,
      status TEXT, organization_id INTEGER, created_by INTEGER, deleted_at TIMESTAMPTZ
    );
    INSERT INTO regulatory_programs VALUES
      ('${PROGRAM_ID}', ${ORG}, 'Vorelinib · KIT-mutant GIST (IND)', 'BX-512', 'Vorelinib · BX-512', '000512', 'IND', NULL, NOW());
    INSERT INTO organization_users VALUES (${ORG}, 1);
  `);
});

async function ind() {
  const r = await pg.query<{ id: number; program_id: string | null }>(
    `SELECT id, program_id FROM submissions WHERE organization_id = $1 AND lower(application_type) = 'ind' AND deleted_at IS NULL ORDER BY id`,
    [ORG],
  );
  return r.rows;
}

describe('111-ind-program seed — one submission per program across the anchor migration', () => {
  it('anchors the submission it created before submissions.program_id, instead of creating a second one', async () => {
    // What an earlier run of this seed left: the submission and its 0000, unanchored.
    await pg.exec(`
      INSERT INTO submissions (id, title, product_name, application_type, client_type, primary_region, status, lifecycle_stage, organization_id, created_by)
        VALUES (3, 'Vorelinib · KIT-mutant GIST (IND)', 'Vorelinib · BX-512', 'ind', 'biotech', 'fda', 'active', 'original', ${ORG}, 1);
      SELECT setval('submissions_id_seq', 3);
      INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, organization_id, created_by)
        VALUES (3, 'fda', '0000', 'original', 'draft', ${ORG}, 1);
    `);

    await seedIndProgramNumbers(client(), { org: { id: ORG }, admin: { id: 1 } });

    expect(await ind()).toEqual([{ id: 3, program_id: PROGRAM_ID }]);
    const seqs = await pg.query(`SELECT submission_id, sequence_number FROM ectd_sequences ORDER BY id`);
    expect(seqs.rows).toEqual([{ submission_id: 3, sequence_number: '0000' }]);
  });

  it('is idempotent: a second run changes nothing', async () => {
    await seedIndProgramNumbers(client(), { org: { id: ORG }, admin: { id: 1 } });
    const once = await ind();
    await seedIndProgramNumbers(client(), { org: { id: ORG }, admin: { id: 1 } });
    expect(await ind()).toEqual(once);
    expect(once).toHaveLength(1);
  });

  it('never anchors a submission it cannot tell apart — two unanchored look-alikes are left alone', async () => {
    await pg.exec(`
      INSERT INTO submissions (title, product_name, application_type, organization_id, created_by) VALUES
        ('Vorelinib · KIT-mutant GIST (IND)', 'Vorelinib · BX-512', 'ind', ${ORG}, 1),
        ('Vorelinib · KIT-mutant GIST (IND)', 'Vorelinib · BX-512', 'ind', ${ORG}, 1);
    `);
    await seedIndProgramNumbers(client(), { org: { id: ORG }, admin: { id: 1 } });
    const rows = await ind();
    expect(rows.filter((r) => r.program_id == null)).toHaveLength(2);
  });
});
