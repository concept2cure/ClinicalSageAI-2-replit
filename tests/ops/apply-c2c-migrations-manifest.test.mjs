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
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const APPLIER = 'scripts/db/migration-set.mjs';

/**
 * The real ordered list, imported rather than scraped out of a source file.
 *
 * It moved here from apply-c2c-migrations.mjs when the deploy-time applier
 * (scripts/db/deploy-migrate.mjs) started consuming the same set, so these
 * assertions now cover the PRODUCTION deploy path and not merely the applier a
 * human might run by hand.
 */
const migrationList = () => C2C_MIGRATION_FILES;

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

  // Both authoring entries must be self-guarding: they add a column or an index
  // WHERE the subsystem is already provisioned, and no-op with a NOTICE where it
  // is not. That is what makes them safe on this path when the loop tables are
  // not.
  for (const file of files.filter((f) => /authoring/.test(f))) {
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

/**
 * ── The reverse direction ────────────────────────────────────────────────────
 *
 * Every assertion above checks that LISTED files exist. Nothing checked that
 * EXISTING files are listed — and that asymmetry is a live trap: three eSTAR
 * migrations were committed, reviewed and merged while being absent from the
 * allowlist, so their tables would have existed in code and in shared/schema.ts
 * but never in an already-provisioned database.
 *
 * Why this cannot simply demand that every migration be listed: there are two
 * legitimate apply paths.
 *
 *   FRESH database  → scripts/db/install-fresh.mjs → drizzle-kit push, which
 *                     derives the whole schema from shared/schema.ts. A plain
 *                     CREATE TABLE migration needs no allowlist entry, because
 *                     push already creates the table.
 *   EXISTING database → scripts/db/deploy-migrate.mjs → C2C_MIGRATION_FILES and
 *                     nothing else. Anything push cannot reproduce on a
 *                     populated database — a backfill, an ALTER that must
 *                     preserve data, a constraint, an RLS policy — reaches
 *                     production ONLY by being on this list.
 *
 * So this is a baseline ratchet, matching the convention already used by
 * .typecheck-baseline.json and duplicate-table-ddl-baseline.json: the migrations
 * that were unlisted when the guard was introduced are grandfathered, and any
 * NEW unlisted migration fails until someone makes a deliberate choice.
 */

/** Only migrations from this date forward are governed (earlier ones predate the guard). */
const RATCHET_FROM = '20260701';

/**
 * Dated root migrations that are intentionally NOT on the allowlist, because
 * their objects come from shared/schema.ts via drizzle-kit push and they carry
 * nothing an existing database additionally needs. Seeded from the state when
 * this guard was added — NOT an endorsement of each entry, just the honest
 * starting line. Removing an entry (by listing the file in the applier) is
 * always safe; adding one requires the reason above to actually hold.
 */
const KNOWN_UNLISTED = new Set([
  'migrations/20260701_protocol_soa.sql',
  'migrations/20260702_protocol_budget.sql',
  'migrations/20260702_usage_model_credit_ledger.sql',
  'migrations/20260703_dmsp.sql',
  'migrations/20260704_biosketch.sql',
  'migrations/20260704_other_support.sql',
  'migrations/20260705_export_control.sql',
  'migrations/20260705_invention_disclosure.sql',
  'migrations/20260705_research_agreements.sql',
  'migrations/20260706_org_user_persona.sql',
  'migrations/20260706_report_definitions.sql',
  'migrations/20260716_template_doc_types.sql',
  'migrations/20260727_onboarding_proposal_runs.sql',
  'migrations/20260728_chat_thread_store.sql',
  // 20260729_unified_documents_provision + its two workflow_document_versions
  // ALTERs (20260730/20260731) are NOT here: their tables are not on the
  // drizzle-push surface (shared/schema/unified_workflow.ts is unexported), so
  // fresh installs do NOT get them via push. They are on the durable applier
  // (C2C_MIGRATION_FILES) instead — see scripts/db/migration-set.mjs.
  'migrations/20260731c_canonical_documents.sql',
]);

test('no NEW root migration is silently absent from the applier allowlist', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir('migrations')).filter((f) => f.endsWith('.sql'));
  const listed = new Set(migrationList());

  const governed = files
    .filter((f) => /^\d{8}/.test(f) && f.slice(0, 8) >= RATCHET_FROM)
    .map((f) => `migrations/${f}`);

  const unaccounted = governed.filter((f) => !listed.has(f) && !KNOWN_UNLISTED.has(f));

  assert.deepEqual(
    unaccounted,
    [],
    `these migrations are on disk but neither listed in ${APPLIER} nor declared in ` +
      `KNOWN_UNLISTED: ${unaccounted.join(', ')}.\n\n` +
      `An unlisted migration NEVER runs against an already-provisioned database. Choose one:\n` +
      `  • If it must run on existing databases (backfill, data-preserving ALTER, ` +
      `constraint, RLS, or anything drizzle-kit push cannot reproduce) — add it to ` +
      `C2C_MIGRATION_FILES in ${APPLIER}.\n` +
      `  • If its objects come from shared/schema.ts and fresh installs get them via ` +
      `drizzle-kit push — add it to KNOWN_UNLISTED in this test with a one-line reason.\n\n` +
      `Do not skip this: it is the mechanism behind "merged != applied".`,
  );
});

test('the grandfathered baseline stays honest (no stale or double-counted entries)', async () => {
  const { readdir } = await import('node:fs/promises');
  const onDisk = new Set((await readdir('migrations')).map((f) => `migrations/${f}`));
  const listed = new Set(migrationList());

  // A baselined file that no longer exists means the baseline is drifting.
  const vanished = [...KNOWN_UNLISTED].filter((f) => !onDisk.has(f));
  assert.deepEqual(vanished, [], `KNOWN_UNLISTED names files that no longer exist: ${vanished.join(', ')}`);

  // A file both baselined AND listed is contradictory — the ratchet should have
  // been loosened by REMOVING the baseline entry.
  const both = [...KNOWN_UNLISTED].filter((f) => listed.has(f));
  assert.deepEqual(
    both,
    [],
    `these are in BOTH the applier allowlist and KNOWN_UNLISTED: ${both.join(', ')}. ` +
      `Now that they are applied, drop them from KNOWN_UNLISTED.`,
  );
});
