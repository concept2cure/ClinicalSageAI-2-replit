/** W1/D2: real full-text search pages stay complete when matching ranks and
 * timestamps tie and heap storage changes. Runs the canonical search-vector
 * migration and unmodified eligibility/query on PGlite, not a captured SQL
 * stub. This proves ordering and query isolation, not production-role RLS. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, AUTHORING_ACCESS_DDL, AUTHOR, PROGRAM, PROGRAM_B, OTHER_PROGRAM, ORG } from '../../../routes/__tests__/_authoring-canvas-fixture';
import { searchVaultDocuments } from '../vault-search';

let db: JourneyDb;
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const currentIds = [...Array.from({ length: 31 }, (_, index) => id(index + 1)), id(33)];
async function document(n: number, options: { program?: string; organization?: number; code?: string; supersedes?: string; deleted?: boolean } = {}) {
  await db.pool.query(`INSERT INTO vault.documents
    (id,program_id,organization_id,document_code,document_title,document_type,file_name,content_hash,extracted_text,created_at,supersedes_id,deleted_at,version)
    VALUES ($1,$2,$3,$4,'Stability report','report','stability.txt',$5,'Stability data.',
      '2026-10-13T10:00:00Z',$6,$7,$8)`, [id(n), options.program ?? PROGRAM, options.organization ?? ORG,
    options.code ?? `PAGE-${n}`, String(n).padStart(64, '0'), options.supersedes ?? null, options.deleted ? '2026-10-13T11:00:00Z' : null, options.supersedes ? '2.0' : '1.0']);
}
const search = (offset = 0, options: { programId?: string | null; organizationId?: number; includeSuperseded?: boolean; allowedProgramIds?: readonly string[]; limit?: number } = {}) => searchVaultDocuments(db.pool, {
  organizationId: options.organizationId ?? ORG, userId: Number(AUTHOR.id), programId: options.programId === undefined ? PROGRAM : options.programId,
  q: 'stability', limit: options.limit ?? 25, offset, includeSuperseded: options.includeSuperseded ?? false,
  allowedProgramIds: options.allowedProgramIds,
});
const resultIds = (result: Awaited<ReturnType<typeof search>>) => result.results.map(row => row.id);

beforeAll(async () => {
  db = await createJourneyDb({ prereqSql: PREREQ + AUTHORING_ACCESS_DDL + VAULT_DDL, migrations: [
    'migrations/20260906_vault_documents_fulltext.sql',
    'migrations/20261006_document_data_dispositions.sql',
    // A search hit carries its lifecycle stage (VR-18), read from canonical_documents.
    'migrations/20260731c_canonical_documents.sql',
  ] });
  await db.pool.query(`INSERT INTO organization_users (organization_id,user_id,role) VALUES (2,${AUTHOR.id},'member')`);
  await db.pool.query(`INSERT INTO projects (id,organization_id,name,regulatory_program_id,owner_id,created_by_id)
      VALUES (44,2,'foreign owned anchor','${OTHER_PROGRAM}',${AUTHOR.id},${AUTHOR.id})`);
  await db.pool.query("INSERT INTO project_visibility_settings VALUES (44,2,'private')");
  // Reverse insertion order prevents heap order from looking like the stable
  // ID contract by accident; every matching vector and timestamp is identical.
  for (let n = 31; n >= 1; n -= 1) await document(n);
  await document(32, { code: 'FAMILY' });
  await document(33, { code: 'FAMILY', supersedes: id(32) });
  await document(34, { program: OTHER_PROGRAM, organization: 2 });
  await document(35, { program: PROGRAM_B });
  await document(36, { deleted: true });
  await document(37, { organization: 2 });
}, 60_000);
afterAll(async () => { try { assertNoSchemaGaps(db); } finally { await db?.close(); } });

describe('canonical Vault full-text paging with tied matches', () => {
  it('intersects narrowing IDs with canonical access before count/rank/LIMIT', async () => {
    const allowed = await search(0, { programId: null, allowedProgramIds: [PROGRAM_B, OTHER_PROGRAM], limit: 1 });
    expect(allowed.total).toBe(1);
    expect(resultIds(allowed)).toEqual([id(35)]);
    expect(await search(0, { programId: null, allowedProgramIds: [], limit: 1 })).toMatchObject({ total: 0, results: [] });
  });

  it('places actual private sharing ahead of tied counts and pages for a viewer', async () => {
    await db.pool.query('BEGIN');
    try {
      await db.pool.query("INSERT INTO users (id,name,email,status) VALUES (99,'viewer','viewer@example.test','active')");
      await db.pool.query(`INSERT INTO organization_users (organization_id,user_id,role) VALUES (${ORG},99,'viewer')`);
      await db.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id IN (42,43)");
      await db.pool.query(`INSERT INTO project_members (project_id,organization_id,user_id,role,status) VALUES (43,${ORG},99,'use','active')`);
      const found = await searchVaultDocuments(db.pool, { organizationId: ORG, userId: 99, programId: null, allowedProgramIds: [PROGRAM, PROGRAM_B], q: 'stability', limit: 1, offset: 0, includeSuperseded: false });
      expect(found.total).toBe(1);
      expect(found.results.map(row => row.id)).toEqual([id(35)]);
      await expect(searchVaultDocuments(db.pool, { organizationId: ORG, userId: 99, programId: PROGRAM, q: 'stability', limit: 1, offset: 0, includeSuperseded: false })).rejects.toMatchObject({ status: 403, code: 'PROJECT_PERMISSION_DENIED' });
      // A controlled checkpoint changes real persisted access after the page
      // query has materialized, before the canonical helper returns it.
      let withdrawn = false;
      const changingClient = { query: async (sql: string, params?: unknown[]) => {
        const result = await db.pool.query(sql, params);
        if (/ts_headline/.test(sql) && !withdrawn) {
          withdrawn = true;
          await db.pool.query('DELETE FROM project_members WHERE user_id=99');
        }
        return result;
      } };
      await expect(searchVaultDocuments(changingClient, { organizationId: ORG, userId: 99, programId: null, q: 'stability', limit: 1, offset: 0, includeSuperseded: false })).rejects.toMatchObject({ status: 503, code: 'PROJECT_ACCESS_CHANGED' });
      expect(withdrawn).toBe(true);
      expect(await searchVaultDocuments(db.pool, { organizationId: ORG, userId: 99, programId: null, q: 'stability', limit: 1, offset: 0, includeSuperseded: false })).toMatchObject({ total: 0, results: [] });
    } finally {
      await db.pool.query('ROLLBACK');
    }
  });

  it('cannot launder a foreign source organization through an owned program', async () => {
    expect(resultIds(await search(25))).not.toContain(id(37));
    expect((await search()).total).toBe(32);
  });

  it('returns every current match exactly once across a heap reorder between pages', async () => {
    const first = await search();
    expect(first.total).toBe(currentIds.length);
    await db.pool.query('CREATE INDEX fixture_vault_heap_reverse ON vault.documents (id DESC)');
    await db.pool.query('CLUSTER vault.documents USING fixture_vault_heap_reverse');
    const last = await search(25);
    const actual = [...resultIds(first), ...resultIds(last)];
    expect(new Set(actual).size).toBe(currentIds.length);
    expect(actual).toEqual(currentIds);
    expect(resultIds(first)).toEqual(currentIds.slice(0, 25));
    expect(last.total).toBe(currentIds.length);
    expect(resultIds(await search())).toEqual(currentIds.slice(0, 25));
  });

  it('keeps project, tenant, deletion and current-version rules in counts and pages', async () => {
    const mine = await search();
    expect(mine.total).toBe(32);
    expect(resultIds(mine)).not.toContain(id(32));
    expect(resultIds(mine)).not.toContain(id(34));
    expect(resultIds(mine)).not.toContain(id(35));
    expect(resultIds(mine)).not.toContain(id(36));
    const library = await search(25, { programId: null });
    expect(library.total).toBe(33);
    expect(resultIds(library)).toEqual([...currentIds.slice(25), id(35)]);
    const foreign = await search(0, { programId: OTHER_PROGRAM, organizationId: 2 });
    expect(foreign.total).toBe(1);
    expect(resultIds(foreign)).toEqual([id(34)]);
    await expect(search(0, { programId: OTHER_PROGRAM })).rejects.toMatchObject({ status: 404, code: 'PROJECT_NOT_FOUND' });
    const historical = await search(25, { includeSuperseded: true });
    expect(historical.total).toBe(33);
    expect(resultIds(historical)).toEqual(Array.from({ length: 8 }, (_, index) => id(index + 26)));
    expect(historical.results.find(row => row.id === id(32))?.current).toBe(false);
  });
});
