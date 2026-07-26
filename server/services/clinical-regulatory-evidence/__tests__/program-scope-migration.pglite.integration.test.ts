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

import { describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A pool bound to whichever PGlite instance the current test created, so
// createSource can be exercised against a spine-only schema.
let active: PGlite | null = null;
vi.mock('../../../db', () => ({
  pool: {
    query: async (sql: string, params?: unknown[]) => {
      const r = await active!.query(sql, params as unknown[]);
      return { rows: r.rows as unknown[], rowCount: (r.rows as unknown[]).length };
    },
  },
}));

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
  // Each case needs a DIFFERENT migration state, so they cannot share one
  // database — but they are deliberately consolidated to THREE PGlite
  // instances rather than one per assertion. Every other suite here spins up
  // one; this file spinning up five was enough extra concurrent WASM Postgres
  // to tip the wider run into worker failures when unrelated tests were added.
  // Keep the instance count down when extending this file.

  it('applies with no spine, then adds the column once the spine lands, and is re-runnable', async () => {
    const db = new PGlite();
    try {
      // 1. No spine — exactly the preview database's state. Must not fail the run.
      await expect(db.exec(sql(PROGRAM_SCOPE))).resolves.toBeDefined();
      expect(await columnExists(db)).toBe(false);

      // 2. Spine arrives, migration re-run — the column must appear.
      await db.exec(sql(SPINE));
      await db.exec(sql(PROGRAM_SCOPE));
      expect(await columnExists(db)).toBe(true);

      // 3. A third run changes nothing.
      await db.exec(sql(PROGRAM_SCOPE));
      expect(await columnExists(db)).toBe(true);
    } finally {
      await db.close();
    }
  });

  it('adds the column and its index when the spine is present', async () => {
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

  it('lets a program-less write through on a spine-only schema, but fails a scoped one loudly', async () => {
    // Regression: createSource named `client_program_id` unconditionally, so
    // every write failed with 42703 on a database that has the spine but not
    // the program-scope migration — the state of production, and of the other
    // CRE suites (18 tests across 6 files went red). Callers that set no
    // program (CSR adapter, CRL ingestion) must not depend on a later
    // migration's column.
    //
    // The opposite case must NOT be silent: dropping a supplied scope would
    // file the document under no project while reporting success.
    const db = new PGlite();
    active = db;
    try {
      await db.exec(sql(SPINE)); // spine only — no program-scope migration
      const svc = await import('../evidence-spine.service');

      const src = await svc.createSource(101, {
        sourceType: 'fda_crl',
        visibilityClass: 'global_public',
        agency: 'FDA',
        title: 'Complete Response Letter',
      });
      expect(src.id).toBeGreaterThan(0);
      expect(src.clientProgramId).toBeNull();

      await expect(
        svc.createSource(101, {
          sourceType: 'client_document',
          clientProgramId: '11111111-1111-4111-8111-111111111111',
          title: 'scoped.pdf',
        }),
      ).rejects.toThrow(/client_program_id/);
    } finally {
      active = null;
      await db.close();
    }
  });
});
