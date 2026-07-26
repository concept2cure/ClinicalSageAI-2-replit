/**
 * The program-scope migration applies on a database that does NOT have the CRE
 * spine — against real Postgres.
 *
 * This is the case CI hit: `preview_db_test` branches from the main database,
 * and `cre_evidence_sources` is not there. The spine migration
 * (db/migrations/20260724_clinical_regulatory_evidence_spine.sql) is merged,
 * but it is not in the allowlist in scripts/db/apply-c2c-migrations.mjs and CI
 * only applies migrations a PR *adds*, to an ephemeral preview branch that is
 * deleted when the PR closes. So the table can be absent from a real database
 * even though its migration is on the default branch.
 *
 * An unguarded ALTER therefore fails the whole migration run with
 * 'relation "cre_evidence_sources" does not exist'. These tests pin both
 * halves of the guard.
 */

import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SPINE = path.resolve(
  here,
  '../../../../db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
);
const PROGRAM_SCOPE = path.resolve(
  here,
  '../../../../migrations/20260726_cre_source_program_scope.sql',
);

const sql = (p: string) => fs.readFileSync(p, 'utf8');

async function columnExists(db: PGlite): Promise<boolean> {
  const r = await db.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'cre_evidence_sources' AND column_name = 'client_program_id'`,
  );
  return r.rows.length > 0;
}

describe('20260726_cre_source_program_scope (real Postgres)', () => {
  it('applies cleanly when the CRE spine is absent, instead of failing the run', async () => {
    const db = new PGlite();
    try {
      // No spine — exactly the preview database's state.
      await expect(db.exec(sql(PROGRAM_SCOPE))).resolves.toBeDefined();
      expect(await columnExists(db)).toBe(false);
    } finally {
      await db.close();
    }
  });

  it('adds the column and index when the spine is present', async () => {
    const db = new PGlite();
    try {
      await db.exec(sql(SPINE));
      await db.exec(sql(PROGRAM_SCOPE));

      expect(await columnExists(db)).toBe(true);
      const idx = await db.query(
        `SELECT 1 FROM pg_indexes WHERE indexname = 'cre_src_program_idx'`,
      );
      expect(idx.rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  it('is re-runnable, so it can be applied again after the spine lands', async () => {
    const db = new PGlite();
    try {
      // First run: no spine, no-op.
      await db.exec(sql(PROGRAM_SCOPE));
      expect(await columnExists(db)).toBe(false);

      // Spine arrives, migration re-run — the column must appear.
      await db.exec(sql(SPINE));
      await db.exec(sql(PROGRAM_SCOPE));
      expect(await columnExists(db)).toBe(true);

      // And running it a third time changes nothing.
      await db.exec(sql(PROGRAM_SCOPE));
      expect(await columnExists(db)).toBe(true);
    } finally {
      await db.close();
    }
  });
});
