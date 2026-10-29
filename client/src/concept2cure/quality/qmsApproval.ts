/**
 * The one client call for a QMS approval signature — a controlled document, a
 * change, or a document's retirement. The review routing that must precede a
 * document's approval is its review route since RR4 (qmsReviewRoute.ts
 * sendQmsForReview, which replaced sendQmsDocumentForReview here: a send now
 * names one QMS approver and any reviewers). The signed routes take the same body and
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

const NOTHING_SIGNED = 'Nothing was signed.';
/** The server's sentence, ending once with "Nothing was signed." (the ceremony's refusals already do). */
function refusedSigning(message: string): Error {
  return new Error(message.trimEnd().endsWith(NOTHING_SIGNED) ? message : `${message} ${NOTHING_SIGNED}`);
}
import type { EsigSignedManifest } from '../_shared/components/EsignModal';

export type QmsApprovalTarget = { kind: 'document' | 'change' | 'document-retire'; id: number };

/** The signed route for each target kind, relative to /api/mdx/qms. */
const SIGNED_PATH: Record<QmsApprovalTarget['kind'], (id: number) => string> = {
  document: (id) => `documents/${id}/approve`,
  'document-retire': (id) => `documents/${id}/retire`,
  change: (id) => `changes/${id}/approve`,
};

/**
 * The meaning each target kind is signed with, as the route stores it and as
 * the dialog names it. A retirement withdraws the document from use; it is not
 * an approval (P-51).
 */
const SIGNED_MEANING: Record<QmsApprovalTarget['kind'], { stored: string; id: 'approval' | 'retirement' }> = {
  document: { stored: 'APPROVED', id: 'approval' },
  'document-retire': { stored: 'retirement', id: 'retirement' },
  change: { stored: 'APPROVED', id: 'approval' },
};

export async function postQmsApproval(
  target: QmsApprovalTarget,
  input: { reason: string; password: string; totp?: string },
): Promise<EsigSignedManifest> {
  const res = await apiRequest('POST', `/api/mdx/qms/${SIGNED_PATH[target.kind](target.id)}`, {
    password: input.password,
    ...(input.totp ? { mfaToken: input.totp } : {}),
    meaning: SIGNED_MEANING[target.kind].stored,
    reason: input.reason,
  });
  const json = (await res.json().catch(() => null)) as {
    meta?: { signature?: { signedAt?: string; boundPayloadDigest?: string } };
  } | null;
  // apiRequest returns a 401 rather than throwing it; here it is the signing
  // ceremony refusing the password or code.
  if (res.status === 401) {
    throw refusedSigning(serverMessage(json) ?? 'Your password or code was not verified. Re-enter them and sign again.');
  }
  const sig = json?.meta?.signature;
  if (!sig?.signedAt) {
    throw new Error('The server did not return the signature record. Reload the register to see whether the approval was recorded.');
  }
  return {
    meaning: SIGNED_MEANING[target.kind].id,
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
export function postQmsPeriodicReview(
  id: number,
  decision: QmsPeriodicReviewDecision,
  input: { reason: string; password: string; totp?: string },
): Promise<EsigSignedManifest> {
  return sendSignedAct('POST', `/api/mdx/qms/documents/${id}/periodic-review`, decision, { ...input, meaning: 'review' }, UNCONFIRMED_REVIEW);
}

/**
 * Sign a nonconformance's disposition. The reason is recorded as its
 * rationale, and a signed disposition is not changed
 * (server/services/qms/nonconformance-disposition.ts).
 */
export function signNcDisposition(
  id: number,
  disposition: string,
  input: { meaning: EsigSignedManifest['meaning']; reason: string; password: string; totp?: string },
): Promise<EsigSignedManifest> {
  return sendSignedAct('PATCH', `/api/mdx/qms/nonconforming/${id}/disposition`, { disposition }, input, UNCONFIRMED_DISPOSITION);
}
const UNCONFIRMED_DISPOSITION = 'The server did not confirm the disposition. Reload the register and check the nonconformance before you sign again.';

/** Close a deviation with a signature (server/services/qms/deviations.ts, P-57). */
export function signDeviationClose(
  id: number,
  input: { meaning: EsigSignedManifest['meaning']; reason: string; password: string; totp?: string },
): Promise<EsigSignedManifest> {
  return sendSignedAct('POST', `/api/mdx/qms/deviations/${id}/close`, {}, input, UNCONFIRMED_CLOSE);
}
const UNCONFIRMED_CLOSE = 'The server did not confirm the close. Reload the register and check the deviation before you sign again.';

/** Sign a supplier's approval standing (server/services/qms/supplier-approval.ts). */
export function signSupplierApproval(
  id: number,
  decision: { approvalStatus: string; reapprovalDate?: string },
  input: { meaning: EsigSignedManifest['meaning']; reason: string; password: string; totp?: string },
): Promise<EsigSignedManifest> {
  return sendSignedAct('POST', `/api/mdx/qms/suppliers/${id}/approval`, decision, input, UNCONFIRMED_APPROVAL);
}
const UNCONFIRMED_APPROVAL = "The server did not confirm the supplier's standing. Reload the register and check the supplier before you sign again.";

/**
 * A route that signs through the platform's one ceremony (routes/governed-signed-act.ts),
 * which answers with the signature's time. A coded refusal (4xx) is the server's
 * sentence. A dropped connection or a server error may have come after the
 * commit, so it is not "nothing was signed", and signing again could record a
 * second act.
 */
async function sendSignedAct(
  method: 'POST' | 'PATCH',
  path: string,
  fields: Record<string, unknown>,
  input: { meaning: EsigSignedManifest['meaning']; reason: string; password: string; totp?: string },
  unconfirmed: string,
): Promise<EsigSignedManifest> {
  let res: Response;
  try {
    res = await apiRequest(method, path, {
      ...fields,
      password: input.password,
      ...(input.totp ? { mfaToken: input.totp } : {}),
      meaning: input.meaning,
      reason: input.reason,
    });
  } catch (err) {
    const status = (err as { status?: unknown } | null)?.status;
    if (typeof status === 'number' && status < 500) throw err;
    throw new Error(unconfirmed);
  }
  const json = (await res.json().catch(() => null)) as { signedAt?: string; sha256Chain?: string } | null;
  if (res.status === 401) {
    throw refusedSigning(serverMessage(json) ?? 'Your password or code was not verified. Re-enter them and sign again.');
  }
  if (!json?.signedAt) throw new Error(unconfirmed);
  return { meaning: input.meaning, reason: input.reason, signedAt: json.signedAt, ...(json.sha256Chain ? { hash: json.sha256Chain } : {}) };
}
const UNCONFIRMED_REVIEW = 'The server did not confirm the review. Reload the register and check the document’s last review before you sign again.';
