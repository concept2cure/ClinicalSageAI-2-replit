/**
 * Who may be named on a review route, as the server answers it
 * (review-route-candidates.ts listRouteCandidates): every member, with the
 * one validator's refusal per role. The shape and its guard are shared by the
 * Vault (vaultRouteCandidates.ts, which reads it for a version) and the Quality
 * register (QmsReviewRoute.tsx, which reads it for a controlled document).
 * Moved out of v2/surfaces/vaultRouteCandidates.ts unchanged in RR2.
 */

export interface CandidateRefusal { code: string; message: string }
export interface RouteCandidateView { id: number; name: string; reviewer: CandidateRefusal | null; approver: CandidateRefusal | null }
export interface RouteCandidatesShape { timeZone: string; canonicalId: string | null; candidates: RouteCandidateView[] }

const isRefusal = (v: unknown) => v === null || (!!v && typeof (v as CandidateRefusal).code === 'string' && typeof (v as CandidateRefusal).message === 'string');
export const isRouteCandidates: (value: unknown) => value is RouteCandidatesShape = (v): v is RouteCandidatesShape => {
  const o = v as RouteCandidatesShape | null;
  return !!o && typeof o.timeZone === 'string' && Array.isArray(o.candidates) && o.candidates.every((c) =>
    !!c && Number.isSafeInteger(c.id) && typeof c.name === 'string' && isRefusal(c.reviewer) && isRefusal(c.approver));
};
