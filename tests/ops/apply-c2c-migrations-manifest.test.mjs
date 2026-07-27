/**
 * The apply-c2c-migrations allowlist is the ONLY durable path a migration has
 * to a real database in this repo.
 *
 * `db/migrations/migrations_manifest.json` is ordering metadata that nothing
 * consumes, and `readiness-audit.mjs` only reports. The other applier,
 * preview_db_test, applies just the migrations a PR *adds*, to an ephemeral
 * Neon branch that is deleted when the PR closes. So a file being merged — even
 * a file listed in the manifest — does not mean it has ever been applied.
 *
 * That is exactly how cre_evidence_sources came to be missing from production
 * while its migration sat merged since 20260724. These tests guard the list
 * that closes such gaps:
 *
 *   1. every entry resolves to a real file (a rename or typo silently drops a
 *      migration from the only path it has);
 *   2. the data-room trio applies IN THE LISTED ORDER against real Postgres and
 *      produces the schema the application code expects.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const APPLIER = 'scripts/db/apply-c2c-migrations.mjs';

/** The FILES array from the applier, read as source so the test cannot drift. */
function migrationList() {
  const source = readFileSync(APPLIER, 'utf8');
  const block = source.match(/const FILES = \[([\s\S]*?)\];/);
  assert.ok(block, 'could not locate the FILES array in ' + APPLIER);
  return [...block[1].matchAll(/'([^']+\.sql)'/g)].map((m) => m[1]);
}

test('every migration in the applier allowlist exists on disk', () => {
  const missing = migrationList().filter((f) => !existsSync(f));
  assert.deepEqual(
    missing,
    [],
    `these files are listed in ${APPLIER} but do not exist: ${missing.join(', ')}. ` +
      'A listed-but-missing file is skipped, so the migration silently never reaches any database.',
  );
});

test('the data-room migrations are listed, and the spine precedes its ALTER', () => {
  const files = migrationList();
  const spine = files.indexOf('db/migrations/20260724_clinical_regulatory_evidence_spine.sql');
  const scope = files.indexOf('migrations/20260726_cre_source_program_scope.sql');
  const uploads = files.indexOf('migrations/20260726_file_uploads_tenancy.sql');

  assert.ok(spine >= 0, 'the CRE spine must be listed — every cre_* write depends on it');
  assert.ok(uploads >= 0, 'the file_uploads tenancy migration must be listed');
  assert.ok(scope >= 0, 'the program-scope migration must be listed');
  assert.ok(
    spine < scope,
    'the spine creates cre_evidence_sources and the program-scope migration ALTERs it, so the spine must come first',
  );
});

test('the authoring loop tables are NOT listed — half a Part 11 subsystem is worse than none', () => {
  // This assertion is the inverse of what this file first shipped. The original
  // reasoning was that the authoring router writes to tables no durable path
  // creates, so the loop tables belonged on this list. The gap is real; the fix
  // was wrong, and #1131 caught it.
  //
  // 20260725_authoring_document_loop_tables.sql creates frozen_documents and
  // user_pins. authoring_audit_trail and authoring_signatures are in SEPARATE
  // files (20260725_authoring_audit_trail.sql,
  // 20260725_authoring_signatures_and_workflow.sql). Apply the loop tables alone
  // and the freeze handler succeeds while its audit INSERT
  // (authoring.router.ts L387) hits a missing table, and e-sign (L3083) fails
  // outright. A freeze that works and leaves no audit trail is a worse state on a
  // Part 11 surface than a freeze that plainly cannot run.
  //
  // The subsystem is provisioned together, by the db/migrations lineage, or not
  // by this supplementary applier at all.
  const files = migrationList();
  const loop = files.indexOf('db/migrations/20260725_authoring_document_loop_tables.sql');
  assert.equal(
    loop,
    -1,
    'the authoring loop tables must NOT be on this list: they carry frozen_documents and user_pins ' +
      'without authoring_audit_trail or authoring_signatures, so applying them alone stands up an ' +
      'unaudited freeze and a broken e-sign.',
  );
});

test('the authoring entries on the list are guarded, additive ALTERs only', () => {
  const files = migrationList();
  const sourceUsage = files.indexOf('migrations/20260726_authoring_citation_source_usage.sql');
  assert.ok(sourceUsage >= 0, 'the source-usage index migration must be listed');

  // The authoring SUBSYSTEM ALTERs must be self-guarding: they add a column or an
  // index WHERE the subsystem is already provisioned, and no-op with a NOTICE
  // where it is not. That is what makes them safe on this path when the loop
  // tables are not.
  //
  // 20260728_authoring_supplementary_tables.sql is EXCLUDED: it is a legitimate
  // CREATOR of INDEPENDENT authoring-router stores (suggestions / reviews /
  // checklists / change-requests / compliance / comment-activity / audit-events /
  // template+doc sections). It is NOT the Part 11 subsystem (frozen_documents /
  // user_pins / authoring_audit_trail / authoring_signatures — asserted absent
  // above), so the half-a-subsystem hazard the no-CREATE-TABLE rule guards does
  // not apply to it.
  const subsystemAlters = files.filter(
    (f) => /authoring/.test(f) && !/authoring_supplementary_tables/.test(f),
  );
  for (const file of subsystemAlters) {
    const sql = readFileSync(file, 'utf8');
    assert.match(
      sql,
      /to_regclass/,
      `${file} is on the applier list but does not guard on to_regclass — it would fail the run, ` +
        'or provision part of a subsystem, on a database without the authoring tables.',
    );
    assert.doesNotMatch(
      sql,
      /CREATE TABLE/i,
      `${file} creates a table. Only guarded additive ALTERs belong on this path for the authoring ` +
        'subsystem; table creation is owned by the db/migrations lineage.',
    );
  }
});

test('the source-usage migration yields its index where the subsystem IS provisioned', async () => {
  // The loop tables are read from DISK, not from the applier list — they are
  // deliberately not on it (see above). What is being proven here is the other
  // half of that decision: where the authoring subsystem has been provisioned by
  // its own lineage, this migration does land its index.
  const files = [
    'db/migrations/20260725_authoring_document_loop_tables.sql',
    'migrations/20260726_authoring_citation_source_usage.sql',
  ];
  assert.ok(
    migrationList().includes(files[1]),
    'the source-usage migration must be on the applier list',
  );

  const db = new PGlite();
  try {
    for (const file of files) {
      await db.exec(readFileSync(path.resolve(file), 'utf8'));
    }
    const idx = await db.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'authoring_citations' AND indexname = 'authoring_citations_reference_idx'`,
    );
    assert.equal(
      idx.rows.length,
      1,
      'the back-reference index must exist — without it "which sections cite this source" is a full scan per source',
    );
  } finally {
    await db.close();
  }
});

test('the source-usage migration no-ops when authoring_citations is absent', async () => {
  // preview_db_test applies only the migrations a PR *adds*, so this file will run
  // in databases where the loop tables do not exist. It must emit a NOTICE and
  // continue rather than fail the run.
  const db = new PGlite();
  try {
    await db.exec(
      readFileSync(path.resolve('migrations/20260726_authoring_citation_source_usage.sql'), 'utf8'),
    );
  } finally {
    await db.close();
  }
});

test('the data-room migrations apply in listed order and yield the expected schema', async () => {
  const files = migrationList().filter((f) =>
    /20260724_clinical_regulatory_evidence_spine|20260726_file_uploads_tenancy|20260726_cre_source_program_scope/.test(
      f,
    ),
  );
  assert.equal(files.length, 3, 'expected all three data-room migrations to be listed');

  const db = new PGlite();
  try {
    for (const file of files) {
      await db.exec(readFileSync(path.resolve(file), 'utf8'));
    }

    // The identity table the chat upload path writes.
    const src = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'cre_evidence_sources'
          AND column_name IN ('client_program_id', 'client_workspace_id', 'checksum')`,
    );
    assert.equal(
      src.rows.length,
      3,
      'cre_evidence_sources must carry checksum plus both project scopes after the trio applies',
    );

    // The tenancy column whose absence silently dropped every chat attachment.
    const uploads = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'file_uploads' AND column_name = 'organization_id'`,
    );
    assert.equal(uploads.rows.length, 1, 'file_uploads must carry organization_id');
  } finally {
    await db.close();
  }
});
