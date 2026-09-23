/**
 * place_project_document — a placement AnA cannot justify is refused.
 *
 * ── What was missing ─────────────────────────────────────────────────────────
 * A document's filing decision could be written in exactly one place: the
 * `POST /api/c2c/project-vault/:id/file` handler, reachable only by a person
 * clicking in the Vault. The ingest classifier's guess — made from a file name
 * and a sample of the text — was therefore permanent as far as AnA was
 * concerned. She could read a document end to end, record precisely what it
 * was, and still leave it sitting in the Unfiled queue.
 *
 * ── What this suite pins ─────────────────────────────────────────────────────
 * The tool's judgement, not the SQL (the write itself is covered against a real
 * database in tests/db/vault-placement.dbtest.ts):
 *   • filing is REFUSED for a document with no comprehension record — a
 *     placement resting on a filename is the classifier's guess wearing AnA's
 *     name;
 *   • unfiling is NOT refused, because it retracts a claim rather than making
 *     one, and the visible Unfiled queue is the honest answer;
 *   • a chat-upload id is answered with the wrong-store refusal, never
 *     "not found";
 *   • a request with no destination, or no rationale, is refused before any
 *     write is attempted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';

const loadDocumentForOrg = vi.hoisted(() => vi.fn());
const placeVaultDocument = vi.hoisted(() => vi.fn());

vi.mock('../../vault/vault-placement.service.js', () => ({ placeVaultDocument }));
vi.mock('../../vault/document-catalog.service.js', () => ({
  isDocumentCatalogEnabled: vi.fn(async () => true),
  loadDocumentForOrg,
}));

import { registerDocumentPlacementHandlers } from '../document-placement-tools.js';

type Handler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;
const handlers = new Map<string, Handler>();
registerDocumentPlacementHandlers((name, fn) => handlers.set(name, fn));

const CTX: ToolContext = { organizationId: 42, userId: 7 };
const VAULT_ID = '00000000-0000-4000-8000-000000000001';
const CHAT_ID = 'file_1712345678_ab12cd';

const doc = (catalogStatus: string | null) => ({
  id: VAULT_ID,
  programId: '11111111-1111-4111-8111-111111111111',
  fileName: 'tox-28day.pdf',
  catalog: catalogStatus ? { status: catalogStatus } : null,
});

async function call(input: Record<string, unknown>) {
  const h = handlers.get('place_project_document');
  if (!h) throw new Error('place_project_document is not registered');
  return JSON.parse(await h(input, CTX));
}

beforeEach(() => {
  loadDocumentForOrg.mockReset();
  placeVaultDocument.mockReset();
  placeVaultDocument.mockResolvedValue({
    ok: true,
    view: 'pharma',
    documentTitle: '28-Day Rat Tox Report',
    before: { folderId: null, ctdSection: null, placementStatus: 'unfiled' },
    filing: {
      folderId: 'module-4',
      folderLabel: 'Module 4 (Nonclinical)',
      evidenceKind: null,
      ctdSection: '4.2.3.2',
      placementStatus: 'confirmed',
      confidence: null,
      rationale: 'The report states a 28-day repeat-dose rat study.',
      needsReview: false,
    },
  });
});

describe('the comprehension gate', () => {
  it('files a cataloged document and reports where it now lives', async () => {
    loadDocumentForOrg.mockResolvedValue(doc('cataloged'));
    const out = await call({
      document_id: VAULT_ID,
      folder_id: 'module-4',
      ctd_section: '4.2.3.2',
      rationale: 'The report states a 28-day repeat-dose rat study.',
    });
    expect(out.ok).toBe(true);
    expect(out.filing.folderId).toBe('module-4');
    expect(out.message).toContain('Module 4 (Nonclinical)');
    expect(placeVaultDocument).toHaveBeenCalledTimes(1);
    const args = placeVaultDocument.mock.calls[0][0];
    expect(args).toMatchObject({
      documentId: VAULT_ID,
      organizationId: 42,
      folderId: 'module-4',
      ctdSection: '4.2.3.2',
      note: 'The report states a 28-day repeat-dose rat study.',
    });
  });

  it('refuses to file a document whose comprehension was never recorded', async () => {
    loadDocumentForOrg.mockResolvedValue(doc('extracted'));
    const out = await call({
      document_id: VAULT_ID,
      folder_id: 'module-4',
      rationale: 'The filename says tox.',
    });
    expect(out.ok).toBe(false);
    expect(out.refused).toBe(true);
    expect(out.reason).toContain('not recorded what it is');
    expect(out.reason).toContain('catalog_project_document');
    // Nothing was written — the refusal is before the service, not after it.
    expect(placeVaultDocument).not.toHaveBeenCalled();
  });

  it('refuses a document that has never been cataloged at all', async () => {
    loadDocumentForOrg.mockResolvedValue(doc(null));
    const out = await call({ document_id: VAULT_ID, folder_id: 'module-4', rationale: 'because' });
    expect(out.refused).toBe(true);
    expect(placeVaultDocument).not.toHaveBeenCalled();
  });

  it('says a failed extraction leaves nothing to base a placement on', async () => {
    loadDocumentForOrg.mockResolvedValue(doc('extraction_failed'));
    const out = await call({ document_id: VAULT_ID, folder_id: 'module-4', rationale: 'because' });
    expect(out.reason).toContain('could not be extracted');
    expect(placeVaultDocument).not.toHaveBeenCalled();
  });

  it('allows unfiling an uncataloged document — it retracts a claim, not makes one', async () => {
    loadDocumentForOrg.mockResolvedValue(doc('extracted'));
    placeVaultDocument.mockResolvedValue({
      ok: true,
      view: 'pharma',
      documentTitle: null,
      before: { folderId: 'module-3', ctdSection: null, placementStatus: 'suggested' },
      filing: {
        folderId: null,
        folderLabel: 'Unfiled',
        evidenceKind: null,
        ctdSection: null,
        placementStatus: 'unfiled',
        confidence: null,
        rationale: 'The suggestion was wrong and I cannot tell where it belongs.',
        needsReview: true,
      },
    });
    const out = await call({
      document_id: VAULT_ID,
      unfile: true,
      rationale: 'The suggestion was wrong and I cannot tell where it belongs.',
    });
    expect(out.ok).toBe(true);
    expect(out.message).toContain('Unfiled queue');
    expect(placeVaultDocument).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: null, confirm: false }),
    );
  });
});

describe('the inputs it will not act on', () => {
  it('answers a chat-upload id with the wrong-store refusal, not absence', async () => {
    const out = await call({ document_id: CHAT_ID, folder_id: 'module-4', rationale: 'r' });
    expect(out.idSpace).toBe('chat_upload');
    expect(out.error).toContain('file_chat_upload_to_vault');
    expect(loadDocumentForOrg).not.toHaveBeenCalled();
  });

  it('requires a rationale — the audit trail records why, not just what', async () => {
    const out = await call({ document_id: VAULT_ID, folder_id: 'module-4' });
    expect(out.error).toContain('rationale');
    expect(loadDocumentForOrg).not.toHaveBeenCalled();
  });

  it('requires a destination rather than guessing one', async () => {
    const out = await call({ document_id: VAULT_ID, rationale: 'it belongs somewhere' });
    expect(out.error).toContain('needs a destination');
    expect(loadDocumentForOrg).not.toHaveBeenCalled();
  });

  it('reports a document this organization does not hold as unknown, with the discovery tool', async () => {
    loadDocumentForOrg.mockResolvedValue(null);
    const out = await call({ document_id: VAULT_ID, folder_id: 'module-4', rationale: 'r' });
    expect(out.idSpace).toBe('unknown');
    expect(out.error).toContain('list_project_documents');
  });

  it('passes the service refusal through instead of claiming a move', async () => {
    loadDocumentForOrg.mockResolvedValue(doc('cataloged'));
    placeVaultDocument.mockResolvedValue({
      ok: false,
      status: 400,
      code: 'INVALID_FOLDER',
      message: "Folder 'zone-5' does not exist in this program's pharma vault taxonomy.",
    });
    const out = await call({ document_id: VAULT_ID, folder_id: 'zone-5', rationale: 'r' });
    expect(out.ok).toBe(false);
    expect(out.error).toBe('INVALID_FOLDER');
    expect(out.message).toContain('pharma vault taxonomy');
  });
});
