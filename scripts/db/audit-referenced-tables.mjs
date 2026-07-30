#!/usr/bin/env node
/**
 * Schema-contract audit — repo-wide "referenced but never created" table finder.
 *
 * The 22 missing authoring tables (endpoints querying relations no migration
 * created) were one instance of a defect class: SQL that references a table the
 * repo never creates, which fails only at runtime with a missing-relation error.
 * This generalizes the authoring schema-contract test across the whole server:
 * it collects every table CREATED (migrations, drizzle pgTable, runtime DDL,
 * views) and every table REFERENCED in real SQL strings, and reports the gap.
 *
 * Precision notes (this is a heuristic, not a SQL parser — triage the output):
 *   - references are pulled ONLY from backtick strings that look like real SQL
 *     (a $-placeholder or a SELECT..FROM / INSERT INTO / UPDATE..SET / DELETE
 *     FROM shape), so English prose in comments and prompts is not scanned;
 *   - set-returning function calls (FROM fn(...)), CTE names, Postgres catalog
 *     relations, and a stoplist of common non-table words are excluded;
 *   - views (CREATE VIEW / MATERIALIZED VIEW) count as created.
 *
 * Usage:  node scripts/db/audit-referenced-tables.mjs [--json]
 * Exit 0 always (diagnostic). Wire into CI as a ratchet once the backlog it
 * reports is triaged (mirror scripts/ci/typecheck-no-regression.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(dir, filter, out = []) {
  let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (['node_modules', '.git', 'dist', 'build'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}
const isProdTs = (p) => (p.endsWith('.ts') || p.endsWith('.tsx')) && !p.includes('/__tests__/') && !p.endsWith('.test.ts');

// ── CREATED relations (tables + views) ──
const created = new Set();
const CREATE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi;
const VIEW_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi;
const PGTABLE_RE = /pg(?:Table|View|MaterializedView)\(\s*['"]([a-z_][a-z0-9_]*)['"]/gi;
const addAll = (re, t) => { re.lastIndex = 0; let m; while ((m = re.exec(t))) created.add(m[1].toLowerCase()); };
for (const f of walk(ROOT, (p) => p.endsWith('.sql'))) { const t = fs.readFileSync(f, 'utf8'); addAll(CREATE_RE, t); addAll(VIEW_RE, t); }
for (const f of walk(ROOT, isProdTs)) { const t = fs.readFileSync(f, 'utf8'); addAll(CREATE_RE, t); addAll(VIEW_RE, t); addAll(PGTABLE_RE, t); }

// ── REFERENCED tables (SQL strings only) ──
const BACKTICK_RE = /`([^`]*)`/g;
const SQLISH = /\$\d|\bselect\b[\s\S]*\bfrom\b|\binsert\s+into\b|\bupdate\s+\w+\s+set\b|\bdelete\s+from\b/i;
const REF_RE = /\b(?:from|join|into|update|delete\s+from)\s+"?([a-z_][a-z0-9_]*)"?/gi;
const CTE_RE = /\b(?:with(?:\s+recursive)?|,)\s+([a-z_][a-z0-9_]*)\s+as\s*\(/gi;
const SQL_KEYWORDS = new Set(['select','set','where','values','lateral','only','returning']);
const SYSTEM = new Set(['information_schema','dual']);
// Common non-table words the heuristic catches inside SQL-ish strings (columns,
// aggregate contexts, recursive-CTE artifacts, prose that slipped the SQL gate).
const STOPLIST = new Set([
  'acks','active','ancestors','correction_counts','created_at','descendants','expected_prev',
  'fingerprint_correction_json','history','hybrid','publication_date','skip','was','yields',
  // 'medline' is a substring of a description text literal ('...from MEDLINE') inside an
  // INSERT INTO literature_sources — not a table (confirmed triage 2026-07-30).
  'medline',
  // 'trend_data' is a CTE + output-column alias in regulatory-delta-radar-service.ts (the
  // real relation is innovation.delta_radar_scans); its CTE def and JOIN span separate
  // concatenated SQL fragments, so per-string CTE tracking can't pair them (triage 2026-07-30).
  'trend_data',
]);

const refs = new Map();
for (const f of walk(path.join(ROOT, 'server'), isProdTs)) {
  const src = fs.readFileSync(f, 'utf8');
  let b; BACKTICK_RE.lastIndex = 0;
  while ((b = BACKTICK_RE.exec(src))) {
    const sql = b[1];
    if (!SQLISH.test(sql)) continue;
    const ctes = new Set(); let c; CTE_RE.lastIndex = 0; while ((c = CTE_RE.exec(sql))) ctes.add(c[1].toLowerCase());
    let m; REF_RE.lastIndex = 0;
    while ((m = REF_RE.exec(sql))) {
      const name = m[1].toLowerCase();
      if (SQL_KEYWORDS.has(name) || SYSTEM.has(name) || STOPLIST.has(name) || ctes.has(name) || name.startsWith('pg_')) continue;
      if (/^\s*\(/.test(sql.slice(m.index + m[0].length))) continue; // FROM fn(...)
      if (!refs.has(name)) refs.set(name, new Set());
      refs.get(name).add(path.relative(ROOT, f));
    }
  }
}

const missing = [...refs.keys()].filter((t) => !created.has(t)).sort();

const BASELINE_PATH = path.join(ROOT, 'scripts', 'db', 'referenced-tables-baseline.json');
const readBaseline = () => {
  try { return new Set(JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).knownMissing ?? []); }
  catch { return new Set(); }
};

if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(
    BASELINE_PATH,
    JSON.stringify({
      _comment: 'Known referenced-but-uncreated table candidates (schema-contract debt). Each is either a genuinely missing table to create with a migration, or a relation created outside the repo (seed/extension) — triage per subsystem. The --check gate fails if a NEW name appears; removing entries here (after creating the table) ratchets the bar down. Goal: 0.',
      knownMissing: missing,
    }, null, 2) + '\n',
  );
  console.log(`Wrote baseline with ${missing.length} known candidates -> ${path.relative(ROOT, BASELINE_PATH)}`);
  process.exit(0);
}

if (process.argv.includes('--check')) {
  const baseline = readBaseline();
  const regressions = missing.filter((t) => !baseline.has(t));
  const resolved = [...baseline].filter((t) => !missing.includes(t));
  if (regressions.length) {
    console.error(`✖ NEW referenced-but-uncreated table(s) — add a migration (or fix the query):`);
    for (const t of regressions) console.error(`  ${t}  <- ${[...refs.get(t)][0]}`);
    console.error(`\nIf this is intentional/created-elsewhere, add it to ${path.relative(ROOT, BASELINE_PATH)} via --write-baseline.`);
    process.exit(1);
  }
  console.log(`✔ No new referenced-but-uncreated tables (${missing.length} known; baseline ${baseline.size}).`);
  if (resolved.length) console.log(`  ${resolved.length} baseline entr${resolved.length === 1 ? 'y is' : 'ies are'} now resolved — run --write-baseline to ratchet down: ${resolved.join(', ')}`);
  process.exit(0);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(missing.map((t) => ({ table: t, files: [...refs.get(t)] })), null, 2));
} else {
  console.log(`created relations: ${created.size}   referenced in SQL: ${refs.size}`);
  console.log(`\nREFERENCED IN SQL BUT NOT CREATED (${missing.length}) — triage each: real missing table, or created outside the repo:`);
  for (const t of missing) {
    const files = [...refs.get(t)];
    console.log(`\n  ${t}  (${files.length})`);
    for (const f of files.slice(0, 5)) console.log(`      ${f}`);
    if (files.length > 5) console.log(`      … +${files.length - 5} more`);
  }
}
