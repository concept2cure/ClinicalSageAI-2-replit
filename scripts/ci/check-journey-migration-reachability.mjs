#!/usr/bin/env node
/**
 * CI Guard: every golden-journey-declared migration MUST be on a durable apply
 * path.
 *
 * WHY THIS EXISTS. The golden-journey tests are the platform's own oracle for
 * "what schema the product actually needs" — each one provisions a real Postgres
 * (PGlite) from a fixed list of migration files and then drives a regulatory
 * workflow end-to-end against it. If a migration is good enough to be a journey's
 * prerequisite, it is good enough that a real deploy must apply it too.
 *
 * The failure mode this catches is the one that has recurred across this
 * codebase (ledger C-6, C-8, C-10, C-11, C-16, C-17, C-19, C-20): a migration
 * lands in db/migrations and in db/migrations/migrations_manifest.json, a journey
 * is written against it and passes, everyone believes it ships — but the manifest
 * applies NOTHING, and the file carries no `_gcc_` infix and is not in the drizzle
 * journal, so no durable path runs it. It exists on the journey's throwaway PGlite
 * and on no real database. "Merged, green, and never applied."
 *
 * WHAT COUNTS AS DURABLE (the paths a real environment actually runs):
 *   • journal      — migrations/meta/_journal.json → drizzle migrate() replays it.
 *   • gcc          — db/migrations/*_gcc_*.sql → the CI psql apply loop.
 *   • c2c-set      — scripts/db/migration-set.mjs C2C_MIGRATION_FILES →
 *                    deploy-migrate.mjs (prod one-off task) + apply-c2c-migrations.
 *   • authoring    — scripts/db/authoring-subsystem.mjs AUTHORING_SUBSYSTEM_FILES →
 *                    applied by the same deploy path before the c2c set.
 * drizzle-kit push (shared/schema.ts) is deliberately NOT counted: it provisions
 * fresh installs only, so counting it would re-admit the exact drift this guard
 * exists to stop — an existing customer database is the one that has the gap.
 *
 * WHAT COUNTS AS JOURNEY-DECLARED. A migration file path that appears as a
 * standalone single-quoted string literal inside tests/golden-journeys/*.ts —
 * i.e. the entries of a `migrations: [...]` array, an extractTableDdl(file, …)
 * call, or the shared harness list. Prose mentions inside limitation strings do
 * not match (the quote does not open on the path), which is correct: a migration
 * a journey only *describes* (e.g. an ALTER it cannot load against a test-only
 * table) is not one the journey provisions.
 *
 * This guard has no baseline and no --strict: the reachable set must be complete
 * at all times. If it ever needs a documented exception, add an explicit skip
 * with a ledger reference rather than a silent allowlist.
 *
 * Usage:
 *   node scripts/ci/check-journey-migration-reachability.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../db/migration-set.mjs';
import { AUTHORING_SUBSYSTEM_FILES } from '../db/authoring-subsystem.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const TAG = '[ci:journey-migration-reachability]';

const journeyDir = path.join(repoRoot, 'tests', 'golden-journeys');
if (!fs.existsSync(journeyDir)) {
  console.error(`${TAG} tests/golden-journeys not found at ${journeyDir}`);
  process.exit(1);
}

// ── The oracle: migration paths declared by golden-journey test sources ──────
// Match only a whole quoted string that IS a migration path — the opening quote
// is immediately followed by db/migrations/ or migrations/ and the closing quote
// immediately follows .sql. Prose strings that merely mention a path do not open
// on it, so they are excluded by construction.
const PATH_LITERAL = /'((?:db\/migrations|migrations)\/[^']+\.sql)'/g;

const declared = new Set();
for (const entry of fs.readdirSync(journeyDir)) {
  if (!entry.endsWith('.ts')) continue;
  const src = fs.readFileSync(path.join(journeyDir, entry), 'utf8');
  for (const m of src.matchAll(PATH_LITERAL)) declared.add(m[1]);
}

if (declared.size === 0) {
  console.error(`${TAG} found no journey-declared migrations — the matcher or the journey layout changed. Failing loud rather than passing vacuously.`);
  process.exit(1);
}

// ── The durable apply paths ──────────────────────────────────────────────────
const journalPath = path.join(repoRoot, 'migrations', 'meta', '_journal.json');
const journal = new Set(
  JSON.parse(fs.readFileSync(journalPath, 'utf8')).entries.map((e) => `migrations/${e.tag}.sql`),
);
const c2c = new Set(C2C_MIGRATION_FILES);
const authoring = new Set(AUTHORING_SUBSYSTEM_FILES);
const isGcc = (file) => file.startsWith('db/migrations/') && /_gcc_/.test(path.basename(file));

function applierFor(file) {
  if (journal.has(file)) return 'journal';
  if (isGcc(file)) return 'gcc';
  if (c2c.has(file)) return 'c2c-set';
  if (authoring.has(file)) return 'authoring-subsystem';
  return null;
}

// ── Evaluate ─────────────────────────────────────────────────────────────────
const dead = [];
const missingFromDisk = [];
for (const file of [...declared].sort()) {
  if (!fs.existsSync(path.join(repoRoot, file))) {
    missingFromDisk.push(file);
    continue;
  }
  if (!applierFor(file)) dead.push(file);
}

if (missingFromDisk.length === 0 && dead.length === 0) {
  console.log(
    `${TAG} OK — all ${declared.size} golden-journey-declared migrations are on a durable apply path.`,
  );
  process.exit(0);
}

if (missingFromDisk.length > 0) {
  console.error(`${TAG} ${missingFromDisk.length} journey-declared migration file(s) do not exist on disk:`);
  for (const f of missingFromDisk) console.error(`  • ${f}`);
  console.error('  A journey references a migration path that was moved or deleted. Fix the path or restore the file.');
}

if (dead.length > 0) {
  console.error(
    `\n${TAG} ${dead.length} golden-journey-declared migration(s) reach NO durable apply path.`,
  );
  console.error('  A journey provisions and depends on each of these, but no real deploy applies them —');
  console.error('  they exist on the throwaway journey database only (ledger C-6 drift).');
  for (const f of dead) console.error(`  • ${f}`);
  console.error('\n  Fix: add each file to a durable applier, in dependency order:');
  console.error('    • incremental C2C schema → C2C_MIGRATION_FILES in scripts/db/migration-set.mjs');
  console.error('    • authoring subsystem    → AUTHORING_SUBSYSTEM_FILES in scripts/db/authoring-subsystem.mjs');
  console.error('    • or give it the _gcc_ infix so the CI psql loop applies it.');
}

process.exit(1);
