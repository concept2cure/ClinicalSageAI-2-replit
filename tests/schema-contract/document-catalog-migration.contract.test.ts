/**
 * Contract: the document-catalog migration is on the durable apply path and
 * actually provisions what the catalog service reads.
 *
 * The catalog is what lets AnA remember a client's uploaded files across
 * sessions (vault.document_catalog) and what makes "reviewed" a proven claim
 * (vault.document_read_receipts + the full-coverage gate). If the migration is
 * merged but never applied, both tables 42P01 at runtime, the ingest hook
 * fails the upload transaction wherever the feature flag is on, and the tools
 * error on every call — the exact merged ≠ applied failure mode
 * ana-memory-migrations-reachable.contract.test.ts documents. So this test
 * pins:
 *   1. membership in C2C_MIGRATION_FILES (the one durable applier),
 *   2. ordering after the vault canonical-shape + placement entries it
 *      shares a table with,
 *   3. a real double apply against PGlite (the set is replayed whole on every
 *      deploy, so idempotency is not optional), with the pgvector-gated
 *      embedding column correctly SKIPPED where the extension is absent,
 *   4. the silent no-op on a database with no vault schema (a legitimate
 *      install state).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CATALOG = 'migrations/20260905_document_catalog.sql';
const CHUNKS = 'migrations/20260905b_vault_document_chunks.sql';
const CANONICAL_SHAPE = 'migrations/20260821_vault_documents_canonical_shape.sql';
const PLACEMENT = 'migrations/20260823_vault_document_placement.sql';

const sql = fs.readFileSync(path.join(REPO_ROOT, CATALOG), 'utf8');
const chunksSql = fs.readFileSync(path.join(REPO_ROOT, CHUNKS), 'utf8');

describe('document-catalog migrations are on the durable apply path', () => {
  it('both are in C2C_MIGRATION_FILES', () => {
    expect(C2C_MIGRATION_FILES).toContain(CATALOG);
    expect(C2C_MIGRATION_FILES).toContain(CHUNKS);
  });

  it('runs after the canonical-shape and placement entries for the same table', () => {
    const at = C2C_MIGRATION_FILES.indexOf(CATALOG);
    expect(at).toBeGreaterThan(C2C_MIGRATION_FILES.indexOf(CANONICAL_SHAPE));
    expect(at).toBeGreaterThan(C2C_MIGRATION_FILES.indexOf(PLACEMENT));
    // The chunks file ALTERs vault.document_catalog, so it must follow it.
    expect(C2C_MIGRATION_FILES.indexOf(CHUNKS)).toBeGreaterThan(at);
  });
});

describe('document-catalog migration applies against PGlite', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
  });

  afterAll(async () => {
    await db.close();
  });

  it('is a silent no-op on a database with no vault schema', async () => {
    await db.exec(sql);
    const res = await db.query(
      `SELECT to_regclass('vault.document_catalog') AS c, to_regclass('vault.document_read_receipts') AS r`
    );
    expect((res.rows[0] as any).c).toBeNull();
    expect((res.rows[0] as any).r).toBeNull();
  });

  it('provisions both tables once vault.documents exists, and re-applies cleanly', async () => {
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS vault;
      CREATE TABLE IF NOT EXISTS vault.documents (
        id UUID PRIMARY KEY,
        program_id UUID NOT NULL,
        content_hash CHAR(64) NOT NULL
      );
    `);
    await db.exec(sql);
    await db.exec(sql); // the set is replayed whole on every deploy

    const cols = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'vault' AND table_name = 'document_catalog'
        ORDER BY column_name`
    );
    const names = (cols.rows as Array<{ column_name: string }>).map(r => r.column_name);
    for (const expected of [
      'document_id',
      'content_hash',
      'catalog_status',
      'extraction_method',
      'extraction_error',
      'char_count',
      'document_kind',
      'purpose',
      'summary',
      'key_data',
      'embedding_status',
    ]) {
      expect(names, `document_catalog must carry ${expected}`).toContain(expected);
    }
    // PGlite has no pgvector here, so the guarded embedding column must be
    // SKIPPED — not attempted and failed.
    expect(names).not.toContain('embedding');

    const receipts = await db.query(
      `SELECT to_regclass('vault.document_read_receipts') AS r`
    );
    expect((receipts.rows[0] as any).r).not.toBeNull();
  });

  it('the chunks migration provisions the store, its indexes, and the catalog ledger — twice', async () => {
    await db.exec(chunksSql);
    await db.exec(chunksSql); // replayed whole on every deploy

    const cols = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'vault' AND table_name = 'document_chunks'
        ORDER BY column_name`
    );
    const names = (cols.rows as Array<{ column_name: string }>).map(r => r.column_name);
    for (const expected of ['document_id', 'chunk_index', 'chunk_text', 'char_start', 'char_end']) {
      expect(names, `document_chunks must carry ${expected}`).toContain(expected);
    }
    // No pgvector here → the guarded embedding column must be SKIPPED.
    expect(names).not.toContain('embedding');

    const ledger = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'vault' AND table_name = 'document_catalog'
          AND column_name IN ('chunk_status', 'chunk_count', 'chunk_error')`
    );
    expect(ledger.rows).toHaveLength(3);
  });

  it('receipt spans are constrained to sane character ranges', async () => {
    await db.exec(
      `INSERT INTO vault.documents (id, program_id, content_hash)
       VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', repeat('a', 64))`
    );
    await expect(
      db.exec(
        `INSERT INTO vault.document_read_receipts (document_id, content_hash, char_start, char_end)
         VALUES ('00000000-0000-4000-8000-000000000001', repeat('a', 64), 100, 50)`
      )
    ).rejects.toThrow(); // end before start violates the CHECK
    await db.exec(
      `INSERT INTO vault.document_read_receipts (document_id, content_hash, char_start, char_end)
       VALUES ('00000000-0000-4000-8000-000000000001', repeat('a', 64), 0, 50)`
    );
  });
});
