/**
 * @fileoverview Contract: persistTraceLinks' INSERT must match the evidence_links DDL.
 *
 * WHY THIS EXISTS
 * `persistTraceLinks` wrote `updated_at` into `evidence_links`, a column that
 * table has never had. Postgres rejected every row; the per-row `catch`
 * counted the rejection as `errors++` and moved on, and the audit route
 * returned `success: true` regardless. The result was a sentence-level
 * traceability path that had never persisted a single link while presenting
 * itself as working — the failure mode that matters most in a 21 CFR Part 11
 * system, because absent traceability is visible and false traceability is not.
 *
 * A column list is exactly the kind of thing a type checker cannot see: the SQL
 * is a string, and the mismatch only surfaces against a live database. This test
 * closes that gap statically — it reads the column names out of the migration
 * that creates the table and the column list out of the INSERT, and asserts the
 * second is a subset of the first. No database required, so it runs everywhere.
 *
 * If you add a column to the INSERT, add it to the table in a numbered
 * migration. If this test fails, the INSERT would fail against a real database.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const DDL_FILE = join(REPO_ROOT, 'migrations', '20260524_program_workbench_schema.sql');
const SERVICE_FILE = join(REPO_ROOT, 'server', 'services', 'sentenceTraceabilityService.ts');

/** Column names declared by `CREATE TABLE evidence_links (...)`. */
function ddlColumns(): string[] {
  const sql = readFileSync(DDL_FILE, 'utf8');
  const start = sql.search(/CREATE TABLE IF NOT EXISTS\s+evidence_links\s*\(/i);
  expect(start, 'evidence_links CREATE TABLE not found in migration').toBeGreaterThan(-1);

  // Walk parens from the opening one so we stop at the table's own closer
  // rather than at a nested REFERENCES(...) or DEFAULT expression.
  const open = sql.indexOf('(', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  expect(end, 'unterminated CREATE TABLE body').toBeGreaterThan(open);

  const body = sql.slice(open + 1, end);
  const columns: string[] = [];
  let depthInBody = 0;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    // A column definition starts at the top level of the table body; a line
    // inside a multi-line REFERENCES/CHECK continuation does not.
    if (depthInBody === 0) {
      const m = line.match(/^([a-z_][a-z0-9_]*)\s+/i);
      if (m && !/^(constraint|primary|foreign|unique|check)$/i.test(m[1])) {
        columns.push(m[1].toLowerCase());
      }
    }
    for (const ch of line) {
      if (ch === '(') depthInBody++;
      else if (ch === ')') depthInBody--;
    }
  }
  return columns;
}

/** Column list from the `INSERT INTO evidence_links (...)` in the service. */
function insertColumns(): string[] {
  const src = readFileSync(SERVICE_FILE, 'utf8');
  const m = src.match(/INSERT INTO evidence_links\s*\(([\s\S]*?)\)\s*VALUES/i);
  expect(m, 'INSERT INTO evidence_links not found in sentenceTraceabilityService').toBeTruthy();
  return m![1]
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

describe('persistTraceLinks ↔ evidence_links column contract', () => {
  it('every column the INSERT writes exists on the table', () => {
    const declared = ddlColumns();
    const written = insertColumns();

    // Guard the parsers themselves: if either returns nothing, the assertion
    // below would pass vacuously and this test would protect nothing.
    expect(declared.length, 'parsed no columns from the DDL').toBeGreaterThan(5);
    expect(written.length, 'parsed no columns from the INSERT').toBeGreaterThan(5);

    const missing = written.filter((c) => !declared.includes(c));
    expect(
      missing,
      `INSERT writes column(s) that evidence_links does not have: ${missing.join(', ')}. ` +
        `Every such row is rejected by Postgres at runtime. Either drop the column ` +
        `from the INSERT or add it to the table in a numbered migration.`
    ).toEqual([]);
  });

  it('does not write updated_at, which this table has never had', () => {
    // The specific regression. Kept as its own case so a reintroduction names
    // itself in the failure output instead of hiding in the generic subset check.
    expect(insertColumns()).not.toContain('updated_at');
    expect(ddlColumns()).not.toContain('updated_at');
  });

  it('records the sentence span so a link can be resolved back to its text', () => {
    // target_id carries "<documentId>:s<index>" and target_path "char:<start>-<end>".
    // Without both, a persisted link cannot be located in the document it describes.
    const written = insertColumns();
    expect(written).toContain('target_id');
    expect(written).toContain('target_path');
    expect(written).toContain('evidence_id');
  });
});
