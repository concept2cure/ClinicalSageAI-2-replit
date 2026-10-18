/** Actual actor facade and registered read handler; synthetic short-transaction admission/source rows.
 * These controls qualify composition, not PostgreSQL/RLS deployment. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const h = vi.hoisted(() => ({ text: 'Source measured 99.2%.', history: false, legacy: false, denied: false, onCoverage: null as (() => void) | null, repair: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: {}, getPool: () => ({}), db: {} }));
vi.mock('../../c2c/current-program-access.js', async original => (
  (await import('./support/source-read-tool-fixture.js')).syntheticProgramAccessMock(await original<Record<string, unknown>>(), () => 'viewer')
));
vi.mock('../../vault/document-catalog-actor-access.js', async () => {
  const { AnaProjectScopeError } = await import('../project-scope-admission.js');
  return { withAnaSourceReadScope: async (input: any, run: any) => {
    if (h.denied) throw new AnaProjectScopeError(403, 'ANA_SOURCE_ACCESS_DENIED', 'Current source access was refused.');
    return run({}, { organizationId: input.organizationId, userId: input.userId, role: 'viewer', projectId: 1,
      programId: '10000000-0000-4000-8000-000000000001', accessibleProgramIds: ['10000000-0000-4000-8000-000000000001'], actorFiltered: true });
  } };
});
vi.mock('../../vault/document-catalog.service.js', async () => {
  const { runLoadDocumentForActor } = await import('../../vault/document-catalog-actor-reads.js');
  const { buildExtractionOutcome, computeCoverage } = await import('../../vault/document-catalog-core.js');
  return {
    withAnaSourceReadScope: (await import('../../vault/document-catalog-actor-access.js')).withAnaSourceReadScope,
    loadDocumentForActor: (input: any, opts = {}) => runLoadDocumentForActor(input, opts, { load: async () => ({
      id: '20000000-0000-4000-8000-000000000001', organizationId: 42, programId: '10000000-0000-4000-8000-000000000001',
      contentHash: 'a'.repeat(64), extractedText: h.text, isCurrent: !h.history, disposition: null, originalFileAvailable: true,
      fileName: 'source.txt', documentTitle: 'Source', catalog: h.legacy ? null : { contentHash: 'a'.repeat(64), status: 'extracted', extractionMethod: 'utf8', extractionConfidence: null },
    } as any) }),
    getReadCoverage: async (_id: string, _hash: string, length: number) => { h.onCoverage?.(); return computeCoverage([], length); },
    revalidateActorSourceScope: async () => {}, buildExtractionOutcome, recordExtractionOutcome: h.repair,
  };
});
import { registerDocumentCatalogHandlers } from '../document-catalog-tools.js';
const id = '20000000-0000-4000-8000-000000000001';
const ctx = { organizationId: 42, userId: 7, sqlClient: { query: async () => ({ rows: [] }) },
  projectRef: '10000000-0000-4000-8000-000000000001', threadId: 'server-thread' };
const handlers = new Map<string, (input: Record<string, unknown>, ctx?: any) => Promise<string>>();
registerDocumentCatalogHandlers((name, fn) => handlers.set(name, fn));
const read = async (context = ctx as any) => JSON.parse(await handlers.get('read_project_document')!({ document_id: id }, context));
beforeEach(() => { h.text = 'Source measured 99.2%.'; h.history = false; h.legacy = false; h.denied = false; h.onCoverage = null; h.repair.mockClear(); });
describe('actual metadata/body facade composition', () => {
  it('current body delivery survives its metadata-only final guard, whose receipt projection is false', async () => {
    const deferred = new Map();
    const result = await read({ ...ctx, toolUseId: 'tu-read', readReceipts: deferred });
    expect(result.ok).toBe(true); expect(result.window.text).toBe(h.text);
    expect(result.coverage).toMatchObject({ prospective: true, providerServedProof: false, currentActorExtractionProof: false });
    expect(deferred.get('tu-read').sourceSnapshot).toMatchObject({ organizationId: 42, userId: 7, documentId: id,
      extractedTextSha256: createHash('sha256').update(h.text).digest('hex') });
  });
  it('historical text remains readable without current-source receipt', async () => {
    h.history = true; const deferred = new Map();
    const result = await read({ ...ctx, toolUseId: 'tu-history', readReceipts: deferred });
    expect(result.ok).toBe(true); expect(result.sourceAccess.currentVersion).toBe(false); expect(deferred.size).toBe(0);
  });
  it('stored legacy text is readable without a backfill write', async () => {
    h.legacy = true;
    const deferred = new Map();
    const result = await read({ ...ctx, toolUseId: 'tu-legacy', readReceipts: deferred }); expect(result.ok).toBe(true); expect(result.window.text).toBe(h.text);
    expect(deferred.size).toBe(0); expect(result.coverage.prospective).toBe(false);
    expect(result.message).toMatch(/metadata is unrecorded/); expect(h.repair).not.toHaveBeenCalled();
  });
  it('same-length extraction mutation during coverage withdraws content even outside settling host', async () => {
    h.onCoverage = () => { h.text = 'Source measured 11.1%.'; };
    const result = await read(); expect(result).toMatchObject({ ok: false, code: 'SOURCE_CHANGED_DURING_READ' });
    expect(result.window).toBeUndefined();
  });
  it('access revocation during coverage withdraws content even outside settling host', async () => {
    h.onCoverage = () => { h.denied = true; };
    const result = await read(); expect(result).toMatchObject({ ok: false, code: 'ANA_SOURCE_ACCESS_DENIED' });
    expect(result.window).toBeUndefined();
  });
});
