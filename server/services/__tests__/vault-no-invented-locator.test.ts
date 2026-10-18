/**
 * A vault document with no stored bytes is not given a storage locator.
 *
 * migrations/20260821_vault_documents_canonical_shape.sql re-runs on every
 * deploy, and set s3_bucket = 'local', s3_key = id::text on every row with
 * none — a locator for bytes nobody wrote there (the old ingest stored a
 * relative path under uploads/, never the row id).
 *
 * It must also replay over the record guard that
 * migrations/20260926_vault_documents_record_immutability.sql installs, which
 * refuses clearing a locator: a migration that withdrew the invented ones
 * would fail every deploy. The guard below is that file's own function, read
 * from it, not a stand-in.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const SQL = read('migrations/20260821_vault_documents_canonical_shape.sql');
const GUARD_FN = (() => {
  const src = read('migrations/20260926_vault_documents_record_immutability.sql');
  const start = src.indexOf('CREATE OR REPLACE FUNCTION vault.documents_record_guard()');
  const end = src.indexOf('$fn$;', start);
  if (start < 0 || end < 0) throw new Error('vault.documents_record_guard not found in its migration');
  return src.slice(start, end + '$fn$;'.length);
})();
/** The GCC-era table as db/migrations/044c_gcc_vault_schema.sql creates it. */
const LEGACY = `CREATE SCHEMA vault;
  CREATE TABLE vault.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), program_id UUID NOT NULL,
    filename TEXT NOT NULL, content_hash CHAR(64) NOT NULL, file_size BIGINT, mime_type TEXT,
    title TEXT, source_type VARCHAR(20) DEFAULT 'docx', status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
const locators = async (pg: PGlite) => (await pg.query<{ filename: string; s3_bucket: string | null; s3_key: string | null }>(
  'SELECT filename, s3_bucket, s3_key FROM vault.documents ORDER BY filename')).rows;

describe('the vault canonical-shape migration', () => {
  it('leaves a legacy row with no stored bytes without a locator, every deploy', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(LEGACY);
      await pg.exec(`INSERT INTO vault.documents (program_id, filename, content_hash)
                     VALUES (gen_random_uuid(), 'legacy.pdf', repeat('a', 64))`);
      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(SQL);
      expect(await locators(pg)).toEqual([{ filename: 'legacy.pdf', s3_bucket: null, s3_key: null }]);
    } finally {
      await pg.close();
    }
  }, 60_000);

  it('replays over the record guard, leaving every locator already written as it is', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(LEGACY);
      await pg.exec(SQL);
      await pg.exec(`ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS storage_version_id TEXT;
        ${GUARD_FN}
        CREATE TRIGGER vault_documents_record_guard BEFORE UPDATE ON vault.documents
          FOR EACH ROW EXECUTE FUNCTION vault.documents_record_guard();
        INSERT INTO vault.documents (program_id, filename, content_hash, s3_bucket, s3_key) VALUES
          (gen_random_uuid(), 'a-earlier-backfill.pdf', repeat('a', 64), 'local', NULL),
          (gen_random_uuid(), 'b-real-path.pdf', repeat('b', 64), 'local', 'uploads/vault/p1/abc');
        UPDATE vault.documents SET s3_key = id::text WHERE filename = 'a-earlier-backfill.pdf';`);
      const before = await locators(pg);
      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(SQL);
      expect(await locators(pg)).toEqual(before);
    } finally {
      await pg.close();
    }
  }, 60_000);
});
