/**
 * Migration journal — an executable applied-migration ledger (G-03).
 *
 * The durable applier (apply-c2c-migrations.mjs) is a hand-curated allowlist and,
 * as its own header admits, "merged and applied have diverged silently across
 * 358 migrations because the manifest is not authoritative for anything." There
 * is no record of WHICH files were applied to a given database, or of whether an
 * already-applied file was later EDITED — an edit the IF-NOT-EXISTS idempotent
 * apply path silently will not re-run, so the code and the live schema drift
 * apart with nothing to detect it.
 *
 * This module is the ledger that closes that gap: a `c2c_migration_journal`
 * table keyed by file path, holding the sha256 of the exact bytes applied plus
 * first/last-applied timestamps and an apply count. On every apply it records
 * the file and, crucially, compares the content hash against what was applied
 * before — surfacing DRIFT (an already-applied migration whose bytes changed).
 *
 * The executor is injected (`query(sql, params) => { rows }`) so the same logic
 * runs against node-postgres in the applier and against PGlite in tests.
 */

import crypto from 'node:crypto';

/** sha256 hex of a UTF-8 string. */
export function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Bootstrap DDL for the journal table. Idempotent; the journal owns itself. */
export const JOURNAL_DDL = `
CREATE TABLE IF NOT EXISTS c2c_migration_journal (
  file             TEXT PRIMARY KEY,
  sha256           TEXT NOT NULL,
  first_applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  apply_count      INTEGER NOT NULL DEFAULT 1
);
`;

/** Ensure the journal table exists. Call once before recording. */
export async function ensureJournal(query) {
  await query(JOURNAL_DDL);
}

/**
 * Record that `file` (with content `sqlText`) was applied.
 *
 * Returns { status, priorSha, sha }:
 *   - 'new'       — first time this file is recorded on this database;
 *   - 'unchanged' — the same bytes were applied before (idempotent re-run);
 *   - 'drift'     — the file was applied before with DIFFERENT bytes. The
 *                   idempotent apply path will not have re-created what changed,
 *                   so the live schema no longer matches the file. This is the
 *                   signal a release gate should refuse on.
 *
 * On drift the new hash is stored (so the ledger reflects the latest bytes) and
 * the count is bumped; the caller decides whether drift is fatal.
 */
export async function recordApplied(query, file, sqlText) {
  const hash = sha256(sqlText);
  const prior = await query('SELECT sha256 FROM c2c_migration_journal WHERE file = $1', [file]);
  const priorSha = prior.rows?.[0]?.sha256 ?? null;

  if (priorSha === null) {
    await query(
      `INSERT INTO c2c_migration_journal (file, sha256) VALUES ($1, $2)
       ON CONFLICT (file) DO NOTHING`,
      [file, hash],
    );
    return { status: 'new', priorSha: null, sha: hash };
  }
  if (priorSha === hash) {
    await query(
      `UPDATE c2c_migration_journal
          SET last_applied_at = NOW(), apply_count = apply_count + 1
        WHERE file = $1`,
      [file],
    );
    return { status: 'unchanged', priorSha, sha: hash };
  }
  await query(
    `UPDATE c2c_migration_journal
        SET sha256 = $2, last_applied_at = NOW(), apply_count = apply_count + 1
      WHERE file = $1`,
    [file, hash],
  );
  return { status: 'drift', priorSha, sha: hash };
}

/** Read the full journal, most-recently-applied first. */
export async function readJournal(query) {
  const { rows } = await query(
    `SELECT file, sha256, first_applied_at, last_applied_at, apply_count
       FROM c2c_migration_journal ORDER BY last_applied_at DESC`,
  );
  return rows;
}
