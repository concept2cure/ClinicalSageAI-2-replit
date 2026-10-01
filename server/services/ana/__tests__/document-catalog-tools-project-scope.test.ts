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
vi.mock('../../../db.js', () => ({ pool: { tag: 'pool' }, getPool: () => ({ tag: 'pool' }), db: {} }));
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
}));

import { registerDocumentCatalogHandlers } from '../document-catalog-tools.js';

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
  for (const f of [h.open, h.inOrg, h.list, h.uploads, h.ingest]) f.mockClear();
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
