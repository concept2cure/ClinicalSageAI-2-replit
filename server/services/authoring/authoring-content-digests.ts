/** Pure digests shared by signature writes, rendered exports and workflow release checks. */
import crypto from 'crypto';
import { authoringSavedSnapshotSchema, type AuthoringSavedSnapshot } from '../../../shared/authoring/peer-review';

export interface FullVisibleAuthoringInput {
  doc: { id: string; title?: unknown; module?: unknown; locale?: unknown; product_code?: unknown; version?: unknown };
  sections: ReadonlyArray<{ id: string; code: string; title?: unknown; content: string | null }>;
}

/** Promoted byte-for-byte from workflow adoption: titles, identity and order
 * belong to a human review, as well as prose. Rows use signing's total order. */
export function fullVisibleAuthoringSnapshot({ doc, sections }: FullVisibleAuthoringInput): AuthoringSavedSnapshot {
  return authoringSavedSnapshotSchema.parse({
    id: doc.id, title: doc.title ?? null, module: doc.module ?? null,
    locale: doc.locale ?? null, productCode: doc.product_code ?? null, version: doc.version ?? null,
    sections: sections.map(section => ({ id: section.id, code: section.code,
      title: section.title ?? null, content: section.content })),
  });
}

/** Re-frame JSONB reads in canonical field order; JSONB's key order is not the
 * signed serialization. Legacy signature/export prose digests remain stable. */
export function authoringSnapshotHash(snapshot: AuthoringSavedSnapshot): string {
  const framed = fullVisibleAuthoringSnapshot({
    doc: { ...snapshot, product_code: snapshot.productCode }, sections: snapshot.sections,
  });
  return crypto.createHash('sha256').update(JSON.stringify(framed)).digest('hex');
}

/** §11.70: one recomputable digest for both signature writes and release reads. */
export function computeAuthoringSignatureDigest(input: {
  signerEmail: string; meaning: string; contentHash: string; coveredContentHash: string | null;
}): string {
  return crypto.createHash('sha256').update(['authoring-sig-v1', input.signerEmail, input.meaning,
    input.contentHash, input.coveredContentHash ?? ''].join('|')).digest('hex');
}

/**
 * Rows are already in the caller's recorded order. The signing routes store
 * this digest; exports and release checks must recompute the identical bytes.
 */
export function sectionsDigest(rows: ReadonlyArray<{ code: string; content: string | null }>): string {
  const content = rows.map((s) => `${s.code}:${s.content}`).join('|||');
  return crypto.createHash('sha256').update(content).digest('hex');
}
