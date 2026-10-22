/**
 * Governed change-control writes through the tenant-scoped QMS routes.
 * Controlled documents use qmsDocuments.ts and the canonical bound editor;
 * signed approval uses qmsApproval.ts and EsignModal.
 */
import { apiRequest, serverMessage } from '@/lib/queryClient';
import type { ChangeState, ChangeType, Classification, LinkType, Relationship } from './changeData';

/** POST to a QMS route and return the envelope's `data`. `apiRequest` throws
 *  every refusal but a 401, which it returns; that is a session refusal here. */
async function qmsPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await apiRequest('POST', `/api/mdx/qms/${path}`, body);
  const parsed = (await res.json().catch(() => null)) as { data?: T } | null;
  if (res.status === 401) {
    throw new Error((serverMessage(parsed) ?? 'Your session could not be verified. Sign in again.') + ' Nothing was changed.');
  }
  if (!parsed || parsed.data == null) {
    throw new Error('The server did not return the record. Reload to see whether the change was recorded.');
  }
  return parsed.data;
}

// Controlled document creation/revision use qmsDocuments.ts and its bound
// authoring-copy response contract. This module owns change-control writes.

export interface NewQmsChange {
  changeNumber: string;
  title: string;
  reason: string;
  description?: string;
  changeType?: ChangeType;
  classification?: Classification;
  targetImplementationDate?: string;
}

export function createQmsChange(input: NewQmsChange): Promise<{ id: number; change_number: string }> {
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined && v !== '') body[k] = v;
  return qmsPost('changes', body);
}

/** Move a change along its lifecycle. 'approved' is refused by the server here
 *  (428) — approval is the signed route. */
export function transitionQmsChange(
  id: number,
  move: { to: Exclude<ChangeState, 'approved'>; reason: string; effectivenessReview?: string },
): Promise<{ id: number; status: ChangeState }> {
  return qmsPost(`changes/${id}/transition`, {
    to: move.to,
    reason: move.reason,
    ...(move.effectivenessReview ? { effectivenessReview: move.effectivenessReview } : {}),
  });
}

export function linkQmsChange(
  id: number,
  link: { linkType: LinkType; linkedRef: string; linkedLabel?: string; relationship?: Relationship; note?: string },
): Promise<{ id: number }> {
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(link)) if (v !== undefined && v !== '') body[k] = v;
  return qmsPost(`changes/${id}/links`, body);
}
