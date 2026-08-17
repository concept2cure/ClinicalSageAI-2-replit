#!/usr/bin/env node
/**
 * CI Guard: a column the server INSERTs must be declared on that table.
 *
 * WHY THIS EXISTS
 * ---------------
 * PostgreSQL rejects an unknown column at PLAN time (42703). A statement naming
 * one does not fail sometimes, on some data, under load — it fails on every
 * execution, forever, from the moment it is written. There is no input that
 * makes it work. That makes it the cheapest possible class of bug to catch
 * statically, and the most expensive to ship: it takes the whole request down.
 *
 * On 2026-08-17 three such columns were live on the governed-export path:
 *
 *   concept2cure_provenance_events.updated_at   (exportGovernance, artifactWriteback)
 *   regulatory_audit_logs.created_at            (both)
 *   regulatory_audit_logs.updated_at            (both)
 *
 * None exists in any migration, and none is declared in shared/schema.ts —
 * whose comment on the provenance table states outright that it is append-only
 * and deliberately carries no updated_at. The effect: EVERY governed export
 * that reached artifact-registry placement — 510(k), CER and IND-form alike —
 * rolled back with 500 GOVERNED_EXPORT_FAILED, on every database, for as long
 * as the code had existed. It failed closed, so nothing was half-registered,
 * and that is the only reason it read as "export is broken" rather than
 * "the audit trail is quietly wrong".
 *
 * It survived because every guard around it asks a different question:
 * `ci:unbacked-tables` and `ci:migration-reachability` ask whether the TABLE
 * exists; `check-tables-against-live-schema` asks whether it exists on a real
 * provisioned database. All three stop at the table. Nothing asked whether the
 * COLUMNS a statement writes are real.
 *
 * WHAT THIS ENFORCES, AND WHAT IT DELIBERATELY DOES NOT
 * -----------------------------------------------------
 * Enforced: every column named in a static `INSERT INTO <table> (...)` in
 * server code is declared on that table's Drizzle model.
 *
 * NOT enforced, and not claimed: that the SQL migration lineage actually
 * creates the column. Drizzle is the DECLARED schema; the migrations are the
 * APPLIED one, and they can disagree in the other direction — a column declared
 * in shared/schema.ts that no migration creates works on a `drizzle push`
 * database and 42703s on a migration-provisioned one. Two of those were also
 * found on 2026-08-17 (concept2cure_artifact_versions.updated_at,
 * cerv2_section_versions.updated_at, reconciled by
 * migrations/20260817_reconcile_declared_updated_at_columns.sql). Catching THAT
 * direction needs a real provisioned database, which is what
 * check-tables-against-live-schema.mjs connects to — this guard is the static,
 * always-runnable half, not a replacement for it.
 *
 * Skipped, honestly rather than silently (see the --verbose report):
 *   • tables with no Drizzle model — nothing to compare against;
 *   • column lists containing an interpolation, so the real list is not known
 *     until runtime;
 *   • `INSERT INTO ... SELECT` / `DEFAULT VALUES` forms with no column list.
 *
 * USAGE
 *   node scripts/ci/check-insert-columns-declared.mjs            # fail on any violation
 *   node scripts/ci/check-insert-columns-declared.mjs --verbose  # also list what was skipped
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const VERBOSE = process.argv.includes('--verbose');
const WRITE_BASELINE = process.argv.includes('--write-baseline');
const BASELINE_PATH = path.join(ROOT, 'scripts/ci/insert-columns-baseline.json');

/**
 * A violation's identity for baseline purposes: table + column, NOT file:line.
 *
 * Deliberate. Keying on a line number would make the baseline go stale on every
 * unrelated edit above it, and worse, would let a genuinely new defect hide in a
 * slot vacated by a moved one. table+column is what is actually wrong.
 */
const keyOf = (table, column) => `${table}.${column}`;

/** Recursively collect files under `dir` matching `ext`, skipping noise. */
function walk(dir, ext, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'build') continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, ext, out);
    else if (full.endsWith(ext)) out.push(full);
  }
  return out;
}

/**
 * Map SQL table name → Set of declared SQL column names, read from the Drizzle
 * models in shared/.
 *
 * Parsed rather than imported on purpose: importing shared/schema.ts pulls the
 * whole dependency graph (and its side effects) into a lint script. The shape
 * being matched is mechanical and uniform across this repo —
 * `pgTable('name', { field: type('sql_name') ... })`.
 */
function declaredColumns() {
  const byTable = new Map();
  for (const file of walk(path.join(ROOT, 'shared'), '.ts')) {
    const src = readFileSync(file, 'utf8');
    // pgTable('table_name', {   … })   — capture the body up to the closing
    // brace that precedes the table's extras callback or the call's end.
    const re = /pgTable\(\s*['"]([a-z0-9_]+)['"]\s*,\s*\{/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
      const table = m[1];
      // Walk braces from the opening `{` to find the column-object body.
      let depth = 1;
      let i = re.lastIndex;
      while (i < src.length && depth > 0) {
        const c = src[i];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        i++;
      }
      const body = src.slice(re.lastIndex, i - 1);
      const cols = byTable.get(table) ?? new Set();
      // field: someType('sql_name'  — the sql name is what the database sees.
      for (const cm of body.matchAll(/^\s*[A-Za-z0-9_]+\s*:\s*[A-Za-z0-9_]+\s*\(\s*['"]([a-z0-9_]+)['"]/gmi)) {
        cols.add(cm[1]);
      }
      byTable.set(table, cols);
    }
  }
  return byTable;
}

/**
 * Every static `INSERT INTO <table> ( ... )` in server code, with its column
 * list. Returns { file, line, table, columns } or a skip reason.
 */
function insertStatements() {
  const found = [];
  const skipped = [];
  for (const file of walk(path.join(ROOT, 'server'), '.ts')) {
    if (file.includes('__tests__') || file.endsWith('.test.ts')) continue;
    const src = readFileSync(file, 'utf8');
    const re = /INSERT\s+INTO\s+(?:public\.)?["`]?([a-z0-9_]+)["`]?\s*\(/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
      const table = m[1];
      // Balance parens from the opening one to get the full column list.
      let depth = 1;
      let i = re.lastIndex;
      while (i < src.length && depth > 0) {
        const c = src[i];
        if (c === '(') depth++;
        else if (c === ')') depth--;
        i++;
      }
      const raw = src.slice(re.lastIndex, i - 1);
      const line = src.slice(0, m.index).split('\n').length;
      const rel = path.relative(ROOT, file);

      // A column list that is computed at runtime cannot be judged here.
      if (raw.includes('${')) {
        skipped.push({ file: rel, line, table, why: 'interpolated column list' });
        continue;
      }
      const columns = raw
        .split(',')
        .map((c) => c.trim().replace(/^["`]|["`]$/g, ''))
        .filter((c) => /^[a-z0-9_]+$/i.test(c));
      if (columns.length === 0) {
        skipped.push({ file: rel, line, table, why: 'no parseable column list' });
        continue;
      }
      found.push({ file: rel, line, table, columns });
    }
  }
  return { found, skipped };
}

const declared = declaredColumns();
const { found, skipped } = insertStatements();

const violations = [];
const noModel = new Map();
for (const stmt of found) {
  const cols = declared.get(stmt.table);
  if (!cols || cols.size === 0) {
    noModel.set(stmt.table, (noModel.get(stmt.table) ?? 0) + 1);
    continue;
  }
  const missing = stmt.columns.filter((c) => !cols.has(c));
  if (missing.length > 0) violations.push({ ...stmt, missing });
}

// ── Baseline: shrink-only ratchet ────────────────────────────────────────────
// These violations predate the guard. Each is a statement that fails on every
// execution; they are recorded so the guard can land and hold the line while
// they are burned down, NOT because they are acceptable. The set may only
// shrink: a new one fails the build, and fixing one without removing it here
// also fails, so the record cannot drift away from reality.
const baseline = existsSync(BASELINE_PATH)
  ? new Set(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).violations ?? [])
  : new Set();

console.log('[ci:insert-columns-declared] columns written vs columns declared');
console.log(`  Drizzle models parsed        : ${declared.size}`);
console.log(`  static INSERTs examined      : ${found.length}`);
console.log(`  skipped (unjudgeable)        : ${skipped.length}`);
console.log(`  tables with no Drizzle model : ${noModel.size}`);

if (VERBOSE) {
  for (const s of skipped) console.log(`    skip ${s.file}:${s.line} ${s.table} — ${s.why}`);
  for (const [t, n] of [...noModel].sort()) console.log(`    no-model ${t} (${n} insert(s))`);
}

// Flatten to table.column keys, then split against the baseline.
const seen = new Set();
for (const v of violations) for (const c of v.missing) seen.add(keyOf(v.table, c));

if (WRITE_BASELINE) {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        note:
          'Pre-existing INSERTs naming columns their table does not declare. Each fails ' +
          'at PLAN time (42703) on every execution. Shrink-only: entries may be removed ' +
          'as they are fixed, never added. Regenerate with --write-baseline ONLY when ' +
          'removing fixed entries.',
        generated: 'scripts/ci/check-insert-columns-declared.mjs --write-baseline',
        violations: [...seen].sort(),
      },
      null,
      2
    ) + '\n'
  );
  console.log(`\n📝 baseline written: ${seen.size} entr(y|ies) → ${path.relative(ROOT, BASELINE_PATH)}`);
  process.exit(0);
}

const fresh = [...seen].filter((k) => !baseline.has(k)).sort();
const fixed = [...baseline].filter((k) => !seen.has(k)).sort();

console.log(`  baselined (known, unfixed)   : ${baseline.size}`);

if (fresh.length > 0) {
  console.error(`\n✖ ${fresh.length} NEW INSERT column(s) the table does not declare:\n`);
  for (const v of violations) {
    const nu = v.missing.filter((c) => !baseline.has(keyOf(v.table, c)));
    if (nu.length === 0) continue;
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    INSERT INTO ${v.table} → undeclared: ${nu.join(', ')}`);
  }
  console.error(
    '\nPostgres rejects an unknown column at PLAN time (42703), so each of these\n' +
      'fails on EVERY execution — there is no input that makes it work. Either the\n' +
      'column belongs on the table (declare it in shared/schema.ts AND create it in a\n' +
      'migration listed in scripts/db/migration-set.mjs), or the statement should not\n' +
      'be writing it.\n'
  );
  process.exit(1);
}

if (fixed.length > 0) {
  console.error(`\n✖ ${fixed.length} baselined violation(s) no longer occur — the ratchet must tighten:\n`);
  for (const k of fixed) console.error(`    ${k}`);
  console.error('\nRemove them: node scripts/ci/check-insert-columns-declared.mjs --write-baseline\n');
  process.exit(1);
}

console.log(
  baseline.size > 0
    ? `\n✅ no new violations. ${baseline.size} baselined and awaiting burn-down.`
    : '\n✅ every INSERTed column is declared on its table.'
);
