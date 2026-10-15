#!/usr/bin/env node
/**
 * CI Guard: a new migration under migrations/ must be on a DEPLOY path.
 *
 * ── THE INCIDENT (2026-10-01) ────────────────────────────────────────────────
 * Five tables, among them ind_amendments and ind_annual_reports, were created
 * by migrations/20260615_*.sql and by nothing a deploy runs. install-fresh
 * overlays every top-level migrations/*.sql, so a NEW database had them.
 * deploy-migrate applies only C2C_MIGRATION_FILES (plus the authoring
 * subsystem), and these files were on neither. So a database provisioned
 * before 2026-06-15 never got them, and the IND registers answered "relation
 * does not exist" there. Fixed in 9d6e3375b by putting the files on the set.
 *
 * ── WHY THE EXISTING GATES MISSED IT ─────────────────────────────────────────
 * ci:migration-reachability counts the top-level migrations/ tree as durable
 * because install-fresh applies it. That answers whether a fresh database has
 * the table. It does not answer whether every database already deployed will
 * get it. Once production is provisioned, only the second question matters for
 * every migration written after that day.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * Every top-level migrations/*.sql is applied by a deploy: it is listed in
 * C2C_MIGRATION_FILES (scripts/db/migration-set.mjs), in
 * AUTHORING_SUBSYSTEM_FILES (scripts/db/authoring-subsystem.mjs), or in the
 * drizzle journal (migrations/meta/_journal.json). The files that predate this
 * rule are baselined. Most of their tables are already covered by a
 * consolidation file on the set; the rest exist on every database
 * install-fresh will provision. The baseline must only shrink.
 *
 * Remember Rule 1 when you list a file: the set re-runs EVERY entry on EVERY
 * deploy, so the file must be replayable (IF NOT EXISTS, no DROP of anything
 * another file creates), and it goes above the final tenant-sweep pair.
 *
 * Usage:
 *   node scripts/ci/check-migration-deploy-path.mjs
 *   node scripts/ci/check-migration-deploy-path.mjs --list
 *   node scripts/ci/check-migration-deploy-path.mjs --selftest
 *   node scripts/ci/check-migration-deploy-path.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../db/migration-set.mjs';
import { AUTHORING_SUBSYSTEM_FILES } from '../db/authoring-subsystem.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS_DIR = path.join(repoRoot, 'migrations');
const JOURNAL = path.join(MIGRATIONS_DIR, 'meta', '_journal.json');
const BASELINE_FILE = path.join(repoRoot, 'scripts/ci/migration-deploy-path-baseline.json');

/** Top-level migrations/*.sql that no deploy applies, as repo-relative paths. */
export function offDeployPath(files = fs.readdirSync(MIGRATIONS_DIR)) {
  const onDeploy = new Set([...C2C_MIGRATION_FILES, ...AUTHORING_SUBSYSTEM_FILES]);
  const journal = fs.existsSync(JOURNAL) ? fs.readFileSync(JOURNAL, 'utf8') : '';
  return files
    .filter((f) => f.endsWith('.sql'))
    .map((f) => `migrations/${f}`)
    .filter((rel) => !onDeploy.has(rel) && !journal.includes(`"${path.basename(rel, '.sql')}"`))
    .sort();
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return null;
  return new Set(JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).files);
}

/** Findings not in the baseline. */
export function introduced(files, baseline) {
  return offDeployPath(files).filter((rel) => !baseline.has(rel));
}

const args = process.argv.slice(2);

if (args.includes('--selftest')) {
  // The gate must fail on the case it exists for: a new file on no deploy path.
  const baseline = readBaseline() ?? new Set();
  const real = fs.readdirSync(MIGRATIONS_DIR);
  const probe = '29991231_deploy_path_selftest_probe.sql';
  const caught = introduced([...real, probe], baseline);
  const clean = introduced(real, baseline);
  const onSet = C2C_MIGRATION_FILES.find((f) => f.startsWith('migrations/'));
  const listedPasses = onSet ? !introduced([...real, path.basename(onSet)], baseline).includes(onSet) : true;
  const ok = caught.includes(`migrations/${probe}`) && clean.length === 0 && listedPasses;
  console.log(
    ok
      ? '[ci:migration-deploy-path:selftest] OK — an unlisted new file fails; the tree as it stands passes; a listed file passes.'
      : `[ci:migration-deploy-path:selftest] FAIL — probe caught=${caught.includes(`migrations/${probe}`)}, clean=${clean.length === 0}, listed passes=${listedPasses}`,
  );
  process.exit(ok ? 0 : 1);
}

const findings = offDeployPath();

if (args.includes('--list')) {
  for (const f of findings) console.log(f);
  console.log(`\n${findings.length} top-level migration(s) on no deploy path.`);
  process.exit(0);
}

if (args.includes('--write-baseline')) {
  fs.writeFileSync(
    BASELINE_FILE,
    JSON.stringify(
      {
        note:
          'Top-level migrations/*.sql files that no deploy applies (not in C2C_MIGRATION_FILES, ' +
          'AUTHORING_SUBSYSTEM_FILES or the drizzle journal), recorded when the rule was introduced ' +
          '(2026-10-01). install-fresh applies them to a new database only. Must only shrink: put a ' +
          'file on the set (replayable, above the tenant sweep) and re-run with --write-baseline.',
        generatedBy: 'scripts/ci/check-migration-deploy-path.mjs --write-baseline',
        files: findings,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`[ci:migration-deploy-path] baseline written — ${findings.length} file(s).`);
  process.exit(0);
}

const baseline = readBaseline();
if (!baseline) {
  console.error('[ci:migration-deploy-path] FAIL — baseline missing (scripts/ci/migration-deploy-path-baseline.json).');
  process.exit(1);
}

const fresh = findings.filter((f) => !baseline.has(f));
const resolved = [...baseline].filter((f) => !findings.includes(f));

if (fresh.length > 0) {
  console.error(`\n[ci:migration-deploy-path] FAIL — ${fresh.length} new migration(s) no deploy applies:\n`);
  for (const f of fresh) console.error(`  ${f}`);
  console.error(
    '\n  install-fresh would apply this to a NEW database, but deploy-migrate applies\n' +
      '  only C2C_MIGRATION_FILES. Every database already provisioned would never get\n' +
      '  it, and any code reading what it creates fails there.\n' +
      '\n  Add it to C2C_MIGRATION_FILES in scripts/db/migration-set.mjs, above the\n' +
      '  final tenant-sweep pair. It re-runs on every deploy (CLAUDE.md Rule 1), so it\n' +
      '  must be replayable: IF NOT EXISTS, and no DROP of anything another file creates.\n',
  );
  process.exit(1);
}

let msg = `[ci:migration-deploy-path] OK — ${findings.length} baselined file(s) on no deploy path, none new.`;
if (resolved.length > 0) {
  msg +=
    `\n  ${resolved.length} baselined file(s) now on a deploy path: ${resolved.slice(0, 6).join(', ')}` +
    (resolved.length > 6 ? ` (+${resolved.length - 6})` : '') +
    '\n  Shrink the baseline: node scripts/ci/check-migration-deploy-path.mjs --write-baseline';
  // A stale baseline entry is a hole a future file could hide in: fail on it.
  console.error(msg);
  process.exit(1);
}
console.log(msg);
process.exit(0);
