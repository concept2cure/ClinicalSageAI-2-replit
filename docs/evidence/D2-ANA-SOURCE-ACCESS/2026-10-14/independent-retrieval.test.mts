/** Four bounded S01/S10/unknown-ledger held-out adapter cases. Actual adapter
 * implementation, controlled authority/database/provider seams, no API call. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), embed: vi.fn(), retrieve: vi.fn(), revoked: false, nullLedger: false }));
vi.mock('../../../../server/db.js', () => ({ pool: { query: h.query }, getPool: () => { throw new Error('UNOWNED_DATABASE_ACCESS'); }, db: {} }));
vi.mock('../../../../server/services/enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: h.embed }) }));
vi.mock('../../../../server/services/ana/source-read-scope.js', () => ({
  revalidateAnaSourceReadScope: async (_q: any, scope: any) => { if (h.revoked) throw new Error('HELDOUT_PRIVATE_SHARE_REVOKED'); return scope; },
  assertAnaSourceProgramAllowed: (scope: any, program: string) => { if (!scope.accessibleProgramIds.includes(program)) throw new Error('HELDOUT_DENIED_PROGRAM'); },
}));
vi.mock('../../../../server/services/vault/document-catalog-actor-access.js', () => ({
  withAnaSourceReadScope: async (_input: any, run: any) => { if (h.revoked) throw new Error('HELDOUT_PRIVATE_SHARE_REVOKED'); return run({ query: h.query }, SCOPE); },
}));
vi.mock('../../../../server/services/vault/document-catalog.service.js', () => ({ listChatUploadsInReadScope: async () => ({ uploads: [], total: 0, withheld: 0, hasMore: false }) }));
vi.mock('../../../../server/services/ragRouter.js', () => ({ ragRouter: { retrieve: h.retrieve } }));
import { searchVaultForAssistant } from '../../../../server/services/vault/vault-assistant-search.ts';
import { searchDocumentPassages } from '../../../../server/services/vault/document-passage-search.ts';

const PROGRAM = '45454545-1111-4111-8111-000000000001';
const PRIVATE = '45454545-1111-4111-8111-000000000002';
const DOCUMENT = '46464646-1111-4111-8111-000000000001';
const ORG_UUID = '47474747-1111-4111-8111-000000000001';
const HASH = 'a'.repeat(64);
const SCOPE = { organizationId: 454, userId: 4541, role: 'viewer', projectId: null, programId: null, accessibleProgramIds: [PROGRAM], actorFiltered: true as const };
const assistant = (catalogEnabled: boolean) => searchVaultForAssistant({ query: h.query }, { organizationId: 454, programId: null, query: 'participants', limit: 1, catalogEnabled, sourceReadScope: SCOPE });
beforeEach(() => {
  vi.clearAllMocks(); h.revoked = false; h.nullLedger = false;
  h.embed.mockResolvedValue({ embedding: [1, 2, 3] }); h.retrieve.mockResolvedValue({ documents: [] });
  h.query.mockImplementation(async (sql: string) => {
    if (/SELECT id FROM organizations/.test(sql)) return { rows: [{ id: 454 }] };
    if (/SELECT d.id::text AS document_id/.test(sql)) return { rows: [{ document_id: DOCUMENT, program_id: PROGRAM, content_hash: HASH }] };
    if (/ts_headline/.test(sql)) return { rows: [{ id: DOCUMENT, program_id: PROGRAM, content_hash: HASH, document_title: 'Participants', current: true }] };
    if (/SELECT count\(\*\)::int AS total/.test(sql)) return { rows: [{ total: 1 }] };
    if (/SELECT COUNT\(\*\)::int AS total/.test(sql)) return { rows: [h.nullLedger ? { total: null, indexed: null, pending: null, failed: null } : { total: 1, indexed: 1, pending: 0, failed: 0 }] };
    if (/COUNT\(\*\) FILTER/.test(sql)) return { rows: [{ searchable: 0, unsearchable: 1 }] };
    return { rows: [] };
  });
});

describe('independent existing retrieval boundary controls', () => {
  it('keyless lexical source/count SQL always applies admitted programs before LIMIT', async () => {
    expect(await assistant(false)).toMatchObject({ textMatches: 1, hits: [{ documentId: DOCUMENT }], semantic: { available: false, reason: 'catalog_off' } });
    expect(h.embed).not.toHaveBeenCalled();
    for (const [sql, params] of h.query.mock.calls) if (/FROM vault\.documents d/.test(sql)) {
      expect(sql).toMatch(/d\.program_id\s*=\s*ANY\(/); expect(params).toContainEqual([PROGRAM]); expect(params).not.toContainEqual([PROGRAM, PRIVATE]);
      // Disposition eligibility has its own nested LIMIT 1. Compare with the
      // final page LIMIT/OFFSET, the boundary that controls returned ranking.
      if (/LIMIT\s+\$\d+\s+OFFSET/.test(sql)) expect(sql.indexOf('d.program_id = ANY')).toBeLessThan(sql.lastIndexOf('LIMIT'));
    }
  });
  it('scope revoked during synthetic query embedding withholds lexical hits and counts', async () => {
    h.embed.mockImplementation(async () => { h.revoked = true; return { embedding: [1, 2, 3] }; });
    await expect(assistant(true)).rejects.toThrow('HELDOUT_PRIVATE_SHARE_REVOKED');
  });
  it('unknown null aggregate ledger stays unknown after optional passage retrieval', async () => {
    h.nullLedger = true;
    const result = await searchDocumentPassages({ organizationId: 454, organizationUuid: ORG_UUID, query: 'participants' }, { sourceReadScope: SCOPE });
    expect(result.coverage).toBeNull(); expect(result.hits).toEqual([]); expect(h.retrieve).toHaveBeenCalled();
  });
  it('passage tenant UUID mismatch refuses before retrieval or any passage metadata', async () => {
    h.query.mockImplementation(async (sql: string) => /SELECT id FROM organizations/.test(sql) ? { rows: [{ id: 999 }] } : { rows: [] });
    await expect(searchDocumentPassages({ organizationId: 454, organizationUuid: ORG_UUID, query: 'participants' }, { sourceReadScope: SCOPE })).rejects.toThrow('organization identity');
    expect(h.retrieve).not.toHaveBeenCalled();
  });
});
