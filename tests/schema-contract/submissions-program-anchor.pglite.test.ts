/**
 * A submission carries its project (LX-22, project first).
 *
 * `submissions` had no project key. The only recorded link was on the program
 * side — `submission_id` inside the sealed `c2c.project.create` audit row — and
 * every production reader re-derived program → submission by product name. Two
 * projects for the same product shared one filing spine, and a submission made
 * in Submission Center had no link at all.
 *
 * 20260925b adds `submissions.program_id`, holds it to the submission's own
 * organization with a composite foreign key, and backfills it from the creation
 * audit rows ONLY where the link is one-to-one and same-tenant. Everything else
 * stays NULL — an ambiguous history is not resolved by guessing.
 *
 * Applies the real files that create both tables, then the anchor, and replays
 * it as every deploy does (CLAUDE.md Rule 1).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';
import { AUDIT_LOGS_PGLITE_DDL } from '../../server/db/pglite-harness';

const ROOT = join(__dirname, '..', '..');
const sql = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const PROGRAMS_DDL = 'migrations/20260524_program_workbench_schema.sql';
const SUBMISSIONS_DDL = 'migrations/20260604_submission_core_canonical.sql';
const ANCHOR = 'migrations/20260925b_submissions_program_anchor.sql';

const P1 = '11111111-1111-4111-8111-111111111111'; // org 1, one-to-one with S1
const P2 = '22222222-2222-4222-8222-222222222222'; // org 1, shares S2 with P3
const P3 = '33333333-3333-4333-8333-333333333333'; // org 1, shares S2 with P2
const P4 = '44444444-4444-4444-8444-444444444444'; // org 2

let db: PGlite;

async function programOf(id: number): Promise<string | null> {
  const { rows } = await db.query<{ program_id: string | null }>(`SELECT program_id FROM submissions WHERE id = $1`, [id]);
  return rows[0].program_id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, email TEXT);
    INSERT INTO organizations (id, name) VALUES (1, 'acme'), (2, 'other');
    INSERT INTO users (id, name, email) VALUES (7, 'u', 'u@x');
    -- The backfill reads tenant_id, action, table_name, record_id and new_values.
    -- The table is the full one the audit writer writes (ci:audit-logs-fixture).
    ${AUDIT_LOGS_PGLITE_DDL}
  `);
  await db.exec(sql(PROGRAMS_DDL));
  await db.exec(sql(SUBMISSIONS_DDL));
  await db.exec(`
    INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name) VALUES
      ('${P1}', 1, 'Alpha IND', 'A-1', 'ind', 'drug', 'FDA', 'Alpha'),
      ('${P2}', 1, 'Beta IND oncology', 'B-1', 'ind', 'drug', 'FDA', 'Beta'),
      ('${P3}', 1, 'Beta IND cardio', 'B-2', 'ind', 'drug', 'FDA', 'Beta'),
      ('${P4}', 2, 'Other org', 'O-1', 'ind', 'drug', 'FDA', 'Other');
    INSERT INTO submissions (id, title, product_name, application_type, client_type, primary_region, organization_id, created_by) VALUES
      (1, 'Alpha IND', 'Alpha', 'ind', 'pharma', 'fda', 1, 7),
      (2, 'Beta IND', 'Beta', 'ind', 'pharma', 'fda', 1, 7),
      (3, 'Other', 'Other', 'ind', 'pharma', 'fda', 2, 7),
      (4, 'Gamma', 'Gamma', 'ind', 'pharma', 'fda', 1, 7);
    INSERT INTO audit_logs (id, tenant_id, action, table_name, record_id, new_values) VALUES
      ('a1', 1, 'c2c.project.create', 'regulatory_programs', '${P1}', '{"submission_id": 1}'),
      ('a2', 1, 'c2c.project.create', 'regulatory_programs', '${P2}', '{"submission_id": 2}'),
      ('a3', 1, 'c2c.project.create', 'regulatory_programs', '${P3}', '{"submission_id": 2}'),
      ('a4', 1, 'c2c.project.create', 'regulatory_programs', '${P4}', '{"submission_id": 4}'),
      ('a5', 1, 'c2c.project.update', 'regulatory_programs', '${P1}', '{"submission_id": 4}');
  `);
  await db.exec(sql(ANCHOR));
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('submissions.program_id (20260925b)', () => {
  it('is on the applier, after both tables it joins', () => {
    const files = C2C_MIGRATION_FILES as string[];
    expect(files.indexOf(ANCHOR)).toBeGreaterThan(files.indexOf(SUBMISSIONS_DDL));
    expect(files.indexOf(ANCHOR)).toBeGreaterThan(files.indexOf(PROGRAMS_DDL));
  });

  it('backfills the one-to-one, same-tenant link from the creation audit row', async () => {
    expect(await programOf(1)).toBe(P1);
  });

  it('leaves a submission two projects both claim unanchored — never resolved by guessing', async () => {
    expect(await programOf(2)).toBeNull();
  });

  it('does not anchor to another organization’s project, and reads only creation rows', async () => {
    expect(await programOf(4)).toBeNull(); // a4 names org 2's program; a5 is not a creation row
    expect(await programOf(3)).toBeNull();
  });

  it('refuses, at the database, a submission anchored to another organization’s project', async () => {
    await expect(
      db.query(`UPDATE submissions SET program_id = $1 WHERE id = 4`, [P4]),
    ).rejects.toThrow(/submissions_program_same_org_fk/);
    await expect(db.query(`UPDATE submissions SET program_id = $1 WHERE id = 4`, [P1])).resolves.toBeDefined();
  });

  it('replays cleanly, as every deploy does, and changes nothing it already decided', async () => {
    await db.query(`UPDATE submissions SET program_id = NULL WHERE id = 4`);
    await db.exec(sql(ANCHOR));
    expect(await programOf(1)).toBe(P1);
    expect(await programOf(2)).toBeNull();
    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pg_constraint WHERE conname = 'submissions_program_same_org_fk'`,
    );
    expect(rows[0].n).toBe(1);
  });

  // Last: it deletes a program. A tenant purge deletes `regulatory_programs`
  // (PURGE_CHILD_TABLES) and not `submissions`, so a plain foreign key made the
  // first anchored submission abort that tenant's whole purge (23503).
  it('lets a program be deleted: the submission stays, its organization intact, un-anchored', async () => {
    await expect(db.query(`DELETE FROM regulatory_programs WHERE id = $1`, [P1])).resolves.toBeDefined();
    const { rows } = await db.query<{ program_id: string | null; organization_id: number }>(
      `SELECT program_id, organization_id FROM submissions WHERE id = 1`,
    );
    expect(rows).toEqual([{ program_id: null, organization_id: 1 }]);
  });
});
