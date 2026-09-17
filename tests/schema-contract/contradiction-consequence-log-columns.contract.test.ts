/**
 * Contract: every write to `contradiction_consequence_log` names columns the
 * table actually has, and the table has one definition, not two.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * One table, two creators, two names for its free-text column:
 *
 *   migrations/20260524_contradiction_engine_schema.sql:130   notes
 *   db/migrations/20260323_assumption_decision_contradiction.sql:291
 *                                                             execution_notes
 *
 * Nine INSERTs across three services write one name or the other:
 *
 *   notes             contradiction-consequence-service.ts  ×4
 *                     contradiction-engine-service.ts       ×1
 *   execution_notes   contradiction-resolution-orchestrator.ts ×4
 *
 * WHICH NAME A REAL DATABASE HAS IS NOT A COIN FLIP. The work order framed this
 * as two lineages — "whichever shape you have, four of nine writes fail" — and
 * that framing is wrong, because the deploy-migrate lineage cannot exist on its
 * own. `scripts/db/deploy-migrate.mjs` refuses an unprovisioned database:
 *
 *     ✗ This database has not been provisioned — refusing to migrate.
 *       Missing base tables: organizations, users, c2c_documents, ...
 *
 * So install-fresh provisions every database, its overlay applies
 * `migrations/20260524` (step 3 reads all of `migrations/*.sql`), and that file
 * creates the table with `notes`. `db/migrations/20260323` is in
 * C2C_MIGRATION_FILES at index 42 and runs later — but it is a
 * `CREATE TABLE IF NOT EXISTS` against a table that now exists, so it no-ops
 * and converges nothing. install-fresh never runs it directly: its step 6 psql
 * loop matches only `db/migrations/*_gcc_*`.
 *
 * The consequence is sharper than the work order's: every provisioned database
 * has `notes`, so it is always the SAME four writes that fail — the
 * orchestrator's — on every database, permanently. Verified by executing the
 * orchestrator's INSERT verbatim against a canonically provisioned database:
 *
 *     ERROR: column "execution_notes" of relation
 *            "contradiction_consequence_log" does not exist
 *
 * All nine sit inside `catch` blocks that discard the error, four with no log
 * line at all, and nothing in the repository ever SELECTs this table — so a
 * consequence that was never recorded is indistinguishable from one that was.
 *
 * ── THE SECOND DIVERGENCE: a default that invents an attribution ─────────────
 * The same two files disagree about `contradiction_findings.detected_by`:
 *
 *   20260524 (the one that wins)   detected_by TEXT
 *   20260323                       detected_by TEXT NOT NULL DEFAULT 'system'
 *
 * No code anywhere writes that column. On the shape that actually ships it is
 * therefore always NULL — while `mapFinding` reads it as
 * `row.detected_by as string` and `ContradictionFinding.detectedBy` is typed
 * `string`, a claim the data never satisfies. Had the other shape won, every
 * finding would instead assert it was detected by 'system' — an attribution
 * nothing recorded. Neither is acceptable; the column is nullable and the type
 * must say so.
 *
 * ── Mechanism ────────────────────────────────────────────────────────────────
 * PREPARE plans a statement without executing it, so an unknown column raises
 * 42703 with no writes and no fixtures. Statements are extracted from the
 * service SOURCE rather than restated here, so this gate cannot drift from the
 * code it guards.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../ui/_strip-comments';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The creator install-fresh applies, and therefore the shape every provisioned
 * database has. Self-contained: its only FKs are to tables it creates itself.
 */
const CANONICAL_CREATOR = 'migrations/20260524_contradiction_engine_schema.sql';
/** The creator on the replaying applier, which only ever no-ops against it. */
const SET_CREATOR = 'db/migrations/20260323_assumption_decision_contradiction.sql';

const WRITERS = [
  'server/services/resolution/contradiction-resolution-orchestrator.ts',
  'server/services/contradiction-consequence-service.ts',
  'server/services/contradiction-engine-service.ts',
];

/** SQL literals in a service that write the consequence log. */
function extractStatements(src: string): string[] {
  const code = stripComments(src);
  const LITERAL = /`([^`\\]*(?:\\.[^`\\]*)*)`|'([^'\\\n]*)'/gs;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = LITERAL.exec(code)) !== null) {
    const s = (m[1] ?? m[2] ?? '').trim();
    if (!/contradiction_consequence_log\b/.test(s)) continue;
    if (!/^\s*(INSERT|SELECT|UPDATE|DELETE|WITH)\b/i.test(s)) continue;
    // Interpolated fragments are not valid SQL standalone.
    if (/\$\{/.test(s)) continue;
    out.push(s);
  }
  return out;
}

let pg: PGlite;
const results: Array<{ file: string; sql: string; code?: string; message?: string }> = [];

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(fs.readFileSync(path.join(REPO_ROOT, CANONICAL_CREATOR), 'utf8'));

  let n = 0;
  for (const rel of WRITERS) {
    const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    for (const sql of extractStatements(src)) {
      try {
        await pg.exec(`PREPARE stmt_${n++} AS ${sql}`);
        results.push({ file: rel, sql });
      } catch (e) {
        const err = e as { code?: string; message?: string };
        results.push({ file: rel, sql, code: err.code, message: err.message });
      }
    }
  }
}, 120_000);

afterAll(async () => { await pg?.close(); });

const short = (s: string) => s.replace(/\s+/g, ' ').slice(0, 100);

describe('every consequence-log write names columns that exist', () => {
  it('found the writes to check, in all three services', () => {
    // A gate that silently stops extracting is a gate that always passes.
    expect(results.length).toBeGreaterThanOrEqual(9);
    for (const rel of WRITERS) {
      expect(results.some((r) => r.file === rel)).toBe(true);
    }
  });

  it('raises no 42703 — the orchestrator\'s four are the ones that did', () => {
    const undefinedColumn = results.filter((r) => r.code === '42703');
    expect(
      undefinedColumn.map((r) => `${path.basename(r.file)}: ${r.message} :: ${short(r.sql)}`),
    ).toEqual([]);
  });

  it('no write mentions execution_notes at all', () => {
    const offenders = results
      .filter((r) => /\bexecution_notes\b/.test(r.sql))
      .map((r) => `${path.basename(r.file)}: ${short(r.sql)}`);
    expect(offenders).toEqual([]);
  });
});

describe('the two creators agree about the table', () => {
  const canonical = fs.readFileSync(path.join(REPO_ROOT, CANONICAL_CREATOR), 'utf8');
  const set = fs.readFileSync(path.join(REPO_ROOT, SET_CREATOR), 'utf8');

  /** The column list of one CREATE TABLE block, in file order. */
  function columnsOf(sql: string, table: string): string[] {
    const m = new RegExp(
      `CREATE TABLE (?:IF NOT EXISTS )?${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
      'i',
    ).exec(sql);
    if (!m) return [];
    return m[1]
      .split('\n')
      .map((l) => stripComments(l).trim())
      .filter((l) => /^[a-z_]+\s+[A-Za-z]/.test(l))
      .filter((l) => !/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(l))
      .map((l) => l.split(/\s+/)[0]);
  }

  it('defines the same consequence-log columns in both files', () => {
    const a = columnsOf(canonical, 'contradiction_consequence_log');
    const b = columnsOf(set, 'contradiction_consequence_log');
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    // Was: `notes` on one side, `execution_notes` on the other.
    expect([...b].sort()).toEqual([...a].sort());
  });

  it('does not default detected_by to an attribution nothing recorded', () => {
    // 'system' is not a fact about the row; no code writes this column.
    for (const [name, sql] of [['canonical', canonical], ['set', set]] as const) {
      const line = sql.split('\n').find((l) => /^\s*detected_by\b/.test(l)) ?? '';
      expect(`${name}: ${line.trim()}`).not.toMatch(/DEFAULT\s+'system'/i);
      expect(`${name}: ${line.trim()}`).not.toMatch(/NOT NULL/i);
    }
  });
});
