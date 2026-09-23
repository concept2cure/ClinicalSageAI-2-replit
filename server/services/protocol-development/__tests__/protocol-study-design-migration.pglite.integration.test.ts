/**
 * migrations/20260922_protocol_document_study_design.sql — replay safety.
 *
 * CLAUDE.md RULE 1: every file in C2C_MIGRATION_FILES is executed on EVERY
 * deploy, unconditionally. A file that is not a no-op on its second run is a
 * bug that ships green. This test applies the real file twice against an
 * in-process PGlite database and proves:
 *
 *   1. it is registered in C2C_MIGRATION_FILES, above the final pair;
 *   2. it carries no DROP;
 *   3. it adds the three link columns on the first run;
 *   4. the second run changes nothing and destroys nothing — a row written
 *      between the two runs still carries its link afterwards;
 *   5. on a database where protocol_documents does not exist (the set-only
 *      C-33 blank-database replay) it NOTICE-skips instead of aborting.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { C2C_MIGRATION_FILES } from '../../../../scripts/db/migration-set.mjs';

const REPO = resolve(__dirname, '../../../..');
const FILE = 'migrations/20260922_protocol_document_study_design.sql';

let sql: string;

beforeAll(() => {
  sql = readFileSync(resolve(REPO, FILE), 'utf8');
});

describe('20260922_protocol_document_study_design.sql', () => {
  it('is registered in C2C_MIGRATION_FILES above the final pair', () => {
    const idx = C2C_MIGRATION_FILES.indexOf(FILE);
    expect(idx).toBeGreaterThan(-1);
    // The final pair (the uuid step and the tenant-isolation sweep) must stay last.
    expect(idx).toBeLessThan(C2C_MIGRATION_FILES.length - 2);
  });

  it('carries no DROP — RULE 1 forbids appending one to a replayed set', () => {
    // Executable statements only: the header note is *required* to say the
    // word (it documents that a rollback is an in-place amendment, not a DROP).
    const executable = sql
      .split('\n')
      .filter((line) => !/^\s*--/.test(line))
      .join('\n');
    expect(/\bDROP\b/i.test(executable)).toBe(false);
  });

  it('applies twice against the same database and the second run is a no-op', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(
        `CREATE TABLE protocol_documents (
           id serial PRIMARY KEY, organization_id int, protocol_kind text, title text,
           status text, deleted_at timestamptz);`,
      );

      await pg.exec(sql);
      const afterFirst = await pg.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'protocol_documents' AND column_name LIKE 'study_design%'
          ORDER BY column_name`,
      );
      expect(afterFirst.rows.map((r) => r.column_name)).toEqual([
        'study_design_id',
        'study_design_linked_at',
        'study_design_linked_by',
      ]);

      // A link written between deploys must survive the replay.
      await pg.query(
        `INSERT INTO protocol_documents (organization_id, title, status, study_design_id, study_design_linked_by)
         VALUES (7, 'A Phase 3 Study', 'in_development', 'sd_abc', 1)`,
      );

      await pg.exec(sql);

      const afterSecond = await pg.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'protocol_documents' AND column_name LIKE 'study_design%'
          ORDER BY column_name`,
      );
      expect(afterSecond.rows.map((r) => r.column_name)).toEqual([
        'study_design_id',
        'study_design_linked_at',
        'study_design_linked_by',
      ]);
      const rows = await pg.query<{ study_design_id: string }>(
        `SELECT study_design_id FROM protocol_documents`,
      );
      expect(rows.rows).toEqual([{ study_design_id: 'sd_abc' }]);
    } finally {
      await pg.close();
    }
  }, 60_000);

  it('skips with a notice when protocol_documents does not exist', async () => {
    const pg = new PGlite();
    try {
      await expect(pg.exec(sql)).resolves.toBeDefined();
      const t = await pg.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM information_schema.tables WHERE table_name = 'protocol_documents'`,
      );
      expect(t.rows[0].c).toBe(0);
    } finally {
      await pg.close();
    }
  }, 60_000);
});
