/**
 * Whether an invention was federally funded is stored as NULL until someone
 * records it, not as "no".
 *
 * invention_disclosures.federal_funding was `boolean NOT NULL DEFAULT false`, so a
 * disclosure whose funding nobody had checked was stored as "not federally
 * funded" and the Bayh-Dole compliance picture reported every 37 CFR 401.14
 * obligation 'not_applicable' for it.
 *
 * The creator (in C2C_MIGRATION_FILES, so it re-runs on every deploy) is amended
 * in place (CLAUDE.md RULE 1): the CREATE declares the column nullable with no
 * default, and a conditional block drops NOT NULL and the default on a database
 * created before the change. The file is applied twice here, to a fresh database
 * and to one in the pre-change shape.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(path.join(process.cwd(), 'migrations/20260705_invention_disclosure.sql'), 'utf8');
const T = 120_000;

const STUBS = `
  CREATE TABLE organizations (id serial PRIMARY KEY);
  CREATE TABLE users (id serial PRIMARY KEY);
  INSERT INTO organizations (id) VALUES (1);
  INSERT INTO users (id) VALUES (1);`;

const UNANSWERED = `INSERT INTO invention_disclosures (organization_id, title, created_by) VALUES (1, 'Funding not yet checked', 1)`;

async function shape(pg: PGlite): Promise<{ is_nullable: string; column_default: string | null }> {
  const r = await pg.query<{ is_nullable: string; column_default: string | null }>(
    `SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'invention_disclosures' AND column_name = 'federal_funding'`,
  );
  return r.rows[0];
}

const OPEN = { is_nullable: 'YES', column_default: null };

describe('invention_disclosures.federal_funding', () => {
  it('a fresh install declares it nullable with no default, so an unanswered row stores NULL', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(STUBS);
      await pg.exec(SQL);
      await pg.exec(SQL);
      expect(await shape(pg)).toEqual(OPEN);
      await pg.exec(UNANSWERED);
      const r = await pg.query<{ v: boolean | null }>(`SELECT federal_funding AS v FROM invention_disclosures`);
      expect(r.rows).toEqual([{ v: null }]);
    } finally {
      await pg.close();
    }
  }, T);

  it('a database created before the change loses NOT NULL and the default on deploy, keeping recorded answers', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(STUBS);
      await pg.exec(SQL);
      // The shape the creator used to produce.
      await pg.exec(`ALTER TABLE invention_disclosures
        ALTER COLUMN federal_funding SET DEFAULT false,
        ALTER COLUMN federal_funding SET NOT NULL`);
      await pg.exec(`INSERT INTO invention_disclosures (organization_id, title, created_by, federal_funding)
                     VALUES (1, 'Recorded federal', 1, true), (1, 'Stored before the change', 1, false)`);

      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(SQL);
        expect(await shape(pg)).toEqual(OPEN);
      }
      const r = await pg.query<{ v: boolean | null }>(`SELECT federal_funding AS v FROM invention_disclosures ORDER BY id`);
      expect(r.rows.map((x) => x.v)).toEqual([true, false]);
      await pg.exec(UNANSWERED);
      const n = await pg.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM invention_disclosures WHERE federal_funding IS NULL`);
      expect(n.rows[0].n).toBe(1);
    } finally {
      await pg.close();
    }
  }, T);
});
