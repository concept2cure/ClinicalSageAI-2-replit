/**
 * The status a filing copy of an authored document is filed with, from the
 * source document's governed state. One rule for the server, which writes the
 * copy (server/services/coauthor/coauthor-snapshot.ts), and the placement
 * dialog, which says before placing what the copy will be
 * (docs/design/FILING_SPINE.md F17).
 *
 * Claims nothing the source has not earned:
 *   APPROVED  -> 'approved'   an APPROVER e-signature was applied
 *   FROZEN    -> 'finalized'  content snapshotted, hash-sealed and locked
 *   anything else -> 'draft'  which correctly fails completeness
 *
 * Only an 'approved' copy is released: freeze, dispatch and transmit refuse a
 * sequence with a leaf whose document is not approved
 * (server/services/ectd/dispatch-gate.ts evaluateReleaseApprovalGate;
 * leaf-source-resolver.ts, DP-35).
 */
export type FilingCopyStatus = 'approved' | 'finalized' | 'draft';

export function snapshotStatusFor(sourceStatus: string | null | undefined): FilingCopyStatus {
  const state = String(sourceStatus ?? '').toUpperCase();
  return state === 'APPROVED' ? 'approved' : state === 'FROZEN' ? 'finalized' : 'draft';
}
