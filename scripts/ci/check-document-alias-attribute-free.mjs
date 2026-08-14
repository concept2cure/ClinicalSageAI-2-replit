#!/usr/bin/env node
/**
 * CI gate: `c2c_document_aliases` holds identities and nothing else.
 *
 * The Document Identity Contract (docs/DOCUMENT_IDENTITY_CONTRACT_2026-08.md)
 * chose a narrow alias map over a document registry, and the reason matters
 * here. The registry was actually built once and reverted: by owning identity
 * AND metadata AND placement it competed with `unified_documents`,
 * `module_documents` and the submission core, all of which already own those
 * things. §3 of that document records the verdict — the failure mode is
 * inherent, not incidental. So the replacement is not "a registry, done more
 * carefully". It is a table that *cannot* own attributes.
 *
 * Nothing about a schema stops a column being added, and the way this fails is
 * not a decision to rebuild the registry. It is one reasonable-looking column
 * at a time: a `title` "just for debugging", a `status` "so we don't have to
 * join", a `ctd_section` "since we're here". Each is defensible alone and the
 * set is the reverted design. This gate is the thing that says no, once, to all
 * of them.
 *
 * WHAT IT CHECKS. Every CREATE TABLE / ALTER TABLE … ADD COLUMN touching
 * `c2c_document_aliases`, in every .sql file in the repo, may only introduce
 * columns from the fixed set below. A new column fails the build and names
 * itself; the fix is to put the attribute in the store that owns it.
 *
 * Usage:
 *   node scripts/ci/check-document-alias-attribute-free.mjs
 *   node scripts/ci/check-document-alias-attribute-free.mjs --json
 *
 * Exit code: 0 when the invariant holds, 1 on any violation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSON_MODE = process.argv.includes('--json');
const TABLE = 'c2c_document_aliases';

/** The complete set. Identity, tenancy, and when the link was made. Nothing
 *  that describes the document — that belongs to the store that owns it. */
const ALLOWED = new Set(['canonical_id', 'store', 'native_id', 'organization_id', 'created_at']);

const SEARCH_DIRS = ['migrations', 'db/migrations', 'scripts/db'];
const violations = [];
let filesScanned = 0;
let statementsChecked = 0;

/** Every .sql file under the migration roots. */
function sqlFiles() {
  const out = [];
  for (const dir of SEARCH_DIRS) {
    const abs = path.join(repoRoot, dir);
    if (!fs.existsSync(abs)) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith('.sql')) out.push(p);
      }
    };
    walk(abs);
  }
  return out;
}

/**
 * Column names introduced by a CREATE TABLE body.
 *
 * Deliberately lenient about SQL it cannot parse: this gate's job is to catch
 * an added attribute, and a parser that guessed at exotic syntax would produce
 * false failures in a check whose whole value is that a failure means
 * something. Table-level constraint clauses are skipped by keyword.
 */
const CONSTRAINT_KEYWORDS = /^(PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT|EXCLUDE|LIKE)\b/i;

function columnsFromCreateBody(body) {
  const cols = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      cols.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cols.push(current);
  return cols
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && !CONSTRAINT_KEYWORDS.test(c))
    .map((c) => c.split(/\s+/)[0].replace(/"/g, '').toLowerCase())
    .filter((c) => /^[a-z_][a-z0-9_]*$/.test(c));
}

/** Extract the parenthesised body of `CREATE TABLE … <table> (…)`. */
function createBodies(sql) {
  const bodies = [];
  const re = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:[a-z_]+\\.)?${TABLE}\\s*\\(`, 'gi');
  let m;
  while ((m = re.exec(sql)) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    let body = '';
    while (i < sql.length && depth > 0) {
      const ch = sql[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth > 0) body += ch;
      i++;
    }
    bodies.push(body);
  }
  return bodies;
}

for (const file of sqlFiles()) {
  const sql = fs.readFileSync(file, 'utf8');
  if (!sql.includes(TABLE)) continue;
  filesScanned++;
  const relPath = path.relative(repoRoot, file);

  for (const body of createBodies(sql)) {
    statementsChecked++;
    for (const col of columnsFromCreateBody(body)) {
      if (!ALLOWED.has(col)) {
        violations.push({ file: relPath, column: col, kind: 'CREATE TABLE' });
      }
    }
  }

  // ALTER TABLE … ADD COLUMN [IF NOT EXISTS] <name>
  const alterRe = new RegExp(
    `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:[a-z_]+\\.)?${TABLE}\\s+ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"?([a-z_][a-z0-9_]*)"?`,
    'gi',
  );
  let a;
  while ((a = alterRe.exec(sql)) !== null) {
    statementsChecked++;
    const col = a[1].toLowerCase();
    if (!ALLOWED.has(col)) {
      violations.push({ file: relPath, column: col, kind: 'ADD COLUMN' });
    }
  }
}

if (JSON_MODE) {
  console.log(JSON.stringify({ filesScanned, statementsChecked, violations }, null, 2));
} else if (violations.length === 0) {
  console.log(
    `\n[ci:document-alias-attribute-free] OK — ${statementsChecked} statement(s) across ` +
      `${filesScanned} file(s); ${TABLE} still holds identities only.\n`,
  );
} else {
  console.error(`\n[ci:document-alias-attribute-free] FAIL — ${violations.length} disallowed column(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.kind} adds \`${v.column}\` to ${TABLE}`);
  }
  console.error(
    `\n${TABLE} may hold only: ${[...ALLOWED].join(', ')}.\n\n` +
      'It is an identity map, not a registry. A registry that owned attributes was built here\n' +
      'once and reverted, because it competed with the stores that already own them\n' +
      '(docs/DOCUMENT_IDENTITY_CONTRACT_2026-08.md §3). Put the attribute in the store that\n' +
      "owns the document, and join. If this column really is an identity and not an attribute,\n" +
      'add it to ALLOWED in this file with a comment saying why.\n',
  );
}

process.exit(violations.length === 0 ? 0 : 1);
