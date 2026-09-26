/**
 * The one client call for a QMS approval signature — a controlled document or
 * a change. Both signed routes take the same body and answer the same way
 * (server/routes/mdx-qms.ts: POST /qms/documents/:id/approve and, since P1-28 /
 * DP-31, POST /qms/changes/:id/approve), so the register and the change log
 * share this rather than each keeping a copy.
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

export type QmsApprovalTarget = { kind: 'document' | 'change'; id: number };

export async function postQmsApproval(
  target: QmsApprovalTarget,
  input: { reason: string; password: string; totp?: string },
): Promise<EsigSignedManifest> {
  const collection = target.kind === 'document' ? 'documents' : 'changes';
  const res = await apiRequest('POST', `/api/mdx/qms/${collection}/${target.id}/approve`, {
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
