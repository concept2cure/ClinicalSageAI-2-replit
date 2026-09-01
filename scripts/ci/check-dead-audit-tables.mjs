#!/usr/bin/env node
/**
 * ci:dead-audit-tables — the tables L13 dropped must stay dropped, and the ones
 * it refused to drop must stay refused for a reason that is still true.
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
 * ── Policy ───────────────────────────────────────────────────────────────────
 * scripts/ci/dead-audit-tables-baseline.json records, per table, exactly which
 * files may mention it today: the historical creator migrations, the drop
 * migration itself, and (for the six tables the drop deliberately withheld) the
 * drizzle schema modules that still declare them. A file mentioning a dead table
 * that is not on its list fails the build. Removing a file from a list — by
 * deleting the last `pgTable` for a withheld table, say — is the ratchet turning
 * the right way; regenerate with --write-baseline after a real reduction.
 *
 * The `withheld` block is the burndown list. Those six are dead in every code
 * path but declared on the drizzle push surface, so `drizzle-kit push` recreates
 * them on every fresh install and a SQL-only DROP would be a deletion that does
 * not delete. They move into `dropped` when their pgTable declarations go.
 *
 * Usage:
 *   node scripts/ci/check-dead-audit-tables.mjs
 *   node scripts/ci/check-dead-audit-tables.mjs --list
 *   node scripts/ci/check-dead-audit-tables.mjs --write-baseline
 * Exit 0 when every mention set is within its baseline, 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:dead-audit-tables]';
const baselinePath = path.join(repoRoot, 'scripts', 'ci', 'dead-audit-tables-baseline.json');
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
];

/** Dead in code, still on the drizzle push surface — burndown, not resolved. */
const WITHHELD = [
  'public.ai_audit_log',
  'public.coauthor_import_history',
  'public.coauthor_status_history',
  'public.csr_extraction_log',
  'public.document_audit_log',
  'public.qmp_audit_trail',
];

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

if (listOnly) {
  for (const group of ['dropped', 'withheld']) {
    console.log(`\n── ${group} ──`);
    for (const [t, fs_] of Object.entries(current[group])) {
      console.log(`  ${t}  (${fs_.length})`);
      for (const f of fs_) console.log(`      ${f}`);
    }
  }
  process.exit(0);
}

if (writeBaseline) {
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify(
      {
        $comment:
          'Files permitted to mention each table that db/migrations/20260901_drop_dead_audit_tables.sql ' +
          'dropped (dropped) or deliberately withheld because drizzle-kit push would recreate it ' +
          '(withheld). These lists may only SHRINK. A file naming a dead table that is not on its list ' +
          'is a resurrection — a new writer, a new reader, a re-added pgTable, or a second CREATE TABLE ' +
          'migration — and fails the build. Regenerate with ' +
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
    '\n  These tables were dropped by db/migrations/20260901_drop_dead_audit_tables.sql,\n' +
      '  which re-runs on every deploy at the end of C2C_MIGRATION_FILES. A writer added\n' +
      '  now does not fail loudly — its table is dropped again on the next deploy and the\n' +
      '  rows go with it. If the store is genuinely needed, remove it from DROPPED in this\n' +
      '  guard and from the migration in the SAME change, and say in\n' +
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
    `${total} permitted mention(s), baseline ${baseline.count} (shrink-only).`,
);
