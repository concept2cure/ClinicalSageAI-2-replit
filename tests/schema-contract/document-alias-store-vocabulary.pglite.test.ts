/**
 * The alias store vocabulary reaches a database that already has the old one.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Every entry of C2C_MIGRATION_FILES re-executes on every deploy, so CLAUDE.md
 * RULE 1 says the way to change shipped schema is to AMEND THE CREATING
 * MIGRATION IN PLACE — appending a DROP is the thing it forbids.
 *
 * The store CHECK was added under a guard keyed on the constraint's NAME:
 *
 *     IF NOT EXISTS (SELECT 1 FROM pg_constraint
 *                     WHERE conname = 'c2c_document_aliases_store_check')
 *
 * Against that guard the amendment RULE 1 mandates did NOTHING on any database
 * that already held the constraint. The guard is false, the ADD is skipped, the
 * old vocabulary survives, and the deploy is green — the failure this repo keeps
 * writing gates for: a change that reports success and had no effect.
 *
 * Whoever next extended the vocabulary would have added their store, watched the
 * migration pass, and then had every write for it rejected in production by a
 * CHECK still carrying the old values, with nothing anywhere saying why.
 *
 * ── How this test can fail ───────────────────────────────────────────────────
 * It builds the case the guard hid: a database carrying a DELIBERATELY
 * TRUNCATED vocabulary, then applies the real migration file and asserts the
 * file's own list reached it. Under the existence-only guard the truncated
 * constraint survives and every store the migration lists but the old
 * constraint lacked is rejected — so this test fails on the exact shape of
 * database the guard made unreachable, which a fresh-database test cannot see.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DOCUMENT_ALIAS_STORES } from '../../server/services/c2c/document-alias-map';

const MIGRATION_PATH = join(__dirname, '..', '..', 'migrations/20260814d_document_alias_map.sql');
const migration = () => readFileSync(MIGRATION_PATH, 'utf8');

const CANON = '0b6f2a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

/**
 * A database as it stood BEFORE the vocabulary was extended: the table, and a
 * CHECK that admits one store. Standing in for any older list, which is the
 * point — the migration must converge the database on its own list whatever it
 * finds, not merely when it finds nothing.
 */
const OLD_VOCABULARY_ONLY = `
  CREATE TABLE IF NOT EXISTS c2c_document_aliases (
    canonical_id    UUID        NOT NULL,
    store           TEXT        NOT NULL,
    native_id       TEXT        NOT NULL,
    organization_id INTEGER     NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (store, native_id),
    UNIQUE (canonical_id, store)
  );
  ALTER TABLE c2c_document_aliases
    ADD CONSTRAINT c2c_document_aliases_store_check
    CHECK (store IN ('authoring_documents'));
`;

let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
});
afterEach(async () => {
  await db?.close();
});

describe('a database carrying an older store vocabulary', () => {
  beforeEach(async () => {
    await db.exec(OLD_VOCABULARY_ONLY);
  });

  it('starts out rejecting a store the migration lists — the precondition', async () => {
    await expect(
      db.query(
        `INSERT INTO c2c_document_aliases (canonical_id, store, native_id, organization_id)
         VALUES ($1, 'submission_leaves', 'n1', 1)`,
        [CANON],
      ),
    ).rejects.toThrow(/c2c_document_aliases_store_check/);
  });

  it('accepts every store in the migration once the migration has run', async () => {
    await db.exec(migration());
    // One row per store. A rejection here is the constraint still carrying the
    // old list, which is precisely what the name-only guard left behind.
    for (const [i, store] of DOCUMENT_ALIAS_STORES.entries()) {
      await expect(
        db.query(
          `INSERT INTO c2c_document_aliases (canonical_id, store, native_id, organization_id)
           VALUES ($1, $2, $3, 1)`,
          [CANON, store, `native-${i}`],
        ),
        `store '${store}' is in DOCUMENT_ALIAS_STORES but the database rejected it`,
      ).resolves.toBeDefined();
    }
  });

  it('still refuses a store that is in neither list', async () => {
    // Converging the vocabulary must not mean widening it to anything.
    await db.exec(migration());
    await expect(
      db.query(
        `INSERT INTO c2c_document_aliases (canonical_id, store, native_id, organization_id)
         VALUES ($1, 'sharepoint', 'n9', 1)`,
        [CANON],
      ),
    ).rejects.toThrow(/c2c_document_aliases_store_check/);
  });

  it('converges on the migration list on EVERY replay, not just the first', async () => {
    // The set re-executes unconditionally; a second run must be a no-op in
    // effect, not a second shape.
    await db.exec(migration());
    await db.exec(migration());
    const r = await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'c2c_document_aliases_store_check'`,
    );
    expect(r.rows).toHaveLength(1);
    for (const store of DOCUMENT_ALIAS_STORES) {
      expect(r.rows[0].def).toContain(`'${store}'`);
    }
  });
});

describe('a fresh database', () => {
  it('gets the same vocabulary — the upgrade path and the create path agree', async () => {
    await db.exec(migration());
    const r = await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'c2c_document_aliases_store_check'`,
    );
    expect(r.rows).toHaveLength(1);
    for (const store of DOCUMENT_ALIAS_STORES) {
      expect(r.rows[0].def).toContain(`'${store}'`);
    }
  });
});
