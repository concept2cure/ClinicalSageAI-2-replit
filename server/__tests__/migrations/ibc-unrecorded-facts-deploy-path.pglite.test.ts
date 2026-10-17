/**
 * An unanswered IBC screening question reaches deployed databases as NULL, not "no".
 *
 * migrations/20260610_ibc_biosafety.sql is amended in place (2026-10-15) so
 * nih_guidelines_section and involves_human_gene_transfer — and, later the same
 * day, biosafety_level and involves_recombinant_dna — are nullable with no
 * default, but that file runs on install-fresh only. A database installed
 * before still had NOT NULL DEFAULT 'not_applicable' / false / 'BSL-1' / false,
 * so an IBC registration created without those answers would fail on insert
 * now that the service writes NULL for them. migrations/20261015h_… is the
 * deploy-set file that relaxes the columns there; this runs it, twice, against
 * PGlite — including on a database where its first version already ran.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { C2C_MIGRATION_FILES } from '../../../scripts/db/migration-set.mjs';

const FILE = 'migrations/20261015h_ibc_unrecorded_facts_nullable.sql';
const DEPLOY = fs.readFileSync(path.join(process.cwd(), FILE), 'utf8');
const COLS = ['biosafety_level', 'involves_human_gene_transfer', 'involves_recombinant_dna', 'nih_guidelines_section'];
const OPEN = { is_nullable: 'YES', column_default: null };
const ALL_OPEN = { biosafety_level: OPEN, involves_human_gene_transfer: OPEN, involves_recombinant_dna: OPEN, nih_guidelines_section: OPEN };
const T = 120_000;

/** The table as installs before 2026-10-15 created it (the columns this file touches). */
const OLD_SHAPE = `
  CREATE TABLE ibc_registrations (
    id                           serial PRIMARY KEY,
    organization_id              integer NOT NULL,
    registration_number          text NOT NULL,
    nih_guidelines_section       text NOT NULL DEFAULT 'not_applicable' CHECK (nih_guidelines_section IN
                                   ('III-A','III-B','III-C','III-D','III-E','III-F','exempt','not_applicable')),
    biosafety_level              text NOT NULL DEFAULT 'BSL-1' CHECK (biosafety_level IN ('BSL-1','BSL-2','BSL-3','BSL-4')),
    involves_recombinant_dna     boolean NOT NULL DEFAULT false,
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

  it('relaxes all four columns on a database installed before, keeps recorded answers, and re-runs as a no-op', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(OLD_SHAPE);
      await pg.exec(`INSERT INTO ibc_registrations (organization_id, registration_number, nih_guidelines_section, biosafety_level, involves_recombinant_dna, involves_human_gene_transfer)
                     VALUES (1, 'R-1', 'III-C', 'BSL-2', true, true)`);
      // Before: an unanswered registration is either refused or stored as "not applicable" / BSL-1 / "no".
      expect(await shape(pg)).toEqual({
        biosafety_level: { is_nullable: 'NO', column_default: "'BSL-1'::text" },
        involves_human_gene_transfer: { is_nullable: 'NO', column_default: 'false' },
        involves_recombinant_dna: { is_nullable: 'NO', column_default: 'false' },
        nih_guidelines_section: { is_nullable: 'NO', column_default: "'not_applicable'::text" },
      });

      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(DEPLOY);
        expect(await shape(pg)).toEqual(ALL_OPEN);
      }

      await pg.exec(`INSERT INTO ibc_registrations (organization_id, registration_number) VALUES (1, 'R-2')`);
      const r = await pg.query(
        `SELECT registration_number, nih_guidelines_section, biosafety_level, involves_recombinant_dna, involves_human_gene_transfer
           FROM ibc_registrations ORDER BY id`,
      );
      expect(r.rows).toEqual([
        { registration_number: 'R-1', nih_guidelines_section: 'III-C', biosafety_level: 'BSL-2', involves_recombinant_dna: true, involves_human_gene_transfer: true },
        { registration_number: 'R-2', nih_guidelines_section: null, biosafety_level: null, involves_recombinant_dna: null, involves_human_gene_transfer: null },
      ]);
    } finally {
      await pg.close();
    }
  }, T);

  it('relaxes the other two on a database where this file’s first version (two columns) already ran', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(OLD_SHAPE);
      await pg.exec(`ALTER TABLE ibc_registrations
        ALTER COLUMN nih_guidelines_section DROP DEFAULT, ALTER COLUMN nih_guidelines_section DROP NOT NULL,
        ALTER COLUMN involves_human_gene_transfer DROP DEFAULT, ALTER COLUMN involves_human_gene_transfer DROP NOT NULL`);

      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(DEPLOY);
        expect(await shape(pg)).toEqual(ALL_OPEN);
      }
    } finally {
      await pg.close();
    }
  }, T);

  it('relaxes ibc_reviews.convened_quorum on a database installed before, keeps recorded answers, and re-runs as a no-op', async () => {
    const pg = new PGlite();
    const quorum = async () => (await pg.query<{ is_nullable: string; column_default: string | null }>(
      `SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ibc_reviews' AND column_name = 'convened_quorum'`,
    )).rows[0];
    try {
      await pg.exec(`${OLD_SHAPE}
        CREATE TABLE ibc_reviews (
          id              serial PRIMARY KEY,
          registration_id integer NOT NULL,
          outcome         text NOT NULL,
          convened_quorum boolean NOT NULL DEFAULT false
        );
        INSERT INTO ibc_reviews (registration_id, outcome, convened_quorum) VALUES (1, 'approved', true);`);
      expect(await quorum()).toEqual({ is_nullable: 'NO', column_default: 'false' });

      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(DEPLOY);
        expect(await quorum()).toEqual(OPEN);
      }
      await pg.exec(`INSERT INTO ibc_reviews (registration_id, outcome) VALUES (1, 'tabled')`);
      const r = await pg.query(`SELECT convened_quorum FROM ibc_reviews ORDER BY id`);
      expect(r.rows).toEqual([{ convened_quorum: true }, { convened_quorum: null }]);
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
