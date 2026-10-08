/**
 * The document catalog tools stay in the open project (PF-10 S7; vault MISSED-2).
 *
 * A conversation belongs to one project (founder decision, 2026-09-26), and
 * cross-project references are refused by default (PF-11). The catalog tools
 * took whatever program the model named:
 *   - list_project_documents listed another program's documents, and for a v2
 *     project (a regulatory_programs UUID, so ctx.projectId is null) listed the
 *     whole organization instead of the open project;
 *   - file_chat_upload_to_vault filed a chat upload into whichever program the
 *     model named (the ingest checks only the organization).
 * Now the open project is resolved once (resolveOpenProgram): its program is
 * the scope, another is refused CROSS_PROJECT, and with no project open a file
 * is refused and pointed at the audited adopt (PF-07).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';

const h = vi.hoisted(() => ({
  open: vi.fn(async (_db: unknown, _ctx: any): Promise<string | null> => null),
  inOrg: vi.fn(async () => true),
  list: vi.fn(async () => ({ documents: [], total: 0, withheld: 0, notYetStudied: 0, extractionFailed: 0, unfiled: 0 })),
  uploads: vi.fn(async () => ({ uploads: [], hasMore: false })),
  docOf: vi.fn(async (): Promise<any> => null),
  receipt: vi.fn(async () => {}),
  complete: vi.fn(async () => ({ ok: true })),
  place: vi.fn(async () => ({ ok: true })),
  search: vi.fn(async () => ({ hits: [], searchedCount: 0, unsearchableCount: 0 })),
  passages: vi.fn(async () => ({ hits: [] as any[], coverage: null })),
  ownDocs: vi.fn(async (): Promise<{ rows: any[] }> => ({ rows: [] })),
  ingest: vi.fn(async () => ({
    ok: true,
    document: { id: '00000000-0000-4000-8000-000000000001', documentCode: 'c', fileName: 'f.pdf' },
    filing: { folderId: 'module-4', folderLabel: 'Module 4', placementStatus: 'suggested' },
  })),
}));
vi.mock('../../c2c/program-access.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../c2c/program-access.js')>()),
  resolveOpenProgram: h.open,
  programInOrganization: h.inOrg,
}));
vi.mock('../../../db.js', () => ({ pool: { query: h.ownDocs }, getPool: () => ({ query: h.ownDocs }), db: {} }));
vi.mock('../../vault/document-catalog-search.js', () => ({
  searchCatalog: h.search,
  CatalogSearchUnavailableError: class extends Error {},
}));
vi.mock('../../vault/document-passage-search.js', () => ({
  searchDocumentPassages: h.passages,
  PassageSearchUnavailableError: class extends Error {},
}));
vi.mock('../../vault/vault-placement.service.js', () => ({ placeVaultDocument: h.place }));
vi.mock('../../../db/tenantStore.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../db/tenantStore.js')>()),
  getTenantScope: () => ({ tenantId: '42', role: 'member', source: 'request' }),
}));
vi.mock('../uploaded-file-access.js', () => ({
  loadUploadedFile: async () => ({ fileId: 'file_1712345678_ab12cd', fileName: 'f.pdf', mimeType: 'application/pdf', fileSize: 1, buffer: Buffer.from('x') }),
}));
vi.mock('../../vault/vault-ingest.service.js', () => ({ ingestVaultDocument: h.ingest }));
vi.mock('../../vault/document-catalog.service.js', () => ({
  isDocumentCatalogEnabled: vi.fn(async () => true),
  listProjectDocuments: h.list,
  listChatUploads: h.uploads,
  loadDocumentForOrg: h.docOf,
  recordReadReceipt: h.receipt,
  completeCatalog: h.complete,
  getReadCoverage: vi.fn(async () => ({ charCount: 10, coveredChars: 10, uncovered: [], complete: true })),
}));

import { registerDocumentCatalogHandlers } from '../document-catalog-tools.js';
import { readReceiptContext, type DeferredReadReceipts } from '../read-receipts.js';

type Handler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;
const handlers = new Map<string, Handler>();
registerDocumentCatalogHandlers((name, fn) => handlers.set(name, fn));

const A = '0a000000-0000-4000-8000-00000000000a';
const B = '0b000000-0000-4000-8000-00000000000b';
const V2_A: ToolContext = { organizationId: 42, userId: 7, projectId: null, projectRef: A };
const NONE: ToolContext = { organizationId: 42, userId: 7 };
const call = async (tool: string, input: Record<string, unknown>, ctx: ToolContext) =>
  JSON.parse(await handlers.get(tool)!(input, ctx));
const FILE = { file_id: 'file_1712345678_ab12cd', document_title: 'Tox study', document_type: 'nonclinical_study_report' };

beforeEach(() => {
  for (const f of [h.open, h.inOrg, h.list, h.uploads, h.ingest, h.docOf, h.receipt, h.complete, h.place, h.search, h.passages, h.ownDocs]) f.mockClear();
  h.open.mockImplementation(async (_db: unknown, ctx: any) => (ctx?.projectRef === A ? A : null));
  h.inOrg.mockResolvedValue(true);
});

describe('list_project_documents', () => {
  it('a v2 project open: lists that project, not the whole organization', async () => {
    const r = await call('list_project_documents', {}, V2_A);
    expect(r.scope).toEqual({ programId: A });
    expect((h.list.mock.calls[0] as any)[1]).toMatchObject({ programId: A });
  });

  it("another project's documents are refused while a project is open, and nothing is listed", async () => {
    const r = await call('list_project_documents', { program_id: B }, V2_A);
    expect(r.code).toBe('CROSS_PROJECT');
    expect(h.list).not.toHaveBeenCalled();
  });

  it('naming the open project itself is fine', async () => {
    const r = await call('list_project_documents', { program_id: A.toUpperCase() }, V2_A);
    expect(r.scope).toEqual({ programId: A });
  });

  it('no project open: the organization, as today, or a program of the organization when named', async () => {
    expect((await call('list_project_documents', {}, NONE)).scope).toEqual({ organizationWide: true });
    expect((await call('list_project_documents', { program_id: B }, NONE)).scope).toEqual({ programId: B });
    h.inOrg.mockResolvedValue(false);
    const foreign = await call('list_project_documents', { program_id: B }, NONE);
    expect(foreign.code).toBe('PROGRAM_NOT_FOUND');
  });
});

describe('file_chat_upload_to_vault', () => {
  it('files into the open project', async () => {
    const r = await call('file_chat_upload_to_vault', FILE, V2_A);
    expect(r.ok).toBe(true);
    expect((h.ingest.mock.calls[0] as any)[0]).toMatchObject({ programId: A, organizationId: 42 });
  });

  it('never into another project while one is open: refused, and nothing is ingested', async () => {
    const r = await call('file_chat_upload_to_vault', { ...FILE, program_id: B }, V2_A);
    expect(r.code).toBe('CROSS_PROJECT');
    expect(h.ingest).not.toHaveBeenCalled();
  });

  it('with no project open: refused, pointing to the audited adopt; nothing is ingested', async () => {
    const r = await call('file_chat_upload_to_vault', { ...FILE, program_id: B }, NONE);
    expect(r.code).toBe('NO_PROJECT');
    expect(r.error).toMatch(/Add to this project/);
    expect(h.ingest).not.toHaveBeenCalled();
  });
});

/* Review wf_0b1c1dfc-069: the rule held for list and file only. Search is
   organization-wide, so the model can hold another project's document id, and
   every by-id tool loaded the document org-checked only. */
describe('the by-id tools: the open project\'s documents only', () => {
  const docOf = (programId: string) => ({
    id: 'dddddddd-0000-4000-8000-000000000001', programId, fileName: 'f.pdf', documentTitle: 'Tox',
    extractedText: 'text body!', contentHash: 'h',
    catalog: { status: 'cataloged', charCount: 10, extractionStatus: 'extracted' },
  });

  it.each([
    ['read_project_document', { document_id: 'dddddddd-0000-4000-8000-000000000001' }],
    ['catalog_project_document', { document_id: 'dddddddd-0000-4000-8000-000000000001', document_kind: 'report', purpose: 'p', summary: 's', key_data: {} }],
    ['place_project_document', { document_id: 'dddddddd-0000-4000-8000-000000000001', folder_id: 'module-4', rationale: 'because' }],
  ])("%s on another project's document is refused, and nothing is read or written", async (tool, input) => {
    h.docOf.mockResolvedValue(docOf(B));
    const r = await call(tool, input, V2_A);
    expect(r.code).toBe('CROSS_PROJECT');
    expect(h.receipt).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.place).not.toHaveBeenCalled();
  });

  it("the open project's own document is read", async () => {
    h.docOf.mockResolvedValue(docOf(A));
    // The receipt waits on delivery (ANA-SUMMARY S1, read-receipts.ts): the read
    // registers it with its loop host, which writes it once the model has the
    // window whole. The read itself writes nothing.
    const deferred: DeferredReadReceipts = new Map();
    const r = await call('read_project_document', { document_id: 'dddddddd-0000-4000-8000-000000000001' }, { ...V2_A, ...readReceiptContext(deferred, 'tu_1') });
    expect(r.code).toBeUndefined();
    expect(deferred.get('tu_1')).toMatchObject({ documentId: 'dddddddd-0000-4000-8000-000000000001', span: { start: 0, end: 10 } });
    expect(h.receipt).not.toHaveBeenCalled();
  });
});

describe('search stays in the open project', () => {
  it('search_project_documents searches the open program only; with no project, the organization', async () => {
    await call('search_project_documents', { query: 'stability data' }, V2_A);
    expect((h.search.mock.calls[0] as any)[2]).toMatchObject({ programId: A });
    await call('search_project_documents', { query: 'stability data' }, NONE);
    expect((h.search.mock.calls[1] as any)[2]).toMatchObject({ programId: null });
  });

  it('search_document_passages searches the open program only; with no project, the organization', async () => {
    h.passages.mockResolvedValue({ hits: [], coverage: null });
    const UUID = '11111111-1111-4111-8111-111111111111';
    await call('search_document_passages', { query: 'stability data' }, { ...V2_A, organizationUuid: UUID });
    expect((h.passages.mock.calls[0] as any)[1]).toMatchObject({ programId: A });
    await call('search_document_passages', { query: 'stability data' }, { ...NONE, organizationUuid: UUID });
    expect((h.passages.mock.calls[1] as any)[1]).toMatchObject({ programId: null });
  });
});

describe('an open project with no program', () => {
  it('reads nothing: not the organization, and not a named program', async () => {
    const UNANCHORED: ToolContext = { organizationId: 42, userId: 7, projectId: 99, projectRef: '99' };
    expect((await call('list_project_documents', {}, UNANCHORED)).code).toBe('NO_PROJECT');
    expect((await call('list_project_documents', { program_id: B }, UNANCHORED)).code).toBe('NO_PROJECT');
    expect(h.list).not.toHaveBeenCalled();
  });
});
