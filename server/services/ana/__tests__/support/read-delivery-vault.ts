/**
 * An in-memory Vault for the read-delivery suites (ANA-SUMMARY S1,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §5): documents, the read
 * receipts written against them, and the catalog's coverage gate.
 *
 * It stands in for vault/document-catalog.service.js, which talks to
 * PostgreSQL. The rules are not stood in for: coverage is computeCoverage over
 * the recorded spans, and the catalog write goes through
 * assertCatalogWriteAllowed, both from document-catalog-core.ts, exactly as the
 * service applies them.
 *
 * vi.mock lines are hoisted per test file, so each suite mocks the paths itself
 * and hands them these factories through a dynamic import (the pattern of
 * routes/ana-ri/__tests__/support/stream-route-harness.ts).
 *
 * Why the gates are stood in for as well as the service: the tools load the
 * service lazily (document-tools-shared.ts), and under vitest several
 * CONCURRENT first imports of a mocked module are handed the unmocked one —
 * reproduced with four parallel requireDocumentAccess calls, where the first got
 * the mock and the other three the real module (a mocker artifact; ESM gives
 * production one namespace). A round of parallel reads is the case under test,
 * so the gates hand this service over directly instead.
 */
import { assertCatalogWriteAllowed, computeCoverage, type Span } from '../../../vault/document-catalog-core.js';
import { unframeToolOutput } from '../../tool-output-frame.js';

interface StoredDocument {
  id: string;
  text: string;
  contentHash: string;
  /** Catalog fields that differ from a freshly extracted document (a cataloged one, say). */
  catalog?: Record<string, unknown>;
}

interface StoredReceipt {
  documentId: string;
  contentHash: string;
  span: Span;
}

const store = {
  documents: new Map<string, StoredDocument>(),
  receipts: [] as StoredReceipt[],
};

export function resetVault(): void {
  store.documents.clear();
  store.receipts.length = 0;
}

/** Ordinary report prose, `length` characters, with a line break every 80 or so. */
export function prose(length: number, seed = 'Stability'): string {
  const line = `${seed} results at 25C/60RH remained within the "assay" specification of 95.0-105.0%.\n`;
  return line.repeat(Math.ceil(length / line.length)).slice(0, length);
}

/** `text` with `sentence` written over it at `at`, keeping the length. */
export function plant(text: string, sentence: string, at: number): string {
  return text.slice(0, at) + sentence + text.slice(at + sentence.length);
}

export function addDocument(id: string, text: string, catalog?: Record<string, unknown>): void {
  store.documents.set(id, { id, text, contentHash: `hash-${id}`, catalog });
}

/** Every receipt written for a document, in order. */
export function receiptsFor(documentId: string): Span[] {
  return store.receipts.filter(r => r.documentId === documentId).map(r => ({ ...r.span }));
}

function coverageOf(documentId: string, contentHash: string, charCount: number) {
  const spans = store.receipts.filter(r => r.documentId === documentId && r.contentHash === contentHash).map(r => r.span);
  return computeCoverage(spans, charCount);
}

function rowOf(doc: StoredDocument) {
  return {
    id: doc.id,
    programId: null,
    fileName: `${doc.id}.txt`,
    documentTitle: `Report ${doc.id}`,
    extractedText: doc.text,
    contentHash: doc.contentHash,
    originalFileAvailable: true,
    disposition: null,
    catalog: {
      status: 'extracted',
      contentHash: doc.contentHash,
      extractionMethod: 'utf8',
      extractionConfidence: null,
      extractionError: null,
      charCount: doc.text.length,
      wordCount: null,
      pageCount: null,
      documentKind: null,
      purpose: null,
      summary: null,
      keyData: null,
      catalogedAt: null,
      ...doc.catalog,
    },
  };
}

/** The module the catalog tools load as `svc`. */
export function serviceMock() {
  return {
    isDocumentCatalogEnabled: async () => true,
    loadDocumentForOrg: async (id: string) => {
      const doc = store.documents.get(id);
      return doc ? rowOf(doc) : null;
    },
    recordReadReceipt: async (args: { documentId: string; contentHash: string; span: Span }) => {
      store.receipts.push({ documentId: args.documentId, contentHash: args.contentHash, span: { ...args.span } });
    },
    getReadCoverage: async (documentId: string, contentHash: string, charCount: number) =>
      coverageOf(documentId, contentHash, charCount),
    completeCatalog: async (args: { documentId: string; keyData?: unknown }) => {
      const doc = store.documents.get(args.documentId);
      if (!doc) return { ok: false, refusal: 'Document not found.' };
      const coverage = coverageOf(doc.id, doc.contentHash, doc.text.length);
      const verdict = assertCatalogWriteAllowed(coverage, args.keyData ?? null, doc.text);
      if (!verdict.allowed) return { ok: false, refusal: verdict.reason, coverage };
      return { ok: true, embeddingStatus: 'failed' as const };
    },
  };
}

/** document-tools-shared.js with its two gates handing over serviceMock() (see the header). */
export function gatesMock(real: Record<string, unknown>) {
  const gate = async (ctx: { organizationId?: number | null } | undefined, tool: string) =>
    ctx?.organizationId ? { svc: serviceMock(), orgId: ctx.organizationId } : { refusal: `${tool} requires an organization context.` };
  return { ...real, requireDocumentAccess: gate, requireCatalog: gate };
}

/**
 * Every tool result one model call was sent, by tool-use id, as the model read
 * it (the staged user turn, unframed). This is what "the model received" means
 * in these suites: the gateway's own copy of the request.
 */
export function resultsSentIn(messages: ReadonlyArray<{ role: string; content: unknown }>): Map<string, string> {
  const sent = new Map<string, string>();
  const marker = /\[Tool Result for [a-z_]+ \(([^)]+)\)\]:\n/g;
  for (const m of messages) {
    if (m.role !== 'user' || typeof m.content !== 'string') continue;
    const text = m.content;
    const hits = [...text.matchAll(marker)];
    hits.forEach((hit, k) => {
      const start = (hit.index ?? 0) + hit[0].length;
      const end = k + 1 < hits.length ? (hits[k + 1].index ?? text.length) : text.length;
      const close = text.lastIndexOf('</tool_output>', end);
      sent.set(hit[1], unframeToolOutput(text.slice(start, close + '</tool_output>'.length)));
    });
  }
  return sent;
}

/** A result as JSON, or null when it is not JSON (a head/tail cut leaves it unparseable). */
export function parsed(content: string | undefined): Record<string, any> | null {
  if (content === undefined) return null;
  try {
    return JSON.parse(content) as Record<string, any>;
  } catch {
    return null;
  }
}
