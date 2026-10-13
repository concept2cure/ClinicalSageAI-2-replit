/** W1/D2: real full-text search pages stay complete when matching ranks and
 * timestamps tie and heap storage changes. Runs the canonical search-vector
 * migration and unmodified eligibility/query on PGlite, not a captured SQL
 * stub. This proves ordering and query isolation, not production-role RLS. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, PROGRAM, PROGRAM_B, OTHER_PROGRAM, ORG } from '../../../routes/__tests__/_authoring-canvas-fixture';
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
const search = (offset = 0, options: { programId?: string | null; organizationId?: number; includeSuperseded?: boolean } = {}) => searchVaultDocuments(db.pool, {
  organizationId: options.organizationId ?? ORG, programId: options.programId === undefined ? PROGRAM : options.programId,
  q: 'stability', limit: 25, offset, includeSuperseded: options.includeSuperseded ?? false,
});
const resultIds = (result: Awaited<ReturnType<typeof search>>) => result.results.map(row => row.id);

beforeAll(async () => {
  db = await createJourneyDb({ prereqSql: PREREQ + VAULT_DDL, migrations: [
    'migrations/20260906_vault_documents_fulltext.sql',
    'migrations/20261006_document_data_dispositions.sql',
  ] });
  // Reverse insertion order prevents heap order from looking like the stable
  // ID contract by accident; every matching vector and timestamp is identical.
  for (let n = 31; n >= 1; n -= 1) await document(n);
  await document(32, { code: 'FAMILY' });
  await document(33, { code: 'FAMILY', supersedes: id(32) });
  await document(34, { program: OTHER_PROGRAM, organization: 2 });
  await document(35, { program: PROGRAM_B });
  await document(36, { deleted: true });
}, 60_000);
afterAll(async () => { try { assertNoSchemaGaps(db); } finally { await db?.close(); } });

describe('canonical Vault full-text paging with tied matches', () => {
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
    expect(await search(0, { programId: OTHER_PROGRAM })).toMatchObject({ total: 0, results: [] });
    const historical = await search(25, { includeSuperseded: true });
    expect(historical.total).toBe(33);
    expect(resultIds(historical)).toEqual(Array.from({ length: 8 }, (_, index) => id(index + 26)));
    expect(historical.results.find(row => row.id === id(32))?.current).toBe(false);
  });
});
