/**
 * The naming acts on a Vault version's open review route (RR3 of
 * docs/design/REVIEW_ROUTING_2026-10-23.md §2.10, §2.12; findings M3, M6):
 *
 *   - ReassignDialog: the sender, or an administrator, gives a member's
 *     assignment that is not signed to another person. The sheet itself moved
 *     to ../reviewRoute/RouteReassignSheet.tsx in RR5, shared with the
 *     Authoring document; this is the Vault's candidates read and act for it
 *     (GET …/route-candidates/:vaultId?for=reassign, POST …/review-route/reassign).
 *   - The naming history (RouteHistory) moved to
 *     ../reviewRoute/RouteHistory.tsx in RR2, shared with the Quality
 *     register.
 *
 * Hand back is a reason-only act, so it is RouteActDialog's (VaultReviewRoute.tsx).
 */
import React from 'react';
import { lifecyclePost } from './vaultLifecyclePost';
import type { RouteMemberView } from '../reviewRoute/routeRound';
import { RouteReassignSheet } from '../reviewRoute/RouteReassignSheet';

export { reassignMissing } from '../reviewRoute/RouteReassignSheet';

/** Reassign one member's assignment on a Vault version's route. */
export function ReassignDialog({ member, vaultId, canonicalId, title, onClose, onDone }: {
  member: RouteMemberView;
  vaultId: string;
  canonicalId: string;
  title: string;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <RouteReassignSheet
      member={member}
      title={title}
      candidatesUrl={`/api/regulatory/documents/route-candidates/${encodeURIComponent(vaultId)}?for=reassign`}
      audit="this version’s audit trail"
      post={(body) => lifecyclePost(`/api/regulatory/documents/${encodeURIComponent(canonicalId)}/review-route/reassign`, body, 'The assignment was not reassigned.')}
      onClose={onClose}
      onDone={onDone}
    />
  );
}
