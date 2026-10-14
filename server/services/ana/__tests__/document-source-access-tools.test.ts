/** Actual registered tools, synthetic authority/service boundaries. No provider or DB proof. */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ raw: vi.fn(), actor: vi.fn(), list: vi.fn(), uploads: vi.fn(), scope: vi.fn(), search: vi.fn(), passages: vi.fn(), complete: vi.fn() }));
vi.mock('../catalog-scope.js', async original => ({ ...await original<Record<string, unknown>>(), catalogScope: h.scope }));
vi.mock('../../c2c/current-program-access.js', async original => (
  (await import('./support/source-read-tool-fixture.js')).syntheticProgramAccessMock(await original<Record<string, unknown>>(), () => 'viewer')
));
vi.mock('../../../db.js', () => ({ pool: { query: vi.fn() }, getPool: () => ({ query: vi.fn() }), db: {} }));
vi.mock('../../vault/vault-write-authority.js', () => ({ vaultWriteRefusal: () => null }));
vi.mock('../../vault/document-catalog.service.js', () => ({
  loadDocumentForOrg: h.raw, loadDocumentForActor: h.actor,
  listProjectDocuments: h.list, listProjectDocumentsForActor: h.list,
  listChatUploads: h.uploads, listChatUploadsForActor: h.uploads,
  isDocumentCatalogEnabled: async () => false,
  getReadCoverage: async (_id: string, _hash: string, count: number) => ({ charCount: count, coveredChars: 0, complete: false, uncovered: [{ start: 0, end: count }] }),
  completeCatalog: h.complete, revalidateActorSourceScope: async () => {},
}));
vi.mock('../../vault/vault-assistant-search.js', () => ({ searchVaultForAssistant: h.search }));
vi.mock('../../vault/document-passage-search.js', () => ({ searchDocumentPassages: h.passages, PassageSearchUnavailableError: class extends Error {} }));
import { registerDocumentCatalogHandlers } from '../document-catalog-tools.js';
import { loadDraftProjectSources } from '../draft-project-sources.js';
const programId = '10000000-0000-4000-8000-000000000001', documentId = '20000000-0000-4000-8000-000000000001';
const executor = { query: async () => ({ rows: [] }) };
const ctx = { organizationId: 42, userId: 7, sqlClient: executor, projectRef: programId };
const admittedScope = { organizationId: 42, userId: 7, role: 'viewer', projectId: 1, programId, accessibleProgramIds: [programId], actorFiltered: true as const };
const sourceAccess = { actorFiltered: true, currentVersion: true, retainedTextOnly: false, currentUseEligible: true, receiptEligible: true, scope: 'open_project', notice: 'Current actor-accessible source.' };
const doc = () => ({ id: documentId, programId, fileName: 'allowed.txt', contentHash: 'a'.repeat(64), extractedText: 'Allowed source evidence.', originalFileAvailable: true,
  admittedScope, sourceAccess, isCurrent: true, extractedTextSha256: createHash('sha256').update('Allowed source evidence.').digest('hex'), catalog: { contentHash: 'a'.repeat(64), status: 'extracted', extractionMethod: 'utf8', extractionConfidence: null } });
const handlers = new Map<string, (input: Record<string, unknown>, ctx?: any) => Promise<string>>();
registerDocumentCatalogHandlers((name, fn) => handlers.set(name, fn));
const call = async (tool: string, input: Record<string, unknown>, context: any = ctx) => JSON.parse(await handlers.get(tool)!(input, context));
beforeEach(() => {
  vi.clearAllMocks();
  h.scope.mockResolvedValue({ programId, admittedScope, executor, accessibleScope: {
    scope: 'verified-accessible-programs', actor: { userId: 7, role: 'viewer' }, programIds: [programId], reconciliationRequired: false,
  } });
  h.raw.mockResolvedValue({ ...doc(), fileName: 'PRIVATE-SECRET.txt', extractedText: 'PRIVATE-SECRET source.' });
  h.actor.mockResolvedValue(doc());
  h.list.mockResolvedValue({ documents: [], total: 0, withheld: 0, notYetStudied: 0, extractionFailed: 0, unfiled: 0, admittedScope, actorFiltered: true });
  h.uploads.mockResolvedValue({ uploads: [], total: 0, withheld: 0, hasMore: false, admittedScope, actorFiltered: true });
  h.search.mockResolvedValue({ hits: [], textMatches: 0, semantic: 'unavailable' });
  h.passages.mockResolvedValue({ hits: [], coverage: { total: 0, indexed: 0, pending: 0, failed: 0 }, ranking: 'text' });
});
describe('actor-aware registered source tools', () => {
  it('requires identified server actor before any read facade or source lookup', async () => {
    const result = await call('read_project_document', { document_id: documentId, userId: 7 }, { organizationId: 42 });
    expect(result.ok).toBe(false); expect(result.code).toBe('SOURCE_ACTOR_REQUIRED');
    expect(h.raw).not.toHaveBeenCalled(); expect(h.actor).not.toHaveBeenCalled();
  });
  it('does not leak org-only document text when actor facade refuses a private source', async () => {
    h.actor.mockImplementation(async () => { throw new Error('SOURCE_ACCESS_DENIED'); });
    const result = await call('read_project_document', { document_id: documentId, userId: 99 });
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain('PRIVATE-SECRET');
    expect(h.actor).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 42, userId: 7, projectRef: programId, documentId }), { includeText: true });
    expect(h.raw).not.toHaveBeenCalled();
  });
  it('active viewer can read without model or catalog flag and gets prospective legacy coverage wording', async () => {
    const receipts = new Map();
    const result = await call('read_project_document', { document_id: documentId }, { ...ctx, toolUseId: 'tu-read', readReceipts: receipts });
    expect(result.ok).toBe(true); expect(result.window.text).toBe('Allowed source evidence.');
    expect(result.coverage.scope).toBe('legacy_byte_history'); expect(result.coverage.prospective).toBe(true);
    expect(result.message).not.toMatch(/have now read|model received|served in a turn/i);
    expect(receipts.get('tu-read').sourceSnapshot).toMatchObject({ organizationId: 42, userId: 7, programId, documentId, extractedTextSha256: result.extractedTextSha256 });
  });
  it('historical by-ID text is disclosed without a new current-source receipt', async () => {
    h.actor.mockResolvedValue({ ...doc(), isCurrent: false, sourceAccess: { ...sourceAccess, currentVersion: false, currentUseEligible: false, receiptEligible: false, notice: 'Historical version; not current source evidence.' } });
    const receipts = new Map();
    const result = await call('read_project_document', { document_id: documentId }, { ...ctx, toolUseId: 'tu-history', readReceipts: receipts });
    expect(result.ok).toBe(true); expect(result.sourceAccess.currentVersion).toBe(false);
    expect(result.message).toContain('Historical version'); expect(receipts.size).toBe(0);
    expect(result.coverage.prospective).toBe(false);
  });
  it('list uses actor facade and never treats request body actor as authority', async () => {
    const result = await call('list_project_documents', { userId: 99, allowedProgramIds: ['private'] });
    expect(result.ok).toBe(true); expect(result.scope.actorFiltered).toBe(true);
    expect(h.list).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 42, userId: 7, projectRef: programId }), { limit: undefined });
    expect(h.uploads).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 42, userId: 7 }), { limit: 100 });
  });
  it.each(['search_project_documents', 'search_document_passages'])('pins actor scope in %s ranking and counts', async tool => {
    const result = await call(tool, { query: 'evidence', allowedProgramIds: ['private'] });
    expect(result.ok).toBe(true);
    const params = tool === 'search_project_documents' ? h.search.mock.calls[0][1] : h.passages.mock.calls[0][2];
    expect((tool === 'search_project_documents' ? h.search : h.passages).mock.calls[0][0]).toBe(executor);
    expect(params.sourceReadScope).toEqual(admittedScope);
    expect(params.allowedProgramIds).not.toEqual(['private']);
  });
  it('a scope denial never becomes an empty successful search', async () => {
    h.scope.mockResolvedValue({ error: 'Source scope unavailable.', code: 'SOURCE_ACCESS_DENIED' });
    const result = await call('search_project_documents', { query: 'evidence' });
    expect(result).toMatchObject({ ok: false, code: 'SOURCE_ACCESS_DENIED' }); expect(h.search).not.toHaveBeenCalled();
  });
  it('draft selections use actor facade before full extraction, refusing private sources', async () => {
    h.actor.mockImplementation(async () => { throw new Error('SOURCE_ACCESS_DENIED'); });
    await expect(loadDraftProjectSources([documentId], ctx)).rejects.toThrow();
    expect(h.actor).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, documentId }), { currentOnly: true });
    expect(h.raw).not.toHaveBeenCalled();
  });
});
