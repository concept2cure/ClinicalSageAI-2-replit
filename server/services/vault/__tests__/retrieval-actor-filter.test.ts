import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), embed: vi.fn(), uploads: vi.fn(), retrieve: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query } }));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: h.embed }) }));
vi.mock('../document-catalog.service.js', () => ({ listChatUploads: h.uploads }));
vi.mock('../../ragRouter.js', () => ({ ragRouter: { retrieve: h.retrieve } }));

import { searchVaultDocuments } from '../vault-search';
import { searchCatalog } from '../document-catalog-search';
import { getPassageCoverage, searchDocumentPassages } from '../document-passage-search';
import { buildDocFilterClause, mergeFilters, VAULT_FILTER_COLUMNS, RAG_FILTER_COLUMNS } from '../../rag-filters';
import { missingVectorIndex } from '../vector-index-availability';

const PROGRAM = '10000000-0000-4000-8000-000000000001';
const ORG_UUID = '20000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  h.embed.mockResolvedValue({ embedding: [1, 2, 3] });
  h.query.mockImplementation(async (sql: string) => ({ rows: /COUNT|count/.test(sql) ? [{ total: 2, indexed: 1, pending: 1, failed: 0, searchable: 1, unsearchable: 1 }] : [] }));
  h.uploads.mockResolvedValue({ uploads: [], hasMore: false });
  h.retrieve.mockResolvedValue({ documents: [] });
});

describe('server-generated allowed programme filters', () => {
  it('recognises the missing optional vector type, while preserving other undefined objects as unavailable', () => {
    expect(missingVectorIndex({ code: '42704', message: 'type "vector" does not exist' })).toBe(true);
    expect(missingVectorIndex({ code: '42704', message: 'type "private_source" does not exist' })).toBe(false);
    expect(missingVectorIndex({ code: '42P01', message: 'relation "vault.document_chunks" does not exist' })).toBe(false);
  });
  it('binds the allowed set before the lexical count and page limit', async () => {
    await searchVaultDocuments({ query: h.query }, { organizationId: 7, programId: null, allowedProgramIds: [PROGRAM], q: 'stability', limit: 1, offset: 0, includeSuperseded: false } as any);
    expect(h.query).toHaveBeenCalledTimes(2);
    for (const [sql, params] of h.query.mock.calls) {
      expect(sql).toMatch(/d\.program_id = ANY\(\$\d+::uuid\[\]\)/);
      expect(sql).toContain('d.organization_id = $1');
      expect(params).toContainEqual([PROGRAM]);
    }
  });

  it('does not promote an empty allowed set into all programmes', async () => {
    await searchVaultDocuments({ query: h.query }, { organizationId: 7, programId: null, allowedProgramIds: [], q: 'stability', limit: 1, offset: 0, includeSuperseded: false } as any);
    for (const [, params] of h.query.mock.calls) expect(params).toContainEqual([]);
  });

  it('bounds meaning counts and candidates before rank and limit', async () => {
    await searchCatalog(7, 'stability', { allowedProgramIds: [PROGRAM] } as any);
    for (const [sql, params] of h.query.mock.calls) {
      expect(sql).toMatch(/d\.program_id = ANY\(\$\d+::uuid\[\]\)/);
      expect(sql).toContain('d.organization_id = $1');
      expect(sql).toContain('rp.deleted_at IS NULL');
      expect(params).toContainEqual([PROGRAM]);
    }
  });

  it('uses the caller executor for meaning SQL rather than a different pool', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await searchCatalog(7, 'stability', { db: { query }, allowedProgramIds: [PROGRAM] } as any);
    expect(query).toHaveBeenCalledTimes(2);
    expect(h.query).not.toHaveBeenCalled();
  });

  it('binds passage ledger to the current byte version, live parent and allowed programmes', async () => {
    await getPassageCoverage(7, null, { allowedProgramIds: [PROGRAM] } as any);
    const [sql, params] = h.query.mock.calls[0];
    expect(sql).toContain('c.content_hash = d.content_hash');
    expect(sql).toContain('p.deleted_at IS NULL');
    expect(sql).toContain('d.organization_id = $1');
    expect(sql).toContain('vault.documents succ');
    expect(sql).toMatch(/d\.program_id = ANY\(\$\d+::uuid\[\]\)/);
    expect(params).toContainEqual([PROGRAM]);
  });

  it('propagates allowed programmes to the existing passage router', async () => {
    await searchDocumentPassages({ organizationId: 7, organizationUuid: ORG_UUID, query: 'stability' }, { allowedProgramIds: [PROGRAM] } as any);
    expect(h.retrieve.mock.calls[0][0].filters).toEqual({ allowedProgramIds: [PROGRAM] });
  });

  it('retains SQL failures as unknown coverage rather than zero', async () => {
    h.query.mockRejectedValue(new Error('ledger unavailable'));
    const result = await searchDocumentPassages({ organizationId: 7, organizationUuid: ORG_UUID, query: 'stability' }, { allowedProgramIds: [PROGRAM] } as any);
    expect(result.coverage).toBeNull();
  });

  it('does not fabricate zero coverage from an absent ledger aggregate row', async () => {
    h.query.mockResolvedValue({ rows: [] });
    const result = await searchDocumentPassages({ organizationId: 7, organizationUuid: ORG_UUID, query: 'stability' }, { allowedProgramIds: [PROGRAM] });
    expect(result.coverage).toBeNull();
  });

  it('preserves allowed set through the router filter merge', () => {
    expect(mergeFilters({ atomType: 'protocol' }, { allowedProgramIds: [PROGRAM] } as any)).toEqual({ atomType: 'protocol', allowedProgramIds: [PROGRAM] });
    expect(mergeFilters(undefined, { allowedProgramIds: [] } as any)).toEqual({ allowedProgramIds: [] });
  });

  it('binds array filters in the canonical SQL helper', () => {
    const params: unknown[] = ['query'];
    expect(buildDocFilterClause({ allowedProgramIds: [PROGRAM] } as any, params, VAULT_FILTER_COLUMNS)).toContain('AND d.program_id = ANY($2::uuid[])');
    expect(params).toEqual(['query', [PROGRAM]]);
  });

  it('refuses an actor programme constraint on a corpus without programme identity', () => {
    expect(() => buildDocFilterClause({ allowedProgramIds: [PROGRAM] } as any, [], RAG_FILTER_COLUMNS)).toThrow(/no program column/);
  });
});
