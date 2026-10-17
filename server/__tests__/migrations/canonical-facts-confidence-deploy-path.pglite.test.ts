/**
 * A governed fact nobody scored reaches deployed databases as NULL, not 0.5.
 *
 * migrations/20260603_living_record_spine.sql is amended in place (2026-10-15)
 * so canonical_facts.confidence is nullable with no default — but that file
 * runs on install-fresh only. A database installed before still had NOT NULL
 * DEFAULT 0.5000, so a fact established or changed without a stated score would
 * fail on insert now that the store writes NULL for it.
 * migrations/20261015k_… is the deploy-set file that relaxes the column there;
 * this runs it, twice, against PGlite.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { C2C_MIGRATION_FILES } from '../../../scripts/db/migration-set.mjs';

const FILE = 'migrations/20261015k_canonical_facts_confidence_unscored.sql';
const DEPLOY = fs.readFileSync(path.join(process.cwd(), FILE), 'utf8');
const T = 120_000;

/** The column as installs before 2026-10-15 created it. */
const OLD_SHAPE = `
  CREATE TABLE canonical_facts (
    id         serial PRIMARY KEY,
    field      text NOT NULL,
    confidence numeric(5,4) NOT NULL DEFAULT 0.5000
  );`;

async function column(pg: PGlite) {
  const r = await pg.query<{ is_nullable: string; column_default: string | null }>(
    `SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'canonical_facts' AND column_name = 'confidence'`,
  );
  return r.rows[0];
}

describe(FILE, () => {
  it('is in the deploy set, ahead of the final isolation pair', () => {
    const files = C2C_MIGRATION_FILES as readonly unknown[];
    const at = files.indexOf(FILE);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(files.length - 2);
  });

  it('relaxes the column on a database installed before, keeps stored scores, and re-runs as a no-op', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(OLD_SHAPE);
      await pg.exec(`INSERT INTO canonical_facts (field, confidence) VALUES ('noael', 0.9)`);
      await pg.exec(`INSERT INTO canonical_facts (field) VALUES ('enrollment')`);
      expect(await column(pg)).toEqual({ is_nullable: 'NO', column_default: '0.5000' });

      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(DEPLOY);
        expect(await column(pg)).toEqual({ is_nullable: 'YES', column_default: null });
      }

      await pg.exec(`INSERT INTO canonical_facts (field) VALUES ('shelf_life')`);
      const r = await pg.query(`SELECT field, confidence::text AS confidence FROM canonical_facts ORDER BY id`);
      expect(r.rows).toEqual([
        { field: 'noael', confidence: '0.9000' },
        { field: 'enrollment', confidence: '0.5000' },
        { field: 'shelf_life', confidence: null },
      ]);
    } finally {
      await pg.close();
    }
  }, T);

  it('does nothing on a database without the table', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(DEPLOY);
      const r = await pg.query<{ t: string | null }>(`SELECT to_regclass('public.canonical_facts')::text AS t`);
      expect(r.rows[0].t).toBeNull();
    } finally {
      await pg.close();
    }
  }, T);
});
