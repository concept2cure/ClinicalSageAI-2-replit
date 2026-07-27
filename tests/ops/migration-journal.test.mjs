/**
 * Migration journal (G-03) — the applied-migration ledger and its drift signal.
 *
 * Proves against real Postgres (PGlite) that the journal:
 *   - bootstraps its own table;
 *   - records a first apply as 'new';
 *   - treats an identical re-apply as 'unchanged' (idempotent), bumping the count;
 *   - flags an already-applied file whose BYTES changed as 'drift', carrying the
 *     prior hash — the case the IF-NOT-EXISTS apply path silently will not re-run.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import {
  ensureJournal,
  recordApplied,
  readJournal,
  sha256,
} from '../../scripts/db/migration-journal.mjs';

function executor(db) {
  return (sql, params) => db.query(sql, params);
}

test('bootstraps its own table', async () => {
  const db = new PGlite();
  try {
    const q = executor(db);
    await ensureJournal(q);
    const r = await q(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'c2c_migration_journal'`,
    );
    assert.equal(r.rows.length, 1, 'ensureJournal must create c2c_migration_journal');
  } finally {
    await db.close();
  }
});

test('records a first apply as new, an identical re-apply as unchanged', async () => {
  const db = new PGlite();
  try {
    const q = executor(db);
    await ensureJournal(q);

    const first = await recordApplied(q, 'migrations/x.sql', 'CREATE TABLE x();');
    assert.equal(first.status, 'new');
    assert.equal(first.priorSha, null);
    assert.equal(first.sha, sha256('CREATE TABLE x();'));

    const again = await recordApplied(q, 'migrations/x.sql', 'CREATE TABLE x();');
    assert.equal(again.status, 'unchanged');
    assert.equal(again.priorSha, first.sha);

    const rows = await readJournal(q);
    const row = rows.find((r) => r.file === 'migrations/x.sql');
    assert.equal(String(row.apply_count), '2', 'an idempotent re-apply bumps the count');
    assert.equal(row.sha256, first.sha);
  } finally {
    await db.close();
  }
});

test('flags an edited-after-apply file as drift and carries the prior hash', async () => {
  const db = new PGlite();
  try {
    const q = executor(db);
    await ensureJournal(q);

    const v1 = await recordApplied(q, 'migrations/y.sql', 'CREATE TABLE y(a int);');
    assert.equal(v1.status, 'new');

    const v2 = await recordApplied(q, 'migrations/y.sql', 'CREATE TABLE y(a int, b int);');
    assert.equal(v2.status, 'drift', 'changed bytes for an applied file is drift');
    assert.equal(v2.priorSha, v1.sha, 'drift carries the previously-applied hash');
    assert.notEqual(v2.sha, v1.sha);

    // The ledger now reflects the latest bytes (so a subsequent identical run is
    // 'unchanged', not perpetual drift).
    const v3 = await recordApplied(q, 'migrations/y.sql', 'CREATE TABLE y(a int, b int);');
    assert.equal(v3.status, 'unchanged');
  } finally {
    await db.close();
  }
});
