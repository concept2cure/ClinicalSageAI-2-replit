/**
 * The one client call for a QMS approval signature — a controlled document, a
 * change, or a document's retirement — and, below it, the review routing that
 * must precede a document's approval (sendQmsDocumentForReview). The signed routes take the same body and
 * answer the same way (server/routes/mdx-qms.ts: POST /qms/documents/:id/approve;
 * since P1-28 / DP-31, POST /qms/changes/:id/approve; since P1-29 / DP-32,
 * POST /qms/documents/:id/retire), so the register and the change log share
 * this rather than each keeping a copy.
 *
 * Runs after EsignModal has checked the password (and code); the server
 * re-verifies them in the transaction that writes the signature. A refusal is
 * thrown as the sentence to show, and the dialog stays open. The time returned
 * is the server's, from the signature row, never the browser's clock.
 *
 * A periodic review of the version in force (postQmsPeriodicReview, gap 5.2)
 * is signed the same way, with meaning `review`, through the platform's one
 * signing ceremony (POST /qms/documents/:id/periodic-review).
 *
 * @module client/src/concept2cure/quality/qmsApproval
 */
import { apiRequest, serverMessage } from '@/lib/queryClient';
import type { EsigSignedManifest } from '../_shared/components/EsignModal';

export type QmsApprovalTarget = { kind: 'document' | 'change' | 'document-retire'; id: number };

/** The signed route for each target kind, relative to /api/mdx/qms. */
const SIGNED_PATH: Record<QmsApprovalTarget['kind'], (id: number) => string> = {
  document: (id) => `documents/${id}/approve`,
  'document-retire': (id) => `documents/${id}/retire`,
  change: (id) => `changes/${id}/approve`,
};

export async function postQmsApproval(
  target: QmsApprovalTarget,
  input: { reason: string; password: string; totp?: string },
): Promise<EsigSignedManifest> {
  const res = await apiRequest('POST', `/api/mdx/qms/${SIGNED_PATH[target.kind](target.id)}`, {
    password: input.password,
    ...(input.totp ? { mfaToken: input.totp } : {}),
    meaning: 'APPROVED',
    reason: input.reason,
  });
  const json = (await res.json().catch(() => null)) as {
    meta?: { signature?: { signedAt?: string; boundPayloadDigest?: string } };
  } | null;
  // apiRequest returns a 401 rather than throwing it; here it is the signing
  // ceremony refusing the password or code.
  if (res.status === 401) {
    throw new Error((serverMessage(json) ?? 'Your password or code was not verified.') + ' Nothing was signed.');
  }
  const sig = json?.meta?.signature;
  if (!sig?.signedAt) {
    throw new Error('The server did not return the signature record. Reload the register to see whether the approval was recorded.');
  }
  return {
    meaning: 'approval',
    reason: input.reason,
    signedAt: sig.signedAt,
    ...(sig.boundPayloadDigest ? { hash: sig.boundPayloadDigest } : {}),
  };
}

/** What the reviewer decided: the next review date is required when the document remains current. */
export type QmsPeriodicReviewDecision =
  | { outcome: 'current'; nextReviewDate: string }
  | { outcome: 'revision-required' };

/**
 * Record a periodic review of a controlled document's version in force. It
 * changes nothing on the document: the review is the signature
 * (server/services/qms/periodic-review.ts).
 */
export async function postQmsPeriodicReview(
  id: number,
  decision: QmsPeriodicReviewDecision,
  input: { reason: string; password: string; totp?: string },
): Promise<EsigSignedManifest> {
  const res = await apiRequest('POST', `/api/mdx/qms/documents/${id}/periodic-review`, {
    ...decision,
    password: input.password,
    ...(input.totp ? { mfaToken: input.totp } : {}),
    meaning: 'review',
    reason: input.reason,
  });
  const json = (await res.json().catch(() => null)) as { signedAt?: string } | null;
  if (res.status === 401) {
    throw new Error((serverMessage(json) ?? 'Your password or code was not verified.') + ' Nothing was signed.');
  }
  if (!json?.signedAt) {
    throw new Error('The server did not return the signature record. Reload the register to see whether the review was recorded.');
  }
  return { meaning: 'review', reason: input.reason, signedAt: json.signedAt };
}

/**
 * Send a draft controlled document for review: the existing edit route,
 * PATCH /api/mdx/qms/documents/:id with status 'in_review' (the server admits
 * only draft or in-review edits and records the §11.10(e) row). Not a
 * signature. Since 2026-10-08 only a document under review can be approved, so
 * this is the step before Approve (QA walk J8: no control in the product moved
 * a draft to review). A refusal is thrown as the server's sentence.
 */
export async function sendQmsDocumentForReview(id: number, reason: string): Promise<void> {
  const res = await apiRequest('PATCH', `/api/mdx/qms/documents/${id}`, { status: 'in_review', reason });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(serverMessage(json) ?? 'Your session could not be verified. Sign in again; nothing was changed.');
  }
}
