import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ revoked: false, query: vi.fn() }));
vi.mock('../vault/retrieval-source-access.js', async original => ({ ...(await original() as object),
  withRetrievalReadScope: async (_scope: unknown, run: any) => {
    if (h.revoked) throw new Error('ANA_SOURCE_SCOPE_CHANGED');
    return run({ query: h.query });
  },
}));
vi.mock('../ana/source-read-scope.js', async original => ({ ...(await original() as object),
  revalidateAnaSourceReadScope: async (_q: unknown, scope: unknown) => {
    if (h.revoked) throw new Error('ANA_SOURCE_SCOPE_CHANGED');
    return scope;
  },
}));
import { AdvancedRAGPipeline } from '../advancedRAGPipeline';
import { optionsForIntent } from '../ragRouter';
const UUID = '20000000-0000-4000-8000-000000000001';
const PROGRAM = '10000000-0000-4000-8000-000000000001';
const DOCUMENT = '30000000-0000-4000-8000-000000000001';
const HASH = 'a'.repeat(64);
const SCOPE = { organizationId: 7, userId: 12, role: 'viewer', projectId: null, programId: null, accessibleProgramIds: [PROGRAM], actorFiltered: true as const };

function pipeline() {
  const out: any = Object.create(AdvancedRAGPipeline.prototype);
  out.pool = { connect: async () => ({ query: h.query, release: vi.fn() }), query: h.query };
  out.embeddingService = { embed: vi.fn(async () => ({ embedding: [1, 2, 3] })) };
  return out;
}
beforeEach(() => {
  h.revoked = false; vi.clearAllMocks();
  h.query.mockImplementation(async (sql: string) => ({ rows: /SELECT id FROM organizations/.test(sql) ? [{ id: 7 }] : [] }));
});
describe('existing RAG actor programme filtering', () => {
  it('passes source authority and allowed filters through the existing router', () => {
    expect(optionsForIntent({ query: 'q', sourceReadScope: SCOPE, filters: { allowedProgramIds: [PROGRAM] } })).toMatchObject({ sourceReadScope: SCOPE, filters: { allowedProgramIds: [PROGRAM] } });
  });
  it('constrains dense materialisation and sparse candidates before ranking/limit', async () => {
    await pipeline().searchVaultSimilar('stability', 1, 0.5, UUID, false, true, { allowedProgramIds: [PROGRAM] });
    const statements = h.query.mock.calls.filter(([sql]) => /FROM vault\.document_chunks/.test(sql));
    expect(statements).toHaveLength(2);
    for (const [sql, params] of statements) {
      expect(sql).toMatch(/d\.program_id = ANY\(\$\d+::uuid\[\]\)/);
      expect(sql.indexOf('d.program_id = ANY')).toBeLessThan(sql.indexOf('ORDER BY'));
      expect(params).toContainEqual([PROGRAM]);
      expect(sql).toContain('vault.documents succ');
    }
  });
  it('re-admits actor access after the query embedding resolves', async () => {
    const p = pipeline();
    p.embeddingService.embed.mockImplementation(async () => { h.revoked = true; return { embedding: [1, 2, 3] }; });
    await expect(p.searchVaultSimilar('stability', 1, 0.5, UUID, false, true, { allowedProgramIds: [PROGRAM] }, undefined, SCOPE)).rejects.toThrow('ANA_SOURCE_SCOPE_CHANGED');
    expect(h.query.mock.calls.some(([sql]) => /FROM vault\.document_chunks/.test(sql))).toBe(false);
  });
  it.each([
    { code: '42883', message: 'operator missing' },
    { code: '42704', message: 'type "vector" does not exist' },
  ])('recovers the lexical branch after missing vector SQL ($code) instead of querying an aborted transaction', async error => {
    let aborted = false;
    h.query.mockImplementation(async (sql: string) => {
      if (sql === 'ROLLBACK TO SAVEPOINT vault_dense_search') { aborted = false; return { rows: [] }; }
      if (aborted) throw Object.assign(new Error('aborted transaction'), { code: '25P02' });
      if (/WITH scoped AS MATERIALIZED/.test(sql)) { aborted = true; throw Object.assign(new Error(error.message), { code: error.code }); }
      return { rows: [] };
    });
    await expect(pipeline().searchVaultSimilar('stability', 1, 0.5, UUID, false, true, { allowedProgramIds: [PROGRAM] })).resolves.toEqual([]);
    expect(h.query.mock.calls.some(([sql]) => /websearch_to_tsquery/.test(sql))).toBe(true);
  });
  it('context expansion preserves programme, exact byte hash, currentness and live-parent fences', async () => {
    await pipeline().expandContext([{ id: 'chunk', documentId: DOCUMENT, programId: PROGRAM, contentHash: HASH, chunkIndex: 1, atomType: 'vault_chunk', content: 'text' }], 1, UUID, 7, { filters: { allowedProgramIds: [PROGRAM] }, sourceReadScope: SCOPE });
    const [sql, params] = h.query.mock.calls.find(([s]) => /SELECT c.chunk_text/.test(s))!;
    expect(sql).toMatch(/d\.program_id = ANY/);
    expect(sql).toContain('AND d.content_hash =');
    expect(sql).toContain('p.deleted_at IS NULL');
    expect(sql).toContain('vault.documents succ');
    expect(params).toContain(HASH);
  });
  it('source revalidation retains the allowed set after asynchronous processing', async () => {
    await pipeline().revalidateCandidates([{ id: 'chunk', chunkId: 'chunk', documentId: DOCUMENT, atomType: 'vault_chunk' }], { strategy: 'basic', organizationUuid: UUID, filters: { allowedProgramIds: [PROGRAM] } });
    const [sql, params] = h.query.mock.calls.find(([s]) => /SELECT c.id::text AS id/.test(s))!;
    expect(sql).toMatch(/d\.program_id = ANY/);
    expect(params).toContainEqual([PROGRAM]);
    expect(sql).toContain('vault.documents succ');
  });
  it('actor-scoped retrieval refuses a selected source when its byte identity changes', async () => {
    h.query.mockImplementation(async (sql: string) => ({ rows: /SELECT id FROM organizations/.test(sql) ? [{ id: 7 }] : /SELECT c.id::text AS id/.test(sql) ? [{ id: 'chunk', document_id: DOCUMENT, program_id: PROGRAM, content_hash: 'b'.repeat(64), title: 'Current source', original_file_available: true }] : [] }));
    await expect(pipeline().revalidateCandidates([{ id: 'chunk', chunkId: 'chunk', documentId: DOCUMENT, programId: PROGRAM, contentHash: HASH, atomType: 'vault_chunk' }], { strategy: 'basic', organizationUuid: UUID, sourceReadScope: SCOPE, filters: { allowedProgramIds: [PROGRAM] } })).rejects.toThrow('source identity changed');
  });
  it('refuses source actor authority on a corpus that cannot apply its programme constraint', async () => {
    await expect(pipeline().retrieve('stability', { strategy: 'basic', corpus: 'client_memory', sourceReadScope: SCOPE })).rejects.toThrow('requires the Vault corpus');
  });
});
