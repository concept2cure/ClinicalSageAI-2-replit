#!/usr/bin/env node
/**
 * CI gate: server code must not run DDL on the runtime connection.
 *
 * ── WHY THIS EXISTS (2026-09-24, launch rows D1 / D2) ────────────────────────
 * Production connects as a non-owner, non-superuser runtime role (app_service,
 * D3). That role holds no CREATE on `public` and owns no table. PostgreSQL
 * checks those privileges BEFORE it looks at IF NOT EXISTS, so on the runtime
 * connection every one of these is refused — even when the object already
 * exists:
 *
 *     CREATE TABLE IF NOT EXISTS organizations (…)   permission denied for schema public
 *     CREATE INDEX IF NOT EXISTS … ON license_requests   must be owner of table license_requests
 *     ALTER TABLE license_requests ADD COLUMN IF NOT EXISTS …   must be owner of table license_requests
 *
 * (Measured on PostgreSQL 16 as app_service against a database provisioned by
 * scripts/db/provision.mjs — docs/evidence/W1/2026-09-24-launch-reach/.)
 *
 * On a developer machine the server connects as a superuser, so the same
 * statement succeeds. That makes this a class of defect that is invisible
 * everywhere except production, by construction:
 *
 *   - POST /api/auth/license-request, the enterprise onboarding intake, lost
 *     every request in production: its runtime CREATE TABLE was refused.
 *   - The GDPR service threw on its first call of every process; the AI
 *     provenance ledger and audit.tamper_proof_log reported success and wrote
 *     nothing (tests/db/gdpr-service-runtime-role.dbtest.ts records all three).
 *
 * Each was found and fixed by hand. Nothing stopped the next one, and three
 * guards (ci:unbacked-tables, ci:column-reachability, ci:migration-reachability)
 * count runtime DDL as a way a table gets created — which, on production's
 * connection, it is not. This gate stops the class at its source.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * Schema is created by an applier — a file in C2C_MIGRATION_FILES run by
 * scripts/db/deploy-migrate.mjs as the owner (CLAUDE.md RULE 1). Code under
 * server/ that issues DDL must either run on the OWNER connection (boot code
 * that opens it explicitly) or not issue DDL at all. Where a table might be
 * missing, VERIFY it (to_regclass) and fail loudly, as the GDPR service now
 * does; do not try to create it.
 *
 * ── WHAT COUNTS ──────────────────────────────────────────────────────────────
 * SQL-shaped DDL inside server/**\/*.{ts,js,mjs,cjs}, comments stripped:
 * CREATE / ALTER / DROP of a table, index, schema, extension, type, sequence,
 * view, function, trigger, policy or role, ALTER DEFAULT PRIVILEGES, and
 * GRANT / REVOKE of a privilege. The object keyword must be followed by an
 * identifier, so prose such as a prompt's "Create Table 2.7.4.1-1" (an ICH E3
 * caption) or a log line's "…attempt CREATE EXTENSION." is not DDL. Test files,
 * __tests__/, server/scripts/ and migrations/ directories are out of scope.
 *
 * ── THE BASELINE ─────────────────────────────────────────────────────────────
 * scripts/ci/runtime-ddl-baseline.json pins each existing file to its exact
 * statement count, and EVERY entry carries a written reason — an entry without
 * one fails. A new file with DDL fails; a baselined file with MORE statements
 * fails. Fewer is reported so the entry can be lowered or removed; --strict
 * makes that fatal too. There is no --write-baseline: the reason is the point.
 *
 * Usage:
 *   node scripts/ci/check-runtime-ddl.mjs [--strict] [--root <dir>] [--baseline <file>]
 * Exit 0 when nothing new, 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:runtime-ddl]';

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const STRICT = args.includes('--strict');
const SCAN_ROOT = path.resolve(argValue('--root', path.join(REPO_ROOT, 'server')));
const BASELINE_PATH = path.resolve(
  argValue('--baseline', path.join(REPO_ROOT, 'scripts/ci/runtime-ddl-baseline.json')),
);
/** Paths are reported relative to this, so a fixture root reads the same as the repo. */
const REPORT_BASE = path.resolve(argValue('--report-base', REPO_ROOT));

const SKIP_DIR = /(^|\/)(__tests__|node_modules|migrations?|fixtures)(\/|$)/;
const SKIP_FILE = /\.(test|spec|dbtest)\.[cm]?[jt]sx?$/;
const SOURCE_FILE = /\.[cm]?[jt]s$/;

/**
 * SQL-shaped DDL. Every alternative requires the object keyword to be followed
 * by an identifier (a letter, underscore, quote or `$` for an interpolation),
 * which is what separates `CREATE TABLE IF NOT EXISTS x` from prose.
 */
export const DDL = new RegExp(
  [
    String.raw`\bCREATE\s+(OR\s+REPLACE\s+)?(UNLOGGED\s+)?(UNIQUE\s+)?(TABLE|INDEX|SCHEMA|EXTENSION|TYPE|SEQUENCE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|TRIGGER|POLICY|ROLE)\s+(CONCURRENTLY\s+)?(IF\s+NOT\s+EXISTS\s+)?["a-zA-Z_$]`,
    String.raw`\bALTER\s+(TABLE|SCHEMA|POLICY|TYPE|SEQUENCE|ROLE|FUNCTION)\s+(IF\s+EXISTS\s+)?(ONLY\s+)?["a-zA-Z_$]`,
    String.raw`\bALTER\s+DEFAULT\s+PRIVILEGES\b`,
    String.raw`\bDROP\s+(TABLE|INDEX|SCHEMA|POLICY|TRIGGER|FUNCTION|VIEW|TYPE|SEQUENCE|ROLE|EXTENSION)\s+(IF\s+EXISTS\s+)?["a-zA-Z_$]`,
    String.raw`\b(GRANT|REVOKE)\s+(ALL|SELECT|INSERT|UPDATE|DELETE|USAGE|EXECUTE|CREATE|CONNECT|TEMP(ORARY)?|REFERENCES|TRIGGER|TRUNCATE)\b[^;\n]*\b(ON|TO|FROM)\b`,
  ].join('|'),
  'i',
);

/**
 * Blank out // and /* *\/ comments, keeping string and template literals (where
 * the SQL lives) and every newline (so line numbers survive).
 */
export function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    out += c;
    i += 1;
  }
  return out;
}

/** Every DDL statement in runtime server code: `{ file, line, statement }`. */
export function scanRuntimeDdl(root = SCAN_ROOT) {
  const hits = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(REPORT_BASE, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (!SKIP_DIR.test(`${rel}/`) && !rel.startsWith('server/scripts')) walk(full);
        continue;
      }
      if (!SOURCE_FILE.test(entry.name) || SKIP_FILE.test(entry.name)) continue;
      stripComments(fs.readFileSync(full, 'utf8'))
        .split('\n')
        .forEach((text, ix) => {
          const m = text.match(DDL);
          if (m) hits.push({ file: rel, line: ix + 1, statement: m[0].replace(/\s+/g, ' ').trim() });
        });
    }
  })(root);
  return hits;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return {};
  const raw = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  return raw.files ?? {};
}

function main() {
  const hits = scanRuntimeDdl();
  const counts = new Map();
  for (const h of hits) counts.set(h.file, (counts.get(h.file) ?? 0) + 1);
  const baseline = loadBaseline();

  const failures = [];
  const fewer = [];

  for (const [file, entry] of Object.entries(baseline)) {
    if (typeof entry?.reason !== 'string' || entry.reason.trim().length < 20) {
      failures.push(`baseline entry for ${file} has no written reason — the reason is the point of the entry`);
    }
  }

  for (const [file, n] of [...counts].sort()) {
    const entry = baseline[file];
    if (!entry) {
      const lines = hits.filter((h) => h.file === file).map((h) => `      ${file}:${h.line}  ${h.statement}`);
      failures.push(`${file} — ${n} DDL statement(s), not baselined:\n${lines.join('\n')}`);
    } else if (n > entry.count) {
      const lines = hits.filter((h) => h.file === file).map((h) => `      ${file}:${h.line}  ${h.statement}`);
      failures.push(`${file} — ${entry.count} → ${n}: the file gained DDL:\n${lines.join('\n')}`);
    } else if (n < entry.count) {
      fewer.push(`${file} — ${entry.count} → ${n}`);
    }
  }
  for (const file of Object.keys(baseline)) {
    if (!counts.has(file)) fewer.push(`${file} — ${baseline[file].count} → 0`);
  }

  console.log(
    `${TAG} ${hits.length} DDL statement(s) in ${counts.size} runtime server file(s); ` +
      `${Object.keys(baseline).length} baselined`,
  );

  if (fewer.length > 0) {
    console.log(`${TAG} ✅ ${fewer.length} baselined file(s) now issue LESS DDL — lower or remove their entries:`);
    for (const f of fewer) console.log(`    • ${f}`);
  }

  if (failures.length > 0 || (STRICT && fewer.length > 0)) {
    console.error(`\n${TAG} ❌ server code issues DDL on a connection production cannot run it on.\n`);
    for (const f of failures) console.error(`  ${f}\n`);
    if (STRICT && fewer.length > 0) console.error('  --strict: the baseline overstates the debt; lower the entries above.\n');
    console.error(
      '  Production\'s runtime role cannot CREATE in public and owns no table, and PostgreSQL\n' +
        '  checks that before IF NOT EXISTS — so this statement is refused in production even\n' +
        '  when the object exists, and succeeds on every developer machine. Create the object\n' +
        '  in a migration listed in C2C_MIGRATION_FILES (CLAUDE.md RULE 1). Where a table might\n' +
        '  be missing, verify it with to_regclass and fail loudly; never create it at runtime.\n',
    );
    process.exit(1);
  }
  console.log(`${TAG} ✅ no new runtime DDL.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
