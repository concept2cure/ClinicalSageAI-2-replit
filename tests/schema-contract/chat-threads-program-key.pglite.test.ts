/**
 * 20261001c_chat_threads_program_key.sql — an AnA conversation names the
 * project it was held in, by key, and only a project of its own organization
 * (PF-10 S1; D2, D3).
 *
 * Real DDL: regulatory_programs from 20260524 and chat_threads from 20260728.
 * Legacy threads are written BEFORE the file, with the project only in
 * metadata->>'programId', as chat-thread-helpers.ts writes it today:
 *   - own organization's program: bound by the backfill;
 *   - another organization's, a missing one, a malformed value, or a thread
 *     with no organization: left unbound, never guessed.
 * Then the creators and the file are replayed, as every deploy does (Rule 1).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../scripts/db/migration-set.mjs';
import { runProgramSameOrgPreflight } from '../../scripts/db/program-same-org-preflight.mjs';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const KEY = 'migrations/20261001c_chat_threads_program_key.sql';
const CREATORS = ['migrations/20260524_program_workbench_schema.sql', 'migrations/20260728_chat_thread_store.sql'];

const P1 = '11111111-1111-4111-8111-111111111111'; // organization 1
const P2 = '22222222-2222-4222-8222-222222222222'; // organization 2
const P3 = '33333333-3333-4333-8333-333333333333'; // organization 1, deleted later
const P_MISSING = '99999999-9999-4999-8999-999999999999';

let db: PGlite;
const thread = (id: string, org: number | null, metadata: unknown, programId: string | null = null) =>
  db.query(`INSERT INTO chat_threads (id, user_id, organization_id, metadata, program_id) VALUES ($1, 5, $2, $3, $4)`, [
    id, org, metadata === null ? null : JSON.stringify(metadata), programId,
  ]);
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));
const programOf = async (id: string) =>
  (await db.query<{ program_id: string | null; organization_id: number | null }>(
    `SELECT program_id, organization_id FROM chat_threads WHERE id = $1`, [id],
  )).rows[0];
const constraints = async () =>
  (await db.query<{ conname: string; convalidated: boolean; def: string }>(
    `SELECT conname, convalidated, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'public.chat_threads'::regclass AND conname LIKE 'chat_threads_program%' ORDER BY conname`,
  )).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT); CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);
                 INSERT INTO organizations (id, name) VALUES (1, 'one'), (2, 'two'); INSERT INTO users (id, name) VALUES (5, 'u');`);
  for (const f of CREATORS) await db.exec(read(f));
  for (const [id, org, name] of [[P1, 1, 'Alpha'], [P2, 2, 'Beta'], [P3, 1, 'Gamma']] as const) {
    await db.query(
      `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, $3, $4, 'ind', 'drug', 'FDA', $5)`,
      [id, org, name, name, name],
    );
  }
  // The column does not exist yet: legacy threads carry the project in metadata only.
  const legacy = (id: string, org: number | null, metadata: unknown) =>
    db.query(`INSERT INTO chat_threads (id, user_id, organization_id, metadata) VALUES ($1, 5, $2, $3)`, [
      id, org, metadata === null ? null : JSON.stringify(metadata),
    ]);
  await legacy('t-own', 1, { programId: P1 });
  await legacy('t-own-upper', 1, { programId: P3.toUpperCase() });
  await legacy('t-foreign', 1, { programId: P2 });
  await legacy('t-missing', 1, { programId: P_MISSING });
  await legacy('t-malformed', 1, { programId: '7abb1c22-not-a-uuid' });
  await legacy('t-no-org', null, { programId: P1 });
  await legacy('t-none', 1, null);
  // Two deploys: the file, then every creator and the file again.
  await db.exec(read(KEY));
  for (const f of CREATORS) await db.exec(read(f));
  await db.exec(read(KEY));
}, 60_000);
afterAll(async () => {
  await db?.close();
});

describe('20261001c on the applier', () => {
  it('runs after the files that create its tables and the program key, and before the tenant sweep', () => {
    const files = C2C_MIGRATION_FILES as string[];
    const at = files.indexOf(KEY);
    expect(at).toBeGreaterThan(-1);
    for (const before of [...CREATORS, 'migrations/20260926b_program_same_org_keys.sql']) {
      expect(files.indexOf(before), before).toBeGreaterThan(-1);
      expect(files.indexOf(before), before).toBeLessThan(at);
    }
    expect(at).toBeLessThan(files.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC as string));
  });

  it('a replay adds nothing: one NOT VALID key that nulls only the program, one NOT VALID CHECK, one index', async () => {
    expect(await constraints()).toEqual([
      {
        conname: 'chat_threads_program_needs_org', convalidated: false,
        def: 'CHECK (((program_id IS NULL) OR (organization_id IS NOT NULL))) NOT VALID',
      },
      {
        conname: 'chat_threads_program_same_org_fk', convalidated: false,
        def: 'FOREIGN KEY (program_id, organization_id) REFERENCES regulatory_programs(id, organization_id) ON DELETE SET NULL (program_id) NOT VALID',
      },
    ]);
    const idx = await db.query<{ indexdef: string }>(`SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_chat_threads_org_program'`);
    expect(idx.rows.map((r) => r.indexdef)).toEqual([
      expect.stringMatching(/\(organization_id, program_id\) WHERE \(program_id IS NOT NULL\)/),
    ]);
  });
});

describe('the backfill binds only a program of the thread\'s own organization', () => {
  it.each([
    ['t-own', P1],
    ['t-own-upper', P3],
    ['t-foreign', null],
    ['t-missing', null],
    ['t-malformed', null],
    ['t-no-org', null],
    ['t-none', null],
  ])('%s → %s', async (id, expected) => {
    expect((await programOf(id)).program_id).toBe(expected);
  });
});

describe('from here on the database holds the key', () => {
  it('a thread naming its own organization\'s program is written', async () => {
    expect(await code(thread('n-own', 1, null, P1))).toBe('ok');
  });

  it("a thread naming another organization's program, or a missing one, is refused", async () => {
    expect(await code(thread('n-foreign', 1, null, P2))).toBe('23503');
    expect(await code(thread('n-missing', 1, null, P_MISSING))).toBe('23503');
    expect(await code(db.query(`UPDATE chat_threads SET program_id = $1 WHERE id = 't-none'`, [P2]))).toBe('23503');
  });

  it('a thread with no organization cannot name a program, and still exists without one', async () => {
    expect(await code(thread('n-no-org', null, null, P1))).toBe('23514');
    expect(await code(thread('n-no-org-plain', null, null, null))).toBe('ok');
  });

  it("deleting a program unbinds its threads and keeps their organization", async () => {
    await db.query(`DELETE FROM regulatory_programs WHERE id = $1`, [P3]);
    expect(await programOf('t-own-upper')).toEqual({ program_id: null, organization_id: 1 });
    // A later replay cannot re-bind it: the program is gone.
    await db.exec(read(KEY));
    expect((await programOf('t-own-upper')).program_id).toBeNull();
  });

  it('the preflight reads the store, and finds no thread naming a foreign program', async () => {
    const results = await runProgramSameOrgPreflight({ query: (t: string, p?: unknown[]) => db.query(t, p) });
    const r = results.find((x: { relation: string }) => x.relation === 'public.chat_threads');
    expect(r).toMatchObject({ skipped: false, rows: [], keyedBy: 'chat_threads_program_same_org_fk' });
  });
});
