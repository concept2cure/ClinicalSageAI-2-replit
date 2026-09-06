/**
 * A chat upload's id must never be answered with "not found".
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * list_project_documents returns the organization's chat uploads beside its
 * vault documents, each with the file_id that reopens it. The obvious next call
 * — read it, catalog it — therefore carries an id that read_project_document
 * and catalog_project_document do not take, and both answered it with
 * "Document not found in your organization's programs."
 *
 * That is absence, reported for a file the same surface had just listed. Under
 * the persona's client-files rule ("never tell someone a document is missing
 * until you have looked") AnA would relay it to the client verbatim — which is
 * precisely the behavior this whole workstream exists to end, reintroduced by
 * the listing that was supposed to help.
 *
 * The two id spaces are distinguishable on sight (vault documents are UUIDs;
 * chat uploads are file_<epoch>_<rand>), so the refusal says which store the
 * file is in and which tool reads it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';

const loadDocumentForOrg = vi.hoisted(() => vi.fn(async () => null));
const completeCatalog = vi.hoisted(() => vi.fn(async () => ({ ok: false, refusal: 'unused' })));

vi.mock('../../vault/document-catalog.service.js', () => ({
  isDocumentCatalogEnabled: vi.fn(async () => true),
  loadDocumentForOrg,
  completeCatalog,
  resolveProgramForProject: vi.fn(async () => null),
  listProjectDocuments: vi.fn(async () => []),
  recordReadReceipt: vi.fn(async () => {}),
  getReadCoverage: vi.fn(async () => ({ charCount: 0, coveredChars: 0, uncovered: [], complete: false })),
  recordExtractionOutcome: vi.fn(async () => {}),
  buildExtractionOutcome: vi.fn(() => ({
    status: 'extraction_failed', method: 'none', confidence: null,
    error: 'none', charCount: 0, wordCount: null,
  })),
}));

import { registerDocumentCatalogHandlers } from '../document-catalog-tools.js';

type Handler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;
const handlers = new Map<string, Handler>();
registerDocumentCatalogHandlers((name, fn) => handlers.set(name, fn));

const CTX: ToolContext = { organizationId: 42, userId: 7 };
const CHAT_ID = 'file_1712345678_ab12cd';
const VAULT_ID = '00000000-0000-4000-8000-000000000001';

async function call(tool: string, input: Record<string, unknown>) {
  const h = handlers.get(tool);
  if (!h) throw new Error(`${tool} is not registered`);
  return JSON.parse(await h(input, CTX));
}

beforeEach(() => {
  loadDocumentForOrg.mockClear();
  completeCatalog.mockClear();
});

describe('read_project_document — a chat upload id', () => {
  it('is told it is the wrong store, and never that the file is missing', async () => {
    const r = await call('read_project_document', { document_id: CHAT_ID });
    expect(r.ok).toBe(false);
    expect(r.idSpace).toBe('chat_upload');
    expect(r.error).toMatch(/chat-uploaded file/i);
    expect(r.error).toMatch(/read_uploaded_document/);
    // The one thing it must never say.
    expect(r.error).not.toMatch(/not found/i);
    expect(r.error).toMatch(/The file exists/);
  });

  it('a genuinely unknown vault id still says plainly that the vault does not hold it', async () => {
    const r = await call('read_project_document', { document_id: VAULT_ID });
    expect(r.ok).toBe(false);
    expect(r.idSpace).toBe('unknown');
    expect(r.error).toMatch(/No vault document with id/);
    expect(r.error).toMatch(/list_project_documents/);
  });
});

describe('catalog_project_document — a chat upload id', () => {
  it('is refused with the same honest reason, without a pointless lookup', async () => {
    const r = await call('catalog_project_document', {
      document_id: CHAT_ID,
      document_kind: 'Certificate of Analysis',
      purpose: 'Supports the batch release.',
      summary: 'CoA for batch 23-104.',
    });
    expect(r.ok).toBe(false);
    expect(r.idSpace).toBe('chat_upload');
    expect(r.error).toMatch(/catalog_project_document cannot take it/);
    // It also says how the file COULD get a durable record, rather than
    // leaving the model to guess that cataloging is impossible.
    expect(r.error).toMatch(/ingested into the project vault/);
    expect(completeCatalog).not.toHaveBeenCalled();
  });
});
