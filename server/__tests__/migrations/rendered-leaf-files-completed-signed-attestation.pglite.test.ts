/**
 * rendered_leaf_files records the uploader's attestation that an attached
 * Module 1 form IS the completed, signed form: who stated it and when
 * (completed_signed_attested_by / completed_signed_attested_at).
 *
 * What it used to do (report_ind_ivd_irb #15, 2026-10-15): nothing recorded
 * whether anybody had said the attached file was the completed, signed 1571 /
 * 1572 / 3674. The IND checklist counted the form done on the forms engine's
 * check alone (required_fields_missing = '{}'), which is computed from the
 * program record, not from the file — so an edited-but-unsigned PDF counted as
 * the signed form and raised readiness.
 *
 * The creator, migrations/20260903_rendered_leaf_files.sql, is amended in place
 * (CLAUDE.md RULE 1: it re-runs on every deploy). It is applied twice here, to
 * a fresh database and to one in the shape the table had before the change.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { C2C_MIGRATION_FILES } from '../../../scripts/db/migration-set.mjs';

const FILE = 'migrations/20260903_rendered_leaf_files.sql';
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const SQL = read(FILE);
/** The later file in the set that adds required_fields_missing (20261008e). */
const CHECK_COLUMN = read('migrations/20261008e_rendered_leaf_files_required_fields_missing.sql');
/** One deploy, in the set's order. */
const deploy = async (pg: PGlite) => { await pg.exec(SQL); await pg.exec(CHECK_COLUMN); };
const COLUMNS = ['completed_signed_attested_at', 'completed_signed_attested_by'];
const T = 120_000;

/** The table as 20260903 + 20261008e left it before 2026-10-15. */
const PRE_CHANGE = `
CREATE TABLE rendered_leaf_files (
  id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, vault_version_id TEXT NOT NULL,
  sha256 TEXT NOT NULL, md5 TEXT NOT NULL, mime TEXT NOT NULL, byte_size INTEGER NOT NULL,
  file_name TEXT NOT NULL, rendered_from TEXT NOT NULL, section_code TEXT,
  required_fields_missing text[], created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

const FILED = `INSERT INTO rendered_leaf_files
  (organization_id, vault_version_id, sha256, md5, mime, byte_size, file_name, rendered_from, required_fields_missing, created_by)
  VALUES (1, 'vv-1', 'a', 'b', 'application/pdf', 10, 'form-fda-1571.pdf', 'ind_form_sponsor_upload', '{}', 9)`;

async function columns(pg: PGlite) {
  const r = await pg.query(
    `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'rendered_leaf_files' AND column_name = ANY($1) ORDER BY column_name`,
    [COLUMNS],
  );
  return r.rows;
}

const EXPECTED = [
  { column_name: 'completed_signed_attested_at', data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null },
  { column_name: 'completed_signed_attested_by', data_type: 'integer', is_nullable: 'YES', column_default: null },
];

describe('rendered_leaf_files: the uploader’s completed-and-signed attestation', () => {
  it('a fresh install has both columns, nullable with no default, after the file runs twice', async () => {
    const pg = new PGlite();
    try {
      await deploy(pg);
      await deploy(pg);
      expect(await columns(pg), 'the creator does not add the attestation columns').toEqual(EXPECTED);
      // Nobody stated it: both are NULL, never a default actor or time.
      await pg.exec(FILED);
      const r = await pg.query(`SELECT completed_signed_attested_by AS by, completed_signed_attested_at AS at FROM rendered_leaf_files`);
      expect(r.rows).toEqual([{ by: null, at: null }]);
    } finally {
      await pg.close();
    }
  }, T);

  it('a database created before the change gains them on deploy, and every file already attached stays unattested', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(PRE_CHANGE);
      await pg.exec(FILED);
      for (let n = 0; n < 2; n++) {
        await deploy(pg);
        expect(await columns(pg), 'the creator does not add the attestation columns').toEqual(EXPECTED);
      }
      // No backfill: nobody attested an earlier attachment, so NULL is its true state.
      const r = await pg.query(
        `SELECT file_name, required_fields_missing, completed_signed_attested_by AS by, completed_signed_attested_at AS at FROM rendered_leaf_files`,
      );
      expect(r.rows).toEqual([{ file_name: 'form-fda-1571.pdf', required_fields_missing: [], by: null, at: null }]);
    } finally {
      await pg.close();
    }
  }, T);

  it('the amended file is on the deploy path, dated, and carries the audit header in its first 40 lines', () => {
    expect((C2C_MIGRATION_FILES as readonly unknown[]).includes(FILE)).toBe(true);
    expect(SQL.split('\n').slice(0, 40).join('\n')).toContain('eCTD REGULATORY AUDIT CONTEXT');
    expect(SQL).toMatch(/AMENDED IN PLACE 2026-10-15/);
    // Rule 1: removing schema is never a DROP appended here.
    expect(SQL).not.toMatch(/\bDROP\s+COLUMN\b/i);
  });
});
