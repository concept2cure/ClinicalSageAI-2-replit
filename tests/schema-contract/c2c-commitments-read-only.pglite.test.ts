/**
 * 20261029i_c2c_commitments_read_only.sql (P-39 step 2): the earlier commitment
 * file keeps its rows as history and takes no new write. Real DDL: the table
 * from 20260603_commitments.sql, with a row written before the file, as a
 * deployed database may hold. INSERT, UPDATE and TRUNCATE are refused; DELETE
 * stays open for a tenant purge; the row is unchanged. Replayed with its
 * creator, as every deploy does (Rule 1), it changes nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const CREATOR = 'migrations/20260603_commitments.sql';
const FILE = 'migrations/20261029i_c2c_commitments_read_only.sql';

let db: PGlite;
const refused = (p: Promise<unknown>) => p.then(() => 'ok', (e: Error) => (/read-only since 2026-10-29/.test(e.message) ? 'refused' : e.message));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(read(CREATOR));
  await db.exec(`INSERT INTO c2c_commitments (id, organization_id, title) VALUES ('cmt_old', 9, 'PMR 1: pediatric study')`);
  await db.exec(read(FILE));
}, 60_000);
afterAll(async () => { await db?.close(); });

describe('c2c_commitments is read-only', () => {
  it('is in the migration set, after the file that creates the table', () => {
    const files = C2C_MIGRATION_FILES as readonly string[];
    expect(files.indexOf(FILE)).toBeGreaterThan(files.indexOf(CREATOR));
    expect(files.indexOf(CREATOR)).toBeGreaterThanOrEqual(0);
  });

  it('refuses an insert, an update and a truncate, and keeps the row as it was', async () => {
    expect(await refused(db.query(`INSERT INTO c2c_commitments (id, organization_id, title) VALUES ('cmt_new', 9, 'x')`))).toBe('refused');
    expect(await refused(db.query(`UPDATE c2c_commitments SET status = 'met' WHERE id = 'cmt_old'`))).toBe('refused');
    expect(await refused(db.query(`TRUNCATE c2c_commitments`))).toBe('refused');
    expect((await db.query(`SELECT id, status, title FROM c2c_commitments`)).rows).toEqual([{ id: 'cmt_old', status: 'proposed', title: 'PMR 1: pediatric study' }]);
  });

  it('replays with its creator unchanged, and leaves delete open for a tenant purge', async () => {
    await db.exec(read(CREATOR));
    await db.exec(read(FILE));
    expect((await db.query(`SELECT count(*)::int AS n FROM c2c_commitments`)).rows).toEqual([{ n: 1 }]);
    expect(await refused(db.query(`DELETE FROM c2c_commitments WHERE organization_id = 9`))).toBe('ok');
  });
});
