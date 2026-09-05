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
 *   read_project_document    — the extracted text, windowed; every window is
 *                              recorded as a read receipt against the exact
 *                              bytes it came from.
 *   catalog_project_document — the comprehension record (kind / purpose /
 *                              summary / key data), REFUSED until the receipts
 *                              cover the entire text. A sampled page cannot be
 *                              recorded as "reviewed".
 *   search_project_documents — semantic search over the comprehension records
 *                              (document-catalog-search.ts), fail-closed when
 *                              the index is unavailable.
 *
 * Handlers are registered via the inject-and-sibling pattern
 * (registerDocumentCatalogHandlers) to avoid an import cycle with
 * AnaToolExecutor; the definitions live in document-catalog-tool-defs.ts and
 * are imported by AnaToolDefinitions, so the registry-consistency suite holds
 * def ↔ handler parity automatically.
 *
 * Feature-gated per tenant on 'ana.document_catalog' (FeatureToggleService,
 * off by default, fails closed) with the ANA_DOCUMENT_CATALOG_FORCE_ON env
 * override — the same rollout shape as the document stack.
 */

import type { ToolContext } from './AnaToolExecutor.js';

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

const DISABLED_MESSAGE =
  'The document catalog is not enabled for this organization (feature ana.document_catalog). ' +
  'Say so plainly; do not simulate a listing.';

type CatalogService = typeof import('../vault/document-catalog.service.js');

/** Shared preamble: tenant present + feature on, else the honest refusal. */
async function requireCatalog(
  ctx: ToolContext | undefined,
  toolName: string,
): Promise<{ svc: CatalogService; orgId: number } | { refusal: string }> {
  if (!ctx?.organizationId) {
    return { refusal: `${toolName} requires an organization context.` };
  }
  const svc = await import('../vault/document-catalog.service.js');
  if (!(await svc.isDocumentCatalogEnabled(ctx.organizationId))) {
    return { refusal: DISABLED_MESSAGE };
  }
  return { svc, orgId: ctx.organizationId };
}

function listMessage(docs: Array<{ catalogStatus: string }>): string {
  if (docs.length === 0) return 'No documents in the vault for this scope.';
  const unstudied = docs.filter(
    d => d.catalogStatus === 'extracted' || d.catalogStatus === 'uncataloged',
  ).length;
  const failed = docs.filter(d => d.catalogStatus === 'extraction_failed').length;
  return (
    `${docs.length} document(s).` +
    (unstudied > 0
      ? ` ${unstudied} not yet studied — read each with read_project_document (all of it) and record it with catalog_project_document.`
      : '') +
    (failed > 0
      ? ` ${failed} with failed extraction — their recorded reasons are in extractionError; report those honestly.`
      : '')
  );
}

/** A chat-uploaded file from the evidence spine, with the file_id that reopens it. */
interface ChatUploadDigest {
  sourceId: number;
  fileId: string | null;
  fileName: string;
  version: string | null;
  extractionStatus: string;
  dossier: unknown;
  programId: string | null;
  uploadedAt: string;
}

/**
 * Current (non-superseded) chat uploads via the canonical evidence-spine
 * listing. `fileId` comes from the source's recorded provenance — it is what
 * inspect_uploaded_document / read_uploaded_document take, so a file attached
 * in a past conversation is reachable again.
 */
async function listChatUploadDigests(
  orgId: number,
  programId: string | null,
  limit: number,
): Promise<ChatUploadDigest[]> {
  const { listClientDocuments } = await import(
    '../clinical-regulatory-evidence/evidence-spine.service.js'
  );
  const sources = await listClientDocuments(orgId, {
    programId: programId ?? undefined,
    includeUnscoped: true,
    currentOnly: true,
    limit,
  });
  return sources.map(s => {
    const prov = (s.provenance ?? {}) as Record<string, unknown>;
    const meta = (s.metadata ?? {}) as Record<string, unknown>;
    return {
      sourceId: s.id,
      fileId: typeof prov.fileUploadId === 'string' ? prov.fileUploadId : null,
      fileName: typeof meta.originalName === 'string' ? meta.originalName : (s.title ?? 'document'),
      version: s.version ?? null,
      extractionStatus: s.extractionStatus,
      dossier: meta.dossier ?? null,
      programId: s.clientProgramId ?? null,
      uploadedAt: String(s.createdAt),
    };
  });
}

async function handleListProjectDocuments(
  input: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<string> {
  const gate = await requireCatalog(ctx, 'list_project_documents');
  if ('refusal' in gate) return JSON.stringify({ error: gate.refusal });
  const { svc, orgId } = gate;

  let programId = typeof input.program_id === 'string' && input.program_id ? input.program_id : null;
  if (!programId && typeof ctx?.projectId === 'number') {
    programId = await svc.resolveProgramForProject(ctx.projectId, orgId);
  }
  const limit = typeof input.limit === 'number' ? input.limit : undefined;
  const docs = await svc.listProjectDocuments(orgId, { programId, limit });

  // Chat uploads ride along; a failure to list them is SAID, never rendered
  // as "no chat uploads" (some installs have no evidence-spine tables).
  let chatUploads: ChatUploadDigest[] | null = null;
  let chatUploadsError: string | null = null;
  try {
    chatUploads = await listChatUploadDigests(orgId, programId, Math.min(200, limit ?? 100));
  } catch (err) {
    chatUploadsError = err instanceof Error ? err.message : String(err);
  }

  return JSON.stringify({
    ok: true,
    scope: programId ? { programId } : { organizationWide: true },
    count: docs.length,
    documents: docs,
    chatUploads,
    ...(chatUploadsError
      ? { chatUploadsError: `Chat uploads could not be listed: ${chatUploadsError}` }
      : {}),
    message:
      listMessage(docs) +
      (chatUploads && chatUploads.length > 0
        ? ` Plus ${chatUploads.length} chat-uploaded file(s) — reopen one with read_uploaded_document using its fileId.`
        : ''),
  });
}

/**
 * Backfill the extraction tier for a document that predates the catalog, so
 * legacy uploads join the same read → catalog flow. Returns the tier it wrote.
 */
async function backfillExtractionTier(
  svc: CatalogService,
  doc: { id: string; contentHash: string },
  text: string,
): Promise<NonNullable<import('../vault/document-catalog.service.js').CatalogDocumentRow['catalog']>> {
  const { pool } = await import('../../db.js');
  const outcome = svc.buildExtractionOutcome(
    text.trim().length > 0
      ? { text, method: 'stored' }
      : {
          text: null,
          method: 'none',
          error:
            'No extracted text is stored for this document (ingested before extraction existed, or extraction failed unrecorded).',
        },
  );
  await svc.recordExtractionOutcome(pool, {
    documentId: doc.id,
    contentHash: doc.contentHash,
    outcome,
  });
  return {
    status: outcome.status,
    extractionMethod: outcome.method,
    extractionConfidence: outcome.confidence,
    extractionError: outcome.error,
    charCount: outcome.charCount,
    wordCount: outcome.wordCount,
    pageCount: null,
    documentKind: null,
    purpose: null,
    summary: null,
    keyData: null,
    catalogedAt: null,
  };
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

function readWindowBounds(input: Record<string, unknown>, charCount: number) {
  const offset = Math.max(0, Math.floor(typeof input.offset === 'number' ? input.offset : 0));
  const maxChars = Math.min(
    80000,
    Math.max(1000, Math.floor(typeof input.max_chars === 'number' ? input.max_chars : 30000)),
  );
  return { offset, end: Math.min(charCount, offset + maxChars) };
}

/**
 * Ensure the document has a readable extraction tier (backfilling a legacy
 * row); returns the honest refusal payload when there is nothing to read.
 */
async function ensureReadable(
  svc: CatalogService,
  doc: NonNullable<Awaited<ReturnType<CatalogService['loadDocumentForOrg']>>>,
  text: string,
): Promise<string | null> {
  if (!doc.catalog) {
    doc.catalog = await backfillExtractionTier(svc, doc, text);
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
    return 'You have now read the entire document. Record what it is with catalog_project_document.';
  }
  return `Keep reading — ${charCount - coverage.coveredChars} characters remain. Continue with offset=${
    coverage.uncovered[0]?.start ?? end
  }. catalog_project_document will refuse until coverage is complete.`;
}

async function handleReadProjectDocument(
  input: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<string> {
  const gate = await requireCatalog(ctx, 'read_project_document');
  if ('refusal' in gate) return JSON.stringify({ error: gate.refusal });
  const { svc, orgId } = gate;

  const documentId = typeof input.document_id === 'string' ? input.document_id : '';
  if (!documentId) {
    return JSON.stringify({ error: 'read_project_document requires document_id (string).' });
  }
  const doc = await svc.loadDocumentForOrg(documentId, orgId, { includeText: true });
  if (!doc) {
    return JSON.stringify({ error: "Document not found in your organization's programs." });
  }

  const text = doc.extractedText ?? '';
  const unreadable = await ensureReadable(svc, doc, text);
  if (unreadable) return unreadable;

  const charCount = doc.catalog!.charCount || text.length;
  const { offset, end } = readWindowBounds(input, charCount);
  if (offset >= charCount) {
    return JSON.stringify({
      ok: false,
      error: `offset ${offset} is beyond the document's ${charCount} characters.`,
    });
  }

  await svc.recordReadReceipt({
    documentId: doc.id,
    contentHash: doc.contentHash,
    span: { start: offset, end },
    readBy: ctx?.userId ?? null,
  });
  const coverage = await svc.getReadCoverage(doc.id, doc.contentHash, charCount);

  return JSON.stringify({
    ok: true,
    documentId: doc.id,
    fileName: doc.fileName,
    documentTitle: doc.documentTitle,
    extractionMethod: doc.catalog!.extractionMethod,
    window: { start: offset, end, text: text.slice(offset, end) },
    totalChars: charCount,
    coverage: {
      coveredChars: coverage.coveredChars,
      complete: coverage.complete,
      uncoveredRanges: coverage.uncovered.slice(0, 10),
    },
    message: coverageMessage(coverage, charCount, end),
  });
}

interface CatalogInput {
  documentId: string;
  documentKind: string;
  purpose: string;
  summary: string;
  keyData: Record<string, unknown> | null;
}

/** Validate the catalog write's inputs; a miss is a structured error, not a throw. */
function parseCatalogInput(input: Record<string, unknown>): CatalogInput | { error: string } {
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const documentId = typeof input.document_id === 'string' ? input.document_id : '';
  const documentKind = str(input.document_kind);
  const purpose = str(input.purpose);
  const summary = str(input.summary);
  if (!documentId || !documentKind || !purpose || !summary) {
    return {
      error:
        'catalog_project_document requires document_id, document_kind, purpose and summary (non-empty strings).',
    };
  }
  const keyData =
    input.key_data && typeof input.key_data === 'object' && !Array.isArray(input.key_data)
      ? (input.key_data as Record<string, unknown>)
      : null;
  return { documentId, documentKind, purpose, summary, keyData };
}

async function handleCatalogProjectDocument(
  input: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<string> {
  const gate = await requireCatalog(ctx, 'catalog_project_document');
  if ('refusal' in gate) return JSON.stringify({ error: gate.refusal });
  const { svc, orgId } = gate;

  const parsed = parseCatalogInput(input);
  if ('error' in parsed) return JSON.stringify(parsed);
  const result = await svc.completeCatalog({
    ...parsed,
    organizationId: orgId,
    userId: ctx?.userId ?? null,
  });
  if (!result.ok) {
    return JSON.stringify({
      ok: false,
      refused: true,
      reason: result.refusal,
      uncoveredRanges: result.coverage?.uncovered.slice(0, 10),
    });
  }
  return JSON.stringify({
    ok: true,
    documentId: parsed.documentId,
    embeddingStatus: result.embeddingStatus,
    message:
      `Cataloged. This document is now on durable record — its kind, purpose, summary and key data will be ` +
      `recalled in future sessions${
        result.embeddingStatus === 'embedded' ? ' and are semantically searchable' : ''
      }. Tell the user what you recorded and where the file is filed.`,
  });
}

async function handleSearchProjectDocuments(
  input: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<string> {
  const gate = await requireCatalog(ctx, 'search_project_documents');
  if ('refusal' in gate) return JSON.stringify({ error: gate.refusal });
  const { orgId } = gate;

  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (query.length < 3) {
    return JSON.stringify({ error: 'search_project_documents requires a query of at least 3 characters.' });
  }
  const { searchCatalog, CatalogSearchUnavailableError } = await import(
    '../vault/document-catalog-search.js'
  );
  try {
    const result = await searchCatalog(orgId, query, {
      limit: typeof input.limit === 'number' ? input.limit : undefined,
    });
    const unsearchable =
      result.unsearchableCount > 0
        ? ` ${result.unsearchableCount} document(s) exist but are not searchable yet (not cataloged) — absence here does not mean absence; use list_project_documents.`
        : '';
    return JSON.stringify({
      ok: true,
      query,
      hits: result.hits,
      searchedCount: result.searchedCount,
      unsearchableCount: result.unsearchableCount,
      message:
        result.hits.length === 0
          ? `No cataloged document matched across the ${result.searchedCount} searched.${unsearchable}`
          : `${result.hits.length} match(es) across ${result.searchedCount} cataloged document(s).${unsearchable}`,
    });
  } catch (err) {
    if (err instanceof CatalogSearchUnavailableError) {
      // Unavailable is not "no matches" — say it, and route to discovery.
      return JSON.stringify({
        ok: false,
        unavailable: true,
        error: err.message,
        message: 'Fall back to list_project_documents + read_project_document; do not report "nothing found".',
      });
    }
    throw err;
  }
}

/** Errors become structured tool results, matching the house handler style. */
function withCaughtErrors(
  name: string,
  handler: (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>,
) {
  return async (input: Record<string, unknown>, ctx?: ToolContext): Promise<string> => {
    try {
      return await handler(input, ctx);
    } catch (err) {
      return JSON.stringify({
        error: `${name} failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };
}

type RegisterFn = (
  name: string,
  handler: (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>,
) => void;

export function registerDocumentCatalogHandlers(register: RegisterFn): void {
  register('list_project_documents', withCaughtErrors('list_project_documents', handleListProjectDocuments));
  register('read_project_document', withCaughtErrors('read_project_document', handleReadProjectDocument));
  register(
    'catalog_project_document',
    withCaughtErrors('catalog_project_document', handleCatalogProjectDocument),
  );
  register(
    'search_project_documents',
    withCaughtErrors('search_project_documents', handleSearchProjectDocuments),
  );
}
