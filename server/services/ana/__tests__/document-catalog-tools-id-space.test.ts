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
const resolveProgramForProject = vi.hoisted(() => vi.fn(async () => null as string | null));
const loadUploadedFile = vi.hoisted(() =>
  vi.fn(async () => ({
    fileId: 'file_1712345678_ab12cd',
    fileName: 'tox study TOX-77-A.pdf',
    mimeType: 'application/pdf',
    fileSize: 12,
    buffer: Buffer.from('%PDF-1.4 body'),
  })),
);
const ingestVaultDocument = vi.hoisted(() => vi.fn());

vi.mock('../uploaded-file-access.js', () => ({ loadUploadedFile }));
vi.mock('../../vault/vault-ingest.service.js', () => ({ ingestVaultDocument }));

vi.mock('../../vault/document-catalog.service.js', () => ({
  isDocumentCatalogEnabled: vi.fn(async () => true),
  loadDocumentForOrg,
  completeCatalog,
  resolveProgramForProject,
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
  loadUploadedFile.mockClear();
  ingestVaultDocument.mockReset();
  resolveProgramForProject.mockReset();
  resolveProgramForProject.mockResolvedValue(null);
  ingestVaultDocument.mockResolvedValue({
    ok: true,
    document: { id: VAULT_ID, documentCode: 'tox-study-TOX-77-A', fileName: 'tox study TOX-77-A.pdf' },
    filing: { folderId: 'module-4', folderLabel: 'Module 4', placementStatus: 'suggested' },
  });
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
    // It names the tool that actually performs the remedy. Describing the
    // action without naming an affordance ("it has to be ingested first") was
    // its own dishonesty while no tool could do it.
    expect(r.error).toMatch(/file_chat_upload_to_vault/);
    expect(completeCatalog).not.toHaveBeenCalled();
  });
});

describe('file_chat_upload_to_vault — the affordance the refusal names', () => {
  const PROGRAM = '11111111-1111-4111-8111-111111111111';

  it('files the upload through the SAME governed ingest the Vault surface uses', async () => {
    const r = await call('file_chat_upload_to_vault', {
      file_id: CHAT_ID,
      document_title: '28-Day Rat Tox Study TOX-77-A',
      document_type: 'REPORT',
      program_id: PROGRAM,
    });
    expect(r.ok).toBe(true);
    expect(r.documentId).toBe(VAULT_ID);
    expect(loadUploadedFile).toHaveBeenCalledWith(CHAT_ID, 42);
    expect(ingestVaultDocument).toHaveBeenCalledTimes(1);
    const passed = ingestVaultDocument.mock.calls[0][0];
    expect(passed).toMatchObject({
      organizationId: 42,
      programId: PROGRAM,
      documentTitle: '28-Day Rat Tox Study TOX-77-A',
      documentType: 'REPORT',
      fileName: 'tox study TOX-77-A.pdf',
    });
    // A code is derived so a second filing of the same file upserts one row
    // rather than growing duplicates.
    expect(passed.documentCode).toBe('tox-study-TOX-77-A');
    // The user is told where it landed, not merely that it worked.
    expect(r.message).toMatch(/Module 4/);
  });

  it('refuses a vault UUID — a document already in the vault needs no filing', async () => {
    const r = await call('file_chat_upload_to_vault', {
      file_id: VAULT_ID,
      document_title: 'x',
      document_type: 'OTHER',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not a chat upload/i);
    expect(ingestVaultDocument).not.toHaveBeenCalled();
  });

  it('asks which program rather than guessing one', async () => {
    const r = await call('file_chat_upload_to_vault', {
      file_id: CHAT_ID,
      document_title: 'CoA batch 23-104',
      document_type: 'REPORT',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Ask which program/);
    expect(ingestVaultDocument).not.toHaveBeenCalled();
  });

  it('relays a governed refusal with its reason, claiming nothing', async () => {
    ingestVaultDocument.mockResolvedValueOnce({
      ok: false, status: 403, code: 'PROGRAM_FORBIDDEN',
      message: 'Program not found or not owned by your organization.',
    });
    const r = await call('file_chat_upload_to_vault', {
      file_id: CHAT_ID, document_title: 'x', document_type: 'OTHER', program_id: PROGRAM,
    });
    expect(r.ok).toBe(false);
    expect(r.refused).toBe(true);
    expect(r.code).toBe('PROGRAM_FORBIDDEN');
    expect(r.reason).toMatch(/not owned by your organization/);
  });

  it('the read refusal now names a tool that exists', async () => {
    const r = await call('read_project_document', { document_id: CHAT_ID });
    expect(r.error).toMatch(/file_chat_upload_to_vault/);
  });
});
