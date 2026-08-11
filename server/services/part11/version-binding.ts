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

export interface BindingVerification {
  valid: boolean;
  /** Whether the §11.70 content binding could be positively verified. */
  bindingVerified: boolean;
  reason: string;
}

/**
 * Decide whether a stored signature's §11.70 content binding still holds, given
 * the digest recorded at signing (`bound`) and the digest re-derived from the
 * signed version's CURRENT content (`current`, or null when that version/content
 * is gone). Pure — the DB read happens in the caller.
 *
 *  - bound present + current matches   → valid, binding verified.
 *  - bound present + current differs   → INVALID, tamper detected.
 *  - bound present + current null      → INVALID, binding unverifiable (content gone).
 *  - bound absent (legacy signature)   → valid, but binding NOT verified (honest).
 */
export function evaluateBindingVerification(
  bound: string | null | undefined,
  current: string | null,
): BindingVerification {
  if (bound && bound.length > 0) {
    if (current === null) {
      return { valid: false, bindingVerified: false, reason: 'Signed version content is no longer available — §11.70 binding cannot be verified' };
    }
    if (current !== bound) {
      return { valid: false, bindingVerified: false, reason: 'Signed content has changed since signing — §11.70 record binding broken (tamper detected)' };
    }
    return { valid: true, bindingVerified: true, reason: 'Content binding verified' };
  }
  return { valid: true, bindingVerified: false, reason: 'Legacy signature — content binding not recorded, cannot be verified' };
}
