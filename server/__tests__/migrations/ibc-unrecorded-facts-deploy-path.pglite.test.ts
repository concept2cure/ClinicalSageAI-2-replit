/**
 * An unanswered IBC screening question reaches deployed databases as NULL, not "no".
 *
 * migrations/20260610_ibc_biosafety.sql is amended in place (2026-10-15) so
 * nih_guidelines_section and involves_human_gene_transfer are nullable with no
 * default — but that file runs on install-fresh only. A database installed
 * before still had NOT NULL DEFAULT 'not_applicable' / false, so an IBC
 * registration created without those answers would fail on insert now that
 * the service writes NULL for them. migrations/20261015h_… is the deploy-set
 * file that relaxes the two columns there; this runs it, twice, against PGlite.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { C2C_MIGRATION_FILES } from '../../../scripts/db/migration-set.mjs';

const FILE = 'migrations/20261015h_ibc_unrecorded_facts_nullable.sql';
const DEPLOY = fs.readFileSync(path.join(process.cwd(), FILE), 'utf8');
const COLS = ['involves_human_gene_transfer', 'nih_guidelines_section'];
const OPEN = { is_nullable: 'YES', column_default: null };
const T = 120_000;

/** The table as installs before 2026-10-15 created it (the columns this file touches). */
const OLD_SHAPE = `
  CREATE TABLE ibc_registrations (
    id                           serial PRIMARY KEY,
    organization_id              integer NOT NULL,
    registration_number          text NOT NULL,
    nih_guidelines_section       text NOT NULL DEFAULT 'not_applicable' CHECK (nih_guidelines_section IN
                                   ('III-A','III-B','III-C','III-D','III-E','III-F','exempt','not_applicable')),
    involves_human_gene_transfer boolean NOT NULL DEFAULT false
  );`;

async function shape(pg: PGlite) {
  const r = await pg.query<{ column_name: string; is_nullable: string; column_default: string | null }>(
    `SELECT column_name, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ibc_registrations' AND column_name = ANY($1)
      ORDER BY column_name`,
    [COLS],
  );
  return Object.fromEntries(r.rows.map(({ column_name, ...rest }) => [column_name, rest]));
}

describe(FILE, () => {
  it('is in the deploy set, ahead of the final isolation pair', () => {
    const files = C2C_MIGRATION_FILES as readonly unknown[];
    const at = files.indexOf(FILE);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(files.length - 2);
  });

  it('relaxes both columns on a database installed before, keeps recorded answers, and re-runs as a no-op', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(OLD_SHAPE);
      await pg.exec(`INSERT INTO ibc_registrations (organization_id, registration_number, nih_guidelines_section, involves_human_gene_transfer)
                     VALUES (1, 'R-1', 'III-C', true)`);
      // Before: an unanswered registration is either refused or stored as "not applicable" / "no".
      expect(await shape(pg)).toEqual({
        involves_human_gene_transfer: { is_nullable: 'NO', column_default: 'false' },
        nih_guidelines_section: { is_nullable: 'NO', column_default: "'not_applicable'::text" },
      });

      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(DEPLOY);
        expect(await shape(pg)).toEqual({ involves_human_gene_transfer: OPEN, nih_guidelines_section: OPEN });
      }

      await pg.exec(`INSERT INTO ibc_registrations (organization_id, registration_number) VALUES (1, 'R-2')`);
      const r = await pg.query(
        `SELECT registration_number, nih_guidelines_section, involves_human_gene_transfer FROM ibc_registrations ORDER BY id`,
      );
      expect(r.rows).toEqual([
        { registration_number: 'R-1', nih_guidelines_section: 'III-C', involves_human_gene_transfer: true },
        { registration_number: 'R-2', nih_guidelines_section: null, involves_human_gene_transfer: null },
      ]);
    } finally {
      await pg.close();
    }
  }, T);

  it('does nothing on a database without the table', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(DEPLOY);
      const r = await pg.query<{ t: string | null }>(`SELECT to_regclass('public.ibc_registrations')::text AS t`);
      expect(r.rows[0].t).toBeNull();
    } finally {
      await pg.close();
    }
  }, T);
});
