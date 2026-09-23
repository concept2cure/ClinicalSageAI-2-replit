/**
 * The P12 review quorum for a concept2cure artifact: whether the review is
 * complete, so the approval act may record the version it approves. One
 * implementation, imported by the two governed approval acts — the only
 * writers of approved_version_id:
 *   - the status route, PUT /projects/:projectId/artifacts/:artifactId/status,
 *     review → approved (server/routes/c2c/artifacts.ts), which owned it inline;
 *   - authoring-actions approve-artifact (server/routes/authoring-actions.ts).
 *
 * 2026-09-23 (W5/D7, residual repair, round 3): moved here unchanged from the
 * status route, with the route's role table, so promote_artifact and the AnA
 * update_artifact_status command could apply both before recording an
 * approval.
 * 2026-09-23 (W5/D7, final pass) — supersedes the round-3 note: product
 * decision, only the governed approval act may make an artifact filable.
 * promote_artifact and update_artifact_status record no approval (reverted to
 * HEAD) and no longer import anything from here; the role table went back
 * inline to its one user, the status route. What remains is the quorum, which
 * authoring-actions approve-artifact now applies as well — it recorded an
 * approval with no quorum check at all.
 * 2026-09-23 (W5/D7, final pass, repair) — amends the note above: promote_artifact
 * and update_artifact_status import the remedy sentences below. They record no
 * version, so they must not repeat the filing rule's remedy (artifactApproval's
 * `remedy`, written for the status route: "approved → review, then review →
 * approved, which records the version approved") — done through the command
 * that printed it, that records nothing, and the user goes round in a circle.
 * These name the governed act that does record the version and say the
 * calling surface records none.
 */

/** A pg-style client: the pool, or queryableFromDrizzle(db | tx). */
export interface ApprovalActQueryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export type ReviewQuorumVerdict = { met: true } | { met: false; message: string };

/**
 * P12 review quorum: when reviewers are assigned, every active reviewer of the
 * latest round must have completed and every decision in that round must be
 * 'approve'. Withdrawn assignments are excluded; a round whose assignments were
 * all withdrawn, or no assignments at all, has no quorum to enforce.
 *
 * `artifactPk` is concept2cure_artifacts.id (the serial key the review tables
 * reference), not artifact_id. A read error propagates: the caller must not
 * record an approval it could not check.
 */
export async function reviewQuorumVerdict(
  q: ApprovalActQueryable,
  artifactPk: number,
  organizationId: number
): Promise<ReviewQuorumVerdict> {
  const assignments = (
    await q.query(
      `SELECT review_round, status FROM concept2cure_review_assignments
       WHERE artifact_id = $1 AND organization_id = $2
       ORDER BY review_round DESC`,
      [artifactPk, organizationId]
    )
  ).rows as Array<{ review_round: number; status: string }>;
  if (assignments.length === 0) return { met: true };

  const latestRound = Number(assignments[0].review_round);
  const active = assignments.filter(
    a => Number(a.review_round) === latestRound && a.status !== 'withdrawn'
  );
  if (active.length === 0) return { met: true };

  const pending = active.filter(a => a.status !== 'completed');
  if (pending.length > 0) {
    return {
      met: false,
      message: `Cannot approve: ${pending.length} of ${active.length} reviewers have not yet submitted their decision`,
    };
  }

  const decisions = (
    await q.query(
      `SELECT decision FROM concept2cure_review_decisions
       WHERE artifact_id = $1 AND review_round = $2 AND organization_id = $3`,
      [artifactPk, latestRound, organizationId]
    )
  ).rows as Array<{ decision: string }>;
  const nonApprovals = decisions.filter(d => d.decision !== 'approve');
  if (nonApprovals.length > 0) {
    return {
      met: false,
      message: `Cannot approve: ${nonApprovals.length} reviewer(s) did not approve (decisions: ${nonApprovals
        .map(d => d.decision)
        .join(', ')})`,
    };
  }
  return { met: true };
}

/** The governed approval act — the only writer of approved_version_id. */
export const GOVERNED_APPROVE_ACTION =
  "the review workflow's Approve action (the status route's review → approved, which takes an attestation " +
  'and applies the review quorum, or authoring-actions approve-artifact)';
/** The governed lock act — the only writer of published_version_id on a lock. */
export const GOVERNED_LOCK_ACTION =
  "the review workflow's Lock action (the status route's approved → locked, or authoring-actions lock-artifact)";

/**
 * The remedy an approved-but-not-filable artifact needs, told by a surface
 * that sets status 'approved' and records no version (`surface` names it:
 * 'command' for AnA update_artifact_status, 'action' for promote_artifact).
 * 2026-09-23 (W5/D7, final pass, repair).
 */
export function approvalRecordedOnlyByGovernedAct(surface: 'command' | 'action'): string {
  return (
    `An approved version is recorded only by ${GOVERNED_APPROVE_ACTION}; this ${surface} records none, ` +
    `so repeating it will not make the artifact filable. To file it, return it to review and approve it ` +
    'through that Approve action, which records the version approved.'
  );
}

/**
 * The remedy for an artifact a surface that records no locked version has
 * locked. The governed lock act needs status 'approved', and the only way out
 * of 'locked' is locked → draft, which clears both versions. 2026-09-23
 * (W5/D7, final pass, repair).
 */
export function lockRecordedOnlyByGovernedAct(surface: 'command' | 'action'): string {
  return (
    `A locked version is recorded only by ${GOVERNED_LOCK_ACTION}; this ${surface} records none, ` +
    'so repeating it will not make the artifact filable. To file it, unlock it (locked → draft), return it to ' +
    `review, approve it through ${GOVERNED_APPROVE_ACTION}, and lock it through that Lock action.`
  );
}
