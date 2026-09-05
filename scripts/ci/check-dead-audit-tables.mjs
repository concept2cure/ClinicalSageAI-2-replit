#!/usr/bin/env node
/**
 * ci:dead-audit-tables — the tables L13 dropped must stay dropped, and the six
 * L143 removed from the drizzle push surface must stay off it.
 *
 * ── Why this gate exists ─────────────────────────────────────────────────────
 * db/migrations/20260901_drop_dead_audit_tables.sql removes twelve audit-shaped
 * tables (plus one phantom) that nothing in this repo writes or reads. A DROP is
 * a one-time event; nothing stops the next change from adding a `pgTable`, a new
 * CREATE TABLE migration, or an INSERT against one of those names — and because
 * the drop lives at the end of C2C_MIGRATION_FILES and re-runs on every deploy,
 * the resurrection would be silent from both sides: the new writer's table keeps
 * vanishing, and the drop keeps "succeeding".
 *
 * That is the shape this repo has been burned by before (a table created by
 * something no applier runs, a policy keyed on a GUC nobody sets): the two
 * halves each look correct and only their combination is wrong. So the invariant
 * is not "these names never appear" — the creating migrations are history and
 * history does not get rewritten — it is that the SET OF FILES mentioning each
 * dead table may only SHRINK.
 *
 * ── Three checks, because the mention ratchet alone is indirect ───────────────
 * 1. PUSH SURFACE. No dead table may be declared as a `pgTable` on the drizzle
 *    push surface — the entrypoints in drizzle.config.ts plus the modules they
 *    `export *`. That surface is what `drizzle-kit push` materialises, and
 *    `scripts/db/install-fresh.mjs` step 2/8 runs that push, so a declaration
 *    there recreates the table on every fresh install no matter what SQL says.
 *    This is the check L143 exists to install: it names the offending file and
 *    the declaration, rather than reporting a file-set delta and leaving the
 *    reader to work out why the file appeared.
 *
 *    It is deliberately scoped to the push surface, not to all TypeScript.
 *    `assumption_history`, `program_activity_log` and `relation_extraction_log`
 *    still have `pgTable` declarations in shared/schema/operating-system.ts,
 *    programs.ts and regulatory-atoms.ts. Those modules are NOT reachable from
 *    drizzle.config.ts, so push never creates them; the declarations compile and
 *    would fail at run time, which is what check 3's mention set is for.
 *
 * 2. DROP-LIST AGREEMENT. Every table this guard calls dropped must actually be
 *    named in the migration's `FOREACH … IN ARRAY ARRAY[…]` list — parsed out of
 *    the file, not restated here. A guard that asserts a drop the SQL no longer
 *    performs is worse than no guard: it reports green over a table that is
 *    still there. SQL_DROP_PENDING below carries the one legitimate exception —
 *    a table taken off the push surface before its SQL drop is written — and is
 *    read from both sides, so neither half can drift ahead of the other
 *    unnoticed. It is empty: all nineteen are in the migration's list.
 *
 * 3. MENTION RATCHET. scripts/ci/dead-audit-tables-baseline.json records, per
 *    table, exactly which files may mention it today: the historical creator
 *    migrations and the drop migration itself. A file mentioning a dead table
 *    that is not on its list fails the build. Removing a file from a list — by
 *    deleting the last `pgTable`, say — is the ratchet turning the right way;
 *    regenerate with --write-baseline after a real reduction.
 *
 * Usage:
 *   node scripts/ci/check-dead-audit-tables.mjs
 *   node scripts/ci/check-dead-audit-tables.mjs --list
 *   node scripts/ci/check-dead-audit-tables.mjs --write-baseline
 * Exit 0 when every check passes, 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:dead-audit-tables]';
const baselinePath = path.join(repoRoot, 'scripts', 'ci', 'dead-audit-tables-baseline.json');
const dropMigration = 'db/migrations/20260901_drop_dead_audit_tables.sql';
const drizzleConfig = 'drizzle.config.ts';
const writeBaseline = process.argv.includes('--write-baseline');
const listOnly = process.argv.includes('--list');

/**
 * The names under judgement. Schema-qualified exactly as the migration lists
 * them; the scan matches on the bare relation name, because SQL and TypeScript
 * both reach these tables unqualified in places and a qualified-only match would
 * miss the writer that matters most.
 */
const DROPPED = [
  'public.assumption_history',
  'public.auth_password_history',
  'public.doc_activity_log',
  'public.ind_protocol_history',
  'public.program_activity_log',
  'public.qc_compliance_history',
  'public.relation_extraction_log',
  'public.strategy_audit',
  'public.vault_document_audit_logs',
  'audit.request_correlations',
  'cortex.confidence_history',
  'predicate.proof_pack_audit_events',
  'regulatory_harmonization.mapping_rule_history',
  // ── L143: the six the L13 drop withheld ──────────────────────────────────
  // Withheld from L13 because each was a `pgTable` on the drizzle push surface,
  // so a SQL-only DROP gave a table that came back on the next fresh install.
  // The declarations are gone from shared/schema.ts and
  // shared/schema/csr-knowledge-db.ts, and the migration's drop list now names
  // them, so both halves of the deletion are in place.
  //
  // Re-verified dead before removal rather than taken on L13's word: zero
  // writers and zero readers across server, client, shared, scripts, db and
  // migrations — including PL/pgSQL function, trigger and view bodies, seed
  // scripts and server/prisma — and no inbound foreign key in either direction.
  // Their only remaining mentions are the creator migrations, which are history.
  'public.ai_audit_log',
  'public.coauthor_import_history',
  'public.coauthor_status_history',
  'public.csr_extraction_log',
  'public.document_audit_log',
  'public.qmp_audit_trail',
];

/**
 * Dropped from the push surface, NOT yet from the SQL drop list.
 *
 * Removing a `pgTable` stops `drizzle-kit push` from creating the table. It does
 * not stop the raw migration overlay: install-fresh.mjs step 3/8 replays every
 * file in migrations/ on top of push, and `migrations/0000_sweet_joseph.sql`
 * still CREATEs five of these six, while `migrations/0005_csr_knowledge_database.sql`
 * — applied as an RLS migration in step 5/8 — CREATEs csr_extraction_log and
 * then ENABLEs RLS on it by name. So a provisioned database still has all six
 * until `db/migrations/20260901_drop_dead_audit_tables.sql` gains them.
 *
 * The migration has since gained all six, so this list is empty. It is kept
 * rather than deleted because check 2 reads it from the other side: a name here
 * that turns up in the migration's array fails the build, so the marker cannot
 * go stale silently — which is exactly how it caught the migration edit that
 * closed it.
 */
const SQL_DROP_PENDING = new Set([]);

/**
 * Dead in code but still declared on the push surface. Empty since L143 closed
 * the burndown; the machinery stays because the next dead table found this way
 * has to be carried the same explicit way rather than quietly left in place.
 */
const WITHHELD = [];

const SCAN_ROOTS = ['server', 'client', 'shared', 'scripts', 'tests', 'db', 'migrations'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next']);
const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|sql|json)$/;

/**
 * Files the scan must not read.
 *
 * `migrations/meta/*_snapshot.json` is a machine dump of the journalled baseline
 * — every column of every table that ever existed — so it names all thirteen and
 * always will. Including it would pin a multi-megabyte file into the baseline and
 * tell a reader nothing.
 *
 * The baseline itself names every table by construction, so scanning it would
 * make the guard report its own record as a resurrection.
 */
const SKIP_FILE = (rel) =>
  rel.startsWith('migrations/meta/') || rel === 'scripts/ci/dead-audit-tables-baseline.json';

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (SCAN_EXT.test(e.name)) out.push(p);
  }
  return out;
}

const files = SCAN_ROOTS.flatMap((r) => walk(path.join(repoRoot, r)))
  .map((abs) => path.relative(repoRoot, abs).split(path.sep).join('/'))
  .filter((rel) => !SKIP_FILE(rel))
  .sort();

/** table -> sorted list of files mentioning its bare relation name. */
function mentions(names) {
  const bare = names.map((n) => ({ full: n, re: new RegExp(`\\b${n.split('.').pop()}\\b`) }));
  const out = {};
  for (const { full } of bare) out[full] = [];
  for (const rel of files) {
    let src;
    try {
      src = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch {
      continue;
    }
    for (const { full, re } of bare) if (re.test(src)) out[full].push(rel);
  }
  return out;
}

const current = { dropped: mentions(DROPPED), withheld: mentions(WITHHELD) };
const countAll = (m) => Object.values(m).reduce((n, v) => n + v.length, 0);
const total = countAll(current.dropped) + countAll(current.withheld);

// ── Check 1: the drizzle push surface ───────────────────────────────────────

/**
 * The files `drizzle-kit push` actually reads: the entrypoints named in
 * drizzle.config.ts, plus every module they `export *`. Derived, not restated —
 * a hardcoded copy is the second source of truth that goes stale the first time
 * someone adds an entrypoint, which is the failure mode this repo keeps hitting.
 */
function pushSurface() {
  const cfg = path.join(repoRoot, drizzleConfig);
  if (!fs.existsSync(cfg)) {
    console.error(`${TAG} ❌ ${drizzleConfig} not found — cannot determine the push surface.`);
    console.error('   Refusing to report success for a surface that was never read.');
    process.exit(1);
  }
  const src = fs.readFileSync(cfg, 'utf8');
  const arr = src.match(/schema\s*:\s*\[([\s\S]*?)\]/);
  const entry = arr ? [...arr[1].matchAll(/['"`](\.\/[^'"`]+)['"`]/g)].map((m) => m[1]) : [];
  if (entry.length === 0) {
    console.error(`${TAG} ❌ could not parse the schema entrypoints from ${drizzleConfig}.`);
    process.exit(1);
  }
  const seen = new Set();
  for (const e of entry) {
    const rel = path.normalize(e).split(path.sep).join('/');
    seen.add(rel);
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const body = fs.readFileSync(abs, 'utf8');
    for (const m of body.matchAll(/export\s+\*\s+from\s+['"`](\.[^'"`]+)['"`]/g)) {
      const child = path
        .normalize(path.join(path.dirname(rel), m[1].endsWith('.ts') ? m[1] : `${m[1]}.ts`))
        .split(path.sep)
        .join('/');
      seen.add(child);
    }
  }
  return [...seen].sort();
}

const surface = pushSurface();

/**
 * `pgTable(\n  'name',` and `pgSchema('x').table('name')` both create a table on
 * push. Whitespace-tolerant because this codebase writes the name on its own
 * line under the call.
 */
function pgTableDeclarations(names) {
  const found = [];
  for (const rel of surface) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const body = fs.readFileSync(abs, 'utf8');
    for (const full of names) {
      const relation = full.split('.').pop();
      const re = new RegExp(`(?:pgTable|\\.table)\\(\\s*['"\`]${relation}['"\`]`);
      const m = body.match(re);
      if (!m) continue;
      const line = body.slice(0, m.index).split('\n').length;
      found.push({ table: full, file: rel, line });
    }
  }
  return found;
}

// ── Check 2: the migration's own drop list ──────────────────────────────────

/**
 * The names inside `FOREACH qualified IN ARRAY ARRAY[ … ] LOOP`, read from the
 * migration. Comments in that block are SQL `--` lines, which carry no quotes,
 * so a plain quoted-string scan of the array body is exact.
 */
function migrationDropList() {
  const abs = path.join(repoRoot, dropMigration);
  if (!fs.existsSync(abs)) {
    console.error(`${TAG} ❌ ${dropMigration} not found — the drop this guard defends is gone.`);
    process.exit(1);
  }
  const body = fs.readFileSync(abs, 'utf8');
  const block = body.match(/FOREACH\s+\w+\s+IN\s+ARRAY\s+ARRAY\[([\s\S]*?)\]\s*LOOP/);
  if (!block) {
    console.error(`${TAG} ❌ could not parse the drop list out of ${dropMigration}.`);
    console.error('   Refusing to report success for a list that was never read.');
    process.exit(1);
  }
  return new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

if (listOnly) {
  console.log(`\n── drizzle push surface (${surface.length} file(s), from ${drizzleConfig}) ──`);
  for (const f of surface) console.log(`      ${f}`);
  const list = migrationDropList();
  console.log(`\n── ${dropMigration} drops (${list.size}) ──`);
  for (const t of [...list].sort()) console.log(`      ${t}`);
  for (const group of ['dropped', 'withheld']) {
    console.log(`\n── ${group} ──`);
    for (const [t, fs_] of Object.entries(current[group])) {
      const pending = SQL_DROP_PENDING.has(t) ? '  [SQL drop pending]' : '';
      console.log(`  ${t}  (${fs_.length})${pending}`);
      for (const f of fs_) console.log(`      ${f}`);
    }
  }
  process.exit(0);
}

// ── Check 1 — no dead table declared on the drizzle push surface ────────────
const resurrected = pgTableDeclarations([...DROPPED]);
if (resurrected.length) {
  console.error(
    `\n🚫 ${TAG} ${resurrected.length} dead audit table(s) are declared on the drizzle push surface:\n`,
  );
  for (const { table, file, line } of resurrected) {
    console.error(`  ${table}`);
    console.error(`      ${file}:${line}`);
  }
  console.error(
    '\n  drizzle.config.ts hands these files to `drizzle-kit push`, and\n' +
      '  scripts/db/install-fresh.mjs step 2/8 runs that push. A `pgTable` here\n' +
      '  recreates the table on every fresh install, so the SQL DROP in\n' +
      `  ${dropMigration}\n` +
      '  becomes a deletion that does not delete — the exact failure ledger rows\n' +
      '  L13 and L143 exist to end.\n\n' +
      '  If the store is genuinely needed again, remove it from DROPPED in this\n' +
      '  guard AND from the migration in the SAME change, and say in\n' +
      '  docs/AUDIT_STORE_INVENTORY_2026-08.md §5.1 what now writes and reads it.\n',
  );
  process.exit(1);
}

// ── Check 2 — this guard's claims match the migration's own list ────────────
const dropList = migrationDropList();
const disagreements = [];
for (const table of DROPPED) {
  const listed = dropList.has(table);
  if (SQL_DROP_PENDING.has(table)) {
    if (listed) {
      disagreements.push(
        `${table} is now dropped by the migration — delete it from SQL_DROP_PENDING in this guard.`,
      );
    }
  } else if (!listed) {
    disagreements.push(
      `${table} is called dropped here but is NOT in the migration's drop list. ` +
        'Either restore it to the migration or stop claiming it was dropped.',
    );
  }
}
if (disagreements.length) {
  console.error(`\n🚫 ${TAG} guard and migration disagree:\n`);
  for (const d of disagreements) console.error(`  • ${d}`);
  console.error(
    `\n  Parsed from ${dropMigration}. A guard that asserts a drop the SQL no\n` +
      '  longer performs reports green over a table that is still there.\n',
  );
  process.exit(1);
}

if (writeBaseline) {
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify(
      {
        $comment:
          'Files permitted to mention each dead audit table. `dropped` is the settled list: dead in ' +
          'every code path and off the drizzle push surface. `withheld` is the burndown list — dead in ' +
          'code but still declared as a pgTable, so a SQL-only DROP would not hold — and is empty since ' +
          'L143. These lists may only SHRINK. A file naming a dead table that is not on its list is a ' +
          'resurrection — a new writer, a new reader, a re-added pgTable, or a second CREATE TABLE ' +
          'migration — and fails the build. The six L143 tables (ai_audit_log, ' +
          'coauthor_import_history, coauthor_status_history, csr_extraction_log, document_audit_log, ' +
          'qmp_audit_trail) moved from withheld to dropped when their pgTable declarations went; ' +
          'their remaining mentions are the creator migrations, which are history. Regenerate with ' +
          'npm run ci:dead-audit-tables:write-baseline only after a real reduction.',
        generatedBy: 'scripts/ci/check-dead-audit-tables.mjs --write-baseline',
        count: total,
        dropped: current.dropped,
        withheld: current.withheld,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`${TAG} baseline written — ${total} permitted mention(s).`);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error(`${TAG} ❌ baseline missing: ${path.relative(repoRoot, baselinePath)}`);
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

const failures = [];
for (const group of ['dropped', 'withheld']) {
  const want = baseline[group] || {};
  for (const [table, seen] of Object.entries(current[group])) {
    const allowed = new Set(want[table] || []);
    const added = seen.filter((f) => !allowed.has(f));
    if (added.length) failures.push({ group, table, added });
  }
  // A name that vanished from the baseline entirely — someone edited the list
  // rather than the code. Treat an unknown table as a failure, not a pass.
  for (const table of Object.keys(current[group])) {
    if (!(table in want)) failures.push({ group, table, added: ['(no baseline entry for this table)'] });
  }
}

if (failures.length) {
  console.error(`\n🚫 ${TAG} ${failures.length} dead audit table(s) gained a reference:\n`);
  for (const { group, table, added } of failures) {
    console.error(`  ${table}  [${group}]`);
    for (const f of added) console.error(`      ${f}`);
  }
  console.error(
    `\n  These tables were dropped by ${dropMigration}, which re-runs on every deploy at\n` +
      '  the end of C2C_MIGRATION_FILES. A writer added now does not fail loudly — its\n' +
      '  table is dropped again on the next deploy and the rows go with it. Anything\n' +
      '  in SQL_DROP_PENDING fails the other way: off the drizzle push surface but\n' +
      '  still created by the raw migration overlay, so a writer added now works\n' +
      '  until that SQL drop lands and then stops.\n\n' +
      '  If the store is genuinely needed, remove it from DROPPED in this guard and from\n' +
      '  the migration in the SAME change, and say in\n' +
      '  docs/AUDIT_STORE_INVENTORY_2026-08.md §5.1 what now writes and reads it.\n',
  );
  process.exit(1);
}

if (total > baseline.count) {
  console.error(
    `\n🚫 ${TAG} permitted-mention count rose ${baseline.count} → ${total}. This list may only shrink.\n`,
  );
  process.exit(1);
}

console.log(
  `${TAG} ✅ ${DROPPED.length} dropped + ${WITHHELD.length} withheld table(s); ` +
    `none declared on the drizzle push surface (${surface.length} file(s) scanned); ` +
    `${DROPPED.length - SQL_DROP_PENDING.size}/${DROPPED.length} in the migration's drop list` +
    `${SQL_DROP_PENDING.size ? `, ${SQL_DROP_PENDING.size} SQL-drop pending` : ''}; ` +
    `${total} permitted mention(s), baseline ${baseline.count} (shrink-only).`,
);
