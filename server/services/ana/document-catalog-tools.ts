/**
 * Project-folder document tools — discovery, whole-document reading, and the
 * catalog write that turns a read into durable comprehension.
 *
 * Why these exist: AnA had no tool that could see vault.documents at all. A
 * client uploaded a file into the project vault, the session ended, and the
 * file effectively vanished from AnA's world — she could not list it, could
 * not re-open it, and never built a durable record of what it was. The only
 * files she could reach were the ones a user hand-attached to a single chat
 * turn. These three tools close that gap over the CANONICAL store (the same
 * vault.documents rows the Vault surface renders), composed with the catalog
 * service's read-coverage discipline:
 *
 *   list_project_documents   — what files exist (vault + chat uploads),
 *                              where each is filed, which are not yet studied
 *                              (honestly labeled), and the file_id that
 *                              reopens a chat upload.
 *   read_project_document    — the extracted text, windowed to RESULT_BUDGET;
 *                              its exact source snapshot defers a legacy span
 *                              receipt until unchanged host-budget admission
 *                              and a guarded write (read-receipts.ts).
 *   catalog_project_document — the comprehension record (kind / purpose /
 *                              summary / key data), REFUSED until the receipts
 *                              cover the entire text. A sampled page cannot be
 *                              recorded as "reviewed".
 *   search_project_documents — AnA's own Vault search. Always the key-free
 *                              Postgres full-text search users have
 *                              (vault-search.ts), plus the semantic catalog
 *                              arm (document-catalog-search.ts) when the
 *                              catalog is on and an embedding provider answers.
 *
 * Handlers are registered via the inject-and-sibling pattern
 * (registerDocumentCatalogHandlers) to avoid an import cycle with
 * AnaToolExecutor; the definitions live in document-catalog-tool-defs.ts and
 * are imported by AnaToolDefinitions, so the registry-consistency suite holds
 * def ↔ handler parity automatically.
 *
 * list, read and search need no flag and no key (D2, 2026-10-01): every
 * organisation's AnA can find and read its Vault. Cataloging and filing stay
 * gated per tenant on 'ana.document_catalog' (FeatureToggleService, off by
 * default, fails closed; ANA_DOCUMENT_CATALOG_FORCE_ON overrides).
 */

import { createHash } from 'node:crypto';
import { LEGACY_CATALOG_VERIFICATION_SCOPE } from '../../../shared/ana/catalog-facts.js';
import type { ToolContext } from './AnaToolExecutor.js';
import type { ProjectDocumentPage } from '../vault/document-catalog.service.js';
import {
  anaToolProvenance,
  CHAT_UPLOAD_ID,
  requireCatalog,
  requireDocumentAccess,
  unknownDocumentRefusal,
  withCaughtErrors,
  type CatalogService,
  type RegisterFn,
} from './document-tools-shared.js';
import { registerDocumentPlacementHandlers } from './document-placement-tools.js';
import { registerDocumentPassageHandlers } from './document-passage-tools.js';
import { vaultWriteRefusal } from '../vault/vault-write-authority.js';
import { catalogScope, sourceReadInput } from './catalog-scope.js';
import { sourceAvailabilityPresentation, catalogVersionRefusal } from '../vault/document-catalog-eligibility.js';
import { RESULT_BUDGET } from './agentic-loop.js';
import { canDeferReadReceipt, coverageAfter, deferReadReceipt, fitReadWindow } from './read-receipts.js';
import { parseCatalogInput, handleCatalogPreview } from './document-catalog-input.js';

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────


/**
 * The message AnA reads off a listing.
 *
 * Every number here comes from the PAGE's scope counts, never from the rows in
 * hand. The rows are capped at 100 by default and 200 at most, so the old
 * `docs.length` told a client with 340 documents that it had 200 — and told a
 * client with 340 documents of which 300 were never studied that 200 were
 * "not yet studied", a figure that is wrong in both directions at once.
 */
function listMessage(page: ProjectDocumentPage): string {
  if (page.total === 0) return 'No documents in the vault for this scope.';
  const shown =
    page.withheld > 0
      ? `${page.total} document(s); ${page.documents.length} listed here, ${page.withheld} not ` +
        `returned (raise limit, or narrow with program_id, or use search_project_documents). ` +
        `Do not answer "no such document" from this page.`
      : `${page.total} document(s) — all of them are listed here.`;
  return (
    shown +
    (page.notYetStudied > 0
      ? ` ${page.notYetStudied} not yet studied — read each with read_project_document (all of it) and record it with catalog_project_document.`
      : '') +
    (page.extractionFailed > 0
      ? ` ${page.extractionFailed} with failed extraction — their recorded reasons are in extractionError; report those honestly.`
      : '') +
    (page.unfiled > 0
      ? ` ${page.unfiled} unfiled — place_project_document gives a document its folder.`
      : '')
  );
}

/**
 * The chat-upload half of a listing, resolved to the three things the response
 * needs: the rows, whether more exist, and — when the spine is unreachable —
 * the reason, SAID rather than rendered as "no chat uploads" (some installs
 * have no evidence-spine tables).
 */
async function chatUploadsFor(
  svc: CatalogService,
  actor: Parameters<CatalogService['listChatUploadsForActor']>[0],
  limit: number | undefined,
): Promise<{
  uploads: Awaited<ReturnType<CatalogService['listChatUploadsForActor']>>['uploads'] | null;
  hasMore: boolean;
  error: string | null;
}> {
  try {
    const page = await svc.listChatUploadsForActor(actor, { limit: Math.min(200, limit ?? 100) });
    return { uploads: page.uploads, hasMore: page.hasMore, error: null };
  } catch {
    return { uploads: null, hasMore: false, error: 'Current actor-accessible chat uploads could not be checked.' };
  }
}

/** The one sentence about chat uploads that rides on the documents message. */
function chatUploadNote(uploads: { length: number } | null, hasMore: boolean): string {
  if (!uploads || uploads.length === 0) return '';
  return (
    ` Plus ${uploads.length}${hasMore ? '+' : ''} chat-uploaded file(s) — ` +
    'reopen one with read_uploaded_document using its fileId.'
  );
}

async function handleListProjectDocuments(
  input: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<string> {
  const gate = await requireDocumentAccess(ctx, 'list_project_documents');
  if ('refusal' in gate) return JSON.stringify({ ok: false, error: gate.refusal, ...('code' in gate ? { code: gate.code } : {}) });
  const { svc, orgId } = gate;

  const scope = await catalogScope(
    ctx,
    orgId,
    typeof input.program_id === 'string' && input.program_id ? input.program_id : null,
    'read',
  );
  if ('error' in scope) return JSON.stringify({ ok: false, error: scope.error, code: scope.code });
  const { programId } = scope;
  const limit = typeof input.limit === 'number' ? input.limit : undefined;
  const actor = sourceReadInput(ctx, orgId, programId);
  const page = await svc.listProjectDocumentsForActor(actor, { limit });
  const chat = await chatUploadsFor(svc, actor, limit);
  await svc.revalidateActorSourceScope(actor, scope.admittedScope);

  return JSON.stringify({
    ok: true,
    scope: programId ? { programId, actorFiltered: true } : scope.admittedScope.projectId !== null
      ? { openProject: true, programId: null, actorFiltered: true } : { accessibleProjects: true, actorFiltered: true },
    // `returned` is the page; `total` is the scope. They were one field named
    // `count`, which made the page the answer to both questions.
    returned: page.documents.length,
    total: page.total,
    withheld: page.withheld,
    notYetStudied: page.notYetStudied,
    extractionFailed: page.extractionFailed,
    unfiled: page.unfiled,
    documents: page.documents,
    chatUploads: chat.uploads,
    ...(chat.hasMore ? { chatUploadsTruncated: true } : {}),
    ...(chat.error ? { chatUploadsError: `Chat uploads could not be listed: ${chat.error}` } : {}),
    message: 'This listing covers the current actor’s accessible project sources. ' + listMessage(page) + chatUploadNote(chat.uploads, chat.hasMore),
  });
}

/** The honest refusal for a document with nothing readable behind it. */
function unreadableResponse(doc: { id: string; fileName: string }, reason: string | null): string {
  return JSON.stringify({
    ok: false,
    documentId: doc.id,
    fileName: doc.fileName,
    extractionFailed: true,
    reason: reason ?? 'No extracted text is stored for this document.',
    message:
      'There is no readable text for this document — that is a recorded extraction failure, not an empty ' +
      'file. Tell the user what failed and why; do not describe content you have not seen. A re-upload ' +
      'through the vault (which OCRs scanned PDFs) usually fixes it.',
  });
}

const finiteNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Where a read starts, and the most text its window may hold: RESULT_BUDGET
 * characters at most (P-24), and never past the end. The handler then shrinks
 * it until the serialized result fits (fitReadWindow). The window was 30,000
 * by default and 80,000 at most, which the model never received whole.
 */
function readWindowBounds(input: Record<string, unknown>, charCount: number) {
  const offset = Math.max(0, Math.floor(finiteNumber(input.offset) ?? 0));
  const asked = Math.min(RESULT_BUDGET, Math.max(1, Math.floor(finiteNumber(input.max_chars) ?? RESULT_BUDGET)));
  return { offset, asked: Math.min(asked, charCount - offset) };
}

/**
 * Ensure the document has a readable extraction tier (backfilling a legacy
 * row); returns the honest refusal payload when there is nothing to read.
 */
async function ensureReadable(
  svc: CatalogService,
  doc: NonNullable<Awaited<ReturnType<CatalogService['loadDocumentForActor']>>>,
  text: string,
): Promise<string | null> {
  const versionRefusal = catalogVersionRefusal(doc);
  if (versionRefusal) return JSON.stringify({ ok: false, code: 'SOURCE_VERSION_CHANGED', documentId: doc.id, error: versionRefusal });
  if (!doc.catalog) {
    const outcome = svc.buildExtractionOutcome(text.trim() ? { text, method: 'stored' } : { text: null, method: 'none', error: 'No extracted text is stored for this legacy source.' });
    // Legacy reads present stored text without repairing regulated rows.
    doc.catalog = { status: outcome.status, contentHash: doc.contentHash, extractionMethod: outcome.method,
      extractionConfidence: outcome.confidence, extractionError: outcome.error, charCount: text.length,
      wordCount: outcome.wordCount, pageCount: null, documentKind: null, purpose: null, summary: null, keyData: null, catalogedAt: null };
    doc.sourceAccess = { ...doc.sourceAccess, receiptEligible: false, notice: doc.sourceAccess.notice + ' Extraction metadata is unrecorded; this read did not backfill or save it.' };
  }
  if (doc.catalog.status === 'extraction_failed' || text.trim().length === 0) {
    return unreadableResponse(doc, doc.catalog.extractionError);
  }
  return null;
}

function coverageMessage(
  coverage: { complete: boolean; coveredChars: number; uncovered: Array<{ start: number }> },
  charCount: number,
  end: number,
): string {
  if (coverage.complete) {
    return 'The prospective legacy byte-bound span history covers the document after this window, if host admission and the receipt write succeed. It is not current-actor, extraction-specific or provider-served proof.';
  }
  return `Prospective legacy byte-bound span history leaves ${charCount - coverage.coveredChars} characters uncovered. Continue with offset=${
    coverage.uncovered[0]?.start ?? end
  }. catalog_project_document will refuse until coverage is complete.`;
}

/**
 * Say so when the text was recognised rather than read.
 *
 * OCR output is a reading of pixels, not the document's own characters: a
 * digit can come back wrong and the sentence around it still scans. The
 * persona requires a scan to be treated as a document, which it is — but a
 * quoted figure from a 71%-confidence recognition needs to be checked against
 * the page, and nothing said so before.
 */
function ocrCaveat(catalog: { extractionMethod: string | null; extractionConfidence: number | null }): string {
  if (catalog.extractionMethod !== 'pdf-ocr' && catalog.extractionMethod !== 'image-ocr') return '';
  const confidence =
    typeof catalog.extractionConfidence === 'number'
      ? ` at ${Math.round(catalog.extractionConfidence)}% mean confidence`
      : '';
  return (
    ` This text was produced by OCR${confidence}, not read from a text layer — treat exact figures, ` +
    'identifiers and dates as needing confirmation against the page before you quote them as fact.'
  );
}

type LoadedDocument = NonNullable<Awaited<ReturnType<CatalogService['loadDocumentForActor']>>>;
type Catalog = NonNullable<LoadedDocument['catalog']>;

/**
 * What was already learned about this document, handed back with the text.
 * The comprehension record was written by a previous read and then never
 * returned by anything, so every re-read started from zero — the client's
 * own figures re-derived from scratch, which is exactly the re-explaining
 * the catalog exists to end. Present only when the record exists; a
 * not-yet-studied document says nothing here rather than an empty shape.
 */
function comprehensionOf(catalog: Catalog) {
  if (catalog.status !== 'cataloged') return undefined;
  const { documentKind, purpose, summary, catalogedAt } = catalog;
  // Whose it is (S4): her own unconfirmed suggestion, or a person's decision.
  const state = catalog.state ?? 'suggested';
  return { documentKind, purpose, summary, keyData: catalog.keyData ?? null, catalogedAt, state, checkScope: LEGACY_CATALOG_VERIFICATION_SCOPE };
}

/** Below this much text a window gives the comprehension record's room back to the document. */
const COMPREHENSION_GIVES_WAY_BELOW = 1000;
const COMPREHENSION_WITHHELD =
  'What was recorded about this document is too long to send beside a useful window of its text, so it is left ' +
  'out of this read. Its kind and purpose are in list_project_documents.';
const NOT_RECORDED =
  ' No new legacy receipt is deferred for this window; the coverage above contains only existing byte-bound history. It does not establish current-actor, extraction-specific or provider-served delivery.';

interface ReadWindow {
  span: { start: number; end: number };
  text: string;
  charCount: number;
  coverage: Awaited<ReturnType<CatalogService['getReadCoverage']>>;
  /** Prospective only: host admission and the receipt write are still pending. */
  recorded: boolean;
  comprehension: ReturnType<typeof comprehensionOf> | 'withheld';
  extractedTextSha256: string;
}

/** One read's result, serialized: the measure fitReadWindow holds to RESULT_BUDGET. */
function readResult(doc: LoadedDocument, catalog: Catalog, w: ReadWindow): string {
  const comprehension =
    w.comprehension === 'withheld' ? { comprehensionWithheld: COMPREHENSION_WITHHELD } : w.comprehension ? { comprehension: w.comprehension } : {};
  return JSON.stringify({
    ok: true,
    documentId: doc.id,
    contentHash: doc.contentHash,
    extractedTextSha256: w.extractedTextSha256,
    fileName: doc.fileName,
    documentTitle: doc.documentTitle,
    ...sourceAvailabilityPresentation(doc),
    sourceAccess: doc.sourceAccess,
    extractionMethod: catalog.extractionMethod,
    ...comprehension,
    /* An OCR'd scan is not the same evidence as a born-digital text layer, and
       the method alone does not say how well it read. The mean confidence
       travels with the window so a low-confidence recognition is qualified
       rather than quoted as if it were typed. Null for methods that do not
       produce one (utf8, pdf-text, docx, xlsx). */
    extractionConfidence: catalog.extractionConfidence,
    window: { start: w.span.start, end: w.span.end, text: w.text },
    totalChars: w.charCount,
    coverage: {
      scope: 'legacy_byte_history',
      prospective: w.recorded,
      currentActorExtractionProof: false,
      providerServedProof: false,
      coveredChars: w.coverage.coveredChars,
      complete: w.coverage.complete,
      uncoveredRanges: w.coverage.uncovered.slice(0, 10),
    },
    message: doc.sourceAccess.notice + ' ' + coverageMessage(w.coverage, w.charCount, w.span.end) + (w.recorded ? ' This is prospective coverage; no receipt write is acknowledged by this result.' : NOT_RECORDED) + ocrCaveat(catalog),
  });
}

/** Source eligibility is separate from the metadata/body delivery projection. */
function sourceReadMatches(before: LoadedDocument, after: LoadedDocument | null, textHash: string, storedStatus: string | null): boolean {
  if (!after) return false;
  return after.id === before.id && after.programId === before.programId && after.contentHash === before.contentHash &&
    after.extractedTextSha256 === textHash && after.isCurrent === before.isCurrent && after.disposition === before.disposition &&
    after.originalFileAvailable === before.originalFileAvailable && after.sourceAccess.currentUseEligible === before.sourceAccess.currentUseEligible &&
    storedCatalogStatus(after) === storedStatus;
}
function storedCatalogStatus(doc: LoadedDocument): string | null { return doc.catalog?.status ?? null; }
function fitDocumentReadWindow(catalog: Catalog, render: (size: number, comprehension: ReadWindow['comprehension']) => string, asked: number) {
  const fit = fitReadWindow(size => render(size, comprehensionOf(catalog)), asked);
  return comprehensionOf(catalog) && fit.size < Math.min(asked, COMPREHENSION_GIVES_WAY_BELOW)
    ? fitReadWindow(size => render(size, 'withheld'), asked) : fit;
}
function deferDocumentWindow(ctx: ToolContext | undefined, doc: LoadedDocument, window: { extractedTextSha256: string; charCount: number; offset: number; size: number; result: string }): void {
  const { extractedTextSha256, charCount, offset, size, result } = window;
  deferReadReceipt(ctx, {
    sourceSnapshot: { organizationId: doc.admittedScope.organizationId, userId: doc.admittedScope.userId,
      programId: doc.programId, documentId: doc.id, contentHash: doc.contentHash, extractedTextSha256, totalChars: charCount,
      span: { start: offset, end: offset + size }, threadId: ctx?.threadId ?? null },
    documentId: doc.id, contentHash: doc.contentHash, span: { start: offset, end: offset + size },
    readBy: doc.admittedScope.userId, result,
  });
}

async function handleReadProjectDocument(
  input: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<string> {
  const gate = await requireDocumentAccess(ctx, 'read_project_document');
  if ('refusal' in gate) return JSON.stringify({ ok: false, error: gate.refusal, ...('code' in gate ? { code: gate.code } : {}) });
  const { svc, orgId } = gate;

  const documentId = typeof input.document_id === 'string' ? input.document_id : '';
  if (!documentId) {
    return JSON.stringify({ error: 'read_project_document requires document_id (string).' });
  }
  if (CHAT_UPLOAD_ID.test(documentId)) return unknownDocumentRefusal(documentId, 'read_project_document');
  const actor = sourceReadInput(ctx, orgId);
  const doc = await svc.loadDocumentForActor({ ...actor, documentId }, { includeText: true });
  if (!doc) {
    return unknownDocumentRefusal(documentId, 'read_project_document');
  }

  const sourceCatalogStatus = storedCatalogStatus(doc);
  const text = doc.extractedText ?? '';
  const extractedTextSha256 = createHash('sha256').update(text).digest('hex');
  const unreadable = await ensureReadable(svc, doc, text);
  if (unreadable) return unreadable;

  const catalog = doc.catalog!;
  const charCount = text.length;
  const { offset, asked } = readWindowBounds(input, charCount);
  if (offset >= charCount) {
    return JSON.stringify({
      ok: false,
      error: `offset ${offset} is beyond the document's ${charCount} characters.`,
    });
  }

  /* Existing byte-bound receipts are aggregate history. This window's
     coverage is prospective until host admission and a source-snapshot-checked
     write. No result attests to provider delivery or extraction-specific durable
     coverage; historical reads earn no new current-source receipt. */
  const before = await svc.getReadCoverage(doc.id, doc.contentHash, charCount);
  const recorded = doc.sourceAccess.receiptEligible && canDeferReadReceipt(ctx);
  const window = (size: number, comprehension: ReadWindow['comprehension']): string => {
    const span = { start: offset, end: offset + size };
    const coverage = recorded ? coverageAfter(before, span, charCount) : before;
    return readResult(doc, catalog, { span, text: text.slice(span.start, span.end), charCount, coverage, recorded, comprehension, extractedTextSha256 });
  };
  const fit = fitDocumentReadWindow(catalog, window, asked);
  const final = await svc.loadDocumentForActor({ ...actor, documentId });
  if (!sourceReadMatches(doc, final, extractedTextSha256, sourceCatalogStatus)) {
    return JSON.stringify({ ok: false, code: 'SOURCE_CHANGED_DURING_READ', error: 'The source changed during this read. No source text or new receipt was returned; read its current version again.' });
  }
  await svc.revalidateActorSourceScope(actor, doc.admittedScope);
  if (recorded) deferDocumentWindow(ctx, doc, { extractedTextSha256, charCount, offset, ...fit });
  return fit.result;
}

/** Who wrote the description, from the tool context (S4): the record names it. */
function catalogProposer(ctx: ToolContext | undefined, orgId: number, purpose: string) {
  return {
    actorKind: 'agent:ana' as const,
    model: ctx?.servingModel?.model ?? ctx?.model ?? null,
    threadId: ctx?.threadId ?? null,
    turnId: ctx?.turnId ?? null,
    audit: anaToolProvenance(ctx, orgId, purpose, 'catalog_project_document'),
  };
}

function catalogRefusal(result: Awaited<ReturnType<CatalogService['completeCatalog']>>): string {
  return JSON.stringify({
    ok: false,
    refused: true,
    reason: result.refusal,
    ...(result.code ? { code: result.code } : {}),
    uncoveredRanges: result.coverage?.uncovered.slice(0, 10),
    // A key_data refusal names every value the text does not state, by path,
    // so the correction is to those values and nothing else.
    ...(result.unverifiedKeyData ? { unverifiedKeyData: result.unverifiedKeyData } : {}),
  });
}

async function handleCatalogProjectDocument(
  input: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<string> {
  const gate = await requireCatalog(ctx, 'catalog_project_document');
  if ('refusal' in gate) return JSON.stringify({ ok: false, error: gate.refusal, ...('code' in gate ? { code: gate.code } : {}) });
  const { svc, orgId } = gate;
  /* The comprehension record is a write, and a shared one: its purpose line is
     in every member's session recall and its summary in every read. So the role
     that may not change the Vault may not write this either (the Vault's RLS
     scopes by program, not role). Checked here because this handler is
     completeCatalog's only caller; the Vault write services check the same way
     (server/services/vault/vault-write-authority.ts). */
  const roleRefusal = vaultWriteRefusal();
  if (roleRefusal) return JSON.stringify({ ok: false, refused: true, reason: roleRefusal.message });

  const parsed = parseCatalogInput(input);
  if ('error' in parsed) return JSON.stringify(parsed);
  if (parsed.recordType === 'verification_preview') return handleCatalogPreview(parsed, svc, orgId, ctx);
  // Told apart before the round trip: a chat upload has no vault row, and the
  // service's "not found" would read as absence for a file we just listed.
  if (CHAT_UPLOAD_ID.test(parsed.documentId)) {
    return unknownDocumentRefusal(parsed.documentId, 'catalog_project_document');
  }
  // The open project's documents only (PF-10 S7), before the shared record is written.
  const target = await svc.loadDocumentForActor({ ...sourceReadInput(ctx, orgId), documentId: parsed.documentId });
  if (!target) return unknownDocumentRefusal(parsed.documentId, 'catalog_project_document');
  const expectedProgramId = target.programId;
  const result = await svc.completeCatalog({
    ...parsed,
    organizationId: orgId,
    expectedProgramId,
    // The person on whose behalf she acts; `proposer` says who wrote it (S4).
    userId: ctx?.userId ?? null,
    proposer: catalogProposer(ctx, orgId, parsed.purpose),
  });
  if (!result.ok) return catalogRefusal(result);
  return JSON.stringify({
    ok: true,
    documentId: parsed.documentId,
    embeddingStatus: result.embeddingStatus,
    catalogState: 'suggested',
    checkScope: LEGACY_CATALOG_VERIFICATION_SCOPE,
    message:
      `Recorded as a suggestion, not yet confirmed by a person. Kind, purpose, summary and key data are ` +
      `attributed to AnA and this turn, and future sessions recall them as unconfirmed.${
        result.embeddingStatus === 'embedded' ? ' They are semantically searchable.' : ''
      } Automatic key-data checking covers value presence; labels and context are not verified. Scientific qualification is unassessed. Tell the user what you recorded and where the file is filed, and that a person confirms or corrects ` +
      `the record in the Vault (the document's Catalog record panel).`,
  });
}

async function handleSearchProjectDocuments(
  input: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<string> {
  const gate = await requireDocumentAccess(ctx, 'search_project_documents');
  if ('refusal' in gate) return JSON.stringify({ ok: false, error: gate.refusal, ...('code' in gate ? { code: gate.code } : {}) });
  const { svc, orgId } = gate;

  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (query.length < 3) {
    return JSON.stringify({ error: 'search_project_documents requires a query of at least 3 characters.' });
  }
  const limit = Math.min(Math.max(typeof input.limit === 'number' ? Math.floor(input.limit) : 8, 1), 25);
  // The open project's documents only (PF-10 S7); the organization's with no project open.
  const scope = await catalogScope(ctx, orgId, null, 'read');
  if ('error' in scope) return JSON.stringify({ ok: false, error: scope.error, code: scope.code });

  // Text always (no key, no flag); meaning when the catalog and an embedding provider allow.
  const { pool } = await import('../../db.js');
  const { searchVaultForAssistant } = await import('../vault/vault-assistant-search.js');
  const result = await searchVaultForAssistant(pool, {
    organizationId: orgId,
    programId: scope.programId,
    query,
    limit,
    catalogEnabled: await svc.isDocumentCatalogEnabled(orgId),
    sourceReadScope: scope.admittedScope,
  });

  const list = result.hits;
  return JSON.stringify({
    ok: true,
    query,
    scope: { actorFiltered: true, ...(scope.programId ? { programId: scope.programId } : scope.admittedScope.projectId !== null ? { openProject: true, programId: null } : { accessibleProjects: true }) },
    hits: list,
    textMatches: result.textMatches,
    semantic: result.semantic,
    message:
      list.length === 0
        ? 'No current actor-accessible Vault document matched this query. Try other terms, or list_project_documents to browse; this miss does not establish absence of evidence.'
        : `${list.length} document(s) matched. Text matching finds documents that use the query's words; ` +
          'read_project_document before relying on one.',
  });
}


/**
 * File a chat upload into the project vault, through the SAME governed ingest
 * the Vault surface uses (ingestVaultDocument, via fileUploadIntoVault) — never
 * a second admission path.
 *
 * This is the affordance the id-space refusal above points at: a chat upload
 * has no vault row, so it can be reopened but never cataloged, chunked or
 * searched. Filing it gives it all three. The refusal named the action before
 * anything could perform it, which is its own kind of dishonesty.
 */
interface FilingInput {
  fileId: string;
  documentTitle: string;
  documentType: string;
  documentCode?: string;
  folderId?: string;
  programId: string | null;
}

/** Validate the filing inputs; a miss is a structured refusal, not a throw. */
function parseFilingInput(input: Record<string, unknown>): FilingInput | { error: string } {
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const fileId = str(input.file_id);
  const documentTitle = str(input.document_title);
  const documentType = str(input.document_type);
  if (!fileId || !documentTitle || !documentType) {
    return { error: 'file_chat_upload_to_vault requires file_id, document_title and document_type.' };
  }
  const documentCode = str(input.document_code) || undefined;
  const folderId = str(input.folder_id) || undefined;
  const programId = str(input.program_id) || null;
  return { fileId, documentTitle, documentType, documentCode, folderId, programId };
}

/** What the user is told about where the file landed — never merely "done". */
function filedMessage(documentCode: string, filing: { placementStatus: string; folderLabel?: string | null; folderId?: string | null }): string {
  const where =
    filing.placementStatus === 'unfiled'
      ? 'not placed in a folder — it needs filing'
      : `${filing.folderLabel ?? filing.folderId}, ${filing.placementStatus}`;
  return (
    `Filed into the vault as ${documentCode} (${where}). ` +
    'Tell the user where it landed. It can now be read with read_project_document and recorded with ' +
    'catalog_project_document using the documentId above.'
  );
}

/**
 * File a chat upload into the project vault, through the SAME governed ingest
 * the Vault surface uses (ingestVaultDocument) — never a second admission path.
 *
 * This is the affordance the id-space refusal above points at: a chat upload
 * has no vault row, so it can be reopened but never cataloged, chunked or
 * searched. Filing it gives it all three. The refusal named the action before
 * anything could perform it, which is its own kind of dishonesty.
 */
async function handleFileChatUploadToVault(
  input: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<string> {
  const gate = await requireCatalog(ctx, 'file_chat_upload_to_vault');
  if ('refusal' in gate) return JSON.stringify({ ok: false, error: gate.refusal, ...('code' in gate ? { code: gate.code } : {}) });
  const { orgId } = gate;

  const parsed = parseFilingInput(input);
  if ('error' in parsed) return JSON.stringify(parsed);
  if (!CHAT_UPLOAD_ID.test(parsed.fileId)) {
    return JSON.stringify({
      ok: false,
      error:
        `${parsed.fileId} is not a chat upload's file_id. This tool files a chat-uploaded file into the vault; ` +
        'a document already in the vault does not need filing — read it with read_project_document.',
      idSpace: 'unknown',
    });
  }

  const scope = await catalogScope(ctx, orgId, parsed.programId, 'file');
  if ('error' in scope) return JSON.stringify({ ok: false, error: scope.error, code: scope.code });
  const programId = scope.programId!;

  // The one upload-to-Vault orchestration (VR-11): the data room's "File into
  // Vault" calls the same function, so the two cannot drift apart.
  const { fileUploadIntoVault } = await import('../vault/vault-file-upload-to-vault.js');
  const result = await fileUploadIntoVault({
    organizationId: orgId,
    userId: ctx?.userId ?? null,
    programId,
    fileId: parsed.fileId,
    documentCode: parsed.documentCode,
    documentTitle: parsed.documentTitle,
    documentType: parsed.documentType,
    folderId: parsed.folderId,
  });

  if (!result.ok) {
    return JSON.stringify({ ok: false, refused: true, code: result.code, reason: result.message });
  }
  return JSON.stringify({
    ok: true,
    documentId: result.document.id,
    fileName: result.document.fileName,
    filing: result.filing,
    message: filedMessage(result.document.documentCode, result.filing),
  });
}

export function registerDocumentCatalogHandlers(register: RegisterFn): void {
  // Placement lives in its own module (see document-tools-shared.ts) but is
  // registered here, so the catalog stack still has one entry point.
  registerDocumentPlacementHandlers(register);
  registerDocumentPassageHandlers(register);
  register(
    'file_chat_upload_to_vault',
    withCaughtErrors('file_chat_upload_to_vault', handleFileChatUploadToVault),
  );
  register('list_project_documents', withCaughtErrors('list_project_documents', handleListProjectDocuments, { safeOutcome: true }));
  register('read_project_document', withCaughtErrors('read_project_document', handleReadProjectDocument, { safeOutcome: true }));
  register(
    'catalog_project_document',
    withCaughtErrors('catalog_project_document', handleCatalogProjectDocument, { safeOutcome: true }),
  );
  register(
    'search_project_documents',
    withCaughtErrors('search_project_documents', handleSearchProjectDocuments, { safeOutcome: true }),
  );
}
