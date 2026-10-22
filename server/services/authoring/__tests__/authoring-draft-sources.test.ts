import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ load: vi.fn(), lock: vi.fn(), query: vi.fn(), search: vi.fn(), sources: vi.fn() }));
vi.mock('../../vault/document-catalog.service.js', () => ({ loadDocumentForOrg: h.load }));
vi.mock('../../vault/document-passage-search.js', () => ({ searchDocumentPassages: h.search }));
vi.mock('../../clinical-regulatory-evidence/retrieval-source-link.js', () => ({ resolveEvidenceSourceIdsByVaultDocuments: h.sources }));
vi.mock('../../document-data-disposition/program-lock.js', () => ({ lockDocumentDispositionProgram: h.lock }));
import { reserveSectionDraftSources, retrieveSectionDraftSources } from '../authoring-draft-sources';
const programId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const contentHash = 'a'.repeat(64);
const receipt = { programId, retrievedBy: 99, documents: [{ documentId, contentHash, version: '1.0' }] };
const q = { query: h.query };
beforeEach(() => {
  vi.clearAllMocks();
  h.query.mockResolvedValue({ rows: [] });
  h.search.mockResolvedValue({ hits: [{ documentId, documentTitle: 'Recorded source', locator: 'Page 2', text: 'Source passage' }] });
  h.sources.mockResolvedValue(new Map([[documentId, 41]]));
  h.load.mockResolvedValue({ id: documentId, programId, contentHash, version: '1.0', disposition: null,
    catalog: { contentHash, status: 'extracted' } });
});
describe('source receipt reservation at draft accept', () => {
  it('reserves the existing source stores and verifies the same program, bytes and version', async () => {
    await reserveSectionDraftSources(q, 7, receipt, 5);
    expect(h.lock).toHaveBeenCalledWith(q, 7, programId);
    expect(h.query).toHaveBeenCalledWith('LOCK TABLE vault.documents, vault.document_catalog IN SHARE MODE');
    expect(h.load).toHaveBeenCalledWith(documentId, 7, { executor: q, userId: 5, programId, currentOnly: true });
  });
  it.each([
    null,
    { id: documentId, programId, contentHash: 'b'.repeat(64), version: '1.0', catalog: { contentHash: 'b'.repeat(64), status: 'extracted' } },
    { id: documentId, programId, contentHash, version: '2.0', catalog: { contentHash, status: 'extracted' } },
    { id: documentId, programId, contentHash, version: '1.0', disposition: 'remove_data', catalog: { contentHash, status: 'extracted' } },
    { id: documentId, programId: documentId, contentHash, version: '1.0', catalog: { contentHash, status: 'extracted' } },
  ])('refuses stale, withdrawn, superseded/missing or foreign sources: %j', async doc => {
    h.load.mockResolvedValue(doc);
    await expect(reserveSectionDraftSources(q, 7, receipt, 5)).rejects.toMatchObject({ status: 409, code: 'DRAFT_SOURCES_UNAVAILABLE' });
  });
  it('preserves legacy candidates but refuses a malformed recorded receipt', async () => {
    await reserveSectionDraftSources(q, 7, undefined, 5);
    expect(h.load).not.toHaveBeenCalled();
    await expect(reserveSectionDraftSources(q, 7, { programId, documents: null }, 5)).rejects.toMatchObject({ code: 'DRAFT_SOURCES_UNAVAILABLE' });
  });
});


describe('section source capture uses current verified caller access', () => {
  const args = { executor: q, userId: 5, organizationId: 7, organizationUuid: documentId, programId, query: 'Source evidence' };
  it('uses one scoped executor and records the actual retrieval actor without creating source identities', async () => {
    const result = await retrieveSectionDraftSources(args);
    expect(h.search).toHaveBeenCalledWith(q, expect.objectContaining({ organizationId: 7, userId: 5 }), { limit: 5, programId });
    expect(h.load).toHaveBeenCalledWith(documentId, 7, { executor: q, userId: 5, programId, currentOnly: true });
    expect(h.sources).toHaveBeenCalledWith(7, programId, [documentId], q);
    expect(result).toEqual({ chunks: [{ content: 'Source passage', title: 'Recorded source (Page 2)', sourceId: 'cre_source:41' }],
      receipt: { programId, retrievedBy: 5, documents: receipt.documents } });
  });
  it('keeps an unregistered actual Vault source uncited rather than inventing a registry entry', async () => {
    h.sources.mockResolvedValue(new Map());
    expect((await retrieveSectionDraftSources(args)).chunks[0].sourceId).toBeNull();
  });
  it.each([0, NaN, -5])('refuses an invalid current principal %s before source retrieval', async userId => {
    await expect(retrieveSectionDraftSources({ ...args, userId })).rejects.toMatchObject({ code: 'DRAFT_SOURCES_UNAVAILABLE' });
    expect(h.search).not.toHaveBeenCalled();
    await expect(reserveSectionDraftSources(q, 7, receipt, userId)).rejects.toMatchObject({ code: 'DRAFT_SOURCES_UNAVAILABLE' });
    expect(h.load).not.toHaveBeenCalled();
  });
  it('rechecks with the current accepting principal rather than the receipt retrieval actor', async () => {
    const denied = Object.assign(new Error('Current source access denied'), { code: 'PROJECT_ACCESS_DENIED' });
    h.load.mockRejectedValue(denied);
    await expect(reserveSectionDraftSources(q, 7, receipt, 5)).rejects.toBe(denied);
    expect(h.load).toHaveBeenCalledWith(documentId, 7, expect.objectContaining({ executor: q, userId: 5 }));
    expect(h.load.mock.calls[0][2].userId).not.toBe(receipt.retrievedBy);
  });
});
