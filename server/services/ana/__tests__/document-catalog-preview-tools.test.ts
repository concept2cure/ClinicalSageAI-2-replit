import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { ToolContext } from '../AnaToolExecutor.js';

const h = vi.hoisted(() => ({
  enabled: true, role: 'member', previewEnabled: false,
  load: vi.fn(), complete: vi.fn(), preview: vi.fn(), coverage: vi.fn(), receipt: vi.fn(),
}));
vi.mock('../../../db.js', () => ({ pool: {}, getPool: () => ({}), db: {} }));
vi.mock('../../../db/tenantStore.js', async original => ({
  ...await original<typeof import('../../../db/tenantStore.js')>(),
  getTenantScope: () => ({ tenantId: '42', role: h.role, source: 'request' }),
}));
vi.mock('../../c2c/program-access.js', async original => ({
  ...await original<typeof import('../../c2c/program-access.js')>(),
  resolveOpenProgram: async (_db: unknown, ctx: ToolContext) => ctx.projectRef ?? null,
  programInOrganization: async () => true,
}));
vi.mock('../../vault/document-catalog.service.js', async () => {
  const { syntheticReadWrapper, syntheticActorDocument } = await import('./support/source-read-tool-fixture.js');
  return ({
  withAnaSourceReadScope: syntheticReadWrapper,
  revalidateActorSourceScope: async () => {},
  isDocumentCatalogEnabled: async () => h.enabled,
  isSourceFactPreviewEnabled: () => h.previewEnabled,
  loadDocumentForActor: (input: any, opts: any) => syntheticActorDocument(input, opts, h.load),
  loadDocumentForOrg: h.load, completeCatalog: h.complete, previewSourceFacts: h.preview,
  getReadCoverage: h.coverage, recordReadReceipt: h.receipt,
}); });

import { registerDocumentCatalogHandlers } from '../document-catalog-tools.js';
import { CATALOG_PROJECT_DOCUMENT } from '../document-catalog-tool-defs.js';
import { RESULT_BUDGET } from '../agentic-loop.js';
const handlers = new Map<string, (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>>();
registerDocumentCatalogHandlers((name, fn) => handlers.set(name, fn));
const program = '10000000-0000-4000-8000-000000000001';
const docId = '20000000-0000-4000-8000-000000000002';
const ctx: ToolContext = { organizationId: 42, userId: 7, projectRef: program, model: 'server-model', threadId: 'server-thread', turnId: 'server-turn' };
const description = { document_id: docId, document_kind: 'csr', purpose: 'Review source', summary: 'Source summary', key_data: { stated: '99.2' } };
const preview = { document_id: docId, record_type: 'verification_preview', fact_candidates: [{ schemaVersion: 1 }] };
const call = async (input: Record<string, unknown>, context = ctx) => JSON.parse(await handlers.get('catalog_project_document')!(input, context));
const doc = { id: docId, programId: program, contentHash: 'a'.repeat(64), extractedText: 'Assay was 99.2%.', fileName: 'assay.txt', documentTitle: 'Assay', catalog: { contentHash: 'a'.repeat(64), status: 'cataloged', extractionMethod: 'utf8', charCount: 16, documentKind: 'cert', keyData: { value: '99.2' }, state: 'confirmed' } };

beforeEach(() => {
  vi.clearAllMocks(); h.enabled = true; h.role = 'member'; h.previewEnabled = false;
  h.load.mockResolvedValue(doc); h.complete.mockResolvedValue({ ok: true, embeddingStatus: 'failed' });
  h.coverage.mockResolvedValue({ charCount: doc.extractedText.length, coveredChars: 0, uncovered: [{ start: 0, end: doc.extractedText.length }], complete: false });
  h.preview.mockResolvedValue({ ok: true, mode: 'verification_preview', persisted: false, reviewState: 'not_recorded', scientificQualification: 'unassessed', results: [{ transcription: { state: 'passed' }, context: { state: 'not_established' }, persisted: false }] });
});

describe('registered catalog verification preview branch', () => {
  it('refuses facts without explicit preview mode before catalog persistence', async () => {
    expect(await call({ ...description, fact_candidates: preview.fact_candidates })).toMatchObject({ ok: false, code: 'INVALID_CATALOG_INPUT' });
    expect(h.complete).not.toHaveBeenCalled(); expect(h.load).not.toHaveBeenCalled();
  });
  it.each(['document_kind', 'purpose', 'summary', 'key_data', 'user_id', 'actor', 'reviewState', 'organization_id', 'program_id'])('refuses preview field %s instead of silently granting or dropping it', async field => {
    h.previewEnabled = true;
    expect(await call({ ...preview, [field]: field === 'key_data' ? {} : 'body value' })).toMatchObject({ ok: false, code: 'INVALID_CATALOG_INPUT' });
    expect(h.preview).not.toHaveBeenCalled(); expect(h.complete).not.toHaveBeenCalled();
  });
  it('is off by default and makes no document or preview call', async () => {
    expect(await call(preview)).toMatchObject({ ok: false, code: 'SOURCE_FACT_PREVIEW_DISABLED', persisted: false });
    expect(h.preview).not.toHaveBeenCalled(); expect(h.load).not.toHaveBeenCalled(); expect(h.complete).not.toHaveBeenCalled();
  });
  it('keeps the catalog gate and write-role gate on preview', async () => {
    h.previewEnabled = true; h.enabled = false;
    expect((await call(preview)).error).toContain('not enabled');
    h.enabled = true; h.role = 'viewer';
    expect(await call(preview)).toMatchObject({ ok: false, refused: true });
    expect(h.preview).not.toHaveBeenCalled();
  });
  it('requires an identified actor and open project', async () => {
    h.previewEnabled = true;
    expect(await call(preview, { organizationId: 42, projectRef: program })).toMatchObject({ ok: false, code: 'CATALOG_ACTOR_REQUIRED' });
    expect(await call(preview, { organizationId: 42, userId: 7 })).toMatchObject({ ok: false, code: 'NO_PROJECT' });
    expect(h.preview).not.toHaveBeenCalled();
  });
  it('uses serving actor/project context and reports diagnostic checks without scientific approval', async () => {
    h.previewEnabled = true;
    const result = await call(preview);
    expect(result).toMatchObject({ ok: true, persisted: false, reviewState: 'not_recorded', scientificQualification: 'unassessed' });
    expect(h.preview).toHaveBeenCalledWith(expect.objectContaining({ documentId: docId, organizationId: 42, userId: 7, programId: program, candidates: preview.fact_candidates }));
    expect(h.complete).not.toHaveBeenCalled(); expect(h.receipt).not.toHaveBeenCalled();
  });
  it('a failed verification is a refusal, never an empty successful result', async () => {
    h.previewEnabled = true;
    h.preview.mockResolvedValue({ ok: false, code: 'SOURCE_FACT_BINDING_FAILED', refusal: 'Exact quote differs.', persisted: false });
    expect(await call(preview)).toMatchObject({ ok: false, code: 'SOURCE_FACT_BINDING_FAILED', persisted: false });
    expect(h.complete).not.toHaveBeenCalled();
  });
  it('reports an unconfirmed preview exception without leaking SQL or private metadata', async () => {
    h.previewEnabled = true; h.preview.mockRejectedValue(new Error('SQLSTATE 42501 SELECT private-study-marker FROM vault.document_catalog WHERE organization_id = 999'));
    const result = await call(preview);
    expect(result).toMatchObject({ ok: false, code: 'DOCUMENT_REQUEST_FAILED', outcome: 'unconfirmed' });
    expect(JSON.stringify(result)).not.toMatch(/SQLSTATE|SELECT|private-study-marker|organization_id|999/);
    expect(result.error).not.toMatch(/nothing was changed|nothing was saved/i);
    expect(h.complete).not.toHaveBeenCalled();
  });
  it('refuses an oversized complete preview rather than clipping diagnostic results', async () => {
    h.previewEnabled = true;
    h.preview.mockResolvedValue({ ok: true, persisted: false, results: [{ explanation: 'x'.repeat(RESULT_BUDGET) }] });
    const result = await call(preview);
    expect(result).toMatchObject({ ok: false, code: 'SOURCE_FACT_PREVIEW_RESPONSE_TOO_LARGE', persisted: false, reviewState: 'not_recorded' });
    expect(result.results).toBeUndefined(); expect(h.complete).not.toHaveBeenCalled();
  });
  it('rejects an unknown operation', async () => {
    expect(await call({ ...description, record_type: 'accept_fact' })).toMatchObject({ ok: false, code: 'INVALID_CATALOG_INPUT' });
    expect(h.complete).not.toHaveBeenCalled();
  });
  it('legacy descriptions retain suggestion attribution and disclose value-only checks', async () => {
    const result = await call(description);
    expect(result).toMatchObject({ ok: true, catalogState: 'suggested', checkScope: { kind: 'legacy_value_presence', context: 'not_recorded', scientificQualification: 'unassessed' } });
    expect(result.message).toMatch(/labels and context.*not.*verified/i);
    expect(h.complete).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, proposer: expect.objectContaining({ model: 'server-model', threadId: 'server-thread', turnId: 'server-turn' }) }));
  });
  it('tool schema advertises the same explicit mutually exclusive branches', () => {
    const schema = CATALOG_PROJECT_DOCUMENT.input_schema as typeof CATALOG_PROJECT_DOCUMENT.input_schema & { oneOf: any[] };
    expect(schema.required).toEqual(['document_id']);
    expect(schema.properties.record_type).toMatchObject({ enum: ['description', 'verification_preview'] });
    expect(schema.oneOf).toHaveLength(2);
    expect(schema.oneOf[1]).toMatchObject({ additionalProperties: false, required: ['document_id', 'record_type', 'fact_candidates'] });
  });
});

describe('registered read exact extraction envelope', () => {
  it('a stale metadata undercount does not clip the source or claim a complete read', async () => {
    h.load.mockResolvedValue({ ...doc, catalog: { ...doc.catalog, charCount: 3 } });
    const result = JSON.parse(await handlers.get('read_project_document')!({ document_id: docId }, ctx));
    expect(result.totalChars).toBe(doc.extractedText.length); expect(result.window.text).toBe(doc.extractedText);
    expect(result.coverage.complete).toBe(false); expect(h.receipt).not.toHaveBeenCalled();
  });
  it('identifies stored text and bytes without minting a read receipt', async () => {
    const result = JSON.parse(await handlers.get('read_project_document')!({ document_id: docId }, ctx));
    expect(result).toMatchObject({ contentHash: doc.contentHash, extractedTextSha256: createHash('sha256').update(doc.extractedText).digest('hex') });
    expect(result.coverage.complete).toBe(false); expect(h.receipt).not.toHaveBeenCalled();
    expect(result.comprehension).toMatchObject({ state: 'confirmed', checkScope: { context: 'not_recorded', scientificQualification: 'unassessed' } });
  });
});
