/** Actual registered handlers with controlled source/policy seams. Expected
 * actor filters/identity guards are SQL-qualified separately; no provider. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ load: vi.fn(), list: vi.fn(), uploads: vi.fn(), coverage: vi.fn(), revalidate: vi.fn(), search: vi.fn(), passage: vi.fn(), enabled: false }));
vi.mock('../../../../server/db.js', () => ({ pool: { query: () => { throw new Error('UNOWNED_DATABASE_ACCESS'); } }, getPool: () => { throw new Error('UNOWNED_DATABASE_ACCESS'); }, db: {} }));
vi.mock('../../../../server/db/tenantStore.js', async original => ({ ...(await original<any>()), getTenantScope: () => ({ tenantId: '363', role: 'viewer', source: 'request' }) }));
vi.mock('../../../../server/services/ana/catalog-scope.js', () => ({
  sourceReadInput: (ctx: any, org: number, requestedProgramId?: string) => ({ organizationId: org, userId: ctx?.userId, projectId: ctx?.projectId, projectRef: ctx?.projectRef, requestedProgramId }),
  catalogScope: async (ctx: any) => ({ programId: ctx?.projectRef ?? null, admittedScope: { organizationId: 363, userId: ctx?.userId, role: 'viewer', projectId: ctx?.projectRef ? 36301 : null, programId: ctx?.projectRef ?? null, accessibleProgramIds: ['36363636-1111-4111-8111-000000000001'], actorFiltered: true } }),
  documentScopeRefusal: async () => null,
}));
vi.mock('../../../../server/services/vault/document-catalog-actor-access.js', () => ({
  withAnaSourceReadScope: async (_input: any, run: any) => run({ query: () => { throw new Error('UNOWNED_DATABASE_ACCESS'); } }, actorScope),
}));
vi.mock('../../../../server/services/vault/document-catalog.service.js', async original => {
  const core = await import('../../../../server/services/vault/document-catalog-core.ts');
  return { ...core, isDocumentCatalogEnabled: async () => h.enabled, loadDocumentForActor: h.load,
    listProjectDocumentsForActor: h.list, listChatUploadsForActor: h.uploads, getReadCoverage: h.coverage, revalidateActorSourceScope: h.revalidate };
});
vi.mock('../../../../server/services/vault/vault-assistant-search.js', () => ({ searchVaultForAssistant: h.search }));
vi.mock('../../../../server/services/vault/document-passage-search.js', () => ({ searchDocumentPassages: h.passage, PassageSearchUnavailableError: class extends Error {} }));
import { registerDocumentCatalogHandlers } from '../../../../server/services/ana/document-catalog-tools.ts';
import { runLoadDocumentForActor } from '../../../../server/services/vault/document-catalog-actor-reads.ts';
const handlers = new Map<string, any>(); registerDocumentCatalogHandlers((name, fn) => handlers.set(name, fn));
const program = '36363636-1111-4111-8111-000000000001';
const document = '37373737-1111-4111-8111-000000000001';
const TEXT = 'Synthetic source K17: result 82 participants.';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const ctx = { organizationId: 363, userId: 3631, projectRef: program, projectId: 36301, threadId: 'independent-thread' };
const actorScope = { organizationId: 363, userId: 3631, role: 'viewer', projectId: 36301, programId: program, accessibleProgramIds: [program], actorFiltered: true };
function doc(extra: Record<string, any> = {}) {
  return { id: document, organizationId: 363, programId: program, fileName: 'source.pdf', documentTitle: 'Synthetic source', contentHash: 'a'.repeat(64), extractedText: TEXT, extractedTextSha256: sha(TEXT), isCurrent: true,
    disposition: null, originalFileAvailable: true, admittedScope: actorScope,
    sourceAccess: { actorFiltered: true, currentVersion: true, currentUseEligible: true, receiptEligible: true, retainedTextOnly: false, scope: 'open_project', notice: 'Only the admitted open project is covered.' },
    catalog: { contentHash: 'a'.repeat(64), status: 'extracted', extractionMethod: 'text', extractionConfidence: null, charCount: TEXT.length, extractionError: null }, ...extra };
}
const call = async (name: string, input: any, context: any = ctx) => JSON.parse(await handlers.get(name)(input, context));
beforeEach(() => {
  vi.clearAllMocks(); h.enabled = false;
  h.load.mockImplementation(async (_actor: any, opts: any) => doc(opts?.includeText ? {} : { extractedText: null }));
  h.revalidate.mockResolvedValue(actorScope);
  h.coverage.mockResolvedValue({ charCount: TEXT.length, coveredChars: 0, complete: false, uncovered: [{ start: 0, end: TEXT.length }] });
  h.list.mockResolvedValue({ documents: [], total: 0, withheld: 0, notYetStudied: 0, extractionFailed: 0, unfiled: 0, admittedScope: actorScope, actorFiltered: true });
  h.uploads.mockResolvedValue({ uploads: [], total: 0, withheld: 0, hasMore: false, actorFiltered: true });
  h.search.mockResolvedValue({ hits: [], textHits: [], catalogHits: [], ranking: 'text', coverage: null });
  h.passage.mockResolvedValue({ hits: [], ranking: 'text', coverage: { total: 0, indexed: 0, pending: 0, failed: 0, unfiledUploads: null } });
});
describe('independent actual registered source tools', () => {
  it('active viewer reads without catalog/model flags and reports prospective history only', async () => {
    // Actual facade projection: body requests may defer receipts, while the
    // final metadata projection necessarily has receiptEligible:false. Treat
    // this transport difference as a source change only if the source itself
    // changed. Policy and raw SQL are separate controlled seams in this case.
    h.load.mockImplementation((input: any, opts: any = {}) => runLoadDocumentForActor(input, opts, { load: async () => doc() as any }));
    const metadata = await h.load({ ...ctx, documentId: document }, {});
    expect(metadata).toMatchObject({ extractedText: null, extractedTextSha256: sha(TEXT), sourceAccess: { receiptEligible: false } });
    const readReceipts = new Map(); const result = await call('read_project_document', { document_id: document }, { ...ctx, toolUseId: 'read-viewer', readReceipts });
    expect(result).toMatchObject({ ok: true, window: { text: TEXT }, coverage: { scope: 'legacy_byte_history', prospective: true, currentActorExtractionProof: false, providerServedProof: false } });
    expect(result.message).toContain('prospective'); expect(readReceipts.size).toBe(1);
    expect(h.load).toHaveBeenCalledWith(expect.objectContaining({ userId: ctx.userId, projectRef: program }), expect.anything());
  });
  it('missing identified actor refuses before any source facade', async () => {
    expect(await call('read_project_document', { document_id: document, userId: ctx.userId }, { organizationId: 363 })).toMatchObject({ ok: false, code: 'SOURCE_ACTOR_REQUIRED' });
    expect(h.load).not.toHaveBeenCalled();
  });
  it('server context determines actor identity despite model body overrides', async () => {
    expect((await call('read_project_document', { document_id: document, userId: 999, organizationId: 999 })).ok).toBe(true);
    expect(h.load).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 363, userId: 3631 }), expect.anything());
  });
  it('named source access denial does not disclose private filename, ID or failure reason', async () => {
    h.load.mockRejectedValue(new Error('PRIVATE_FAILURE_SENTINEL PRIVATE_FILENAME_SENTINEL'));
    const result = await call('read_project_document', { document_id: document }); expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_'); expect(JSON.stringify(result)).not.toContain(document); expect(result).not.toHaveProperty('window');
  });
  it('read access revoked during coverage await cannot emit earlier admitted text', async () => {
    h.coverage.mockImplementation(async () => { h.load.mockRejectedValue(new Error('synthetic revoked private share')); return { charCount: TEXT.length, coveredChars: 0, complete: false, uncovered: [{ start: 0, end: TEXT.length }] }; });
    const result = await call('read_project_document', { document_id: document }); expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TEXT); expect(result).not.toHaveProperty('window');
  });
  it('same-length extraction replacement during coverage await cannot emit stale text', async () => {
    h.coverage.mockImplementation(async () => { h.load.mockResolvedValue(doc({ extractedText: null, extractedTextSha256: sha(TEXT.replace('82', '83')) })); return { charCount: TEXT.length, coveredChars: 0, complete: false, uncovered: [{ start: 0, end: TEXT.length }] }; });
    const result = await call('read_project_document', { document_id: document }); expect(result.ok).toBe(false); expect(result).not.toHaveProperty('window');
  });
  it('history remains explicitly historical and earns no new current-source receipt', async () => {
    const historical = doc({ isCurrent: false, sourceAccess: { ...doc().sourceAccess, currentVersion: false, currentUseEligible: false, receiptEligible: false, notice: 'Historical version; no new current-source receipt.' } });
    h.load.mockResolvedValue(historical); const readReceipts = new Map();
    const result = await call('read_project_document', { document_id: document }, { ...ctx, toolUseId: 'read-history', readReceipts });
    expect(result).toMatchObject({ ok: true, sourceAccess: { currentVersion: false }, coverage: { prospective: false } }); expect(readReceipts.size).toBe(0);
  });
  it('keep_data read states original unavailable and preserves eligible retained extraction', async () => {
    h.load.mockResolvedValue(doc({ disposition: 'keep_data', originalFileAvailable: false, sourceAccess: { ...doc().sourceAccess, retainedTextOnly: true, notice: 'Original unavailable; retained extracted text only.' } }));
    expect(await call('read_project_document', { document_id: document })).toMatchObject({ ok: true, originalFileAvailable: false, sourceAccess: { retainedTextOnly: true }, window: { text: TEXT } });
  });
  it('actor-filtered list never labels upload lookup failure as no files', async () => {
    h.uploads.mockRejectedValue(new Error('PRIVATE_FILENAME_SENTINEL'));
    const result = await call('list_project_documents', {}, { ...ctx, projectRef: null, projectId: null });
    expect(result).toMatchObject({ ok: true, scope: { accessibleProjects: true, actorFiltered: true }, chatUploads: null });
    expect(result.chatUploadsError).toContain('could not'); expect(JSON.stringify(result)).not.toContain('PRIVATE_');
    expect(h.list).toHaveBeenCalledWith(expect.objectContaining({ userId: 3631 }), expect.anything());
  });
  it('passage outside-index ledger unknown stays unknown with actor-filtered scope', async () => {
    const result = await call('search_document_passages', { query: 'participants' });
    expect(result).toMatchObject({ ok: true, scope: { actorFiltered: true }, coverage: { unfiledUploads: null } });
    expect(result.message).toContain('could not be checked');
    expect(h.passage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sourceReadScope: expect.objectContaining({ userId: 3631, accessibleProgramIds: [program] }) }));
  });
});

describe('actual serving call-site source checks (static integration evidence)', () => {
  it('both canonical chat bootstrap calls forward authenticated actor and admitted project reference', () => {
    for (const file of ['server/routes/chat/send-message.ts', 'server/routes/ana-ri/stream.ts']) {
      const source = fs.readFileSync(file, 'utf8'); const call = source.match(/(?:const\s+\w+\s*=\s*)?await sessionBootstrapBlockFor\(\{([\s\S]*?)\}\)/)?.[1];
      expect(call, file).toBeTruthy(); expect(call, file).toMatch(/userId\s*:/); expect(call, file).toMatch(/projectRef\s*:/); expect(call, file).not.toContain('req.body.user');
    }
  });
  it('actual stream and nonstream loop hosts guard staged sources with cancellation before settlement', () => {
    for (const file of ['server/routes/ana-ri/stream.ts', 'server/services/ana/AnaToolExecutor.ts']) {
      const source = fs.readFileSync(file, 'utf8'); const start = source.indexOf('budgetToolResultsForModel(entries');
      expect(start, file).toBeGreaterThan(0); const handoff = source.slice(start, start + 2600);
      expect(handoff, file).toMatch(/guardReadResultsForHandoff\(/); expect(handoff, file).toMatch(/signal\s*(?::|[,}])/);
      expect(handoff.indexOf('guardReadResultsForHandoff'), file).toBeLessThan(handoff.indexOf('settleReadReceipts'));
    }
  });
  it('registered recall forwards the authenticated actor and session project scope', () => {
    const source = fs.readFileSync('server/services/ana/AnaToolExecutor.ts', 'utf8');
    const start = source.indexOf('await buildSessionBootstrapContext({'); expect(start).toBeGreaterThan(0);
    const call = source.slice(start, start + 1000); expect(call).toMatch(/userId\s*:\s*(?:ctx|context|toolContext)\??\.userId/); expect(call).toMatch(/projectRef\s*:/);
  });
});
