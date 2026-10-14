/** Registered input/JSON-schema interoperability checks. Source/database service
 * is an explicit seam; this suite makes no canonical authority/DB proof claim. */
import Ajv from 'ajv';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ enabled: true, previewEnabled: true, load: vi.fn(), complete: vi.fn(), preview: vi.fn() }));
vi.mock('../../../../server/db.js', () => ({ pool: { query: () => { throw new Error('UNOWNED_DATABASE_ACCESS'); } }, getPool: () => { throw new Error('UNOWNED_DATABASE_ACCESS'); }, db: {} }));
vi.mock('../../../../server/db/tenantStore.js', async original => ({ ...(await original<any>()), getTenantScope: () => ({ tenantId: '42', role: 'member', source: 'request' }) }));
vi.mock('../../../../server/services/c2c/program-access.js', async original => ({ ...(await original<any>()), resolveOpenProgram: async (_q: any, ctx: any) => ctx.projectRef ?? null, programInOrganization: async () => true }));
vi.mock('../../../../server/services/vault/document-catalog.service.js', () => ({ isDocumentCatalogEnabled: async () => h.enabled, isSourceFactPreviewEnabled: () => h.previewEnabled, loadDocumentForOrg: h.load, completeCatalog: h.complete, previewSourceFacts: h.preview }));
import { CATALOG_PROJECT_DOCUMENT } from '../../../../server/services/ana/document-catalog-tool-defs.ts';
import { registerDocumentCatalogHandlers } from '../../../../server/services/ana/document-catalog-tools.ts';
const handlers = new Map<string, any>(); registerDocumentCatalogHandlers((name, fn) => handlers.set(name, fn));
const validate = new Ajv({ strict: false }).compile(CATALOG_PROJECT_DOCUMENT.input_schema);
const program = 'abababab-1111-4111-8111-111111111111';
const document = 'cdcdcdcd-1111-4111-8111-111111111111';
const text = 'Product: XR; Batch: B17; Material: API; Method: HPLC; Result role: measured result; Assay: 99.20 %';
const anchor = { documentId: document, contentHash: 'a'.repeat(64), extractedTextSha256: createHash('sha256').update(text).digest('hex'), range: { start: 0, end: text.length }, exactQuote: text };
const spec = { kind: 'cmc_result', property: 'assay', productRef: 'XR', batchAsWritten: 'B17', materialAsWritten: 'API', methodAsWritten: 'HPLC', resultRole: 'measured_result' };
const fact = { schemaVersion: 1, meaning: spec, value: { kind: 'scalar', asWritten: '99.20', unitAsWritten: '%' }, origin: { kind: 'source_statement', valueAnchor: anchor, witnesses: Object.keys(spec).filter(k => !['kind', 'property'].includes(k)).map(k => ({ path: `meaning.${k}`, anchor })) } };
const preview = () => ({ document_id: document, record_type: 'verification_preview', fact_candidates: [structuredClone(fact)] });
const description = () => ({ document_id: document, document_kind: 'cert', purpose: 'Source evidence', summary: 'A complete source summary.' });
const ctx = { organizationId: 42, userId: 7, projectRef: program, model: 'serving-model' };
const call = async (input: any) => JSON.parse(await handlers.get('catalog_project_document')(input, ctx));
beforeEach(() => { vi.clearAllMocks(); h.enabled = true; h.previewEnabled = true; h.load.mockResolvedValue({ id: document, programId: program }); h.complete.mockResolvedValue({ ok: true, embeddingStatus: 'failed' }); h.preview.mockResolvedValue({ ok: true, mode: 'verification_preview', persisted: false, reviewState: 'not_recorded', scientificQualification: 'unassessed', results: [{ ok: true, transcription: { state: 'passed' }, context: { state: 'failed' }, persisted: false }] }); });
describe('independent registered catalog transport checks', () => {
  it('JSON Schema interoperates with both explicit preview and default legacy description', async () => { expect(validate(preview())).toBe(true); expect(validate(description())).toBe(true); expect((await call(description())).ok).toBe(true); });
  it('an acceptance-like operation is outside both schema and registered parser', async () => { const input = { ...description(), record_type: 'accept_fact' }; expect(validate(input)).toBe(false); expect(await call(input)).toMatchObject({ ok: false, code: 'INVALID_CATALOG_INPUT' }); expect(h.complete).not.toHaveBeenCalled(); });
  it('a near-matching mode cannot silently become legacy persistence', async () => { const input = { ...preview(), record_type: 'verification_preview ' }; expect(validate(input)).toBe(false); expect(await call(input)).toMatchObject({ ok: false, code: 'INVALID_CATALOG_INPUT' }); expect(h.complete).not.toHaveBeenCalled(); expect(h.preview).not.toHaveBeenCalled(); });
  it('facts without explicit preview refuse on both schema and registered handler', async () => { const input = { ...description(), fact_candidates: [fact] }; expect(validate(input)).toBe(false); expect(await call(input)).toMatchObject({ ok: false, code: 'INVALID_CATALOG_INPUT' }); expect(h.complete).not.toHaveBeenCalled(); });
  it.each(['actor', 'organization_id', 'summary', 'accepted'])('mixed preview %s refuses before any service call', async key => { const input = { ...preview(), [key]: 'body-controlled' }; expect(validate(input)).toBe(false); expect(await call(input)).toMatchObject({ ok: false, code: 'INVALID_CATALOG_INPUT' }); expect(h.preview).not.toHaveBeenCalled(); expect(h.complete).not.toHaveBeenCalled(); });
  it('diagnostic context failure remains source preview without review or persistence', async () => { const result = await call(preview()); expect(result).toMatchObject({ ok: true, persisted: false, reviewState: 'not_recorded', scientificQualification: 'unassessed', results: [{ context: { state: 'failed' } }] }); expect(h.preview).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 42, userId: 7, programId: program })); expect(h.complete).not.toHaveBeenCalled(); });
  it('full-read refusal is preserved as a failed result with its actual coverage', async () => { h.preview.mockResolvedValue({ ok: false, code: 'SOURCE_NOT_FULLY_READ', persisted: false, coverage: { complete: false, uncovered: [{ start: 20, end: 100 }] } }); expect(await call(preview())).toMatchObject({ ok: false, code: 'SOURCE_NOT_FULLY_READ', coverage: { complete: false } }); expect(h.complete).not.toHaveBeenCalled(); });
  it('flag-off refuses before preview source access', async () => { h.previewEnabled = false; expect(await call(preview())).toMatchObject({ ok: false, code: 'SOURCE_FACT_PREVIEW_DISABLED', persisted: false }); expect(h.preview).not.toHaveBeenCalled(); });
  it('default legacy result discloses value-only scope while preserving suggestion state', async () => { expect(await call(description())).toMatchObject({ ok: true, catalogState: 'suggested', checkScope: { kind: 'legacy_value_presence', context: 'not_recorded', scientificQualification: 'unassessed' } }); expect(h.preview).not.toHaveBeenCalled(); });
});
