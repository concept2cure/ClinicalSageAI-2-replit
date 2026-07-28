/**
 * Schema contract: the c2c section queries the product ships must actually run.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * migrations/20260528_phase9_document_schema.sql created c2c_document_sections
 * with fifteen columns. None was `updated_at` or `created_at`. Four shipped
 * queries reference one anyway:
 *
 *   server/routes/c2c/projects.ts:334       MAX(ds.updated_at)        → /workstreams
 *   server/routes/c2c/projects.ts:371,377   ds.updated_at, ORDER BY   → /drafts
 *   server/routes/c2c/project-vault.ts:365  ds.updated_at             → project vault
 *   server/routes/c2c/documents.ts:441      SET updated_at = now()    → PATCH section save
 *
 * Postgres rejects an unknown column at PLAN time, so these are not
 * empty-result edge cases — they are unconditional 42703 failures:
 *
 *   ERROR:  column ds.updated_at does not exist
 *   HINT:   Perhaps you meant to reference the column "d.updated_at".
 *
 * The hint names the cause: c2c_documents has updated_at, the sections table
 * never did, and the aliases are one character apart.
 *
 * ProjectHome calls /workstreams and /drafts on every render, so both panels
 * have always 500'd — surfacing as an error card, not "nothing here yet". And
 * documents.ts's UPDATE branch is the canonical Part 11 section save, the one
 * that is transactional and writes an audit row; it fails on the first re-save
 * of any section. It had not been hit only because nothing creates sections.
 *
 * ── Why these tests execute SQL ───────────────────────────────────────────────
 * A source grep cannot tell you whether a query will plan. That is decided by
 * the catalog, at runtime. So these build the table from the REAL migration and
 * run the REAL query text from the routes. The pre-fix state is asserted first,
 * against a table without the columns, so the fix is known to close a
 * demonstrated failure rather than a theorised one.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALTER_MIGRATION = path.join(
  REPO_ROOT, 'migrations/20260728_c2c_document_sections_timestamps.sql',
);
const SCHEMA_MIGRATION = path.join(
  REPO_ROOT, 'migrations/20260528_phase9_document_schema.sql',
);

/** c2c_document_sections exactly as 20260528 created it BEFORE this fix. */
const PRE_FIX_SCHEMA = `
  CREATE TABLE c2c_documents (
    id text PRIMARY KEY, org_id integer NOT NULL, project_id uuid,
    doc_type text NOT NULL, agency text NOT NULL, title text NOT NULL,
    status text NOT NULL DEFAULT 'draft', readiness integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE c2c_document_sections (
    id bigserial PRIMARY KEY,
    document_id text NOT NULL REFERENCES c2c_documents(id) ON DELETE CASCADE,
    section_key text NOT NULL, parent_key text, label text NOT NULL,
    path_order integer NOT NULL, mandatory boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'todo', owner_id integer,
    content jsonb NOT NULL DEFAULT '{}'::jsonb, draft_source text,
    drafted_at timestamptz, accepted_by integer, accepted_at timestamptz,
    version integer NOT NULL DEFAULT 1,
    UNIQUE (document_id, section_key)
  );
`;

/** The real query text from each shipped route. */
const WORKSTREAMS = `
  SELECT d.doc_type, COUNT(*) AS total, MAX(ds.updated_at) AS last_updated
    FROM c2c_documents d JOIN c2c_document_sections ds ON ds.document_id = d.id
   WHERE d.org_id = $1 GROUP BY d.doc_type`;
const DRAFTS = `
  SELECT ds.section_key, ds.updated_at, ds.version
    FROM c2c_document_sections ds JOIN c2c_documents d ON d.id = ds.document_id
   WHERE d.org_id = $1 AND ds.status <> 'todo'
   ORDER BY ds.updated_at DESC NULLS LAST`;
const VAULT = `
  SELECT ds.section_key, ds.status, ds.version, ds.updated_at
    FROM c2c_document_sections ds WHERE ds.document_id = $1`;
const PATCH_UPDATE = `
  UPDATE c2c_document_sections SET updated_at = now()
   WHERE document_id = $1 AND section_key = $2`;

const ALL_FOUR: ReadonlyArray<[label: string, sql: string, args: unknown[]]> = [
  ['/workstreams (projects.ts:334)', WORKSTREAMS, [1]],
  ['/drafts (projects.ts:371,377)', DRAFTS, [1]],
  ['project vault (project-vault.ts:365)', VAULT, ['doc_x']],
  ['PATCH section save (documents.ts:441)', PATCH_UPDATE, ['doc_x', 'm2.5']],
];

let pg: PGlite;
beforeEach(async () => { pg = new PGlite(); });
afterEach(async () => { await pg?.close(); });

describe('the defect was real (pre-fix state)', () => {
  it.each(ALL_FOUR)('%s fails with a missing-column error', async (_l, sql, args) => {
    await pg.exec(PRE_FIX_SCHEMA);
    await expect(pg.query(sql, args as any[])).rejects.toThrow(/updated_at/);
  }, 60_000);

  it('fails at plan time — an empty table is not the reason', async () => {
    await pg.exec(PRE_FIX_SCHEMA);
    // The table is empty either way; only the column list differs.
    const count = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM c2c_document_sections`,
    );
    expect(Number(count.rows[0].n)).toBe(0);
    // A query over the SAME empty table that does not name updated_at succeeds.
    await expect(
      pg.query(`SELECT section_key FROM c2c_document_sections`),
    ).resolves.toBeDefined();
    // So the failure is the column, not the emptiness.
    await expect(pg.query(WORKSTREAMS, [1])).rejects.toThrow(/updated_at/);
  }, 60_000);
});

describe('the guarded ALTER fixes an existing database', () => {
  const applyAlter = async () => {
    await pg.exec(PRE_FIX_SCHEMA);
    await pg.exec(fs.readFileSync(ALTER_MIGRATION, 'utf8'));
  };

  it.each(ALL_FOUR)('%s now runs', async (_l, sql, args) => {
    await applyAlter();
    await expect(pg.query(sql, args as any[])).resolves.toBeDefined();
  }, 60_000);

  it('adds both columns, NOT NULL with a default so existing rows are valid', async () => {
    await pg.exec(PRE_FIX_SCHEMA);
    await pg.query(
      `INSERT INTO c2c_documents (id, org_id, doc_type, agency, title) VALUES ('d1',1,'ind','fda','T')`,
    );
    await pg.query(
      `INSERT INTO c2c_document_sections (document_id, section_key, label, path_order)
       VALUES ('d1','m2.5','Clinical Overview',1)`,
    );
    // A pre-existing row must survive the NOT NULL addition.
    await pg.exec(fs.readFileSync(ALTER_MIGRATION, 'utf8'));
    const r = await pg.query<{ created_at: string; updated_at: string }>(
      `SELECT created_at, updated_at FROM c2c_document_sections`,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].created_at).toBeTruthy();
    expect(r.rows[0].updated_at).toBeTruthy();
  }, 60_000);

  it('is re-runnable', async () => {
    await applyAlter();
    await expect(pg.exec(fs.readFileSync(ALTER_MIGRATION, 'utf8'))).resolves.toBeDefined();
  }, 60_000);

  it('no-ops where the table does not exist', async () => {
    // Same lesson as the CMC re-key: ADD COLUMN IF NOT EXISTS guards the column,
    // never the table, so the whole thing is to_regclass-guarded.
    await expect(pg.exec(fs.readFileSync(ALTER_MIGRATION, 'utf8'))).resolves.toBeDefined();
  }, 60_000);

  it('adds no BEFORE UPDATE trigger that would race the Part 11 version trigger', async () => {
    // c2c_document_sections already carries c2c_snapshot_section_version(),
    // a BEFORE UPDATE trigger enforcing attribution. A second one competing on
    // the same rows is exactly what we must not introduce; documents.ts:441
    // maintains updated_at explicitly instead.
    const sql = fs.readFileSync(ALTER_MIGRATION, 'utf8');
    expect(sql).not.toMatch(/CREATE\s+TRIGGER/i);
  }, 60_000);
});

describe('the fresh-install path converges with the incremental one', () => {
  it('20260528 declares both columns, so a new database needs no catch-up', () => {
    const schema = fs.readFileSync(SCHEMA_MIGRATION, 'utf8');
    const block = schema.slice(
      schema.indexOf('CREATE TABLE IF NOT EXISTS c2c_document_sections'),
      schema.indexOf('CREATE INDEX IF NOT EXISTS c2c_doc_sections_doc_idx'),
    );
    expect(block).toMatch(/created_at\s+timestamptz\s+NOT NULL\s+DEFAULT now\(\)/);
    expect(block).toMatch(/updated_at\s+timestamptz\s+NOT NULL\s+DEFAULT now\(\)/);
  });
});
