/**
 * Who may be named on a Vault version's review route: the server's answer
 * (GET …/route-candidates/:vaultId, review-route-candidates.ts), each member
 * with the validator's refusal per role. Read by the route form at a send and
 * (RR3, `?for=reassign`) by the reassign sheet, which the server answers as
 * the reassignment would admit. Moved out of VaultReviewRoute.tsx in RR3; its
 * shape and guard moved to ../reviewRoute/routeCandidates.ts in RR2.
 */
import { useState } from 'react';
import { useLiveData } from '../dataConnect';
import { isRouteCandidates, type RouteCandidatesShape } from '../reviewRoute/routeCandidates';

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
