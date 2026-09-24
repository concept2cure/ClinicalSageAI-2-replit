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
 *     write is attempted;
 *   • a placement AnA makes is a SUGGESTION attributed to her, never a person's
 *     confirmed decision (D5, placement-attribution). The tool used to hand the
 *     service nothing but the human's user id, so the Vault recorded AnA's
 *     folder as 'confirmed', placed_by that person, with a Part 11 audit row
 *     that named only them — while URS-VAULT-007 says a person confirms the
 *     filing. It now passes her provenance (actor kind, tool, serving model,
 *     thread, turn) in the repo's agent-audit shape, and it refuses to confirm
 *     a suggestion at all: confirming is the person's act, in the Vault.
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
import { PLACE_PROJECT_DOCUMENT } from '../document-catalog-tool-defs.js';

type Handler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;
const handlers = new Map<string, Handler>();
registerDocumentPlacementHandlers((name, fn) => handlers.set(name, fn));

/* The context the chat stream hands a tool: the tenant, the person on whose
   behalf AnA acts, and the provenance of the turn that made the call. */
const CTX: ToolContext = {
  organizationId: 42,
  userId: 7,
  servingModel: { provider: 'anthropic', model: 'claude-test-model' },
  threadId: 'thread-placement-1',
  turnId: 'turn-placement-3',
};
const VAULT_ID = '00000000-0000-4000-8000-000000000001';
const CHAT_ID = 'file_1712345678_ab12cd';

const doc = (catalogStatus: string | null) => ({
  id: VAULT_ID,
  programId: '11111111-1111-4111-8111-111111111111',
  fileName: 'tox-28day.pdf',
  catalog: catalogStatus ? { status: catalogStatus } : null,
});

async function call(input: Record<string, unknown>, ctx: ToolContext = CTX) {
  const h = handlers.get('place_project_document');
  if (!h) throw new Error('place_project_document is not registered');
  return JSON.parse(await h(input, ctx));
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
      // What the service writes for a placement an agent makes.
      placementStatus: 'suggested',
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
    // Unfiling stays AnA's to do — the Unfiled queue is where a person decides
    // — but it is her act, so it carries her attribution like any other.
    expect(placeVaultDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        folderId: null,
        agent: expect.objectContaining({ actorKind: 'agent:ana', tool: 'place_project_document' }),
      }),
    );
    expect(placeVaultDocument.mock.calls[0][0].confirm).toBeFalsy();
  });
});

describe('an AnA placement is a suggestion a person confirms, attributed to AnA', () => {
  const RATIONALE = 'The report states a 28-day repeat-dose rat study.';

  it("hands the service her provenance, so the write cannot pass for a person's decision", async () => {
    loadDocumentForOrg.mockResolvedValue(doc('cataloged'));
    await call({ document_id: VAULT_ID, folder_id: 'module-4', rationale: RATIONALE });
    const args = placeVaultDocument.mock.calls[0][0];
    // The person stays on the row as the one on whose behalf she acted...
    expect(args.userId).toBe(7);
    // ...and the audit details say who actually decided, in the agent.ana.*
    // shape explain_audit_row reads (mdx-tool-policy agentAuditDetails).
    expect(args.agent).toEqual({
      actorKind: 'agent:ana',
      agentReason: RATIONALE,
      // Not assessed: that soft signal is computed by the governed-tool gate,
      // which this tool does not run. `false` would tell an auditor the
      // rationale was checked and found wanting.
      reasonReferencedArtifact: null,
      threadId: 'thread-placement-1',
      chatMessageId: null,
      tool: 'place_project_document',
      servingModel: { provider: 'anthropic', model: 'claude-test-model' },
      turnId: 'turn-placement-3',
    });
    expect(args.confirm).toBeFalsy();
  });

  it('records a model it was not told about as unknown, never a guessed one', async () => {
    loadDocumentForOrg.mockResolvedValue(doc('cataloged'));
    await call(
      { document_id: VAULT_ID, folder_id: 'module-4', rationale: RATIONALE },
      { organizationId: 42, userId: 7 },
    );
    const { agent } = placeVaultDocument.mock.calls[0][0];
    expect(agent.actorKind).toBe('agent:ana');
    expect(agent.servingModel).toEqual({ provider: null, model: null });
    expect(agent.threadId).toBeNull();
    expect(agent.turnId).toBeNull();
  });

  it("refuses confirm_suggested — confirming a filing is a person's act, in the Vault", async () => {
    loadDocumentForOrg.mockResolvedValue(doc('cataloged'));
    const out = await call({
      document_id: VAULT_ID,
      confirm_suggested: true,
      rationale: 'The classifier was right about this one.',
    });
    expect(out.ok).toBe(false);
    expect(out.refused).toBe(true);
    expect(out.reason).toContain('person');
    expect(out.reason).toContain('Vault');
    // Refused before anything is read or written.
    expect(loadDocumentForOrg).not.toHaveBeenCalled();
    expect(placeVaultDocument).not.toHaveBeenCalled();
  });

  it('is described to the model as a suggestion a person confirms, not a filing', () => {
    // The definition is what the model reads before it ever calls the tool; it
    // said "File a project-vault document", and that a confirm was hers to make.
    const { description, input_schema } = PLACE_PROJECT_DOCUMENT;
    expect(description).toMatch(/^Suggest /);
    expect(description).toContain('a person confirms');
    expect(description).toContain('confirm_suggested is refused');
    const props = input_schema.properties as Record<string, { description?: string }>;
    expect(props.confirm_suggested.description).toMatch(/^Always refused/);
  });

  it('tells the model the placement awaits a person, not that the document is filed', async () => {
    loadDocumentForOrg.mockResolvedValue(doc('cataloged'));
    const out = await call({ document_id: VAULT_ID, folder_id: 'module-4', rationale: RATIONALE });
    expect(out.ok).toBe(true);
    expect(out.message).toContain('suggested');
    expect(out.message).toContain('confirm');
    expect(out.message).not.toContain('is filed under');
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
