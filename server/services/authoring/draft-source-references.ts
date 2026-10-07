/** Durable declared source references, reverified at save; not proof of claim support. */
import type { DraftSource } from '../ana/draft-project-sources.js';
import type { Queryable } from '../vault/document-catalog.service.js';
import { sourceAvailabilityPresentation } from '../vault/document-catalog-eligibility.js';

export type DraftSourceReference = Pick<DraftSource, 'documentId' | 'contentHash' | 'span'>;
export type VerifiedDraftSourceReference = Omit<DraftSource, 'text'>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseReference(raw: unknown): DraftSourceReference {
  const ref = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const span = ref.span && typeof ref.span === 'object' ? ref.span as Record<string, unknown> : {};
  if (typeof ref.documentId !== 'string' || !UUID.test(ref.documentId) ||
      typeof ref.contentHash !== 'string' || !/^[0-9a-f]{64}$/i.test(ref.contentHash)) throw new Error('Invalid source identity/version');
  if (span.start !== 0 || !Number.isSafeInteger(span.end) || !Number.isSafeInteger(span.totalChars) ||
      Number(span.end) < 1 || Number(span.end) > 12000 || Number(span.totalChars) < Number(span.end)) throw new Error('Invalid source excerpt span');
  return { documentId: ref.documentId.toLowerCase(), contentHash: ref.contentHash.toLowerCase(),
    span: { start: 0, end: Number(span.end), totalChars: Number(span.totalChars) } };
}

export function parseDraftSourceReferences(raw: unknown): DraftSourceReference[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) throw new Error('Select one to eight source references');
  const refs = raw.map(parseReference);
  if (new Set(refs.map(r => r.documentId)).size !== refs.length ||
      refs.reduce((n, r) => n + r.span.end, 0) > 48000) throw new Error('Duplicate sources or excerpt budget exceeded');
  return refs;
}

export async function verifyDraftSourceReferences(
  refs: DraftSourceReference[], pool: Queryable, organizationId: number, programId: string,
): Promise<VerifiedDraftSourceReference[]> {
  const { loadDocumentForOrg } = await import('../vault/document-catalog.service.js');
  const verified: VerifiedDraftSourceReference[] = [];
  for (const ref of refs) {
    const doc = await loadDocumentForOrg(ref.documentId, organizationId, { includeText: true, executor: pool, programId });
    if (!doc || doc.programId.toLowerCase() !== programId.toLowerCase() ||
        doc.contentHash.toLowerCase() !== ref.contentHash || !doc.catalog || doc.catalog.contentHash !== doc.contentHash ||
        !['extracted', 'cataloged'].includes(doc.catalog.status) ||
        ['remove_data', 'supersede'].includes(doc.disposition ?? '') ||
        !doc.extractedText?.trim() || doc.extractedText.length !== ref.span.totalChars) throw new Error('Source references could not be verified');
    verified.push({ documentId: doc.id, programId, contentHash: doc.contentHash,
      title: doc.documentTitle || doc.fileName, span: ref.span,
      completeText: ref.span.end === doc.extractedText.length,
      extractionMethod: doc.catalog.extractionMethod, extractionConfidence: doc.catalog.extractionConfidence,
      ...sourceAvailabilityPresentation(doc) });
  }
  return verified;
}
