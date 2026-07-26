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

test('the authoring loop tables are listed, and precede the source-usage index', () => {
  const files = migrationList();
  const loop = files.indexOf('db/migrations/20260725_authoring_document_loop_tables.sql');
  const sourceUsage = files.indexOf('migrations/20260726_authoring_citation_source_usage.sql');

  // Same gap as the CRE spine before #1109: merged and manifest-listed, but the
  // manifest is consumed by nothing, so the authoring router has been writing to
  // tables no durable path ever created.
  assert.ok(loop >= 0, 'the authoring document-loop tables must be listed — every /api/authoring write depends on them');
  assert.ok(sourceUsage >= 0, 'the source-usage migration must be listed');
  assert.ok(
    loop < sourceUsage,
    'the loop tables create authoring_citations and the source-usage migration indexes it, so the loop tables must come first',
  );
});

test('the source-usage migration applies on top of the loop tables and yields its index', async () => {
  const files = migrationList().filter((f) =>
    /20260725_authoring_document_loop_tables|20260726_authoring_citation_source_usage/.test(f),
  );
  assert.equal(files.length, 2, 'expected both authoring migrations to be listed');

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
