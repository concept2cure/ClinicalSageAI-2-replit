/** Adapter fences; canonical sharing/role admission is exercised separately. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), embed: vi.fn(), retrieve: vi.fn(), uploads: vi.fn(), revoked: false, sourceChanged: false }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query } }));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: h.embed }) }));
vi.mock('../../ana/source-read-scope.js', () => ({
  revalidateAnaSourceReadScope: async (_q: unknown, scope: unknown) => {
    if (h.revoked) throw new Error('ANA_SOURCE_SCOPE_CHANGED');
    return scope;
  },
  assertAnaSourceProgramAllowed: (scope: any, program: string) => {
    if (!scope.accessibleProgramIds.includes(program)) throw new Error('ANA_SOURCE_ACCESS_DENIED');
  },
}));
vi.mock('../document-catalog-actor-access.js', () => ({
  withAnaSourceReadScope: async (input: any, callback: any) => {
    if (h.revoked) throw new Error('ANA_SOURCE_SCOPE_CHANGED');
    return callback({ query: h.query }, { ...SCOPE, ...input });
  },
}));
vi.mock('../document-catalog.service.js', () => ({ listChatUploads: vi.fn(), listChatUploadsInReadScope: h.uploads }));
vi.mock('../../ragRouter.js', () => ({ ragRouter: { retrieve: h.retrieve } }));

import { searchVaultForAssistant } from '../vault-assistant-search';
import { searchDocumentPassages } from '../document-passage-search';
const PROGRAM = '10000000-0000-4000-8000-000000000001';
const PRIVATE = '10000000-0000-4000-8000-000000000002';
const DOCUMENT = '30000000-0000-4000-8000-000000000001';
const HASH = 'a'.repeat(64);
const ORG_UUID = '20000000-0000-4000-8000-000000000001';
const SCOPE = { organizationId: 7, userId: 12, role: 'viewer', projectId: null, programId: null, accessibleProgramIds: [PROGRAM], actorFiltered: true as const };

beforeEach(() => {
  vi.clearAllMocks(); h.revoked = false; h.sourceChanged = false;
  h.embed.mockResolvedValue({ embedding: [1, 2, 3] });
  h.uploads.mockResolvedValue({ uploads: [{ documentId: 'creator-owned' }], hasMore: false });
  h.retrieve.mockResolvedValue({ documents: [] });
  h.query.mockImplementation(async (sql: string) => {
    if (/SELECT id FROM organizations/.test(sql)) return { rows: [{ id: 7 }] };
    if (/count\(\*\)/.test(sql)) return { rows: [{ total: 1 }] };
    if (/COUNT/.test(sql)) return { rows: [{ total: 1, indexed: 1, pending: 0, failed: 0, searchable: 0, unsearchable: 1 }] };
    if (/SELECT d.id::text AS document_id/.test(sql)) return { rows: h.sourceChanged ? [] : [{ document_id: DOCUMENT, program_id: PROGRAM, content_hash: HASH }] };
    if (/ts_headline/.test(sql)) return { rows: [{ id: DOCUMENT, program_id: PROGRAM, content_hash: HASH, document_title: 'Stability', current: true }] };
    return { rows: [] };
  });
});
const assistant = (catalogEnabled = false, scope = SCOPE) => searchVaultForAssistant({ query: h.query }, {
  organizationId: 7, programId: null, query: 'stability', limit: 1, catalogEnabled, sourceReadScope: scope,
});

describe('actor-scoped assistant retrieval', () => {
  it('preserves an admitted viewer and keyless positive read', async () => {
    expect(await assistant()).toMatchObject({ hits: [{ documentId: DOCUMENT }], textMatches: 1, semantic: { available: false, reason: 'catalog_off' } });
    expect(h.embed).not.toHaveBeenCalled();
    const sourceSql = h.query.mock.calls.filter(([sql]) => /vault\.documents/.test(sql));
    expect(sourceSql.every(([sql]) => /d\.program_id\s*=\s*ANY/.test(sql))).toBe(true);
  });

  it('does not return old text/counts after access is revoked during meaning embedding', async () => {
    h.embed.mockImplementation(async () => { h.revoked = true; return { embedding: [1, 2, 3] }; });
    await expect(assistant(true)).rejects.toThrow('ANA_SOURCE_SCOPE_CHANGED');
  });

  it('rechecks old lexical identities when the optional provider becomes unavailable', async () => {
    h.embed.mockImplementation(async () => { h.sourceChanged = true; throw new Error('provider unavailable'); });
    await expect(assistant(true)).rejects.toThrow('Source access or identity changed');
  });

  it('withholds stale totals even when the changed source was outside the selected page', async () => {
    let updated = false;
    const base = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (sql: string, params: unknown[]) => /count\(\*\)/.test(sql)
      ? { rows: [{ total: updated ? 2 : 1 }] } : base(sql, params));
    h.embed.mockImplementation(async () => { updated = true; return { embedding: [1, 2, 3] }; });
    await expect(assistant(true)).rejects.toThrow('Source access or identity changed');
  });

  it('does not swallow changed actor authority as optional meaning unavailability', async () => {
    h.query.mockImplementationOnce(async () => { h.revoked = true; return { rows: [{ total: 1 }] }; });
    await expect(assistant()).rejects.toThrow('ANA_SOURCE_SCOPE_CHANGED');
  });

  it('rejects contradictory actor/source organisation before a source read', async () => {
    await expect(assistant(false, { ...SCOPE, organizationId: 9 })).rejects.toThrow('does not match');
    expect(h.query).not.toHaveBeenCalled();
  });

  it('pins scope arrays before an asynchronous callback can mutate them', async () => {
    const original = { ...SCOPE, accessibleProgramIds: [PROGRAM] };
    h.embed.mockImplementation(async () => { original.accessibleProgramIds.push(PRIVATE); return { embedding: [1, 2, 3] }; });
    await assistant(true, original);
    for (const [sql, params] of h.query.mock.calls) {
      if (/d\.program_id = ANY/.test(sql)) expect(params).not.toContainEqual([PROGRAM, PRIVATE]);
    }
  });

  it.each([
    { code: '42703', message: 'embedding column missing' },
    { code: '42704', message: 'type "vector" does not exist' },
  ])('rolls back unsupported meaning SQL ($code) and preserves the authorised lexical result', async error => {
    const base = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (/COUNT\(\*\) FILTER/.test(sql)) throw Object.assign(new Error(error.message), { code: error.code });
      return base(sql, params);
    });
    expect(await assistant(true)).toMatchObject({ hits: [{ documentId: DOCUMENT }], semantic: { available: false, reason: 'no_embedding_provider' } });
    expect(h.query.mock.calls.some(([sql]) => sql === 'ROLLBACK TO SAVEPOINT catalog_meaning_search')).toBe(true);
  });
});

describe('actor-scoped passage adapter', () => {
  it('uses actor-filtered outside-index captures and current permitted programmes', async () => {
    const result = await searchDocumentPassages({ organizationId: 7, organizationUuid: ORG_UUID, query: 'stability' }, { sourceReadScope: SCOPE });
    expect(result.coverage?.unfiledUploads).toBe(1);
    expect(h.uploads).toHaveBeenCalledWith(expect.objectContaining({ query: h.query }), expect.objectContaining({ userId: 12 }), { limit: 20 });
    expect(h.retrieve.mock.calls[0][0]).toMatchObject({ filters: { allowedProgramIds: [PROGRAM] }, sourceReadScope: SCOPE });
  });

  it('refuses UUID/integer tenant mismatch before retrieval', async () => {
    h.query.mockResolvedValue({ rows: [] });
    await expect(searchDocumentPassages({ organizationId: 7, organizationUuid: ORG_UUID, query: 'stability' }, { sourceReadScope: SCOPE })).rejects.toThrow('organization identity');
    expect(h.retrieve).not.toHaveBeenCalled();
  });

  it('withholds passage content and coverage when actor scope changes during retrieval', async () => {
    h.retrieve.mockImplementation(async () => { h.revoked = true; return { documents: [{ documentId: DOCUMENT, content: 'private stale content' }] }; });
    await expect(searchDocumentPassages({ organizationId: 7, organizationUuid: ORG_UUID, query: 'stability' }, { sourceReadScope: SCOPE })).rejects.toThrow('ANA_SOURCE_SCOPE_CHANGED');
  });

  it('refuses a returned passage whose recorded programme is outside the allowed set', async () => {
    h.retrieve.mockResolvedValue({ documents: [{ documentId: DOCUMENT, programId: PRIVATE, contentHash: HASH, content: 'private' }] });
    await expect(searchDocumentPassages({ organizationId: 7, organizationUuid: ORG_UUID, query: 'stability' }, { sourceReadScope: SCOPE })).rejects.toThrow('ANA_SOURCE_ACCESS_DENIED');
  });
});
