/**
 * Governed change-control writes through the tenant-scoped QMS routes.
 * Controlled documents use qmsDocuments.ts and the canonical bound editor;
 * signed approval uses qmsApproval.ts and EsignModal.
 */
import { apiRequest, serverMessage } from '@/lib/queryClient';
import type { DeviceChangeMarket } from '@shared/regulatory/change-control-taxonomy';
import type { ChangeState, ChangeType, Classification, LinkType, Relationship, RiskLevel } from './changeData';

/** Send a governed write and return the record `take` finds in the reply.
 *  `apiRequest` throws every refusal but a 401, which it returns; that is a
 *  session refusal here. */
async function send<T>(
  method: 'POST' | 'PATCH' | 'DELETE', url: string, body: Record<string, unknown>, take: (parsed: unknown) => T | null,
): Promise<T> {
  const res = await apiRequest(method, url, body);
  const parsed = (await res.json().catch(() => null)) as unknown;
  if (res.status === 401) {
    throw new Error((serverMessage(parsed) ?? 'Your session could not be verified. Sign in again.') + ' Nothing was changed.');
  }
  const row = take(parsed);
  if (row == null) {
    throw new Error('The server did not return the record. Reload to see whether the change was recorded.');
  }
  return row;
}

/** Write to a QMS route and return the envelope's `data`. The quality records
 *  (qmsRecordData.ts) write through this too. A DELETE carries its reason in a
 *  JSON body, as the governed QMS removals require. */
export const qmsWrite = <T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body: Record<string, unknown>): Promise<T> =>
  send(method, `/api/mdx/qms/${path}`, body, (p) => ((p as { data?: T } | null)?.data ?? null));

/** Write to the CAPA routes (server/routes/capa-mdr.ts), which return the
 *  record itself with its audit outcome under `meta`, not a `data` envelope. */
export const capaWrite = <T>(path: string, body: Record<string, unknown>): Promise<T> =>
  send('POST', `/api/capa-mdr/${path}`, body, (p) => (p && typeof p === 'object' && 'id' in p ? (p as T) : null));

const qmsPost = <T>(path: string, body: Record<string, unknown>): Promise<T> => qmsWrite<T>('POST', path, body);

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
  riskLevel?: RiskLevel;
  impactAssessment?: string;
  implementationPlan?: string;
  /** The project the change belongs to (P-60); absent, an organisation-wide change. */
  programId?: string;
}

/** A change's assessment. Editable while the change is proposed or under assessment; after that the server refuses it
 *  (409 QMS_CHANGE_CONTENT_FIXED), because the approval signs it. An empty field is sent as null: cleared. */
export interface QmsChangeAssessment {
  riskLevel: RiskLevel | null;
  impactAssessment: string | null;
  implementationPlan: string | null;
  targetImplementationDate: string | null;
}

/** The edit states its reason; the audit row keeps it with each field before and after (F1, Part 11 review L-2). */
export function updateQmsChange(id: number, assessment: QmsChangeAssessment, editReason: string): Promise<{ id: number }> {
  return qmsWrite('PATCH', `changes/${id}`, { ...assessment, editReason });
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

/**
 * Run the device change determination for a market on a change (P-122). The body carries the person's answers to the
 * engine's questions and, when a recorded determination is replaced, why. The server runs the engine, keeps the
 * outcome on the change and returns it; no verdict is ever sent from here.
 */
export function assessQmsChangeImpact(
  id: number,
  input: { market: DeviceChangeMarket; answers: Record<string, boolean | undefined>; reason?: string },
): Promise<{ id: number; regulatory_impact?: unknown }> {
  return qmsPost(`changes/${id}/regulatory-impact`, {
    market: input.market, answers: input.answers, ...(input.reason ? { reason: input.reason } : {}),
  });
}
