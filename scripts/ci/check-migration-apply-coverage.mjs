#!/usr/bin/env node
/**
 * Guard: a new root-level `migrations/*.sql` file must be on a path that
 * actually applies it.
 *
 * Why this exists. Root `migrations/` files are NOT applied by drizzle's
 * runtime migrate() — only the journaled baseline is. The single durable path
 * is the FILES list in scripts/db/apply-c2c-migrations.mjs. Two mechanisms look
 * like they cover the gap and do not:
 *
 *   - db/migrations/migrations_manifest.json is ordering metadata that nothing
 *     consumes; readiness-audit.mjs only reports on it.
 *   - preview_db_test applies the migrations a PR *adds*, but to an ephemeral
 *     Neon branch that is deleted when the PR closes.
 *
 * So a migration can be merged, pass every check including a green preview DB,
 * and never once run against a real database. That is not hypothetical: it is
 * what happened to the clinical-regulatory-evidence spine and then to the whole
 * Risk-Based Monitoring lineage — seven migrations, merged from 2026-06-29
 * onward, whose tables the durable path never created.
 *
 * This check cannot retroactively fix the 129 phase migrations already in that
 * state; verifying each is idempotent and correctly ordered is work for whoever
 * owns that schema. What it can do is stop the count growing. The existing gap
 * is recorded as an explicit baseline, and any file added to `migrations/`
 * afterwards must either be listed in FILES or be added to the baseline with a
 * stated reason. Adding to the baseline is a visible, reviewable act instead of
 * a silent omission.
 *
 * Usage:
 *   node scripts/ci/check-migration-apply-coverage.mjs            # check
 *   node scripts/ci/check-migration-apply-coverage.mjs --write    # re-baseline
 *
 * Exit codes: 0 pass · 1 new unlisted migration · 2 baseline/IO problem
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const migrationsDir = path.join(repoRoot, 'migrations');
const applierPath = path.join(repoRoot, 'scripts', 'db', 'apply-c2c-migrations.mjs');
const baselinePath = path.join(repoRoot, 'docs', 'reports', 'migration-apply-coverage-baseline.json');

const write = process.argv.includes('--write');

/**
 * The migrations the applier will actually run.
 *
 * Read by matching quoted `migrations/...sql` paths in the FILES literal rather
 * than by importing the module: importing it would pull in `pg` and dotenv and
 * run its top-level config, and this check must stay dependency-free enough to
 * run in any CI job. The applier is the authority on its own list, so a parse
 * that finds nothing is treated as an error rather than as "nothing listed".
 */
function listedInApplier() {
  const src = fs.readFileSync(applierPath, 'utf8');
  const start = src.indexOf('const FILES = [');
  if (start === -1) {
    console.error(`✗ could not find the FILES list in ${path.relative(repoRoot, applierPath)}`);
    console.error('  If the applier was restructured, update this check to match.');
    process.exit(2);
  }
  const end = src.indexOf('];', start);
  const block = src.slice(start, end === -1 ? undefined : end);
  const found = [...block.matchAll(/['"](migrations\/[^'"]+\.sql)['"]/g)].map(m => m[1]);
  if (found.length === 0) {
    console.error('✗ the FILES list parsed to zero root migrations — refusing to pass vacuously');
    process.exit(2);
  }
  return new Set(found);
}

/**
 * Files this check does not require on the durable path.
 *
 * Drizzle-generated migrations (`0000_`-style, journaled in migrations/meta) are
 * applied by migrate() and must NOT be double-applied here.
 */
function isDrizzleJournaled(name) {
  return /^\d{4}_/.test(name);
}

function currentMigrations() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .filter(f => !isDrizzleJournaled(f))
    .sort();
}

function readBaseline() {
  if (!fs.existsSync(baselinePath)) {
    if (write) return { knownUnapplied: [] };
    console.error(`✗ baseline missing: ${path.relative(repoRoot, baselinePath)}`);
    console.error('  Run with --write to create it.');
    process.exit(2);
  }
  const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  if (!Array.isArray(parsed.knownUnapplied)) {
    console.error('✗ baseline is malformed: knownUnapplied must be an array');
    process.exit(2);
  }
  return parsed;
}

const listed = listedInApplier();
const all = currentMigrations();
const unlisted = all.filter(f => !listed.has(`migrations/${f}`));

if (write) {
  const next = {
    _comment:
      'Root migrations/*.sql files NOT on the durable apply path (the FILES list in '
      + 'scripts/db/apply-c2c-migrations.mjs). These were already in this state when the '
      + 'guard was introduced; drizzle does not apply root migrations, so nothing creates '
      + 'their objects on a real database. Do not add to this list to silence the check — '
      + 'add the migration to FILES instead. If a file genuinely does not belong on that '
      + 'path, add it here in the same commit that adds the file, with the reason in the '
      + 'commit message.',
    generatedBy: 'scripts/ci/check-migration-apply-coverage.mjs --write',
    knownUnapplied: unlisted,
  };
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
  console.info(`✓ baseline written: ${unlisted.length} known-unapplied migration(s)`);
  process.exit(0);
}

const baseline = readBaseline();
const known = new Set(baseline.knownUnapplied);
const newlyUnlisted = unlisted.filter(f => !known.has(f));
// A file that left the baseline because it was correctly added to FILES is
// progress, not drift — report it so the baseline can be tightened.
const nowApplied = baseline.knownUnapplied.filter(f => listed.has(`migrations/${f}`));

console.info(`migrations/ phase files: ${all.length}`);
console.info(`on the durable apply path: ${all.length - unlisted.length}`);
console.info(`known-unapplied (baseline): ${known.size}`);

if (nowApplied.length > 0) {
  console.info(
    `\n${nowApplied.length} baseline file(s) are now on the apply path — `
    + 're-run with --write to tighten the baseline:',
  );
  for (const f of nowApplied) console.info(`  + ${f}`);
}

if (newlyUnlisted.length > 0) {
  console.error(`\n✗ ${newlyUnlisted.length} new migration(s) are not on any durable apply path:\n`);
  for (const f of newlyUnlisted) console.error(`  - migrations/${f}`);
  console.error(
    '\nA merged migration that is not in the FILES list of'
    + '\nscripts/db/apply-c2c-migrations.mjs is never applied to a real database.'
    + '\npreview_db_test passing does not contradict this: it applies to an ephemeral'
    + '\nNeon branch that is deleted when the PR closes.'
    + '\n\nAdd each file to that list, in dependency order, and confirm it is idempotent'
    + '\n(IF NOT EXISTS / to_regclass-guarded) — the applier re-runs the whole list.',
  );
  process.exit(1);
}

console.info('\n✓ no new migration is missing from the durable apply path');
