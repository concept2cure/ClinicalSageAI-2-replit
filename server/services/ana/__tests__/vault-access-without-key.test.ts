/**
 * AnA searches and reads the client's Vault with no AI key and no feature flag
 * (D2, founder direction 2026-10-01: "Vault search should not depend on an
 * OpenAI key or a Claude key or any key"; evidence
 * docs/evidence/D2/2026-10-01-vault-search-no-key/).
 *
 * Before: 'ana.document_catalog' is off for every organisation, so
 * list_project_documents, read_project_document and search_project_documents
 * all refused, and the toolset withheld them: AnA had no Vault access in
 * production. With the catalog on, search_project_documents was semantic only
 * and answered "unavailable" whenever no embedding key was configured.
 *
 * Now the three are always offered. search_project_documents always runs the
 * Postgres full-text search the Vault surface already gives users
 * (searchVaultDocuments, any of the question's terms), and adds the semantic
 * catalog arm only when the catalog is on and an embedding provider answers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';

const h = vi.hoisted(() => ({
  catalogOn: vi.fn(async () => false),
  text: vi.fn(async (_db: unknown, _p: any) => ({ total: 0, results: [] as any[] })),
  semantic: vi.fn(async (): Promise<any> => ({ hits: [], searchedCount: 0, unsearchableCount: 0 })),
  list: vi.fn(async () => ({ documents: [], total: 0, withheld: 0, notYetStudied: 0, extractionFailed: 0, unfiled: 0 })),
  uploads: vi.fn(async () => ({ uploads: [], hasMore: false })),
  docOf: vi.fn(async (): Promise<any> => null),
}));

class Unavailable extends Error {}

vi.mock('../../c2c/program-access.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../c2c/program-access.js')>()),
  resolveOpenProgram: vi.fn(async () => null),
  programInOrganization: vi.fn(async () => true),
}));
vi.mock('../../../db.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) }, getPool: () => ({}), db: {} }));
vi.mock('../../vault/vault-search.js', () => ({ searchVaultDocuments: h.text }));
vi.mock('../../vault/document-catalog-search.js', () => ({
  searchCatalog: h.semantic,
  CatalogSearchUnavailableError: Unavailable,
}));
vi.mock('../../../db/tenantStore.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../db/tenantStore.js')>()),
  getTenantScope: () => ({ tenantId: '42', role: 'member', source: 'request' }),
}));
vi.mock('../../vault/document-catalog.service.js', () => ({
  isDocumentCatalogEnabled: h.catalogOn,
  listProjectDocuments: h.list,
  listChatUploads: h.uploads,
  loadDocumentForOrg: h.docOf,
  recordReadReceipt: vi.fn(async () => {}),
  getReadCoverage: vi.fn(async () => ({ charCount: 10, coveredChars: 10, uncovered: [], complete: true })),
}));

import { registerDocumentCatalogHandlers } from '../document-catalog-tools.js';
import { CATALOG_GATED_TOOLS } from '../document-tools-shared.js';

type Handler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;
const handlers = new Map<string, Handler>();
registerDocumentCatalogHandlers((name, fn) => handlers.set(name, fn));
const ORG: ToolContext = { organizationId: 42, userId: 7 };
const call = async (tool: string, input: Record<string, unknown>) => JSON.parse(await handlers.get(tool)!(input, ORG));

const STABILITY = {
  id: 'd0000000-0000-4000-8000-000000000001',
  title: '24-month stability report, batch 12',
  fileName: 'stability-batch-12.pdf',
  documentType: 'report',
  sizeBytes: 1000,
  folderId: 'module-3',
  ctdSection: '3.2.P.8',
  placementStatus: 'confirmed',
  version: '1',
  current: true,
  snippet: 'assay remained within <b>specification</b> at 24 months',
  program: { id: 'a0000000-0000-4000-8000-00000000000a', name: 'Program A' },
};

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  h.catalogOn.mockResolvedValue(false);
  h.text.mockResolvedValue({ total: 1, results: [STABILITY] });
  h.semantic.mockReset();
  h.semantic.mockResolvedValue({ hits: [], searchedCount: 0, unsearchableCount: 0 });
});

describe('AnA reaches the Vault with no key and the catalog off', () => {
  it('the three Vault tools are offered whatever the catalog flag says', () => {
    for (const tool of ['list_project_documents', 'read_project_document', 'search_project_documents']) {
      expect(CATALOG_GATED_TOOLS).not.toContain(tool);
    }
  });

  it('search_project_documents finds a document by full text, with no key and no catalog', async () => {
    const out = await call('search_project_documents', { query: 'Which report shows 24-month stability for batch 12?' });
    expect(out.ok).toBe(true);
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0]).toMatchObject({ documentId: STABILITY.id, title: STABILITY.title, matchedBy: ['text'] });
    expect(out.hits[0].snippet).toContain('specification');
    // A question matches on ANY of its terms; requiring all of them answers nothing.
    expect(h.text.mock.calls[0][1]).toMatchObject({ organizationId: 42, programId: null, match: 'any' });
    expect(h.semantic).not.toHaveBeenCalled();
  });

  it('with the catalog on and no embedding provider, the full-text hits still come back', async () => {
    h.catalogOn.mockResolvedValue(true);
    h.semantic.mockRejectedValue(new Unavailable('no embedding provider configured'));
    const out = await call('search_project_documents', { query: 'stability batch 12' });
    expect(out.ok).toBe(true);
    expect(out.hits.map((x: any) => x.documentId)).toEqual([STABILITY.id]);
    expect(out.semantic).toMatchObject({ available: false });
  });

  it('a document found both ways is one hit that says so', async () => {
    h.catalogOn.mockResolvedValue(true);
    h.semantic.mockResolvedValue({
      hits: [{ documentId: STABILITY.id, programId: STABILITY.program.id, title: STABILITY.title, similarity: 0.82 }],
      searchedCount: 3,
      unsearchableCount: 0,
    });
    const out = await call('search_project_documents', { query: 'shelf life data' });
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].matchedBy).toEqual(['text', 'meaning']);
  });

  it('nothing found is said as nothing found, not as unavailable', async () => {
    h.text.mockResolvedValue({ total: 0, results: [] });
    const out = await call('search_project_documents', { query: 'pediatric investigation plan' });
    expect(out.ok).toBe(true);
    expect(out.hits).toEqual([]);
    expect(out.unavailable).toBeUndefined();
  });

  it('list_project_documents and read_project_document do not refuse when the catalog is off', async () => {
    const listed = await call('list_project_documents', {});
    expect(listed.error ?? '').not.toMatch(/not enabled|catalog/i);
    expect(h.list).toHaveBeenCalled();
    h.docOf.mockResolvedValue(null);
    const read = await call('read_project_document', { document_id: STABILITY.id });
    expect(String(read.error ?? '')).not.toMatch(/not enabled for the organization/i);
    expect(h.docOf).toHaveBeenCalled();
  });
});
