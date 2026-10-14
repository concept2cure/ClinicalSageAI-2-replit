/** Pure digests shared by signature writes, rendered exports and workflow release checks. */
import crypto from 'crypto';

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
