/**
 * planCheckIn on a schema WITHOUT idx_vault_documents_program_hash_unique
 * (VR-08). GCC installs carry that index and deploy-migrated ones may not
 * (db/migrations/044c_gcc_vault_schema.sql:106-107), so "these bytes are
 * already a version" must come from the check itself, never from whichever
 * unique index happens to exist. The PostgreSQL suite
 * (tests/db/vault-version-checkin.dbtest.ts) covers the schema with the index.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { currentVersionOfCode, nextMajorVersion, planCheckIn } from '../vault-version-checkin';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const ORG = 7;
let pg: PGlite;
const q = { query: async (sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params as unknown[])).rows as any[] }) };

async function version(code: string, v: string, hash: string, supersedes: string | null = null, org = ORG): Promise<string> {
  const r = await pg.query<{ id: string }>(
    `INSERT INTO vault.documents (program_id, organization_id, document_code, version, content_hash, supersedes_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text AS id`,
    [PROGRAM, org, code, v, hash, supersedes],
  );
  return r.rows[0].id;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id UUID NOT NULL, organization_id INTEGER, document_code TEXT, document_title TEXT, document_type TEXT, version TEXT,
      content_hash CHARACTER(64) NOT NULL, supersedes_id UUID, deleted_at TIMESTAMPTZ,
      folder_id TEXT, evidence_kind TEXT, ctd_section TEXT, placement_status TEXT NOT NULL DEFAULT 'unfiled',
      placement_confidence TEXT, placement_rationale TEXT, placed_by INTEGER,
      classification TEXT, retention_policy TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (program_id, document_code, version)
    );`);
});
afterAll(async () => { await pg.close(); });

const H = (c: string) => c.repeat(64);

describe('the next version (FD1: sequential majors)', () => {
  it('is the next major, and nothing for a version that is not a number', () => {
    expect(nextMajorVersion('1.0')).toBe('2.0');
    expect(nextMajorVersion('1.3')).toBe('2.0');
    expect(nextMajorVersion('9')).toBe('10.0');
    for (const v of ['draft-1a2b3c4d', '1.0-1a2b3c4d', 'abc123', '', '1.0.0']) expect(nextMajorVersion(v), v).toBeNull();
  });
});

describe('planCheckIn without the program-hash unique index', () => {
  it('refuses bytes the document already holds, naming the version', async () => {
    const v1 = await version('DOC-A', '1.0', H('a'));
    const plan = await planCheckIn(q, { organizationId: ORG, programId: PROGRAM, headId: v1, contentHash: H('a') });
    expect(plan).toMatchObject({ ok: false, status: 409, code: 'CONTENT_ALREADY_A_VERSION' });
    if (!plan.ok) expect(plan.message).toMatch(/version 1\.0/);
  });

  it('names the end of the chain when an older version is named', async () => {
    const v1 = await version('DOC-B', '1.0', H('b'));
    const v2 = await version('DOC-B', '2.0', H('c'), v1);
    await version('DOC-B', '3.0', H('d'), v2);
    const plan = await planCheckIn(q, { organizationId: ORG, programId: PROGRAM, headId: v1, contentHash: H('e') });
    expect(plan).toMatchObject({ ok: false, code: 'VERSION_NOT_CURRENT' });
    if (!plan.ok) expect(plan.message).toMatch(/current one is 3\.0/);
  });

  it("does not find another organization's version, nor a malformed id", async () => {
    const theirs = await version('DOC-C', '1.0', H('f'), null, 99);
    for (const headId of [theirs, 'not-a-uuid']) {
      expect(await planCheckIn(q, { organizationId: ORG, programId: PROGRAM, headId, contentHash: H('0') }))
        .toMatchObject({ ok: false, status: 404, code: 'VERSION_HEAD_NOT_FOUND' });
    }
  });

  it('assigns the next version to the current head', async () => {
    const v1 = await version('DOC-D', '1.0', H('1'));
    const plan = await planCheckIn(q, { organizationId: ORG, programId: PROGRAM, headId: v1, contentHash: H('2') });
    expect(plan).toMatchObject({ ok: true, version: '2.0', head: { id: v1, document_code: 'DOC-D' } });
  });
});

describe('currentVersionOfCode: the head a new version is offered against (QA-2026-10-08)', () => {
  /* A conflict at (program, code, version) must name the version a new one is
     added to. That is the end of the chain at that code, not the row that
     happens to hold the conflicting version number. */
  const at = (documentCode: string) => ({ organizationId: ORG, programId: PROGRAM, documentCode });

  it('is the end of the successor chain at that code', async () => {
    const v1 = await version('CUR-A.pdf', '1.0', H('5'));
    const v2 = await version('CUR-A.pdf', '2.0', H('6'), v1);
    expect(await currentVersionOfCode(q, at('CUR-A.pdf'))).toEqual({ id: v2, version: '2.0' });
  });

  it('is the one document at the code when nothing supersedes it', async () => {
    const v1 = await version('CUR-B.pdf', '1.0', H('7'));
    expect(await currentVersionOfCode(q, at('CUR-B.pdf'))).toEqual({ id: v1, version: '1.0' });
  });

  it("is null when no document holds the code, and never another organization's document", async () => {
    await version('CUR-C.pdf', '1.0', H('8'), null, 99);
    expect(await currentVersionOfCode(q, at('CUR-C.pdf'))).toBeNull();
    expect(await currentVersionOfCode(q, at('CUR-NONE.pdf'))).toBeNull();
  });
});
