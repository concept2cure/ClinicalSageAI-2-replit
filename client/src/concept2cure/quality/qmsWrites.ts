/**
 * The Quality app's unsigned governed writes — one client call per QMS route.
 *
 * Until 2026-10-17 the buttons these serve ("New controlled document", the
 * library cards, "Revise", "Raise change request", "Advance", "Link a record")
 * each handed AnA a sentence and wrote nothing (audit 2026-10-17). Every one
 * has a route in server/routes/mdx-qms.ts, editor-gated, tenant-scoped by the
 * caller's organisation, and writing its §11.10(e) row (`meta.auditTrail`;
 * `apiRequest` announces a row that did not persist):
 *
 *   POST /api/mdx/qms/documents                 create — a draft, never effective
 *   POST /api/mdx/qms/documents/:id/revise      reason required → draft, next major version
 *   POST /api/mdx/qms/changes                   raise a change request
 *   POST /api/mdx/qms/changes/:id/transition    lifecycle move, reason required (governedReason)
 *   POST /api/mdx/qms/changes/:id/links         cross-reference a record
 *
 * The signed acts (approve, retire, change approval) are not here; they are
 * qmsApproval.ts, behind EsignModal. A refusal is thrown as the server's
 * sentence; nothing here retries or substitutes a value.
 *
 * @module client/src/concept2cure/quality/qmsWrites
 */
import { apiRequest, serverMessage } from '@/lib/queryClient';
import type { SopTemplate } from './data';
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

export interface CreatedQmsDocument { id: number; doc_number: string; version: string; status: string }

/** Create a controlled document from a library template, as a draft. The
 *  server seeds its section skeleton from `templateKey`. */
export function createQmsDocument(input: {
  template: SopTemplate;
  docNumber: string;
  title: string;
  nextReviewDate?: string | null;
}): Promise<CreatedQmsDocument> {
  return qmsPost<CreatedQmsDocument>('documents', {
    docNumber: input.docNumber,
    title: input.title,
    docType: input.template.docType,
    templateKey: input.template.key,
    ...(input.template.category ? { category: input.template.category } : {}),
    ...(input.nextReviewDate ? { nextReviewDate: input.nextReviewDate } : {}),
  });
}

/** Open a controlled revision: the document returns to draft at the next major
 *  version and its approval is cleared. */
export function reviseQmsDocument(id: number, reason: string): Promise<{ id: number; version: string; status: string }> {
  return qmsPost(`documents/${id}/revise`, { reason });
}

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
