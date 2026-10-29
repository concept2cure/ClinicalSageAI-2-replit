/**
 * Who may be named on a Vault version's review route: the server's answer
 * (GET …/route-candidates/:vaultId, review-route-candidates.ts), each member
 * with the validator's refusal per role. Read by the route form at a send and
 * (RR3, `?for=reassign`) by the reassign sheet, which the server answers as
 * the reassignment would admit. Moved out of VaultReviewRoute.tsx in RR3.
 */
import { useState } from 'react';
import { useLiveData, type ShapeGuard } from '../dataConnect';

export interface CandidateRefusal { code: string; message: string }
export interface RouteCandidateView { id: number; name: string; reviewer: CandidateRefusal | null; approver: CandidateRefusal | null }
export interface RouteCandidatesShape { timeZone: string; canonicalId: string | null; candidates: RouteCandidateView[] }

const isRefusal = (v: unknown) => v === null || (!!v && typeof (v as CandidateRefusal).code === 'string' && typeof (v as CandidateRefusal).message === 'string');
export const isRouteCandidates: ShapeGuard<RouteCandidatesShape> = (v): v is RouteCandidatesShape => {
  const o = v as RouteCandidatesShape | null;
  return !!o && typeof o.timeZone === 'string' && Array.isArray(o.candidates) && o.candidates.every((c) =>
    !!c && Number.isSafeInteger(c.id) && typeof c.name === 'string' && isRefusal(c.reviewer) && isRefusal(c.approver));
};

/** Who may be named, read when the form opens; an unread list offers no one, and says so. For a reassignment, as the reassignment would admit (RR3). */
export function useRouteCandidates(vaultId: string, purpose: 'send' | 'reassign' = 'send') {
  const [epoch, setEpoch] = useState(0);
  const read = useLiveData<RouteCandidatesShape>(
    purpose === 'reassign'
      ? `/api/regulatory/documents/route-candidates/${encodeURIComponent(vaultId)}?for=reassign`
      : `/api/regulatory/documents/route-candidates/${encodeURIComponent(vaultId)}`,
    [vaultId, purpose, epoch], isRouteCandidates);
  return { loading: read.loading, data: read.loading ? null : read.data, again: () => setEpoch((n) => n + 1) };
}
