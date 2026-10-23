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
import { currentVersionOfCode, nextMajorVersion, planCheckIn, recheckUnderLock } from '../vault-version-checkin';

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
      program_id UUID NOT NULL, organization_id INTEGER, document_code TEXT, document_type TEXT, version TEXT,
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
    expect(nextMajorVersion('999999.0')).toBeNull();
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

  it('advances past immutable retired major slots without reviving their rows', async () => {
    const head = await version('RETIRED-SLOT', '1.0', H('a'));
    const retired = await version('RETIRED-SLOT', '2.0', H('b'), head);
    await pg.query('UPDATE vault.documents SET deleted_at = now() WHERE id = $1', [retired]);
    expect(await planCheckIn(q, { organizationId: ORG, programId: PROGRAM, headId: head, contentHash: H('c') }))
      .toMatchObject({ ok: true, version: '3.0' });
    expect(await planCheckIn(q, { organizationId: ORG, programId: PROGRAM, headId: head, contentHash: H('b') }))
      .toMatchObject({ ok: false, code: 'CONTENT_ALREADY_A_VERSION' });
    expect((await pg.query<{ version: string; deleted_at: Date | null }>('SELECT version, deleted_at FROM vault.documents WHERE id=$1', [retired])).rows[0])
      .toMatchObject({ version: '2.0', deleted_at: expect.any(Date) });
  });

  it('scopes retired slots and refuses an occupied live next slot', async () => {
    const head = await version('RETIRED-SCOPE', '1.0', H('d'));
    const theirs = await version('RETIRED-SCOPE', '42.0', H('e'), null, 99);
    const otherCode = await version('RETIRED-OTHER', '60.0', H('f'));
    await pg.query('UPDATE vault.documents SET deleted_at=now() WHERE id IN ($1,$2)', [theirs, otherCode]);
    expect(await planCheckIn(q, { organizationId: ORG, programId: PROGRAM, headId: head, contentHash: H('0') }))
      .toMatchObject({ ok: true, version: '2.0' });
    await version('RETIRED-SCOPE', '2.0', H('1'));
    expect(await planCheckIn(q, { organizationId: ORG, programId: PROGRAM, headId: head, contentHash: H('0') }))
      .toMatchObject({ ok: false, code: 'VERSION_SLOT_OCCUPIED' });
  });

  it('refuses exhausted numeric numbering without inventing a wider scheme', async () => {
    const head = await version('VERSION-EXHAUSTED', '999999.0', H('2'));
    expect(await planCheckIn(q, { organizationId: ORG, programId: PROGRAM, headId: head, contentHash: H('3') }))
      .toMatchObject({ ok: false, code: 'VERSION_SCHEME_UNKNOWN' });
  });

  it('reserves the highest retired major and rechecks its assignment under the head lock', async () => {
    const head = await version('RETIRED-RECHECK', '1.0', H('4'));
    const retired = await version('RETIRED-RECHECK', '7.3', H('5'));
    await pg.query('UPDATE vault.documents SET deleted_at=now() WHERE id=$1', [retired]);
    await pg.query(`INSERT INTO vault.documents (program_id,organization_id,document_code,version,content_hash,deleted_at)
      VALUES ($1,$2,'RETIRED-RECHECK','80.0',$3,now())`, ['22222222-2222-4222-8222-222222222222', ORG, H('6')]);
    const input = { organizationId: ORG, programId: PROGRAM, contentHash: H('7') };
    const planned = await planCheckIn(q, { ...input, headId: head });
    expect(planned).toMatchObject({ ok: true, version: '8.0' });
    if (!planned.ok) throw new Error('Expected a valid next version');
    const intervening = await version('RETIRED-RECHECK', '8.0', H('8'));
    await pg.query('UPDATE vault.documents SET deleted_at=now() WHERE id=$1', [intervening]);
    expect(await recheckUnderLock(q, input, planned)).toMatchObject({ ok: false, code: 'VERSION_NOT_CURRENT' });
  });

  it('refuses a prepared 2.0 when a retained 2.0 slot appears before the locked recheck', async () => {
    const head = await version('RETIRED-INITIAL-RACE', '1.0', H('9'));
    const input = { organizationId: ORG, programId: PROGRAM, contentHash: H('a') };
    const planned = await planCheckIn(q, { ...input, headId: head });
    expect(planned).toMatchObject({ ok: true, version: '2.0' });
    if (!planned.ok) throw new Error('Expected a valid next version');
    const retired = await version('RETIRED-INITIAL-RACE', '2.0', H('b'), head);
    await pg.query('UPDATE vault.documents SET deleted_at=now() WHERE id=$1', [retired]);
    expect(await recheckUnderLock(q, input, planned)).toMatchObject({ ok: false, code: 'VERSION_NOT_CURRENT' });
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

describe('currentVersionOfCode does not guess among live heads', () => {
  const at = (documentCode: string) => ({ organizationId: ORG, programId: PROGRAM, documentCode });

  it.each([
    ['legacy roots', 'draft-aaaaaaaa', 'draft-bbbbbbbb'],
    ['numeric roots', '1.0', '9.0'],
  ])('omits a hint for two independent %s despite different creation dates', async (name, first, second) => {
    const code = `AMB-${name}`;
    const older = await version(code, first, H('9'));
    const newer = await version(code, second, H('a'));
    await pg.query(`UPDATE vault.documents SET created_at = CASE WHEN id = $1::uuid
      THEN '2020-01-01'::timestamptz ELSE '2030-01-01'::timestamptz END WHERE id IN ($1::uuid, $2::uuid)`,
    [older, newer]);
    expect(await currentVersionOfCode(q, at(code))).toBeNull();
  });

  it('omits a hint for a legacy fork with two live successor heads', async () => {
    const parent = await version('AMB-FORK', '1.0', H('b'));
    await version('AMB-FORK', '2.0', H('c'), parent);
    await version('AMB-FORK', '3.0', H('d'), parent);
    expect(await currentVersionOfCode(q, at('AMB-FORK'))).toBeNull();
  });

  it('counts only live heads in the exact organization and program', async () => {
    const head = await version('AMB-SCOPE', '1.0', H('e'));
    const tombstone = await version('AMB-SCOPE', '9.0', H('f'));
    await pg.query('UPDATE vault.documents SET deleted_at = now() WHERE id = $1', [tombstone]);
    await version('AMB-SCOPE', '11.0', H('0'), null, 99);
    await pg.query(`INSERT INTO vault.documents (program_id, organization_id, document_code, version, content_hash)
      VALUES ($1, $2, 'AMB-SCOPE', '1.0', $3)`, ['22222222-2222-4222-8222-222222222222', ORG, H('1')]);
    expect(await currentVersionOfCode(q, at('AMB-SCOPE'))).toEqual({ id: head, version: '1.0' });
  });

  it('still plans an explicit numeric UUID check-in when a code has independent roots', async () => {
    const selected = await version('AMB-EXPLICIT', '1.0', H('2'));
    await version('AMB-EXPLICIT', '9.0', H('3'));
    expect(await planCheckIn(q, { ...at('AMB-EXPLICIT'), headId: selected, contentHash: H('4') }))
      .toMatchObject({ ok: true, head: { id: selected }, version: '2.0' });
  });
});
