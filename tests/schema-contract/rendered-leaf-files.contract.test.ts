/**
 * migrations/20260903_rendered_leaf_files.sql — the file applies, is idempotent,
 * and lands the shape the drizzle model and the leaf resolver read.
 *
 * The manifest test proves the file is LISTED; this proves it WORKS. A
 * migration that is registered but throws on apply halts deploy-migrate for
 * every tenant, and one whose columns disagree with the model fails only at
 * runtime, on the filing path this table exists to fix.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');
const FILE = 'migrations/20260903_rendered_leaf_files.sql';
const SQL = fs.readFileSync(path.join(REPO_ROOT, FILE), 'utf8');

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
});
afterAll(async () => {
  await pg?.close?.();
});

async function columns(table: string): Promise<Record<string, string>> {
  const { rows } = await pg.query<{ column_name: string; data_type: string; is_nullable: string }>(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1`,
    [table],
  );
  return Object.fromEntries(rows.map((r) => [r.column_name, `${r.data_type}:${r.is_nullable}`]));
}

describe('rendered_leaf_files migration', () => {
  it('is registered in the applied migration set', () => {
    expect(C2C_MIGRATION_FILES).toContain(FILE);
  });

  it('applies to an empty database and is idempotent on a second apply', async () => {
    await pg.exec(SQL);
    const first = await columns('rendered_leaf_files');
    expect(Object.keys(first).length).toBeGreaterThan(0);
    // deploy-migrate replays the whole set, so a second apply must not throw.
    await pg.exec(SQL);
    expect(await columns('rendered_leaf_files')).toEqual(first);
  });

  it('lands every column the model and the resolver read, with the right nullability', async () => {
    const cols = await columns('rendered_leaf_files');
    // NOT NULL where the record would otherwise be able to lie about the bytes.
    for (const c of ['organization_id', 'vault_version_id', 'sha256', 'md5', 'mime', 'byte_size', 'file_name', 'rendered_from']) {
      expect(cols[c], `${c} missing`).toBeTruthy();
      expect(cols[c].endsWith(':NO'), `${c} must be NOT NULL`).toBe(true);
    }
    // Optional context.
    expect(cols['section_code']).toMatch(/:YES$/);
    expect(cols['created_by']).toMatch(/:YES$/);
  });

  it('refuses two rows for the same stored object in one organization', async () => {
    const insert = (vv: string) =>
      pg.query(
        `INSERT INTO rendered_leaf_files
           (organization_id, vault_version_id, sha256, md5, mime, byte_size, file_name, rendered_from)
         VALUES (1,$1,'sha','md5','application/pdf',10,'f.pdf','ind_annual_report')`,
        [vv],
      );
    await insert('vv-dup');
    // A retry that re-puts the same version must not create a second record of
    // the same bytes.
    await expect(insert('vv-dup')).rejects.toThrow();
    // The same handle under a different organization is a different object.
    await expect(
      pg.query(
        `INSERT INTO rendered_leaf_files
           (organization_id, vault_version_id, sha256, md5, mime, byte_size, file_name, rendered_from)
         VALUES (2,'vv-dup','sha','md5','application/pdf',10,'f.pdf','ind_annual_report')`,
      ),
    ).resolves.toBeTruthy();
  });
});
