/**
 * Document store consolidation step 3 (2026-10-17): a numeric-workspace chat
 * upload no longer writes a concept2cure_artifacts copy, which was the reads'
 * binding from workspace to program. resolveUploadCaptureScope is that binding
 * now, established once at capture, on real PostgreSQL (PGlite).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { resolveUploadCaptureScope } from '../capture-scope';

const ORG = 41, OTHER = 42;
const PROGRAM = '20000000-0000-4000-8000-000000000001';
let pg: PGlite;
const db = { query: async (sql: string, params?: unknown[]) => ({ rows: (await pg.query<Record<string, unknown>>(sql, params)).rows }) };

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, deleted_at timestamptz);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, regulatory_program_id uuid, status text);`);
}, 60_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec('DELETE FROM projects; DELETE FROM regulatory_programs;');
  await pg.query('INSERT INTO regulatory_programs VALUES ($1,$2,NULL)', [PROGRAM, ORG]);
  await pg.query("INSERT INTO projects VALUES (12,$1,$2,'active')", [ORG, PROGRAM]);
});
const numeric = { programId: null, workspaceId: 12 };

describe('resolveUploadCaptureScope', () => {
  it('records a numeric upload in the program its projects row is the single live anchor of', async () => {
    expect(await resolveUploadCaptureScope(db, numeric, ORG)).toEqual({ programId: PROGRAM, workspaceId: null });
  });
  it('leaves a UUID or conversation scope as it came', async () => {
    expect(await resolveUploadCaptureScope(db, { programId: PROGRAM, workspaceId: null }, ORG)).toEqual({ programId: PROGRAM, workspaceId: null });
    expect(await resolveUploadCaptureScope(db, { programId: null, workspaceId: null }, ORG)).toEqual({ programId: null, workspaceId: null });
  });
  it.each([
    ['no program', "UPDATE projects SET regulatory_program_id=NULL"],
    ['a second live anchor', `INSERT INTO projects VALUES (13,${ORG},'${PROGRAM}','active')`],
    ['a deleted program', 'UPDATE regulatory_programs SET deleted_at=now()'],
    ['a deleted project', "UPDATE projects SET status='deleted'"],
    ["another organisation's program", `UPDATE regulatory_programs SET organization_id=${OTHER}`],
  ])('keeps the workspace scope with %s', async (_label, sql) => {
    await pg.exec(sql);
    expect(await resolveUploadCaptureScope(db, numeric, ORG)).toEqual(numeric);
  });
  it("never binds another organisation's projects row", async () => {
    expect(await resolveUploadCaptureScope(db, numeric, OTHER)).toEqual(numeric);
  });
});
