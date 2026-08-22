/**
 * @fileoverview Contract: document_span_lineage SQL ↔ Drizzle ↔ migration order.
 *
 * WHY THIS EXISTS
 * `persistTraceLinks` wrote an `updated_at` column that `evidence_links` never
 * had. TypeScript could not see it — the statement is a string — so every row
 * was rejected at runtime, the per-row catch counted it, and the caller
 * reported success. Sentence-level traceability persisted nothing for as long
 * as it existed while presenting itself as working.
 *
 * This table is the successor to that path, so the same drift is guarded
 * statically here, before it can happen: the columns in the migration, the
 * columns in the Drizzle definition, and the position of the migration in the
 * apply set are all asserted against each other. None of it needs a database.
 *
 * The ordering assertion is not incidental. `20260801_tenant_isolation_sweep`
 * applies tenant isolation to the tenant-scoped tables the set has created by
 * the time it runs. A tenant-scoped table registered AFTER the sweep is created
 * and never policied — it would exist, accept rows, and leak across tenants
 * with nothing failing. That is a silent multi-tenancy hole, which is why it is
 * checked here rather than left to review.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES, TENANT_ISOLATION_SWEEP } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = join(__dirname, '..', '..');
const MIGRATION = join(REPO_ROOT, 'db/migrations/20260803_document_span_lineage.sql');
const DRIZZLE = join(REPO_ROOT, 'shared/schema/document-span-lineage.ts');

const MIGRATION_PATH = 'db/migrations/20260803_document_span_lineage.sql';
// Imported rather than re-typed — see the note in tenant-isolation-sweep.contract.test.ts.
const SWEEP_PATH = TENANT_ISOLATION_SWEEP;

/**
 * SQL with `--` line comments removed.
 *
 * Required before any paren matching: the prose in this migration contains
 * unbalanced parens (the half-open interval is written `[char_start, char_end)`),
 * and counting those would close the CREATE TABLE body early — which is exactly
 * what happened when this test was first written, and what the "parsers actually
 * found something" assertion below caught.
 */
function strippedSql(): string {
  return readFileSync(MIGRATION, 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/** Column names declared by the CREATE TABLE body (top level only). */
function sqlColumns(): string[] {
  const sql = strippedSql();
  const start = sql.search(/CREATE TABLE IF NOT EXISTS\s+public\.document_span_lineage\s*\(/i);
  expect(start, 'CREATE TABLE not found').toBeGreaterThan(-1);

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

  const columns: string[] = [];
  let nested = 0;
  for (const raw of sql.slice(open + 1, end).split('\n')) {
    const line = raw.trim();
    if (nested === 0) {
      const m = line.match(/^([a-z_][a-z0-9_]*)\s+/i);
      // CONSTRAINT rows are not columns.
      if (m && !/^(constraint|primary|foreign|unique|check)$/i.test(m[1])) {
        columns.push(m[1].toLowerCase());
      }
    }
    for (const ch of line) {
      if (ch === '(') nested++;
      else if (ch === ')') nested--;
    }
  }
  return columns;
}

/** snake_case column names the Drizzle table maps to. */
function drizzleColumns(): string[] {
  const src = readFileSync(DRIZZLE, 'utf8');
  const start = src.indexOf("pgTable(");
  expect(start, 'pgTable( not found in the Drizzle module').toBeGreaterThan(-1);
  // Column declarations only — the index definitions below reference columns
  // through `table.x`, not through a type call, so they cannot be miscounted.
  return [
    ...src
      .slice(start)
      .matchAll(/\b(?:uuid|text|integer|real|timestamp)\(\s*'([a-z_0-9]+)'/g),
  ].map((m) => m[1]);
}

describe('document_span_lineage — SQL ↔ Drizzle column parity', () => {
  it('the parsers actually found something', () => {
    // Without this, every assertion below could pass vacuously.
    expect(sqlColumns().length).toBeGreaterThan(15);
    expect(drizzleColumns().length).toBeGreaterThan(15);
  });

  it('every SQL column exists in the Drizzle definition', () => {
    const missing = sqlColumns().filter((c) => !drizzleColumns().includes(c));
    expect(
      missing,
      `Columns in the migration but absent from the Drizzle table: ${missing.join(', ')}. ` +
        `Drizzle queries would never read or write them.`
    ).toEqual([]);
  });

  it('every Drizzle column exists in the SQL', () => {
    const extra = drizzleColumns().filter((c) => !sqlColumns().includes(c));
    expect(
      extra,
      `Columns in the Drizzle table but absent from the migration: ${extra.join(', ')}. ` +
        `Every statement touching them fails against a real database — the exact ` +
        `failure mode that hid in evidence_links.`
    ).toEqual([]);
  });
});

describe('document_span_lineage — the constraints that make a row meaningful', () => {
  const sql = () => readFileSync(MIGRATION, 'utf8');

  it('a span must be non-empty and non-negative', () => {
    expect(sql()).toMatch(/CHECK\s*\(\s*char_start\s*>=\s*0\s+AND\s+char_end\s*>\s*char_start\s*\)/i);
  });

  it('each provenance kind must carry its own evidence', () => {
    // The heart of it: a row cannot record that a claim exists while saying
    // nothing about where it came from. A source citation needs a reference and
    // a checksum; an author assertion needs an author and a time.
    const body = sql();
    expect(body).toContain('document_span_lineage_kind_shape');
    expect(body).toMatch(/provenance_kind\s*=\s*'cre_evidence_source'[\s\S]*?reference_id IS NOT NULL/);
    expect(body).toMatch(/provenance_kind\s*=\s*'cre_evidence_source'[\s\S]*?payload_sha256 IS NOT NULL/);
    expect(body).toMatch(/provenance_kind\s*=\s*'author_assertion'[\s\S]*?asserted_by IS NOT NULL/);
    expect(body).toMatch(/provenance_kind\s*=\s*'author_assertion'[\s\S]*?asserted_at IS NOT NULL/);
  });

  it('the unique index gives ON CONFLICT something to conflict on', () => {
    // evidence_links carries ON CONFLICT DO NOTHING with no matching
    // constraint, so re-persisting duplicates rather than reconciles.
    const body = sql();
    expect(body).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS\s+document_span_lineage_unique_link/i);
    // NULLs compare distinct, so the nullable discriminators must be COALESCEd
    // or the constraint silently does not apply to author assertions.
    expect(body).toMatch(/COALESCE\(reference_id, ''\)/);
    expect(body).toMatch(/COALESCE\(asserted_by, ''\)/);
  });

  it('both read directions are indexed', () => {
    const body = sql();
    // Forward: what backs this span. Backward: where is this source used.
    expect(body).toContain('document_span_lineage_span_idx');
    expect(body).toContain('document_span_lineage_reference_idx');
    // Propagation: which spans are against superseded source content.
    expect(body).toContain('document_span_lineage_payload_idx');
  });
});

describe('document_span_lineage — apply-set position', () => {
  /**
   * Position is read from the LIST, not from byte offsets in its source file.
   *
   * This used to `readFileSync` migration-set.mjs and compare `indexOf` of the
   * two quoted paths. That is a proxy for apply order, and a brittle one: it
   * breaks the moment an entry stops being a bare string literal — as happened
   * when the sweep's path became an exported constant so four files could stop
   * re-typing it — and it would just as happily pass on a path that appears
   * only inside a comment. The array is the thing that determines apply order,
   * so the array is what gets measured.
   */
  it('is registered in the apply set', () => {
    // A migration nothing applies is not a migration; the table would exist
    // only in the Drizzle definition and every query against it would fail.
    expect(C2C_MIGRATION_FILES).toContain(MIGRATION_PATH);
  });

  it('is registered BEFORE the tenant-isolation sweep', () => {
    const mine = C2C_MIGRATION_FILES.indexOf(MIGRATION_PATH);
    const sweep = C2C_MIGRATION_FILES.indexOf(SWEEP_PATH);
    expect(mine, 'this migration is not in the apply set').toBeGreaterThan(-1);
    expect(sweep, 'the tenant-isolation sweep is not in the apply set').toBeGreaterThan(-1);
    expect(
      mine,
      `document_span_lineage must be applied BEFORE ${SWEEP_PATH}. The sweep policies ` +
        `the tenant-scoped tables that exist when it runs; registered after it, this ` +
        `table is created and never isolated — it would accept rows and leak across ` +
        `tenants with nothing failing.`
    ).toBeLessThan(sweep);
  });
});
