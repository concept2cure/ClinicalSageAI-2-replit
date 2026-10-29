/**
 * migrations/20260505_saved_precedent_queries.sql, amended in place 2026-10-29:
 * the organisation's saved queries now hold Vault saved views as well as
 * precedent searches (D2, P-46; docs/design/VAULT_SAVED_VIEWS_2026-10-29.md
 * §3.2, test T1).
 *
 * Every deploy replays the file (CLAUDE.md Rule 1), so it is applied three
 * times on each of the three shapes a deployed database can hold today:
 *   (a) pushed: drizzle push's shape at the time (scope json, naive timestamps);
 *   (b) SQL:    the file's own original CREATE (scope jsonb, naive timestamps);
 *   (c) empty:  no table at all.
 * Precedent rows keep their content and read as what they already were. A Vault
 * row can hold parameters only, and a project view only its own organisation's
 * project. Real DDL for regulatory_programs (20260524).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../scripts/db/migration-set.mjs';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const FILE = 'migrations/20260505_saved_precedent_queries.sql';
const PROGRAMS = 'migrations/20260524_program_workbench_schema.sql';

const P1 = '11111111-1111-4111-8111-111111111111'; // organisation 1
const P2 = '22222222-2222-4222-8222-222222222222'; // organisation 2
const NAIVE = '2026-05-05 10:00:00';

const PUSHED_DDL = `CREATE TABLE saved_precedent_queries (
  id serial PRIMARY KEY, organization_id integer NOT NULL REFERENCES organizations(id), user_id integer REFERENCES users(id),
  label text NOT NULL, query text NOT NULL, scope json, hits integer NOT NULL DEFAULT -1, last_run_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now());
  CREATE INDEX spq_org_idx ON saved_precedent_queries (organization_id);
  CREATE INDEX spq_user_idx ON saved_precedent_queries (user_id);`;
const SQL_DDL = PUSHED_DDL.replace('scope json,', 'scope jsonb,');

const dbs: PGlite[] = [];
afterAll(async () => { for (const d of dbs) await d.close(); });

async function freshDb(start: 'pushed' | 'sql' | 'empty', withPrograms = true) {
  const db = new PGlite();
  dbs.push(db);
  await db.exec(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT); CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);
                 INSERT INTO organizations (id, name) VALUES (1, 'one'), (2, 'two'); INSERT INTO users (id, name) VALUES (5, 'a'), (6, 'b');`);
  if (withPrograms) {
    await db.exec(read(PROGRAMS));
    for (const [id, org, name] of [[P1, 1, 'Alpha'], [P2, 2, 'Beta']] as const) {
      await db.query(
        `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name)
         VALUES ($1, $2, $3, $4, 'IND', 'drug', 'FDA', $5)`, [id, org, name, name, name]);
    }
  }
  if (start !== 'empty') {
    await db.exec(start === 'pushed' ? PUSHED_DDL : SQL_DDL);
    await db.query(`INSERT INTO saved_precedent_queries (organization_id, user_id, label, query, scope, created_at, updated_at)
                    VALUES (1, NULL, 'Dupe', 'q1', NULL, $1, $1), (1, 5, 'Dupe', 'q2', '{"pathway":"510k"}', $1, $1)`, [NAIVE]);
  }
  return db;
}

const columns = async (db: PGlite) => Object.fromEntries((await db.query<{ column_name: string; data_type: string }>(
  `SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'saved_precedent_queries' ORDER BY column_name`)).rows.map((r) => [r.column_name, r.data_type]));
const constraints = async (db: PGlite) => (await db.query<{ conname: string }>(
  `SELECT conname FROM pg_constraint WHERE conrelid = 'public.saved_precedent_queries'::regclass AND conname LIKE 'spq_%' ORDER BY conname`)).rows.map((r) => r.conname);
const relfilenode = async (db: PGlite) => (await db.query<{ relfilenode: number }>(
  `SELECT relfilenode FROM pg_class WHERE oid = 'public.saved_precedent_queries'::regclass`)).rows[0].relfilenode;
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));

const vault = (db: PGlite, over: Record<string, unknown> = {}) => {
  const row = {
    organization_id: 1, user_id: 5, label: 'My view', query: '', surface: 'vault', visibility: 'private', program_id: null as string | null,
    scope: JSON.stringify({ v: 1, filters: { documentType: ['CSR'] }, includeSuperseded: false }), hits: -1, last_run_at: null as string | null,
    ...over,
  };
  return db.query(
    `INSERT INTO saved_precedent_queries (organization_id, user_id, label, query, surface, visibility, program_id, scope, hits, last_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10) RETURNING id`,
    [row.organization_id, row.user_id, row.label, row.query, row.surface, row.visibility, row.program_id, row.scope, row.hits, row.last_run_at]);
};

describe('the file is on the deploy path', () => {
  it('is in C2C_MIGRATION_FILES, after regulatory_programs\' creator and before the tenant tail', () => {
    const set = C2C_MIGRATION_FILES as unknown[];
    const at = set.indexOf(FILE);
    expect(at, 'listed').toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(set.indexOf(PROGRAMS));
    expect(at).toBeLessThan(set.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC));
  });
});

describe.each(['pushed', 'sql', 'empty'] as const)('replayed three times from the %s shape', (start) => {
  it('reaches one shape, keeps precedent rows as they were, and the third replay changes nothing', async () => {
    const db = await freshDb(start);
    await db.exec(read(FILE));
    const first = { cols: await columns(db), cons: await constraints(db) };
    await db.exec(read(FILE));
    const node = await relfilenode(db);
    await db.exec(read(FILE));
    expect({ cols: await columns(db), cons: await constraints(db) }).toEqual(first);
    expect(await relfilenode(db), 'the type blocks are no-ops once applied').toBe(node);
    expect(first.cols).toMatchObject({
      scope: 'jsonb', created_at: 'timestamp with time zone', updated_at: 'timestamp with time zone',
      last_run_at: 'timestamp with time zone', surface: 'text', visibility: 'text', program_id: 'uuid', updated_by: 'integer',
    });
    expect(first.cons).toEqual(['spq_precedent_shape', 'spq_program_same_org_fk', 'spq_surface_known', 'spq_vault_view_shape', 'spq_visibility_known']);
    if (start !== 'empty') {
      const rows = (await db.query<{ surface: string; visibility: string; program_id: string | null; created: string; scope: unknown }>(
        `SELECT surface, visibility, program_id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS created, scope
           FROM saved_precedent_queries ORDER BY id`)).rows;
      expect(rows).toEqual([
        { surface: 'precedent', visibility: 'org_public', program_id: null, created: NAIVE, scope: null },
        { surface: 'precedent', visibility: 'org_public', program_id: null, created: NAIVE, scope: { pathway: '510k' } },
      ]);
    }
  });
});

describe('a Vault row holds parameters only, and only its own organisation\'s project', () => {
  it('refuses every shape that is not a saved view', async () => {
    const db = await freshDb('pushed');
    await db.exec(read(FILE));
    const refused: Array<[string, Record<string, unknown>]> = [
      ['a stored count', { hits: 3 }],
      ['a stored run time', { last_run_at: '2026-10-29T00:00:00Z' }],
      ['no owner', { user_id: null }],
      ['no scope', { scope: null }],
      ['a scope with no filters', { scope: JSON.stringify({ v: 1, includeSuperseded: false }) }],
      ['a scope holding a count', { scope: JSON.stringify({ v: 1, filters: {}, includeSuperseded: false, hits: 4 }) }],
      ['a filter outside the seven parameters', { scope: JSON.stringify({ v: 1, filters: { programId: ['x'] }, includeSuperseded: false }) }],
      ['a folder in a library view', { scope: JSON.stringify({ v: 1, filters: { folderId: ['module-3'] }, includeSuperseded: false }) }],
      ['a blank label', { label: '   ' }],
      ['an over-long label', { label: 'x'.repeat(121) }],
      ['an over-long query', { query: 'q'.repeat(501) }],
      ['an unknown surface', { surface: 'x' }],
      ['an unknown visibility', { visibility: 'personal' }],
      ['a precedent row that is private', { surface: 'precedent', visibility: 'private' }],
      ['a precedent row naming a project', { surface: 'precedent', visibility: 'org_public', program_id: P1 }],
    ];
    for (const [why, over] of refused) expect(await code(vault(db, over)), why).toBe('23514');
    expect(await code(vault(db, { program_id: P2 })), 'another organisation\'s project').toBe('23503');
  });

  it('accepts a library view and a project view, and deleting the project takes only its views', async () => {
    const db = await freshDb('sql');
    await db.exec(read(FILE));
    expect(await code(vault(db))).toBe('ok');
    expect(await code(vault(db, { program_id: P1, visibility: 'org_public',
      scope: JSON.stringify({ v: 1, filters: { folderId: ['module-3'], ctdSection: ['3.2.P'] }, includeSuperseded: true }) }))).toBe('ok');
    await db.query(`DELETE FROM regulatory_programs WHERE id = $1`, [P1]);
    const left = (await db.query<{ surface: string; program_id: string | null }>(
      `SELECT surface, program_id FROM saved_precedent_queries ORDER BY id`)).rows;
    expect(left.filter((r) => r.surface === 'vault')).toEqual([{ surface: 'vault', program_id: null }]);
    expect(left.filter((r) => r.surface === 'precedent')).toHaveLength(2);
  });
});

describe('install-fresh\'s overlay can reach the file before regulatory_programs exists', () => {
  it('fails with 42P01 "does not exist", which the overlay defers, and leaves nothing behind', async () => {
    const db = await freshDb('pushed', false);
    const err = await db.exec(read(FILE)).then(() => null, (e: { code?: string; message?: string }) => e);
    await db.exec('ROLLBACK').catch(() => undefined);
    expect(err?.code).toBe('42P01');
    expect(err?.message).toMatch(/does not exist/);
    expect(Object.keys(await columns(db))).not.toContain('surface');
    await db.exec(read(PROGRAMS));
    await db.exec(read(FILE));
    expect(Object.keys(await columns(db))).toContain('surface');
  });
});

describe('every constraint is added only when absent', () => {
  it('a copy with one name guard removed fails on its second replay (the guard is what makes it replayable)', async () => {
    const db = await freshDb('empty');
    const guard = /IF NOT EXISTS \(SELECT 1 FROM pg_constraint\s+WHERE conrelid = 'public\.saved_precedent_queries'::regclass AND conname = 'spq_surface_known'\) THEN/;
    const src = read(FILE);
    expect(src).toMatch(guard);
    const unguarded = src.replace(guard, 'IF TRUE THEN');
    await db.exec(unguarded);
    expect(await code(db.exec(unguarded))).toBe('42710');
  });
});
