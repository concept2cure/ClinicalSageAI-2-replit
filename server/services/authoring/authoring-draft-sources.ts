/** The section-draft adapter over the canonical program Vault passage search.
 * Stores version receipts, never a second search corpus or invented source ids. */
import { searchDocumentPassages } from '../vault/document-passage-search.js';
import { loadDocumentForOrg, type Queryable } from '../vault/document-catalog.service.js';
import { resolveEvidenceSourceIdsByVaultDocuments } from '../clinical-regulatory-evidence/retrieval-source-link.js';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;
export interface SectionDraftSourceReceipt {
  programId: string;
  /** Provenance only; current acceptance authority always comes from its verified caller. */
  retrievedBy: number;
  documents: Array<{ documentId: string; contentHash: string; version: string | null }>;
}
export class SectionDraftSourcesUnavailableError extends Error {
  readonly status = 409;
  readonly code = 'DRAFT_SOURCES_UNAVAILABLE';
  constructor() { super('The project sources changed or became unavailable. Refresh the source records and generate a new draft. Nothing was accepted.'); }
}

type SourceDoc = Awaited<ReturnType<typeof loadDocumentForOrg>>;
function eligible(doc: SourceDoc, programId: string): doc is NonNullable<SourceDoc> {
  return !!doc && doc.programId.toLowerCase() === programId.toLowerCase() && HASH.test(doc.contentHash) &&
    !!doc.catalog && doc.catalog.contentHash === doc.contentHash &&
    ['extracted', 'cataloged'].includes(doc.catalog.status) && !['remove_data', 'supersede'].includes(doc.disposition ?? '');
}

export async function retrieveSectionDraftSources(args: {
  executor: Queryable; userId: number;
  organizationId: number; organizationUuid: string | null; programId: unknown; query: string;
}) {
  if (typeof args.programId !== 'string' || !UUID.test(args.programId)) throw new Error('The document has no verified project source scope.');
  requireVerifiedActor(args.userId);
  const programId = args.programId;
  const result = await searchDocumentPassages(args.executor, { organizationId: args.organizationId, userId: args.userId,
    organizationUuid: args.organizationUuid, query: args.query }, { limit: 5, programId });
  const documents: SectionDraftSourceReceipt['documents'] = [];
  for (const documentId of [...new Set(result.hits.map(h => h.documentId))]) {
    if (!documentId || !UUID.test(documentId)) throw new SectionDraftSourcesUnavailableError();
    const doc = await loadDocumentForOrg(documentId, args.organizationId, { executor: args.executor, userId: args.userId, programId, currentOnly: true });
    if (!eligible(doc, programId)) throw new SectionDraftSourcesUnavailableError();
    documents.push({ documentId: doc.id, contentHash: doc.contentHash, version: doc.version ?? null });
  }
  // A filed capture can have a canonical CRE record with these exact bytes.
  // Direct Vault uploads without one stay uncited; no registry entry is minted.
  const sourceIds = await resolveEvidenceSourceIdsByVaultDocuments(args.organizationId, programId, documents.map(d => d.documentId), args.executor);
  return {
    chunks: result.hits.filter(h => h.text.trim()).map(h => ({
      content: h.text, title: h.documentTitle + (h.locator ? ` (${h.locator})` : ''),
      sourceId: h.documentId && sourceIds.has(h.documentId) ? `cre_source:${sourceIds.get(h.documentId)}` : null,
    })),
    receipt: { programId, retrievedBy: args.userId, documents } satisfies SectionDraftSourceReceipt,
  };
}

/** Inside the existing accept transaction. The same disposition/program and
 * source-table reservation used by saved authoring receipts prevents a check-in
 * or withdrawal between revalidation and the accepted content's commit. */
export async function reserveSectionDraftSources(q: Queryable, organizationId: number, raw: unknown, currentUserId: number): Promise<void> {
  if (raw === undefined) return; // Legacy candidates predate source receipts.
  requireVerifiedActor(currentUserId);
  const receipt = raw as SectionDraftSourceReceipt | null;
  if (!receipt || typeof receipt.programId !== 'string' || !UUID.test(receipt.programId) ||
      !Array.isArray(receipt.documents) || receipt.documents.length > 5) throw new SectionDraftSourcesUnavailableError();
  if (receipt.documents.length === 0) return;
  await lockDocumentDispositionProgram(q, organizationId, receipt.programId);
  await q.query('LOCK TABLE vault.documents, vault.document_catalog IN SHARE MODE');
  for (const source of receipt.documents) {
    if (!validSourceIdentity(source)) throw new SectionDraftSourcesUnavailableError();
    const doc = await loadDocumentForOrg(source.documentId, organizationId, { executor: q, userId: currentUserId, programId: receipt.programId, currentOnly: true });
    if (!eligible(doc, receipt.programId) || doc.contentHash !== source.contentHash || (doc.version ?? null) !== source.version) throw new SectionDraftSourcesUnavailableError();
  }
}

function validSourceIdentity(source: SectionDraftSourceReceipt['documents'][number]): boolean {
  return typeof source?.documentId === 'string' && UUID.test(source.documentId) &&
    typeof source.contentHash === 'string' && HASH.test(source.contentHash);
}

function requireVerifiedActor(userId: number): void {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new SectionDraftSourcesUnavailableError();
}
