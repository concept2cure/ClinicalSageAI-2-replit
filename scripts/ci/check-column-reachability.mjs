#!/usr/bin/env node
/**
 * CI Guard: a COLUMN the server queries must be added by something a real
 * deployment actually RUNS.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * check-migration-reachability.mjs closed this question for TABLES, and has
 * ratcheted its baseline to zero. The same blind spot stayed wide open one level
 * down. A migration that only ALTERs — adding a column to a table that already
 * exists — creates no table, so that guard never looks at it, and neither does
 * ci:unbacked-tables. The file sits in db/migrations/, on no applier, and every
 * gate stays green while the column it adds exists on no real database.
 *
 * Six such defects were found by hand between 2026-09-08 and 2026-09-20, each
 * confirmed by running the server's own statement against a database built by
 * scripts/db/install-fresh.mjs plus the whole migration set:
 *
 *   audit_events.hmac_seal ......... the Part 11 §11.70 seal verifier, 42703
 *   gdpr_…_requests.execution_evidence  every DSAR completion, 42703
 *   ai_claims.verifier_flags ....... claim persistence in chat, 42703
 *   ivdr_binder_evidence.source_type  attaching evidence to a claim, 42703
 *   ivdr_packs.{hashes,warnings} ... every IVDR pack build's last step, 42703
 *   c2c_ana_actions.command ........ (a CHECK, not a column — same cause)
 *
 * Each was one line of wiring away from working, and nothing could see them.
 * This guard is that missing eye. Anything NEW fails the build.
 *
 * ── How it decides ───────────────────────────────────────────────────────────
 * A column counts as DURABLY ADDED when any of these creates it:
 *   · an `ALTER TABLE … ADD COLUMN` in a file on a durable apply path
 *   · a `CREATE TABLE` body in such a file
 *   · a drizzle table definition in shared/schema*.ts (drizzle-kit push runs
 *     before the set on every from-scratch install)
 * Durability is decided by the SAME rule as the table guard — that definition
 * lives there and is imported, not restated.
 *
 * A column counts as REFERENCED only when a SQL-looking string in server/ names
 * BOTH the table and the column. Requiring both is what keeps generic names
 * (`status`, `notes`, `metadata`) from producing a stream of phantoms — the
 * failure mode the sibling guard's header warns costs you the whole guard.
 *
 * Usage:  node scripts/ci/check-column-reachability.mjs [--write-baseline]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { C2C_MIGRATION_FILES } from '../db/migration-set.mjs';
import { AUTHORING_SUBSYSTEM_FILES } from '../db/authoring-subsystem.mjs';
import { sqlishSegments, stripSqlComments, tablesIn, repoRoot } from './check-migration-reachability.mjs';

const __filename = fileURLToPath(import.meta.url);
const TAG = '[ci:column-reachability]';
const BASELINE = path.join(repoRoot, 'scripts', 'ci', 'column-reachability-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');
const read = (p) => fs.readFileSync(p, 'utf8');

/** `ALTER TABLE [IF EXISTS] [schema.]t ADD COLUMN [IF NOT EXISTS] c` */
const ADD_COLUMN_RE =
  /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"?[a-z0-9_]+"?\s*\.\s*)?"?([a-z0-9_]+)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi;

/** `CREATE TABLE [IF NOT EXISTS] [schema.]t ( … )` → the table and its body. */
const CREATE_TABLE_BODY_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?[a-z0-9_]+"?\s*\.\s*)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\n\s*\)\s*;/gi;

function walkSql(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(_archive|_legacy|meta|node_modules)$/.test(e.name)) walkSql(p, acc);
    } else if (e.name.endsWith('.sql')) acc.push(p);
  }
  return acc;
}

// ── Durability: the table guard's rule, imported in spirit and restated only
//    where it needs the file list this script already has. ──────────────────
const journal = fs.existsSync(path.join(repoRoot, 'migrations/meta/_journal.json'))
  ? read(path.join(repoRoot, 'migrations/meta/_journal.json'))
  : '';
const installFresh = read(path.join(repoRoot, 'scripts/db/install-fresh.mjs'));
const namedDurable = new Set([...C2C_MIGRATION_FILES, ...AUTHORING_SUBSYSTEM_FILES]);

function isDurable(rel) {
  const base = path.basename(rel);
  if (namedDurable.has(rel)) return true;
  if (/_gcc_/.test(base)) return true;
  if (journal.includes(base.replace(/\.sql$/, ''))) return true;
  if (installFresh.includes(rel) || installFresh.includes(base)) return true;
  if (rel.startsWith('migrations/') && !rel.startsWith('migrations/meta/')) return true;
  return false;
}

// ── 1. Who adds which column, and is that path durable? ─────────────────────
const durable = new Set(); // "table.column"
const durableTables = new Set(); // a table the sibling guard already vouches for
const orphanAdds = new Map(); // "table.column" -> [files]

for (const dir of ['migrations', 'db/migrations']) {
  for (const abs of walkSql(path.join(repoRoot, dir))) {
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    const sql = stripSqlComments(read(abs));
    const durableFile = isDurable(rel);

    ADD_COLUMN_RE.lastIndex = 0;
    for (const m of sql.matchAll(ADD_COLUMN_RE)) {
      const key = `${m[1].toLowerCase()}.${m[2].toLowerCase()}`;
      if (durableFile) durable.add(key);
      else {
        if (!orphanAdds.has(key)) orphanAdds.set(key, []);
        orphanAdds.get(key).push(rel);
      }
    }

    if (!durableFile) continue;
    for (const t of tablesIn(sql)) durableTables.add(String(t).split('.').pop().toLowerCase());
    CREATE_TABLE_BODY_RE.lastIndex = 0;
    for (const m of sql.matchAll(CREATE_TABLE_BODY_RE)) {
      const table = m[1].toLowerCase();
      for (const line of m[2].split('\n')) {
        const col = /^\s*"?([a-z0-9_]+)"?\s+[a-z]/i.exec(line);
        if (col && !/^(constraint|primary|unique|foreign|check|like|exclude)$/i.test(col[1])) {
          durable.add(`${table}.${col[1].toLowerCase()}`);
        }
      }
    }
  }
}

// Drizzle push runs before the set on every from-scratch install, so a column it
// declares is present regardless of the .sql trees.
for (const rel of ['shared/schema.ts', ...fs.existsSync(path.join(repoRoot, 'shared/schema'))
  ? fs.readdirSync(path.join(repoRoot, 'shared/schema')).filter((f) => f.endsWith('.ts')).map((f) => `shared/schema/${f}`)
  : []]) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) continue;
  const src = read(abs);
  const re = /pgTable\(\s*['"]([a-z0-9_]+)['"]\s*,\s*\{([\s\S]*?)\n\s*\}/g;
  for (const m of src.matchAll(re)) {
    const table = m[1].toLowerCase();
    for (const c of m[2].matchAll(/\b[a-zA-Z]+\(\s*['"]([a-z0-9_]+)['"]/g)) {
      durable.add(`${table}.${c[1].toLowerCase()}`);
    }
    durableTables.add(table);
  }
}

// ── 2. Which of the orphaned columns does the server actually query? ────────
function serverSqlSegments() {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!/^(node_modules|dist|_archive|__tests__|coverage)$/.test(e.name)) walk(p);
      } else if (/\.(ts|js|mjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
        out.push(...sqlishSegments(read(p)).map((s) => ({ sql: s, file: path.relative(repoRoot, p) })));
      }
    }
  };
  walk(path.join(repoRoot, 'server'));
  return out;
}

const segments = serverSqlSegments();
const findings = [];
for (const [key, files] of orphanAdds) {
  if (durable.has(key)) continue;
  const [table, column] = key.split('.');
  // A table nothing durable creates is the TABLE guard's finding, not this
  // one — reporting it here would duplicate ci:migration-reachability and
  // blame the column for an absent table.
  if (!durableTables.has(table)) continue;
  const tRe = new RegExp(`\\b${table}\\b`, 'i');
  const cRe = new RegExp(`\\b${column}\\b`, 'i');
  const hit = segments.find((s) => tRe.test(s.sql) && cRe.test(s.sql));
  if (hit) findings.push({ column: key, addedOnlyBy: files, referencedIn: hit.file });
}
findings.sort((a, b) => a.column.localeCompare(b.column));

// ── 3. Ratchet ──────────────────────────────────────────────────────────────
const baseline = fs.existsSync(BASELINE) ? JSON.parse(read(BASELINE)) : { columns: [] };
const allowed = new Set(baseline.columns ?? []);

if (writeBaseline) {
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        _comment:
          'Columns the server queries whose ONLY creator is a migration on no durable apply path — they exist on no real database, so the statements naming them raise 42703. Anything NEW fails the build. Resolve an entry (put its migration on an applier, or delete the dead reference), then remove it here to ratchet down. Goal: 0.',
        count: findings.length,
        columns: findings.map((f) => f.column),
        detail: findings,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`${TAG} baseline written — ${findings.length} column(s).`);
  process.exit(0);
}

const fresh = findings.filter((f) => !allowed.has(f.column));
if (fresh.length > 0) {
  console.error(`${TAG} ❌ ${fresh.length} column(s) the server queries are added only by a migration nothing runs:`);
  for (const f of fresh) {
    console.error(`  ${f.column}`);
    console.error(`      added only by : ${f.addedOnlyBy.join(', ')}`);
    console.error(`      queried in    : ${f.referencedIn}`);
  }
  console.error(
    `\n  Put the migration on an applier (C2C_MIGRATION_FILES, positioned after the file that\n` +
      `  creates the table — CLAUDE.md RULE 1), or delete the reference if the feature is dead.`,
  );
  process.exit(1);
}

console.log(
  `${TAG} OK — ${orphanAdds.size} column add(s) on no applier, ${findings.length} of them queried by the server` +
    `${findings.length ? ` (all baselined)` : ''}.`,
);
