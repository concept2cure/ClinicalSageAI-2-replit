/**
 * Contract: every SQL statement in server/routes/biopharma/programs.ts
 * references columns that actually exist on `regulatory_programs`.
 *
 * ── The bug this gate exists for ──────────────────────────────────────────────
 * All three handlers in that router selected five columns the table has never
 * had:
 *
 *   p.sponsor_name  p.lead_indication  p.filing_date
 *   p.pdufa_date    p.completion_percentage
 *
 * PostgreSQL rejects an unknown column at PLAN time (42703), so these were not
 * "usually fine" — every request to /api/biopharma, and to
 * /api/biopharma/:id, failed 100% of the time with 500 INTERNAL_ERROR. Observed
 * live against a fully provisioned database: `column p.sponsor_name does not
 * exist`.
 *
 * The canonical shape is shared/schema/programs.ts, and it disagrees on names,
 * not just presence: `indication`, `actual_submission_date`, `progress_percent`.
 * `pdufa_date` has no equivalent at all.
 *
 * A fourth defect hid behind the same file: GET /meetings was registered AFTER
 * GET /:id. Express matches in registration order, so `/meetings` bound
 * `id = 'meetings'` and never reached its own handler — and that handler was
 * itself querying `p.milestones`, another absent column, inside a catch that
 * returned `{meetings: []}`. A permanently empty meeting calendar that read as
 * "nothing scheduled". Both are covered below.
 *
 * ── Mechanism ─────────────────────────────────────────────────────────────────
 * PREPARE plans a statement without executing it, so an unknown column raises
 * 42703 with no fixtures and no writes. Statements are extracted from the router
 * SOURCE, so the gate cannot drift from the code it guards.
 *
 * The fixture DDL below is checked against the Drizzle definition column-for-
 * column before any statement is planned, so the harness cannot quietly agree
 * with a wrong router by being wrong in the same way.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { getTableColumns } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../ui/_strip-comments';
import { completeStatusSqlList } from '../../server/services/c2c/section-content';
import { regulatoryPrograms } from '../../shared/schema/programs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROUTER = path.join(REPO_ROOT, 'server/routes/biopharma/programs.ts');

/**
 * `regulatory_programs` as shared/schema/programs.ts defines it. Types are
 * loose on purpose — PREPARE only needs the column to exist and to be usable in
 * the expressions the router writes; the column SET is what the test below pins
 * to the Drizzle definition.
 */
const REGULATORY_PROGRAMS_DDL = `
  CREATE TABLE regulatory_programs (
    id uuid PRIMARY KEY,
    organization_id integer NOT NULL,
    name text NOT NULL,
    code varchar(50) NOT NULL,
    description text,
    program_type text NOT NULL,
    product_type text NOT NULL,
    device_class text,
    regulatory_path text,
    primary_agency text NOT NULL,
    target_agencies json,
    product_name text NOT NULL,
    product_code varchar(50),
    indication text,
    intended_use text,
    predicate_devices json,
    -- The device-level eSTAR administrative facts (WO-8 Phase 3). They live on
    -- the program because they describe the device, and the official FDA eSTAR
    -- reads them through estar-administrative-data. Listed here because this
    -- fixture is pinned to the Drizzle definition column-for-column below.
    common_name text,
    classification_name text,
    regulation_number text,
    associated_product_codes text,
    indications_for_use_citation text,
    equivalent_devices json,
    status text NOT NULL,
    phase text,
    priority text,
    target_submission_date timestamp,
    actual_submission_date timestamp,
    approval_date timestamp,
    progress_percent integer,
    completed_milestones integer,
    total_milestones integer,
    lead_user_id integer,
    team_members json,
    settings json,
    metadata json,
    tags json,
    created_by text,
    updated_by text,
    deleted_at timestamp,
    created_at timestamp NOT NULL,
    updated_at timestamp NOT NULL
  )`;

/** The tables this router joins. Only the joined columns matter for planning. */
const SUPPORTING_DDL = [
  `CREATE TABLE organizations (id serial PRIMARY KEY, name text)`,
  `CREATE TABLE program_milestones (
     id uuid PRIMARY KEY, program_id uuid, name text, description text,
     category text, target_date timestamp, actual_date timestamp,
     duration_days integer, status text, progress integer)`,
  `CREATE TABLE c2c_documents (
     id uuid PRIMARY KEY, project_id uuid, org_id integer, title text,
     doc_type text, agency text, status text, readiness integer,
     updated_at timestamp)`,
  `CREATE TABLE c2c_document_sections (
     id uuid PRIMARY KEY, document_id uuid, status text)`,
];

/**
 * SQL literals in the router, with its one interpolated fragment resolved.
 *
 * The router builds its SELECT lists from a shared `PROGRAM_FIELDS` constant so
 * the two handlers cannot disagree about the column mapping. That makes the
 * literals contain `${PROGRAM_FIELDS}`, which is not plannable as written — so
 * the constant is read from the same source file and substituted, rather than
 * restated here where it could drift.
 */
function extractStatements(src: string): string[] {
  const code = stripComments(src);

  const fieldsMatch = /const PROGRAM_FIELDS\s*=\s*`([\s\S]*?)`/.exec(code);
  if (!fieldsMatch) throw new Error('PROGRAM_FIELDS not found — extractor needs updating');
  const programFields = fieldsMatch[1];

  const out: string[] = [];
  const LITERAL = /`([^`\\]*(?:\\.[^`\\]*)*)`/gs;
  let m: RegExpExecArray | null;
  while ((m = LITERAL.exec(code)) !== null) {
    const raw = m[1] ?? '';
    if (!/^\s*SELECT\b/i.test(raw)) continue;
    let sql = raw.replace(/\$\{PROGRAM_FIELDS\}/g, programFields);
    // The list handler appends predicates and a LIMIT by index. Planning needs
    // a syntactically complete statement, so the remaining interpolations are
    // resolved to their static equivalents; the column references — the thing
    // under test — are untouched.
    sql = sql
      // completion_percentage is derived from the governed sections, and the
      // complete-status list is rendered from the single constant that
      // c2c-section-completion.contract.test.ts pins against the readiness
      // trigger. Substituting the REAL function keeps the gate planning exactly
      // what production runs, instead of a hard-coded copy that could drift.
      .replace(/\$\{completeStatusSqlList\(\)\}/g, completeStatusSqlList())
      .replace(/\$\{conditions\.join\([^)]*\)\}/g, 'p.organization_id = $1')
      .replace(/\$\$\{params\.length \+ 1\}/g, '$2')
      .replace(/\$\{params\.length \+ 1\}/g, '2');
    if (/\$\{/.test(sql)) continue;
    out.push(sql.trim());
  }
  return out;
}

let pg: PGlite;
let statements: string[] = [];
const results: Array<{ sql: string; code?: string; message?: string }> = [];

beforeAll(async () => {
  statements = extractStatements(fs.readFileSync(ROUTER, 'utf8'));

  pg = new PGlite();
  await pg.exec(REGULATORY_PROGRAMS_DDL);
  for (const ddl of SUPPORTING_DDL) await pg.exec(ddl);

  let n = 0;
  for (const sql of statements) {
    try {
      await pg.exec(`PREPARE bp_stmt_${n++} AS ${sql}`);
      results.push({ sql });
    } catch (e) {
      const err = e as { code?: string; message?: string };
      results.push({ sql, code: err.code, message: err.message });
    }
  }
}, 120_000);

afterAll(async () => {
  await pg?.close();
});

const short = (s: string) => s.replace(/\s+/g, ' ').slice(0, 120);

describe('biopharma/programs.ts SQL matches the schema', () => {
  it('the fixture table matches the Drizzle definition column-for-column', async () => {
    // Guards the guard. If the fixture drifted from shared/schema/programs.ts it
    // could plan a statement production would reject, and every assertion below
    // would be meaningless.
    const canonical = Object.values(getTableColumns(regulatoryPrograms))
      .map((c) => c.name)
      .sort();
    const fixture = (
      await pg.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'regulatory_programs' ORDER BY column_name`,
      )
    ).rows.map((r) => r.column_name);
    expect(fixture).toEqual(canonical);
  });

  it('extracts every SELECT in the router — the gate is not vacuous', () => {
    // Two handlers select programs, one selects meetings.
    expect(statements.length).toBeGreaterThanOrEqual(3);
  });

  it('no statement references a column its table does not have', () => {
    const undefinedColumn = results
      .filter((r) => r.code === '42703')
      .map((r) => `${r.message}\n    in: ${short(r.sql)}`);
    expect(undefinedColumn).toEqual([]);
  });

  it('no statement references a table that does not exist', () => {
    const undefinedTable = results
      .filter((r) => r.code === '42P01')
      .map((r) => `${r.message}\n    in: ${short(r.sql)}`);
    expect(undefinedTable).toEqual([]);
  });

  it('every extracted statement plans cleanly', () => {
    const failed = results
      .filter((r) => r.code)
      .map((r) => `[${r.code}] ${r.message}\n    in: ${short(r.sql)}`);
    expect(failed).toEqual([]);
  });
});

describe('biopharma route registration order', () => {
  it('registers /meetings before /:id so it is reachable', () => {
    // Express matches in registration order. With /:id first, a request for
    // /api/biopharma/meetings binds id='meetings' and the meetings handler is
    // dead code — which is exactly how it shipped.
    const src = stripComments(fs.readFileSync(ROUTER, 'utf8'));
    const meetings = src.indexOf(`router.get('/meetings'`);
    const byId = src.indexOf(`router.get('/:id'`);
    expect(meetings).toBeGreaterThan(-1);
    expect(byId).toBeGreaterThan(-1);
    expect(meetings).toBeLessThan(byId);
  });
});
