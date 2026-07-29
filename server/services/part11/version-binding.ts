/**
 * §11.70 signature-to-content binding.
 *
 * A 21 CFR Part 11 electronic signature must be bound to the *content* it signs
 * (§11.70 signature/record linking), not merely to the record's identifiers — a
 * signature over `{documentId, versionId}` alone stays "valid" even if the
 * version's bytes are later altered, which is exactly what §11.70 forbids.
 *
 * `buildVersionBindingDigest` computes the deterministic SHA-256 that the two
 * document-signing paths (`routes/esignature.ts` and
 * `part11ComplianceService.createElectronicSignature`) store in the
 * `electronic_signatures.bound_payload_digest` column — the same §11.70 binding
 * the submission-release path already writes for its payload. It FAILS CLOSED on
 * empty/absent content: you cannot bind (and therefore must not apply) a
 * signature over content that isn't there.
 *
 * Pure — no DB, no clock, no side effects — so the binding contract is unit
 * testable and identical across both callers.
 *
 * @module server/services/part11/version-binding
 */
import { createHash } from 'crypto';

export interface VersionBindingInput {
  documentId: number;
  versionId: number;
  /** The stored version label/number (e.g. "0.7", "1.0"); null when unversioned. */
  versionNumber?: string | number | null;
  /** The signed version's content bytes (HTML/JSON/Markdown as stored). */
  content: string | null | undefined;
}

/**
 * Deterministic §11.70 content-binding digest over the signed version. Keys are
 * emitted in sorted order so the digest is stable and re-derivable by an auditor
 * from the stored version row. Throws when there is no content to bind — a
 * signature must never be applied to empty/absent content.
 */
export function buildVersionBindingDigest(input: VersionBindingInput): string {
  if (input.content == null || input.content === '') {
    throw new Error(
      `Part 11 §11.70: cannot bind a signature — document ${input.documentId} version ${input.versionId} has no stored content.`,
    );
  }
  // Sorted-key canonical form (content, documentId, versionId, versionNumber).
  const canonical = JSON.stringify({
    content: input.content,
    documentId: input.documentId,
    versionId: input.versionId,
    versionNumber: input.versionNumber ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
