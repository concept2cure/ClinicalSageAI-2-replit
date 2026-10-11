#!/usr/bin/env node
/**
 * check-sql-interpolation.mjs — no NEW value interpolated into SQL text.
 *
 * ── Why (D3/D6, 2026-10-08) ──────────────────────────────────────────────────
 * Row-level security here is decided by session variables the runtime role
 * can set, so a statement an attacker controls can choose any tenant
 * (docs/security/C2C_TENANT_ISOLATION_PROOF.md §0). SQL injection is therefore
 * cross-tenant critical wherever it occurs, and nothing in CI looked for it.
 *
 * A value belongs in a bind parameter ($1, drizzle's sql`…${x}…`), never in
 * the SQL text. This gate counts, per server file, the expressions
 * interpolated into SQL text by the two forms it can see reliably:
 *
 *   - a template literal passed straight to `.query(` / `.query<T>(`;
 *   - `sql.raw(` (drizzle's escape hatch, which does not parameterize).
 *
 * Most of today's interpolations are safe: generated `$n` placeholder lists,
 * table names from code constants. The sweep that classified every one is
 * docs/evidence/D3/2026-10-08-sql-injection-sweep/. So this is a ratchet, not
 * a ban. Each file is frozen at its count in sql-interpolation-baseline.json.
 * A file that gains one fails: bind the value, or, for a genuine identifier,
 * route it through a fixed allowlist and raise the baseline in the same
 * change, saying why. A file that loses one must lower its baseline. New files
 * start at zero.
 *
 * Not seen (the selftest pins it as a known gap): SQL text assembled in a
 * variable first and passed to `.query(text)`, and string concatenation.
 *
 * Usage:
 *   node scripts/ci/check-sql-interpolation.mjs
 *   node scripts/ci/check-sql-interpolation.mjs --write-baseline   (only with a reason in the commit)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './lib/strip-comments.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:sql-interpolation]';
const BASELINE_PATH = path.join(repoRoot, 'scripts', 'ci', 'sql-interpolation-baseline.json');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '__tests__', '__mocks__']);
const isTestFile = (name) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(name);

/** @returns {string[]} repo-relative .ts/.js files under server/, tests excluded */
function walk(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(rel, acc);
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(e.name) && !isTestFile(e.name)) {
      acc.push(rel.split(path.sep).join('/'));
    }
  }
  return acc;
}

const QUERY_TEMPLATE = /\.query\s*(?:<[^>]*>)?\(\s*`([^`]*)`/g;
const SQL_RAW = /\bsql\.raw\(/g;

/** Interpolated expressions in SQL text, in one file's source. */
export function countInterpolations(source) {
  const text = stripComments(source);
  let n = 0;
  for (const m of text.matchAll(QUERY_TEMPLATE)) n += (m[1].match(/\$\{/g) || []).length;
  n += (text.match(SQL_RAW) || []).length;
  return n;
}

function scan() {
  const found = {};
  for (const rel of walk('server')) {
    const n = countInterpolations(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
    if (n) found[rel] = n;
  }
  return found;
}

const found = scan();

if (process.argv.includes('--write-baseline')) {
  const sorted = Object.fromEntries(Object.entries(found).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + '\n');
  const total = Object.values(sorted).reduce((a, b) => a + b, 0);
  console.log(`${TAG} baseline written: ${total} interpolation(s) in ${Object.keys(sorted).length} file(s).`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
} catch (err) {
  console.error(`${TAG} ❌ cannot read ${path.relative(repoRoot, BASELINE_PATH)}: ${err.message}`);
  process.exit(1);
}

const violations = [];
for (const [file, n] of Object.entries(found)) {
  const allowed = baseline[file] ?? 0;
  if (n > allowed) {
    violations.push(
      allowed === 0
        ? `${file}: ${n} value(s) interpolated into SQL text — not in the baseline`
        : `${file}: ${n} value(s) interpolated into SQL text, baseline allows ${allowed}`,
    );
  }
}
for (const [file, allowed] of Object.entries(baseline)) {
  const n = found[file] ?? 0;
  if (n < allowed) {
    violations.push(`${file}: now ${n} (baseline ${allowed}) — good news; lower the baseline to lock it in`);
  }
}

if (violations.length) {
  console.error(`${TAG} ❌ ${violations.length} problem(s):\n`);
  for (const v of violations) console.error(`  • ${v}`);
  console.error(
    '\n  A value in SQL TEXT is an injection waiting for an input. Pass it as a bind\n' +
      '  parameter ($1, or drizzle sql`…${x}…`, which parameterizes). For a genuine\n' +
      '  identifier (a table or column name), take it from a fixed allowlist in code,\n' +
      '  and raise this file\'s count in scripts/ci/sql-interpolation-baseline.json in\n' +
      '  the same change, with the reason in the commit. RLS does not contain injected\n' +
      '  SQL here (docs/security/C2C_TENANT_ISOLATION_PROOF.md §0).\n',
  );
  process.exit(1);
}

const total = Object.values(found).reduce((a, b) => a + b, 0);
console.log(
  `${TAG} OK — no new value interpolated into SQL text. ${total} baselined interpolation(s) in ` +
    `${Object.keys(found).length} file(s); the baseline may only shrink.`,
);
