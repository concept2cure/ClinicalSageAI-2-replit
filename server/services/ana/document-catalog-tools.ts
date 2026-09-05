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
 *   list_project_documents  — what files exist, where each is filed, which
 *                             are not yet studied (honestly labeled).
 *   read_project_document   — the extracted text, windowed; every window is
 *                             recorded as a read receipt against the exact
 *                             bytes it came from.
 *   catalog_project_document — the comprehension record (kind / purpose /
 *                             summary / key data), REFUSED until the receipts
 *                             cover the entire text. A sampled page cannot be
 *                             recorded as "reviewed".
 *
 * Handlers are registered via the inject-and-sibling pattern
 * (registerDocumentCatalogHandlers) to avoid an import cycle with
 * AnaToolExecutor; the definitions are imported by AnaToolDefinitions so the
 * registry-consistency suite holds def ↔ handler parity automatically.
 *
 * Feature-gated per tenant on 'ana.document_catalog' (FeatureToggleService,
 * off by default, fails closed) with the ANA_DOCUMENT_CATALOG_FORCE_ON env
 * override — the same rollout shape as the document stack.
 */

import type { AnaTool } from '../ai-gateway/types';
import type { ToolContext } from './AnaToolExecutor.js';

// ─────────────────────────────────────────────────────────────────────────────
// Definitions
// ─────────────────────────────────────────────────────────────────────────────

export const LIST_PROJECT_DOCUMENTS: AnaTool = {
  name: 'list_project_documents',
  description:
    'List every document in the project vault (the client\'s project folder) — the durable store uploads land in, ' +
    'across sessions. Returns, per document: its id, title, file name, WHERE it is filed (folder, CTD section, ' +
    'placement status), and its catalog state — "cataloged" (read in full and understood; kind + purpose shown), ' +
    '"extracted" (text ready, not yet studied), "extraction_failed" (with the recorded reason), or "uncataloged" ' +
    '(predates cataloging). Use this FIRST whenever the user mentions their files, a prior upload, or asks what ' +
    'exists — never assume a file is gone because it was uploaded in an earlier session. Follow up with ' +
    'read_project_document to study a document and catalog_project_document to record what it is.',
  input_schema: {
    type: 'object',
    properties: {
      program_id: {
        type: 'string',
        description: 'Optional regulatory program UUID to scope to. Default: the active project\'s program, else every program in the organization.',
      },
      limit: { type: 'number', description: 'Maximum documents to return (default 100, max 200).' },
    },
    required: [],
  },
};

export const READ_PROJECT_DOCUMENT: AnaTool = {
  name: 'read_project_document',
  description:
    'Read the full extracted text of a vault document by document id (from list_project_documents), windowed with ' +
    'offset/max_chars. Scanned PDFs were OCRed at ingest — the text here IS the document\'s content, so read it, ' +
    'do not treat the file as an opaque image. Every window you read is recorded as a read receipt; the response ' +
    'reports your exact coverage so far and the character ranges still unread. To truly review a document, page ' +
    'through ALL of it (advance offset until coverage is complete) — catalog_project_document will refuse a ' +
    'partial read. If extraction failed, this tool says so with the recorded reason instead of returning empty ' +
    'text; report that honestly rather than guessing at the content.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'string', description: 'The vault document UUID from list_project_documents.' },
      max_chars: { type: 'number', description: 'Maximum characters to return in this window (default 30000, max 80000).' },
      offset: { type: 'number', description: 'Character offset to start from (default 0; advance it to page through the whole document).' },
    },
    required: ['document_id'],
  },
};

export const CATALOG_PROJECT_DOCUMENT: AnaTool = {
  name: 'catalog_project_document',
  description:
    'Record durable comprehension of a vault document you have just read IN FULL: what kind of document it is, what ' +
    'it is for, a faithful summary, and the key data inside it (study IDs, dates, doses, endpoints, sample sizes, ' +
    'batch numbers — whatever the document actually carries). This is what makes the file remembered: the record is ' +
    'embedded for semantic recall and surfaced at the start of future sessions alongside the document\'s filed ' +
    'location. The write is REFUSED unless your read receipts cover the entire extracted text — if refused, the ' +
    'response lists the exact unread ranges; go read them with read_project_document and try again. Never invent ' +
    'content to fill key_data: record only what the text states.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'string', description: 'The vault document UUID.' },
      document_kind: {
        type: 'string',
        description: 'What the document IS, specifically (e.g. "GLP 28-day rat toxicology study report", "Certificate of Analysis, batch 23-104", "Investigator CV").',
      },
      purpose: {
        type: 'string',
        description: 'One or two sentences: what this document is FOR in the program (what it evidences, which section it supports, why the client uploaded it).',
      },
      summary: {
        type: 'string',
        description: 'A faithful summary of the whole document — its structure, findings, and conclusions. Grounded in the text you read; no extrapolation.',
      },
      key_data: {
        type: 'object',
        description: 'Structured facts extracted from the text: identifiers, dates, quantities, endpoints, results. Keys of your choosing; values exactly as stated in the document.',
      },
    },
    required: ['document_id', 'document_kind', 'purpose', 'summary'],
  },
};

export const DOCUMENT_CATALOG_TOOLS: AnaTool[] = [
  LIST_PROJECT_DOCUMENTS,
  READ_PROJECT_DOCUMENT,
  CATALOG_PROJECT_DOCUMENT,
];

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

const DISABLED_MESSAGE =
  'The document catalog is not enabled for this organization (feature ana.document_catalog). ' +
  'Say so plainly; do not simulate a listing.';

type RegisterFn = (
  name: string,
  handler: (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>,
) => void;

export function registerDocumentCatalogHandlers(register: RegisterFn): void {
  register('list_project_documents', async (input, ctx) => {
    if (!ctx?.organizationId) {
      return JSON.stringify({ error: 'list_project_documents requires an organization context.' });
    }
    try {
      const svc = await import('../vault/document-catalog.service.js');
      if (!(await svc.isDocumentCatalogEnabled(ctx.organizationId))) {
        return JSON.stringify({ error: DISABLED_MESSAGE });
      }
      let programId = typeof input.program_id === 'string' && input.program_id ? input.program_id : null;
      if (!programId && typeof ctx.projectId === 'number') {
        programId = await svc.resolveProgramForProject(ctx.projectId, ctx.organizationId);
      }
      const limit = typeof input.limit === 'number' ? input.limit : undefined;
      const docs = await svc.listProjectDocuments(ctx.organizationId, { programId, limit });
      const unstudied = docs.filter(d => d.catalogStatus === 'extracted' || d.catalogStatus === 'uncataloged').length;
      const failed = docs.filter(d => d.catalogStatus === 'extraction_failed').length;
      return JSON.stringify({
        ok: true,
        scope: programId ? { programId } : { organizationWide: true },
        count: docs.length,
        documents: docs,
        message:
          docs.length === 0
            ? 'No documents in the vault for this scope.'
            : `${docs.length} document(s).` +
              (unstudied > 0
                ? ` ${unstudied} not yet studied — read each with read_project_document (all of it) and record it with catalog_project_document.`
                : '') +
              (failed > 0
                ? ` ${failed} with failed extraction — their recorded reasons are in extractionError; report those honestly.`
                : ''),
      });
    } catch (err) {
      return JSON.stringify({
        error: `list_project_documents failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  register('read_project_document', async (input, ctx) => {
    if (!ctx?.organizationId) {
      return JSON.stringify({ error: 'read_project_document requires an organization context.' });
    }
    const documentId = typeof input.document_id === 'string' ? input.document_id : '';
    if (!documentId) {
      return JSON.stringify({ error: 'read_project_document requires document_id (string).' });
    }
    try {
      const svc = await import('../vault/document-catalog.service.js');
      if (!(await svc.isDocumentCatalogEnabled(ctx.organizationId))) {
        return JSON.stringify({ error: DISABLED_MESSAGE });
      }
      const doc = await svc.loadDocumentForOrg(documentId, ctx.organizationId, { includeText: true });
      if (!doc) {
        return JSON.stringify({ error: 'Document not found in your organization\'s programs.' });
      }

      const text = doc.extractedText ?? '';

      // Backfill the extraction tier for documents that predate the catalog,
      // so legacy uploads join the same read → catalog flow.
      if (!doc.catalog) {
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
        doc.catalog = {
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

      if (doc.catalog.status === 'extraction_failed' || text.trim().length === 0) {
        return JSON.stringify({
          ok: false,
          documentId: doc.id,
          fileName: doc.fileName,
          extractionFailed: true,
          reason:
            doc.catalog.extractionError ??
            'No extracted text is stored for this document.',
          message:
            'There is no readable text for this document — that is a recorded extraction failure, not an empty ' +
            'file. Tell the user what failed and why; do not describe content you have not seen. A re-upload ' +
            'through the vault (which OCRs scanned PDFs) usually fixes it.',
        });
      }

      const charCount = doc.catalog.charCount || text.length;
      const offset = Math.max(0, Math.floor(typeof input.offset === 'number' ? input.offset : 0));
      const maxChars = Math.min(80000, Math.max(1000, Math.floor(typeof input.max_chars === 'number' ? input.max_chars : 30000)));
      const end = Math.min(charCount, offset + maxChars);
      if (offset >= charCount) {
        return JSON.stringify({
          ok: false,
          error: `offset ${offset} is beyond the document's ${charCount} characters.`,
        });
      }
      const window = text.slice(offset, end);

      await svc.recordReadReceipt({
        documentId: doc.id,
        contentHash: doc.contentHash,
        span: { start: offset, end },
        readBy: ctx.userId ?? null,
      });
      const coverage = await svc.getReadCoverage(doc.id, doc.contentHash, charCount);

      return JSON.stringify({
        ok: true,
        documentId: doc.id,
        fileName: doc.fileName,
        documentTitle: doc.documentTitle,
        extractionMethod: doc.catalog.extractionMethod,
        window: { start: offset, end, text: window },
        totalChars: charCount,
        coverage: {
          coveredChars: coverage.coveredChars,
          complete: coverage.complete,
          uncoveredRanges: coverage.uncovered.slice(0, 10),
        },
        message: coverage.complete
          ? 'You have now read the entire document. Record what it is with catalog_project_document.'
          : `Keep reading — ${charCount - coverage.coveredChars} characters remain. Continue with offset=${
              coverage.uncovered[0]?.start ?? end
            }. catalog_project_document will refuse until coverage is complete.`,
      });
    } catch (err) {
      return JSON.stringify({
        error: `read_project_document failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  register('catalog_project_document', async (input, ctx) => {
    if (!ctx?.organizationId) {
      return JSON.stringify({ error: 'catalog_project_document requires an organization context.' });
    }
    const documentId = typeof input.document_id === 'string' ? input.document_id : '';
    const documentKind = typeof input.document_kind === 'string' ? input.document_kind.trim() : '';
    const purpose = typeof input.purpose === 'string' ? input.purpose.trim() : '';
    const summary = typeof input.summary === 'string' ? input.summary.trim() : '';
    if (!documentId || !documentKind || !purpose || !summary) {
      return JSON.stringify({
        error: 'catalog_project_document requires document_id, document_kind, purpose and summary (non-empty strings).',
      });
    }
    try {
      const svc = await import('../vault/document-catalog.service.js');
      if (!(await svc.isDocumentCatalogEnabled(ctx.organizationId))) {
        return JSON.stringify({ error: DISABLED_MESSAGE });
      }
      const keyData =
        input.key_data && typeof input.key_data === 'object' && !Array.isArray(input.key_data)
          ? (input.key_data as Record<string, unknown>)
          : null;
      const result = await svc.completeCatalog({
        documentId,
        organizationId: ctx.organizationId,
        documentKind,
        purpose,
        summary,
        keyData,
        userId: ctx.userId ?? null,
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
        documentId,
        embeddingStatus: result.embeddingStatus,
        message:
          `Cataloged. This document is now on durable record — its kind, purpose, summary and key data will be ` +
          `recalled in future sessions${
            result.embeddingStatus === 'embedded' ? ' and are semantically searchable' : ''
          }. Tell the user what you recorded and where the file is filed.`,
      });
    } catch (err) {
      return JSON.stringify({
        error: `catalog_project_document failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });
}
