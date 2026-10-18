/**
 * The harness's Shadow Review tables (SHADOW_REVIEW_PGLITE_DDL) are the deploy
 * path's, column for column and type for type: 20260604_shadow_review.sql,
 * then 20261015_shadow_review_waiver.sql and
 * 20261015b_shadow_finding_disposition.sql, applied as deploy-migrate applies
 * them. Seven harnesses once carried their own copies; none had the
 * 2026-10-15 columns, and the dispatch assessor failed on all of them. A
 * column added to a migration and not to the harness fails here.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { SHADOW_REVIEW_PGLITE_DDL } from '../pglite-harness';
import { C2C_MIGRATION_FILES } from '../../../scripts/db/migration-set.mjs';

const ROOT = path.resolve(__dirname, '../../../');
/** Every file on the deploy path that creates or alters a Shadow Review table, in deploy order. */
const SHADOW_MIGRATIONS = (C2C_MIGRATION_FILES as string[]).filter((f) =>
  /ALTER TABLE (public\.)?shadow_review_|CREATE TABLE IF NOT EXISTS (public\.)?shadow_review_/.test(
    fs.readFileSync(path.join(ROOT, f), 'utf8'),
  ),
);

async function columns(db: PGlite): Promise<string[]> {
  const r = await db.query<{ table_name: string; column_name: string; data_type: string }>(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('shadow_review_runs', 'shadow_review_findings')
      ORDER BY table_name, column_name`,
  );
  return r.rows.map((c) => `${c.table_name}.${c.column_name} ${c.data_type}`);
}

describe('SHADOW_REVIEW_PGLITE_DDL', () => {
  it('names the deploy path’s Shadow Review migrations: the creator and both 2026-10-15 files', () => {
    expect(SHADOW_MIGRATIONS).toEqual(
      expect.arrayContaining([
        'migrations/20260604_shadow_review.sql',
        'migrations/20261015_shadow_review_waiver.sql',
        'migrations/20261015b_shadow_finding_disposition.sql',
      ]),
    );
  });

  it('has exactly the columns and types the deploy path builds', async () => {
    const real = new PGlite();
    const harness = new PGlite();
    try {
      // The parents the real migrations' foreign keys name, minimally.
      await real.exec(`
        CREATE TABLE organizations (id SERIAL PRIMARY KEY);
        CREATE TABLE users (id SERIAL PRIMARY KEY);
        CREATE TABLE ectd_sequences (id SERIAL PRIMARY KEY);
      `);
      for (const f of SHADOW_MIGRATIONS) await real.exec(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      await harness.exec(SHADOW_REVIEW_PGLITE_DDL);
      const want = await columns(real);
      expect(want.length).toBeGreaterThan(30);
      expect(await columns(harness)).toEqual(want);
    } finally {
      await real.close();
      await harness.close();
    }
  });
});
