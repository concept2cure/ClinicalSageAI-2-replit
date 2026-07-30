#!/usr/bin/env node
/**
 * CI Guard: a table the server QUERIES must be created by something a real
 * deployment actually RUNS.
 *
 * WHY THIS EXISTS — the blind spot in ci:unbacked-tables.
 * That guard asks "does any file create this table?" and counts, by its own
 * documented rule, "a non-archived .sql migration (db/migrations/, migrations/)".
 * It never asks whether an applier RUNS that .sql. So a migration that sits in
 * db/migrations/ and is on no apply path — not `_gcc_` (the CI psql loop), not in
 * the drizzle journal, not in C2C_MIGRATION_FILES, not in AUTHORING_SUBSYSTEM_
 * FILES, not named by install-fresh — makes its tables look "backed" while they
 * exist on no real database. The endpoints that query them 500 with
 * missing-relation errors, and every guard in CI stays green.
 *
 * That is the exact failure this codebase keeps rediscovering under different
 * names (ledger C-6, C-8, C-10, C-11, C-16, C-19, C-20, C-23, C-29, C-30, C-31,
 * C-32): "merged, green, and never applied". ci:journey-migration-reachability
 * already closes it for migrations a golden journey declares. This guard closes
 * the general case: EVERY server-referenced table, whatever surfaced it.
 *
 * WHAT COUNTS AS DURABLE (the paths a real environment actually runs):
 *   • journal       — migrations/meta/_journal.json → drizzle migrate() replays it
 *   • gcc           — db/migrations/*_gcc_*.sql → the CI psql apply loop
 *   • c2c-set       — C2C_MIGRATION_FILES → deploy-migrate (prod) + apply-c2c
 *   • authoring     — AUTHORING_SUBSYSTEM_FILES → same deploy path
 *   • install-fresh — files install-fresh.mjs names explicitly (pre-overlay
 *                     creators, the authoring step, the root overlay tree)
 *   • push          — the drizzle push surface (pgTable/pgView in shared/).
 *                     Counted HERE, unlike in the journey guard: this guard's
 *                     question is "can this table exist on a real database at
 *                     all?", and push genuinely provisions fresh installs.
 *
 * BASELINE. The debt predates the guard and is large, so findings are pinned in
 * migration-reachability-baseline.json. Anything NEW fails immediately; resolving
 * an entry (put its migration on an applier, or delete the dead reference) then
 * removing it from the baseline ratchets the number down. Goal: 0.
 *
 * Usage:
 *   node scripts/ci/check-migration-reachability.mjs
 *   node scripts/ci/check-migration-reachability.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../db/migration-set.mjs';
import { AUTHORING_SUBSYSTEM_FILES } from '../db/authoring-subsystem.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');
const TAG = '[ci:migration-reachability]';
const BASELINE = path.join(repoRoot, 'scripts', 'ci', 'migration-reachability-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');

const read = (p) => fs.readFileSync(p, 'utf8');
const CREATE_TABLE_RE = /CREATE\s+(?:UNLOGGED\s+|TEMP\s+|TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(?:public\.)?([a-z0-9_]+)/gi;
const CREATE_VIEW_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(?:public\.)?([a-z0-9_]+)/gi;

const tablesIn = (sql) => {
  const out = new Set();
  for (const re of [CREATE_TABLE_RE, CREATE_VIEW_RE]) {
    re.lastIndex = 0;
    for (const m of sql.matchAll(re)) out.add(m[1].toLowerCase());
  }
  return out;
};

/** Walk a directory for files matching `test`, skipping vendored/archived trees. */
function walk(dir, test, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(node_modules|dist|_archive|__tests__|coverage)$/.test(e.name)) walk(p, test, acc);
    } else if (test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

// ── 1. The durable creator set ──────────────────────────────────────────────
const journal = fs.existsSync(path.join(repoRoot, 'migrations/meta/_journal.json'))
  ? read(path.join(repoRoot, 'migrations/meta/_journal.json'))
  : '';
const installFresh = read(path.join(repoRoot, 'scripts/db/install-fresh.mjs'));
const namedDurable = new Set([...C2C_MIGRATION_FILES, ...AUTHORING_SUBSYSTEM_FILES]);

/** Is this repo-relative .sql on a path a real deployment runs? */
function isDurable(rel) {
  const base = path.basename(rel);
  if (namedDurable.has(rel)) return true;
  if (/_gcc_/.test(base)) return true;
  if (journal.includes(base.replace(/\.sql$/, ''))) return true;
  if (installFresh.includes(rel) || installFresh.includes(base)) return true;
  // The root migrations/ tree is the drizzle lineage the journal replays.
  if (rel.startsWith('migrations/') && !rel.startsWith('migrations/meta/')) return true;
  return false;
}

const durableTables = new Set();
const deadCreators = new Map(); // table -> [files]

for (const abs of walk(path.join(repoRoot, 'db/migrations'), (n) => n.endsWith('.sql'))) {
  const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
  if (rel.includes('/_legacy/') || rel.includes('/_archive/')) continue;
  const created = tablesIn(read(abs));
  if (isDurable(rel)) {
    for (const t of created) durableTables.add(t);
  } else {
    for (const t of created) {
      if (!deadCreators.has(t)) deadCreators.set(t, []);
      deadCreators.get(t).push(rel);
    }
  }
}
for (const abs of walk(path.join(repoRoot, 'migrations'), (n) => n.endsWith('.sql'))) {
  for (const t of tablesIn(read(abs))) durableTables.add(t);
}
// drizzle push surface — provisions fresh installs from shared/.
for (const abs of walk(path.join(repoRoot, 'shared'), (n) => n.endsWith('.ts'))) {
  const src = read(abs);
  for (const m of src.matchAll(/pg(?:Table|View|MaterializedView)\(\s*['"]([a-z0-9_]+)['"]/gi)) {
    durableTables.add(m[1].toLowerCase());
  }
}
// runtime DDL in server code is a real (if discouraged) provisioning path.
for (const abs of walk(path.join(repoRoot, 'server'), (n) => n.endsWith('.ts'))) {
  const src = read(abs);
  if (!/CREATE\s+TABLE/i.test(src)) continue;
  for (const t of tablesIn(src)) durableTables.add(t);
}

// ── 2. Tables the server actually queries ───────────────────────────────────
const REF_RE = /(?:\bFROM|\bJOIN|\bINTO|\bUPDATE)\s+["`]?([a-z][a-z0-9_]{3,})["`]?/gi;
const referenced = new Map(); // table -> Set(files)
for (const abs of walk(
  path.join(repoRoot, 'server'),
  (n) => n.endsWith('.ts') && !/\.test\.|\.spec\./.test(n),
)) {
  const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
  const src = read(abs);
  REF_RE.lastIndex = 0;
  for (const m of src.matchAll(REF_RE)) {
    const t = m[1].toLowerCase();
    if (!referenced.has(t)) referenced.set(t, new Set());
    referenced.get(t).add(rel);
  }
}

// ── 3. The finding: referenced, created ONLY by a deploy-dead migration ─────
const findings = {};
for (const [table, creators] of [...deadCreators.entries()].sort()) {
  if (durableTables.has(table)) continue; // also created somewhere durable — fine
  if (!referenced.has(table)) continue; // never queried — dead spec, not a 500
  findings[table] = {
    createdOnlyBy: [...new Set(creators)].sort(),
    referencedBy: [...referenced.get(table)].sort().slice(0, 6),
  };
}

const names = Object.keys(findings).sort();

if (writeBaseline) {
  fs.writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        _comment:
          'Tables the server queries whose ONLY creator is a migration on no durable apply path — they exist on no real database, so those endpoints 500. ci:unbacked-tables cannot see this class: it counts any .sql file as a creator regardless of whether an applier runs it. Anything NEW fails the build. Resolve an entry (put its migration on an applier, or delete the dead reference), then remove it here to ratchet down. Goal: 0.',
        _durablePaths: [
          'migrations/meta/_journal.json (drizzle migrate)',
          'db/migrations/*_gcc_*.sql (CI psql loop)',
          'C2C_MIGRATION_FILES (deploy-migrate + apply-c2c)',
          'AUTHORING_SUBSYSTEM_FILES (same deploy path)',
          'files install-fresh.mjs names explicitly',
          'the drizzle push surface (pgTable/pgView in shared/)',
        ],
        count: names.length,
        tables: findings,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`${TAG} baseline written: ${names.length} table(s).`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(read(BASELINE)) : { tables: {} };
const baselined = new Set(Object.keys(baseline.tables || {}));
const added = names.filter((t) => !baselined.has(t));
const resolved = [...baselined].filter((t) => !names.includes(t));

console.log(
  `${TAG} ${durableTables.size} durably-created tables; ${names.length} server-referenced table(s) created only by a deploy-dead migration; ${baselined.size} baselined`,
);

if (resolved.length) {
  console.log(
    `${TAG} ✅ ${resolved.length} baselined table(s) now reachable — remove from the baseline to ratchet down:`,
  );
  for (const t of resolved.slice(0, 20)) console.log(`    • ${t}`);
}

if (added.length) {
  console.error(`\n${TAG} ❌ ${added.length} NEW unreachable table reference(s):\n`);
  for (const t of added) {
    console.error(`  ${t}`);
    console.error(`    created only by : ${findings[t].createdOnlyBy.join(', ')}`);
    console.error(`    referenced by   : ${findings[t].referencedBy.join(', ')}`);
  }
  console.error(`\n  A migration in db/migrations/ is NOT applied by anything on its own.`);
  console.error(`  Put it on a durable path — usually C2C_MIGRATION_FILES in`);
  console.error(`  scripts/db/migration-set.mjs — or the table will exist on no real`);
  console.error(`  database and every endpoint that queries it will 500 in production,`);
  console.error(`  while ci:unbacked-tables still reports it "backed".`);
  process.exit(1);
}

console.log(`${TAG} ✅ no new unreachable table references.`);
