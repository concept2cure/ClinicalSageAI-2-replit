/** Held-out serving-program handoff through the actual registered handler and
 * actual completeCatalog source loader. Controlled SQL/embedding/writer seams;
 * genuine transaction move refusal is tested separately in catalog-postgres. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), preflight: vi.fn(), embed: vi.fn(), write: vi.fn(), currentProgram: '', moveBeforeService: false }));
vi.mock('../../../../server/db.js', () => ({ pool: { query: h.query, connect: () => { throw new Error('UNEXPECTED_CATALOG_CONNECTION'); } }, getPool: () => ({ query: h.query }), db: {} }));
vi.mock('../../../../server/db/tenantStore.js', async original => ({ ...(await original<any>()), getTenantScope: () => ({ tenantId: '42', role: 'member', source: 'request' }) }));
vi.mock('../../../../server/services/c2c/program-access.js', async original => ({ ...(await original<any>()), resolveOpenProgram: async (_q: any, ctx: any) => ctx.projectRef ?? null, programInOrganization: async () => true }));
vi.mock('../../../../server/services/enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: h.embed }) }));
vi.mock('../../../../server/services/vault/document-catalog-governance.service.js', () => ({ writeCatalogSuggestion: h.write, catalogStateOf: () => 'suggested' }));
vi.mock('../../../../server/services/vault/document-catalog.service.js', async original => ({ ...(await original<any>()), loadDocumentForOrg: h.preflight }));
import { registerDocumentCatalogHandlers } from '../../../../server/services/ana/document-catalog-tools.ts';
const handlers = new Map<string, any>(); registerDocumentCatalogHandlers((name, fn) => handlers.set(name, fn));
const A = 'aaaaaaaa-2222-4222-8222-222222222222';
const B = 'bbbbbbbb-2222-4222-8222-222222222222';
const ID = 'cccccccc-2222-4222-8222-222222222222';
const TEXT = 'Measured assay 99.20 % for batch B17.';
const input = { document_id: ID, document_kind: 'cert', purpose: 'Source evidence', summary: 'Batch B17 measured assay 99.20 %.', key_data: { batch: 'B17', result: '99.20 %' } };
const ctx = { organizationId: 42, userId: 7, projectRef: A, model: 'serving-model', threadId: 'serving-thread', turnId: 'serving-turn' };
const call = async (body: any = input) => JSON.parse(await handlers.get('catalog_project_document')(body, ctx));
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('ANA_DOCUMENT_CATALOG_FORCE_ON', 'true'); h.currentProgram = A; h.moveBeforeService = false;
  h.preflight.mockImplementation(async () => { const doc = { id: ID, organizationId: 42, programId: A, contentHash: 'd'.repeat(64) }; if (h.moveBeforeService) h.currentProgram = B; return doc; });
  h.query.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('SELECT d.id')) {
      // SQL-visible move: a genuinely supplied programme predicate cannot
      // return the now-B row for A. The identity is never merely model text.
      if (params[2] !== undefined && params[2] !== h.currentProgram) return { rows: [], rowCount: 0 };
      return { rows: [{ id: ID, organization_id: 42, program_id: h.currentProgram, content_hash: 'd'.repeat(64), catalog_content_hash: 'd'.repeat(64), extracted_text: TEXT, char_count: TEXT.length, catalog_status: 'extracted', extraction_method: 'utf8', original_file_available: true, file_name: 'coa.txt', document_title: 'CoA' }], rowCount: 1 };
    }
    if (sql.includes('SELECT char_start')) return { rows: [{ char_start: 0, char_end: TEXT.length }], rowCount: 1 };
    throw new Error('Unexpected SQL in independent serving-program handoff');
  });
  h.embed.mockResolvedValue({ embedding: [1, 2] }); h.write.mockResolvedValue({ ok: true, embeddingStatus: 'embedded' });
});
describe('independent serving-program snapshot', () => {
  it('a source admitted in A then moved to accessible B before service load cannot write B', async () => {
    h.moveBeforeService = true;
    const result = await call();
    expect(result.ok).not.toBe(true); expect(h.embed).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled();
  });
  it('body programme and expected-programme fields cannot replace the server A handoff', async () => {
    expect(await call({ ...input, program_id: B, expectedProgramId: B })).toMatchObject({ ok: true });
    expect(h.write).toHaveBeenCalledWith(expect.objectContaining({ programId: A, organizationId: 42, userId: 7 }));
  });
  it('a move after initial source load retains A in the final writer snapshot', async () => {
    h.embed.mockImplementation(async () => { h.currentProgram = B; return { embedding: [1, 2] }; });
    h.write.mockResolvedValue({ ok: false, refusal: 'Controlled final transaction source moved.' });
    expect(await call()).toMatchObject({ ok: false, refused: true });
    expect(h.write).toHaveBeenCalledWith(expect.objectContaining({ programId: A, contentHash: 'd'.repeat(64) }));
  });
});
