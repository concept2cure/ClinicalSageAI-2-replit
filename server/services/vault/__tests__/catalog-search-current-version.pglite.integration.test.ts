/**
 * W2/D4: current-version catalog eligibility, against in-memory PostgreSQL.
 *
 * LIMITATION: the installed PGlite has no pgvector extension. Only the literal
 * distance expression is replaced with a deterministic scalar ($2::real);
 * embedding is a TEST-ONLY REAL column, and the query provider is stubbed.
 * Actual searchCatalog counts/hits execute with family, tenant, project,
 * deletion, disposition and content-hash predicates unchanged. This proves
 * eligibility/counting, NOT vector scoring, provider quality or runtime RLS.
 * Catalog/disposition tables come from canonical migrations. Legacy invalid
 * links are intentional fixtures predating the version-lineage write guard.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, PROGRAM, PROGRAM_B, OTHER_PROGRAM, ORG } from '../../../routes/__tests__/_authoring-canvas-fixture';
import { supersededSql } from '../vault-version-family';

const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query } }));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: async () => ({ embedding: [1, 0] }) }) }));
import { searchCatalog } from '../document-catalog-search';

let jdb: JourneyDb;
const DISTANCE = 'c.embedding <=> $2::vector';
beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ + VAULT_DDL,
    migrations: ['migrations/20260905_document_catalog.sql', 'migrations/20261008e_document_catalog_attribution.sql', 'migrations/20261006_document_data_dispositions.sql'],
    testOnlySql: 'ALTER TABLE vault.document_catalog ADD COLUMN embedding REAL',
  });
  h.query.mockImplementation((sql: string, params: unknown[] = []) => {
    if (!sql.includes(DISTANCE)) return jdb.pool.query(sql, params);
    const scalarParams = [...params];
    scalarParams[1] = 0; // Deterministic distance only; no filtering predicates are changed.
    return jdb.pool.query(sql.replaceAll(DISTANCE, '$2::real'), scalarParams);
  });
}, 240_000);
beforeEach(async () => {
  vi.clearAllMocks();
  await jdb.pool.query('DELETE FROM vault.documents'); // Local in-memory fixtures only.
});
afterAll(async () => {
  try { assertNoSchemaGaps(jdb); } finally { await jdb?.close(); }
});

interface VersionOptions {
  version?: string;
  program?: string;
  organization?: number | null;
  code?: string;
  supersedes?: string;
  deleted?: boolean;
}
async function version(options: VersionOptions = {}): Promise<string> {
  const id = randomUUID();
  await jdb.pool.query(`INSERT INTO vault.documents
    (id, program_id, organization_id, document_code, document_title, document_type, version,
     content_hash, file_name, supersedes_id, deleted_at)
    VALUES ($1,$2,$3,$4,'Clinical study report','csr',$5,$6,'study.pdf',$7,$8)`,
  [id, options.program ?? PROGRAM, options.organization === undefined ? ORG : options.organization,
    options.code ?? 'CSR', options.version ?? '1.0', id.replaceAll('-', '').repeat(2),
    options.supersedes ?? null, options.deleted ? new Date() : null]);
  return id;
}
async function catalog(id: string, options: { status?: string; embedded?: boolean; stale?: boolean } = {}): Promise<void> {
  await jdb.pool.query(`INSERT INTO vault.document_catalog
    (document_id,content_hash,catalog_status,document_kind,summary,embedding)
    SELECT id,$2,$3,'CSR',$4,$5 FROM vault.documents WHERE id=$1`,
  [id, options.stale ? 'a'.repeat(64) : id.replaceAll('-', '').repeat(2),
    options.status ?? 'cataloged', `Summary of ${id}`, options.embedded === false ? null : 0]);
}
const search = () => searchCatalog(ORG, 'clinical endpoint', { programId: PROGRAM });
const ids = (result: Awaited<ReturnType<typeof searchCatalog>>) => result.hits.map(hit => hit.documentId).sort();

describe('semantic catalog — current version, not a better indexed predecessor', () => {
  it('excludes a correctly hashed cataloged predecessor from hits AND counts, retaining its stored history', async () => {
    const old = await version();
    const current = await version({ version: '2.0', supersedes: old });
    await catalog(old);
    await catalog(current);
    const result = await search();
    expect(ids(result)).toEqual([current]);
    expect(result).toMatchObject({ searchedCount: 1, unsearchableCount: 0 });
    expect(JSON.stringify(result)).not.toContain(`Summary of ${old}`);
    const retained = await jdb.pool.query('SELECT id FROM vault.documents WHERE id=$1', [old]);
    expect(retained.rows).toHaveLength(1); // Search eligibility does not erase stored version history.
    for (const [sql] of h.query.mock.calls) expect(sql).toContain(`NOT ${supersededSql('d')}`);
    const { loadDocumentForOrg } = await import('../document-catalog.service');
    expect(await loadDocumentForOrg(old, ORG)).toMatchObject({
      id: old, catalog: { summary: `Summary of ${old}` },
    }); // Explicit historical reads remain available, not default search evidence.
    expect(await loadDocumentForOrg(old, ORG, { currentOnly: true })).toBeNull();
    expect(await loadDocumentForOrg(current, ORG, { currentOnly: true })).toMatchObject({ id: current });
    expect(await loadDocumentForOrg(old, 2)).toBeNull();
  });

  it.each(['no catalog', 'extracted', 'cataloged without embedding', 'stale catalog'])('reports %s current successor as unsearchable without returning the old summary', async state => {
    const old = await version();
    const current = await version({ version: '2.0', supersedes: old });
    await catalog(old);
    if (state !== 'no catalog') await catalog(current, {
      status: state === 'extracted' ? 'extracted' : 'cataloged',
      embedded: state !== 'cataloged without embedding', stale: state === 'stale catalog',
    });
    expect(await search()).toEqual({ hits: [], searchedCount: 0, unsearchableCount: 1 });
  });

  it('ignores a deleted successor, making the surviving predecessor current under the canonical family rule', async () => {
    const old = await version();
    const removed = await version({ version: '2.0', supersedes: old, deleted: true });
    await catalog(old);
    await catalog(removed);
    const result = await search();
    expect(ids(result)).toEqual([old]);
    expect(result).toMatchObject({ searchedCount: 1, unsearchableCount: 0 });
  });
});

describe('semantic catalog — canonical legacy-family boundaries', () => {
  it.each([
    ['cross-program', { program: PROGRAM_B }],
    ['cross-organization', { organization: 99 }],
    ['cross-code', { code: 'UNRELATED-CSR' }],
    ['unknown organization', { organization: null }],
  ] as const)('does not hide an original under an invalid %s successor link', async (_label, different) => {
    const original = await version();
    const unrelated = await version({ version: '2.0', supersedes: original, ...different });
    await catalog(original);
    await catalog(unrelated);
    const result = await search();
    expect(ids(result)).toContain(original);
    expect(result.searchedCount).toBe('program' in different ? 1 : 2);
    expect(result.unsearchableCount).toBe(0);
  });

  it('does not hide an unrelated same-code document without a successor pointer', async () => {
    const original = await version();
    const unrelated = await version({ version: '2.0' });
    await catalog(original);
    await catalog(unrelated);
    const result = await search();
    expect(ids(result)).toEqual([original, unrelated].sort());
    expect(result).toMatchObject({ searchedCount: 2, unsearchableCount: 0 });
  });
});

describe('semantic catalog — current evidence remains organization/project scoped', () => {
  it('isolates the open program, organization-wide search and a foreign program', async () => {
    const mine = await version();
    const sibling = await version({ program: PROGRAM_B });
    const foreign = await version({ program: OTHER_PROGRAM, organization: 2 });
    for (const id of [mine, sibling, foreign]) await catalog(id);
    expect(ids(await search())).toEqual([mine]);
    const org = await searchCatalog(ORG, 'endpoint');
    expect(ids(org)).toEqual([mine, sibling].sort());
    expect(org).toMatchObject({ searchedCount: 2, unsearchableCount: 0 });
    expect(await searchCatalog(ORG, 'endpoint', { programId: OTHER_PROGRAM }))
      .toEqual({ hits: [], searchedCount: 0, unsearchableCount: 0 });
    expect(ids(await searchCatalog(2, 'endpoint', { programId: OTHER_PROGRAM }))).toEqual([foreign]);
  });
});
