/**
 * The one client call for a QMS approval signature — a controlled document, a
 * change, or a document's retirement. The signed routes take the same body and
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
