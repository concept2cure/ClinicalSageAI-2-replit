#!/usr/bin/env node
/**
 * A store that product code READS but nothing ever WRITES.
 *
 * ── Why this gate exists ──────────────────────────────────────────────────────
 * `evidence_claims`, `evidence_sources` and `evidence_claim_links` accumulated
 * SIX readers and never once acquired a writer. Nothing in the product inserts
 * into them, so every read returns an empty set — and empty sets were being
 * reported as findings. `programClaimsReport` answered "0 orphan claims, 0
 * contradicted claims", which reads as "this program's evidence is fully linked
 * and internally consistent" and reads exactly the same way when there is
 * nothing to link. That fed `evidence-sufficiency`, whose claim checks only ever
 * ADD findings, so the absence contributed nothing and the verdict came out as
 * though claim health had been examined and passed — a verdict that decides
 * whether a submission is cleared for approval.
 *
 * None of that was visible from any one file. It was only visible by asking a
 * question no one was asking: does anything write here?
 *
 * ── What it checks ────────────────────────────────────────────────────────────
 * For each drizzle table referenced in `server/` outside tests, whether the
 * codebase contains any write to it (`db.insert(x)`, `.update(x)`, `.delete(x)`,
 * or raw `INSERT INTO`/`UPDATE`). A table that is read and never written is
 * reported, and must be declared in the baseline with a REASON.
 *
 * A reason is required rather than a bare allowlist because "we know" is not the
 * same as "it is fine": writing down why forces the half-built-feature decision
 * to be made deliberately, instead of drifting for another six readers.
 *
 * ── What it deliberately does not do ──────────────────────────────────────────
 * It does not fail on a table that migrations or seeds populate — that is a real
 * write, just not from application code. Those belong in the baseline with that
 * as their reason. It also cannot see writes made through raw string
 * interpolation; this finds the common shape, not every shape, and says so
 * rather than implying completeness.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = path.join(repoRoot, 'scripts/ci/writerless-stores-baseline.json');
const LIST = process.argv.includes('--list');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name) && !/\.(test|spec|d)\.ts$/.test(e.name) && !p.includes('__tests__')) out.push(p);
  }
  return out;
}

/**
 * The set of real drizzle tables, read from the schema modules.
 *
 * Without this the scan matched every `.from(` in the tree — Array.from,
 * Buffer.from, a local named `unknown` — and reported 189 "stores", most of
 * which are not tables. A gate whose findings are mostly noise is one people
 * learn to skip, which is the failure mode this whole gate exists to prevent.
 */
function knownTables() {
  const out = new Set();
  const roots = [path.join(repoRoot, 'shared')];
  const stack = [...roots];
  while (stack.length) {
    const dir = stack.pop();
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p2 = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(p2); continue; }
      if (!/\.ts$/.test(e.name)) continue;
      const src = fs.readFileSync(p2, 'utf8');
      for (const m of src.matchAll(/export\s+const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*pgTable\(/g)) out.add(m[1]);
    }
  }
  return out;
}
const TABLES = knownTables();

const files = walk(path.join(repoRoot, 'server'));
const reads = new Map();   // table -> Set(file)
const inserts = new Set(); // table — something can CREATE a row here
const updates = new Set(); // table — something changes rows, which need not exist

const READ_RE  = /\.from\(\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;
const INSERT_RE = /\.insert\(\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;
const UPDATE_RE = /\.(?:update|delete)\(\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(repoRoot, f).split(path.sep).join('/');
  for (const m of src.matchAll(READ_RE)) {
    if (!TABLES.has(m[1])) continue; // not a table — Array.from and friends
    if (!reads.has(m[1])) reads.set(m[1], new Set());
    reads.get(m[1]).add(rel);
  }
  for (const m of src.matchAll(INSERT_RE)) if (TABLES.has(m[1])) inserts.add(m[1]);
  for (const m of src.matchAll(UPDATE_RE)) if (TABLES.has(m[1])) updates.add(m[1]);
}

// Raw SQL writes count too — a table written by a service using raw SQL is
// written, however it got there.
//
// AND SQL-SIDE WRITERS COUNT. Ledger L144 found that the audit-store inventory
// grepped TypeScript alone and produced a delete list 24 tables too long,
// because this codebase's Part 11 stores are written by SECURITY DEFINER
// functions and BEFORE INSERT hash-chain triggers defined in db/migrations/ —
// every store whose only writer is a database function read as dead. Its
// conclusion generalises: a liveness claim made from TypeScript alone is
// unsound here. So the migration trees are scanned as well, and a table with
// only a PL/pgSQL writer, or only a seed, is NOT reported. Erring permissive is
// the safe direction for a ratchet: a missed finding costs a later look, a
// false one costs the gate its credibility.
// Only a statement that can CREATE a row counts. An UPDATE against a table
// nothing inserts into can never match a row — five such writers on
// evidence_claims read as live for weeks and hid the table from this gate
// (ledger L22). Those tables are reported, flagged update-only.
const rawWriteNames = new Set();
const rawUpdateNames = new Set();
const sqlSources = [...files];
for (const root of ['migrations', 'db/migrations']) {
  const abs = path.join(repoRoot, root);
  if (!fs.existsSync(abs)) continue;
  const stack = [abs];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p2 = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p2);
      else if (/\.sql$/i.test(e.name)) sqlSources.push(p2);
    }
  }
}
for (const f of sqlSources) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/INSERT\s+INTO\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi)) rawWriteNames.add(m[1].toLowerCase());
  for (const m of src.matchAll(/UPDATE\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s+SET/gi)) rawUpdateNames.add(m[1].toLowerCase());
}
/** drizzle identifiers are camelCase; raw SQL is snake_case. Compare on snake. */
const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const findings = [];
for (const [table, readers] of reads) {
  if (inserts.has(table)) continue;
  if (rawWriteNames.has(snake(table))) continue;
  const updateOnly = updates.has(table) || rawUpdateNames.has(snake(table));
  findings.push({ table, readers: [...readers].sort(), updateOnly });
}
findings.sort((a, b) => a.table.localeCompare(b.table));

let baseline = { stores: {} };
if (fs.existsSync(BASELINE)) baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

if (LIST) {
  for (const f of findings) console.log(`${f.table}  (${f.readers.length} reader file(s))${f.updateOnly ? '  [update-only: nothing inserts, so no row can ever match]' : ''}\n    ${f.readers.join('\n    ')}`);
  console.log(`\n${findings.length} writerless store(s).`);
  process.exit(0);
}

if (process.argv.includes('--write-baseline')) {
  const stores = {};
  for (const f of findings) {
    stores[f.table] = baseline.stores?.[f.table] ?? { readerCount: f.readers.length, reason: 'TODO: why does nothing write here?' };
    stores[f.table].readerCount = f.readers.length;
  }
  fs.writeFileSync(BASELINE, JSON.stringify({
    $comment: 'Stores read by server code that nothing writes. Each needs a REASON — see scripts/ci/check-writerless-stores.mjs.',
    $generated: 'node scripts/ci/check-writerless-stores.mjs --write-baseline',
    stores,
  }, null, 2) + '\n');
  console.log(`[ci:writerless-stores] baseline written — ${findings.length} store(s).`);
  process.exit(0);
}

const known = baseline.stores ?? {};
const undeclared = findings.filter((f) => !known[f.table]);
// Recorded but not yet adjudicated. REPORTED, never failed on: the existing set
// was inherited, and failing the build on it would only invite twenty invented
// reasons — which is the same dishonesty in a different place. The ratchet is
// that the set may not GROW.
const unadjudicated = findings.filter((f) => known[f.table] && /^(TODO|NOT ADJUDICATED)/i.test(known[f.table].reason ?? ''));

if (undeclared.length === 0) {
  console.log(`[ci:writerless-stores] OK — ${findings.length} declared writerless store(s); no new ones.`);
  if (unadjudicated.length) {
    console.log(`  ${unadjudicated.length} still awaiting a decision (give it a writer, drop the readers, or record why):`);
    for (const f of unadjudicated) console.log(`    ${f.table} — ${f.readers.length} reader file(s)`);
  }
  process.exit(0);
}

console.error('\n[ci:writerless-stores] FAIL\n');
for (const f of undeclared) {
  console.error(`  ${f.table} is READ by ${f.readers.length} file(s) and written by nothing.`);
  for (const r of f.readers.slice(0, 4)) console.error(`      ${r}`);
}

console.error(`
  A store nothing writes returns an empty set to every reader, and an empty set
  is not a finding of "none". That is how "0 contradicted claims" came to mean
  "assessed and clean" on a table that has never held a row.

  Either give it a writer, drop the readers, or declare it in
  scripts/ci/writerless-stores-baseline.json with a real reason — not a TODO.
`);
process.exit(1);
