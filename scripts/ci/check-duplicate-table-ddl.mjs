#!/usr/bin/env node
/**
 * CI Guard: detect the same table defined in more than one migration file.
 *
 * WHY THIS EXISTS
 * ---------------
 * The repo has two migration lineages — `migrations/` and `db/migrations/` —
 * and the two tools that could have caught cross-lineage collisions have
 * exactly complementary blind spots:
 *
 *   scripts/db/sync-migration-manifest.mjs:8       scans db/migrations/ only
 *   scripts/ci/check-migration-prefix-collisions.mjs:44  scans migrations/ only
 *
 * Neither scans both. Neither checks table NAMES at all — only 4-digit filename
 * prefixes. So `assumption_records`, `decision_records` and the contradiction
 * tables are each defined twice, with incompatible DDL, and CI is green.
 *
 * Because every colliding definition is guarded by CREATE TABLE IF NOT EXISTS,
 * the surviving shape is decided by migration order rather than by code. See
 * tests/schema-contract/operating-system-collision.contract.test.ts, which
 * demonstrates both outcomes, and
 * docs/architecture/C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md (C-1, C-2, C-3, C-6).
 *
 * WHAT THIS ENFORCES
 * ------------------
 *   - A table may be defined in at most ONE non-archived .sql file.
 *   - Known pre-existing collisions live in a baseline and do not fail the
 *     build; anything NEW fails immediately.
 *   - Archived paths (_legacy/, _deprecated_migrations/, docs/archive/) are
 *     historical records and are ignored.
 *
 * MODES
 *   (default)          fail on any collision not in the baseline
 *   --strict           fail on ANY collision, baseline included
 *   --write-baseline   snapshot current collisions; run intentionally, commit result
 *   --json <path>      also write the full report as JSON
 *
 * Usage:
 *   node scripts/ci/check-duplicate-table-ddl.mjs
 *   node scripts/ci/check-duplicate-table-ddl.mjs --strict
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const WRITE_BASELINE = args.includes('--write-baseline');
const jsonIdx = args.indexOf('--json');
const JSON_OUT = jsonIdx !== -1 ? args[jsonIdx + 1] : null;

const BASELINE_PATH = path.join(repoRoot, 'scripts', 'ci', 'duplicate-table-ddl-baseline.json');

/** Paths whose DDL is historical, not deployed. */
const ARCHIVED = ['_legacy/', '_deprecated_migrations/', 'docs/archive/', 'node_modules/'];

const isArchived = (p) => ARCHIVED.some((a) => p.includes(a));

/** Recursively collect .sql files under the repo. */
function collectSql(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      collectSql(full, acc);
    } else if (e.name.endsWith('.sql')) {
      acc.push(path.relative(repoRoot, full));
    }
  }
  return acc;
}

/**
 * Extract created table names, schema-qualified so that
 * `CREATE TABLE audit.foo` is recorded as `audit.foo` and not as a table named
 * `audit`. Getting this wrong inflates the count dramatically.
 */
const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)/gi;

function tablesIn(file) {
  let sql;
  try {
    sql = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  } catch {
    return [];
  }
  const found = new Set();
  for (const m of sql.matchAll(CREATE_TABLE_RE)) found.add(m[1].toLowerCase());
  return [...found];
}

// ── Scan ──────────────────────────────────────────────────────────────────────

const sqlFiles = collectSql(repoRoot).filter((f) => !isArchived(f));
/** table -> Set<file> */
const byTable = new Map();
for (const file of sqlFiles) {
  for (const table of tablesIn(file)) {
    if (!byTable.has(table)) byTable.set(table, new Set());
    byTable.get(table).add(file);
  }
}

const collisions = [...byTable.entries()]
  .filter(([, files]) => files.size > 1)
  .map(([table, files]) => ({ table, files: [...files].sort() }))
  .sort((a, b) => a.table.localeCompare(b.table));

// ── Baseline ──────────────────────────────────────────────────────────────────

// The baseline pins table -> exact file set, NOT just the table name. Baselining
// by name alone would let a table that is already colliding accumulate unlimited
// new definitions silently — the guard would stay green while the defect grew.
if (WRITE_BASELINE) {
  const baseline = {
    $comment:
      'Pre-existing duplicate CREATE TABLE definitions, pinned to the exact set ' +
      'of files that define each table. Each entry is a defect to be reconciled ' +
      'per ADR-0006, not an approved pattern. A NEW table collision, or a NEW ' +
      'file defining an already-colliding table, fails CI. Shrink this file; ' +
      'never grow it.',
    generatedAt: new Date().toISOString(),
    total: collisions.length,
    entries: Object.fromEntries(collisions.map((c) => [c.table, c.files])),
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`[ci:duplicate-table-ddl] baseline written: ${collisions.length} collisions`);
  process.exit(0);
}

/** table -> baselined file list */
let baselineEntries = {};
if (!STRICT && fs.existsSync(BASELINE_PATH)) {
  try {
    baselineEntries = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).entries ?? {};
  } catch {
    console.error(`[ci:duplicate-table-ddl] baseline unreadable at ${BASELINE_PATH}`);
    process.exit(1);
  }
}

const baselineTables = new Set(Object.keys(baselineEntries));

/** A collision offends if it is new, OR if any defining file is not baselined. */
const offending = STRICT
  ? collisions
  : collisions
      .map((c) => {
        const known = new Set(baselineEntries[c.table] ?? []);
        const newFiles = c.files.filter((f) => !known.has(f));
        return newFiles.length ? { ...c, newFiles } : null;
      })
      .filter(Boolean);

if (JSON_OUT) {
  fs.writeFileSync(
    path.isAbsolute(JSON_OUT) ? JSON_OUT : path.join(repoRoot, JSON_OUT),
    JSON.stringify({ scanned: sqlFiles.length, collisions, offending }, null, 2) + '\n',
  );
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log(
  `[ci:duplicate-table-ddl] scanned ${sqlFiles.length} non-archived .sql files; ` +
    `${byTable.size} distinct tables; ${collisions.length} defined more than once` +
    (STRICT ? ' (strict mode)' : `; ${baselineTables.size} baselined`),
);

if (offending.length === 0) {
  console.log('[ci:duplicate-table-ddl] ✅ no new duplicate table definitions.');
  process.exit(0);
}

console.error('');
console.error('🚫 Duplicate CREATE TABLE definitions detected:');
console.error('');
for (const { table, files } of offending) {
  console.error(`  ${table}`);
  for (const f of files) console.error(`      ${f}`);
}
console.error('');
console.error('  Every one of these is guarded by CREATE TABLE IF NOT EXISTS, so the');
console.error('  surviving column set is decided by migration ORDER, not by code — and');
console.error('  it can differ per environment.');
console.error('');
console.error('  Fix: define the table in exactly one migration (see ADR-0006).');
console.error('  If this is a pre-existing collision being tracked for reconciliation:');
console.error('    npm run ci:duplicate-table-ddl:write-baseline');
console.error('');
process.exit(1);
