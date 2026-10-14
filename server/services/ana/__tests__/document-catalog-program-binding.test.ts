/** Actual registered description tool -> actual canonical completion service.
 * Synthetic DB/write fixtures isolate serving-project binding from final-role
 * admission: the actor is assumed able to write both programmes. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';
const h = vi.hoisted(() => ({ query: vi.fn(), embed: vi.fn(), write: vi.fn(), loads: 0, moveOnSecondLoad: false, missingPreflight: false }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: {} }));
vi.mock('../../../db/tenantStore.js', async original => ({
  ...await original<typeof import('../../../db/tenantStore.js')>(),
  getTenantScope: () => ({ tenantId: '42', role: 'member', source: 'request' }),
}));
vi.mock('../../c2c/program-access.js', async original => ({
  ...await original<typeof import('../../c2c/program-access.js')>(),
  resolveOpenProgram: async (_db: unknown, ctx: ToolContext) => ctx.projectRef ?? null,
  programInOrganization: async () => true,
}));
// Interactive actor preflight is synthetic here; completion and source loads are real.
vi.mock('../../vault/document-catalog.service.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../vault/document-catalog.service.js')>();
  const fixture = await import('./support/source-read-tool-fixture.js');
  return { ...real, withAnaSourceReadScope: fixture.syntheticReadWrapper, revalidateActorSourceScope: async () => {},
    loadDocumentForActor: (input: any, opts: any) => fixture.syntheticActorDocument(input, opts, real.loadDocumentForOrg) };
});
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: h.embed }) }));
vi.mock('../../vault/document-catalog-governance.service.js', () => ({ catalogStateOf: () => 'suggested', writeCatalogSuggestion: h.write }));
import { registerDocumentCatalogHandlers } from '../document-catalog-tools.js';
import { completeCatalog } from '../../vault/document-catalog.service.js';
const handlers = new Map<string, (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>>();
registerDocumentCatalogHandlers((name, fn) => handlers.set(name, fn));
const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';
const id = '20000000-0000-4000-8000-000000000002';
const text = 'Assay measured 99.2%.';
const context: ToolContext = { organizationId: 42, userId: 7, projectRef: A, threadId: 'server-thread', model: 'served-model' };
const input = { document_id: id, document_kind: 'cert', purpose: 'Source assay', summary: 'Assay measured.', key_data: { value: '99.2' } };
const call = async (body = input, ctx = context) => JSON.parse(await handlers.get('catalog_project_document')!(body, ctx));
beforeEach(() => {
  vi.clearAllMocks(); h.loads = 0; h.moveOnSecondLoad = false; h.missingPreflight = false;
  vi.stubEnv('ANA_DOCUMENT_CATALOG_FORCE_ON', 'true');
  h.embed.mockResolvedValue({ embedding: [1, 2, 3] });
  // Final writer can admit this actor in both A and B. The serving context
  // boundary must still hold before embedding and before writer invocation.
  h.write.mockResolvedValue({ ok: true, embeddingStatus: 'embedded' });
  h.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT d.id')) {
      h.loads++;
      if (h.loads === 1 && h.missingPreflight) return { rows: [] };
      return { rows: [{ id, organization_id: 42, program_id: h.loads > 1 && h.moveOnSecondLoad ? B : A, content_hash: 'a'.repeat(64), catalog_content_hash: 'a'.repeat(64), catalog_status: 'extracted', char_count: text.length, extracted_text: text, file_name: 'assay.txt', original_file_available: true }] };
    }
    if (sql.includes('SELECT char_start')) return { rows: [{ char_start: 0, char_end: text.length }] };
    throw new Error('Unexpected programme-binding fixture query');
  });
});

describe('serving programme binding across catalog source loads', () => {
  it.each([true, false])('a move between preflight and service load refuses even when both programmes are writable (project open: %s)', async open => {
    h.moveOnSecondLoad = true;
    const result = await call(input, open ? context : { organizationId: 42, userId: 7 });
    expect(result).toMatchObject({ ok: false, refused: true, code: 'SOURCE_PROGRAM_CHANGED' });
    expect(h.loads).toBe(2); expect(h.embed).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled();
  });
  it('a missing preflight cannot become an unadmitted document on a later load', async () => {
    h.missingPreflight = true; h.moveOnSecondLoad = true;
    expect(await call()).toMatchObject({ ok: false, idSpace: 'unknown' });
    expect(h.loads).toBe(1); expect(h.embed).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled();
  });
  it('a body-supplied programme cannot replace the server-loaded programme', async () => {
    expect(await call({ ...input, program_id: B, expectedProgramId: B } as typeof input)).toMatchObject({ ok: true, catalogState: 'suggested' });
    expect(h.write).toHaveBeenCalledWith(expect.objectContaining({ programId: A }));
  });
  it('the completion service independently refuses a different expected programme', async () => {
    expect(await completeCatalog({ documentId: id, organizationId: 42, documentKind: 'cert', purpose: 'Source assay', summary: 'Assay measured.', keyData: { value: '99.2' }, userId: 7, expectedProgramId: B })).toMatchObject({ ok: false, code: 'SOURCE_PROGRAM_CHANGED' });
    expect(h.embed).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled();
  });
  it('matching expected programme is retained in the final writer handoff', async () => {
    expect(await completeCatalog({ documentId: id, organizationId: 42, documentKind: 'cert', purpose: 'Source assay', summary: 'Assay measured.', keyData: { value: '99.2' }, userId: 7, expectedProgramId: A })).toMatchObject({ ok: true });
    expect(h.write).toHaveBeenCalledWith(expect.objectContaining({ programId: A }));
  });
});
