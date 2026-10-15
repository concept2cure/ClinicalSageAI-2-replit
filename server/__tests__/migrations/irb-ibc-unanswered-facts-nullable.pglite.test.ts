/**
 * An unanswered screening question is stored as NULL (not recorded), not as "no".
 *
 * irb_submissions.involves_vulnerable_populations and
 * ibc_registrations.involves_human_gene_transfer were `boolean NOT NULL DEFAULT
 * false`, and ibc_registrations.nih_guidelines_section was `NOT NULL DEFAULT
 * 'not_applicable'`. A submission nobody had asked about vulnerable subjects
 * was stored as "none involved", so the 45 CFR 46.111(b) safeguards check never
 * fired for it; an IBC registration with no NIH Guidelines category or gene-
 * transfer answer was stored as "not applicable" / "no", so the convened-IBC
 * review requirement was never raised for it.
 *
 * Both creators are amended in place (CLAUDE.md RULE 1): the CREATE declares the
 * columns nullable with no default, and a conditional block drops NOT NULL and
 * the default on a database created before the change. Each file is applied
 * twice here, to a fresh database and to one in the pre-change shape.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const IRB = read('migrations/20260610_irb_submissions.sql');
const IBC = read('migrations/20260610_ibc_biosafety.sql');
const T = 120_000;

const STUBS = `
  CREATE TABLE organizations (id serial PRIMARY KEY);
  CREATE TABLE users (id serial PRIMARY KEY);
  CREATE TABLE submissions (id serial PRIMARY KEY);
  INSERT INTO organizations (id) VALUES (1);
  INSERT INTO users (id) VALUES (1);`;

interface Shape { column_name: string; is_nullable: string; column_default: string | null }

async function shape(pg: PGlite, table: string, columns: string[]): Promise<Record<string, Omit<Shape, 'column_name'>>> {
  const r = await pg.query<Shape>(
    `SELECT column_name, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2) ORDER BY column_name`,
    [table, columns],
  );
  return Object.fromEntries(r.rows.map(({ column_name, ...rest }) => [column_name, rest]));
}

const OPEN = { is_nullable: 'YES', column_default: null };

describe('irb_submissions.involves_vulnerable_populations', () => {
  const COL = ['involves_vulnerable_populations'];
  const UNANSWERED = `INSERT INTO irb_submissions (organization_id, protocol_number, title, created_by) VALUES (1, 'P-9', 'Unanswered', 1)`;

  it('a fresh install declares it nullable with no default, so an unanswered row stores NULL', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(STUBS);
      await pg.exec(IRB);
      await pg.exec(IRB);
      expect(await shape(pg, 'irb_submissions', COL)).toEqual({ involves_vulnerable_populations: OPEN });
      await pg.exec(UNANSWERED);
      const r = await pg.query<{ v: boolean | null }>(`SELECT involves_vulnerable_populations AS v FROM irb_submissions`);
      expect(r.rows).toEqual([{ v: null }]);
    } finally {
      await pg.close();
    }
  }, T);

  it('a database created before the change loses NOT NULL and the default on deploy, keeping recorded answers', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(STUBS);
      await pg.exec(IRB);
      // The shape the creator used to produce.
      await pg.exec(`ALTER TABLE irb_submissions
        ALTER COLUMN involves_vulnerable_populations SET DEFAULT false,
        ALTER COLUMN involves_vulnerable_populations SET NOT NULL`);
      await pg.exec(`INSERT INTO irb_submissions (organization_id, protocol_number, title, created_by, involves_vulnerable_populations)
                     VALUES (1, 'P-1', 'Answered yes', 1, true), (1, 'P-2', 'Stored before the change', 1, false)`);

      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(IRB);
        expect(await shape(pg, 'irb_submissions', COL)).toEqual({ involves_vulnerable_populations: OPEN });
      }
      const r = await pg.query<{ v: boolean | null }>(`SELECT involves_vulnerable_populations AS v FROM irb_submissions ORDER BY id`);
      expect(r.rows.map((x) => x.v)).toEqual([true, false]);
      await pg.exec(UNANSWERED);
      const n = await pg.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM irb_submissions WHERE involves_vulnerable_populations IS NULL`);
      expect(n.rows[0].n).toBe(1);
    } finally {
      await pg.close();
    }
  }, T);
});

describe('ibc_registrations.nih_guidelines_section and involves_human_gene_transfer', () => {
  const COLS = ['involves_human_gene_transfer', 'nih_guidelines_section'];
  const UNANSWERED = `INSERT INTO ibc_registrations (organization_id, registration_number, title, created_by) VALUES (1, 'R-9', 'Unanswered', 1)`;

  it('a fresh install declares both nullable with no default, so an unanswered row stores NULL', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(STUBS);
      await pg.exec(IBC);
      await pg.exec(IBC);
      expect(await shape(pg, 'ibc_registrations', COLS)).toEqual({ involves_human_gene_transfer: OPEN, nih_guidelines_section: OPEN });
      await pg.exec(UNANSWERED);
      const r = await pg.query(`SELECT nih_guidelines_section, involves_human_gene_transfer FROM ibc_registrations`);
      expect(r.rows).toEqual([{ nih_guidelines_section: null, involves_human_gene_transfer: null }]);
      // The category vocabulary is still enforced on a recorded answer.
      await expect(
        pg.exec(`INSERT INTO ibc_registrations (organization_id, registration_number, title, created_by, nih_guidelines_section) VALUES (1, 'R-8', 'x', 1, 'III-Z')`),
      ).rejects.toThrow(/check constraint/);
    } finally {
      await pg.close();
    }
  }, T);

  it('a database created before the change loses NOT NULL and the defaults when the file runs, keeping recorded answers', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(STUBS);
      await pg.exec(IBC);
      await pg.exec(`ALTER TABLE ibc_registrations
        ALTER COLUMN nih_guidelines_section SET DEFAULT 'not_applicable',
        ALTER COLUMN nih_guidelines_section SET NOT NULL,
        ALTER COLUMN involves_human_gene_transfer SET DEFAULT false,
        ALTER COLUMN involves_human_gene_transfer SET NOT NULL`);
      await pg.exec(`INSERT INTO ibc_registrations (organization_id, registration_number, title, created_by, nih_guidelines_section, involves_human_gene_transfer)
                     VALUES (1, 'R-1', 'Recorded', 1, 'III-C', true)`);

      for (let run = 0; run < 2; run++) {
        await pg.exec(IBC);
        expect(await shape(pg, 'ibc_registrations', COLS)).toEqual({ involves_human_gene_transfer: OPEN, nih_guidelines_section: OPEN });
      }
      const r = await pg.query(`SELECT nih_guidelines_section, involves_human_gene_transfer FROM ibc_registrations`);
      expect(r.rows).toEqual([{ nih_guidelines_section: 'III-C', involves_human_gene_transfer: true }]);
    } finally {
      await pg.close();
    }
  }, T);
});
