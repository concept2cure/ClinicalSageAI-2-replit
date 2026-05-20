#!/usr/bin/env node
/**
 * CI Guard: detect duplicate numeric prefixes in migrations/.
 *
 * Drizzle applies migrations in lexicographic filename order. Two files with
 * the same numeric prefix (e.g. 0007_a.sql, 0007_b.sql) still apply
 * deterministically, but parallel branches can each add a 0019_x.sql and
 * land conflicting work without git noticing. A single source of truth on
 * "what number is next" prevents that.
 *
 * What this enforces:
 *   - 4-digit-prefixed migrations (\d{4}_*.sql) MUST have a unique prefix.
 *   - Date-prefixed migrations (\d{8}_*.sql, e.g. 20260429_*) MAY repeat —
 *     a deploy date can legitimately ship multiple files.
 *   - Other naming (legacy 001_*, phase13_*) is ignored. Don't add new
 *     migrations with those shapes.
 *
 * Mode:
 *   - Default: fail on any 4-digit prefix collision NOT in the baseline.
 *     The repo currently has 4 known collisions (0007/0008/0010/0011) that
 *     predate this check. Those are baked in.
 *   - --strict: fail on ANY 4-digit prefix collision, baseline or not.
 *     Use this once the team has renumbered the legacy collisions.
 *   - --write-baseline: snapshot the current set of collisions to baseline.
 *     Only run intentionally; commit the result.
 *
 * Usage:
 *   node scripts/ci/check-migration-prefix-collisions.mjs
 *   node scripts/ci/check-migration-prefix-collisions.mjs --strict
 *   node scripts/ci/check-migration-prefix-collisions.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const writeBaseline = args.includes('--write-baseline');

const migrationsDir = path.join(repoRoot, 'migrations');
const baselinePath = path.join(migrationsDir, '.prefix-collisions-baseline.json');

if (!fs.existsSync(migrationsDir)) {
  console.error(`[ci:migration-prefix-collisions] migrations/ not found at ${migrationsDir}`);
  process.exit(1);
}

const SHORT_PREFIX = /^(\d{4})_.+\.sql$/;
const DATE_PREFIX = /^\d{8}_.+\.sql$/;

const groups = new Map();
for (const entry of fs.readdirSync(migrationsDir)) {
  if (DATE_PREFIX.test(entry)) continue;
  const match = entry.match(SHORT_PREFIX);
  if (!match) continue;
  const prefix = match[1];
  if (!groups.has(prefix)) groups.set(prefix, []);
  groups.get(prefix).push(entry);
}

const collisions = {};
for (const [prefix, files] of [...groups.entries()].sort()) {
  if (files.length > 1) collisions[prefix] = files.sort();
}

if (writeBaseline) {
  fs.writeFileSync(baselinePath, JSON.stringify(collisions, null, 2) + '\n');
  console.log(
    `[ci:migration-prefix-collisions] wrote baseline (${Object.keys(collisions).length} ` +
      `prefix(es)) → ${path.relative(repoRoot, baselinePath)}`
  );
  process.exit(0);
}

let baseline = {};
if (fs.existsSync(baselinePath)) {
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch (err) {
    console.error(
      `[ci:migration-prefix-collisions] failed to parse baseline at ${baselinePath}: ${err.message}`
    );
    process.exit(1);
  }
}

const newCollisions = {};
for (const [prefix, files] of Object.entries(collisions)) {
  if (strict) {
    newCollisions[prefix] = files;
    continue;
  }
  const baselineFiles = new Set(baseline[prefix] ?? []);
  const added = files.filter((f) => !baselineFiles.has(f));
  if (added.length > 0 && (files.length > (baseline[prefix]?.length ?? 0))) {
    newCollisions[prefix] = files;
  }
}

if (Object.keys(newCollisions).length === 0) {
  const total = Object.keys(collisions).length;
  if (strict) {
    console.log('[ci:migration-prefix-collisions] OK — no 4-digit prefix collisions');
  } else {
    console.log(
      `[ci:migration-prefix-collisions] OK — no NEW collisions ` +
        `(${total} baselined collision prefix(es) tolerated)`
    );
  }
  process.exit(0);
}

console.error(
  `[ci:migration-prefix-collisions] FAIL — ${Object.keys(newCollisions).length} ` +
    `prefix collision(s) not in baseline:\n`
);
for (const [prefix, files] of Object.entries(newCollisions)) {
  console.error(`  ${prefix}:`);
  for (const file of files) {
    const baselineFiles = new Set(baseline[prefix] ?? []);
    const tag = baselineFiles.has(file) ? ' (baselined)' : ' (NEW)';
    console.error(`    - ${file}${tag}`);
  }
}
console.error(
  '\nFix: rename your new migration to the next free 4-digit prefix.\n' +
    '     ls migrations/ | grep -E "^[0-9]{4}_" | sort | tail -1\n' +
    'If the collision is intentional and approved, add it to ' +
    `${path.relative(repoRoot, baselinePath)} ` +
    '(re-run with --write-baseline).'
);
process.exit(1);
