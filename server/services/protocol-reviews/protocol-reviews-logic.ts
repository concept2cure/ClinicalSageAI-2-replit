/**
 * Protocol Review & Comment deterministic logic (Capability C2C-18c)
 *
 * Pure, DB-free, LLM-free: summarize the per-reviewer dispositions into a single
 * board-level consensus, and decide whether the protocol is ready for a decision
 * (every assignment completed + no open blocking comments). The consensus rule
 * mirrors how a review board resolves dispositions under ICH E6(R2) §5.0 and
 * 45 CFR 46.111 — any reject is dispositive, otherwise any "approve with changes"
 * gates a clean approval; abstentions never decide. Deterministic — the gate the
 * service and route layers enforce.
 *
 * @module server/services/protocol-reviews/protocol-reviews-logic
 */

export type ReviewAssignmentStatus = 'assigned' | 'in_progress' | 'completed';
export type ReviewDisposition = 'approve' | 'approve_with_changes' | 'reject' | 'abstain';
export type Consensus = 'approve' | 'approve_with_changes' | 'reject' | 'pending';

export interface AssignmentView {
  status: ReviewAssignmentStatus;
  disposition?: ReviewDisposition | null;
}

export interface ConsensusResult {
  /** Count of assignments marked completed. */
  completed: number;
  /** Count of assignments not yet completed. */
  pending: number;
  /** Tally of recorded dispositions, keyed by disposition. */
  dispositions: Record<ReviewDisposition, number>;
  consensus: Consensus;
  /** Cited, human-readable explanation of how the consensus was reached. */
  basis: string;
}

const ICH_E6 = 'ICH E6(R2) §5.0 / 45 CFR 46.111 — review-board disposition resolution';

/**
 * Roll the per-reviewer dispositions up into a single board consensus. Rules:
 *   - If not every assignment is completed → 'pending' (the board cannot decide).
 *   - Else if any reviewer rejected → 'reject' (a reject is dispositive).
 *   - Else if any reviewer approved-with-changes → 'approve_with_changes'.
 *   - Else if at least one reviewer approved → 'approve'.
 *   - Else (only abstentions / none) → 'pending'.
 * Pure.
 */
export function summarizeReviewConsensus(assignments: AssignmentView[]): ConsensusResult {
  const dispositions: Record<ReviewDisposition, number> = { approve: 0, approve_with_changes: 0, reject: 0, abstain: 0 };
  let completed = 0;
  let pending = 0;
  for (const a of assignments) {
    if (a.status === 'completed') completed += 1;
    else pending += 1;
    if (a.disposition) dispositions[a.disposition] += 1;
  }

  let consensus: Consensus;
  let basis: string;
  if (assignments.length === 0) {
    consensus = 'pending';
    basis = `No reviewers assigned yet. (${ICH_E6})`;
  } else if (pending > 0) {
    consensus = 'pending';
    basis = `${pending} of ${assignments.length} review(s) not yet completed. (${ICH_E6})`;
  } else if (dispositions.reject > 0) {
    consensus = 'reject';
    basis = `${dispositions.reject} reviewer(s) recorded a reject; a reject is dispositive. (${ICH_E6})`;
  } else if (dispositions.approve_with_changes > 0) {
    consensus = 'approve_with_changes';
    basis = `${dispositions.approve_with_changes} reviewer(s) require changes before approval. (${ICH_E6})`;
  } else if (dispositions.approve > 0) {
    consensus = 'approve';
    basis = `All ${dispositions.approve} non-abstaining reviewer(s) approved. (${ICH_E6})`;
  } else {
    consensus = 'pending';
    basis = `All reviewers abstained; no decisive disposition. (${ICH_E6})`;
  }

  return { completed, pending, dispositions, consensus, basis };
}

// ─── Readiness gate ──────────────────────────────────────────────────────────

export interface ReadinessInput {
  assignments: AssignmentView[];
  /** Count of unresolved comments at severity 'blocking'. */
  openBlockingComments: number;
}

export interface ReadinessResult {
  readyToDecide: boolean;
  /** Cited reasons the protocol is not yet ready (empty when ready). */
  blockers: string[];
}

/**
 * Decide whether a protocol review is ready for a board decision: every
 * assignment must be completed and there must be no open blocking comments.
 * Pure — the deterministic gate the service enforces before a disposition roll-up
 * is treated as final.
 */
export function evaluateReviewReadiness(input: ReadinessInput): ReadinessResult {
  const blockers: string[] = [];
  if (input.assignments.length === 0) {
    blockers.push(`No reviewers assigned. (${ICH_E6})`);
  }
  const incomplete = input.assignments.filter((a) => a.status !== 'completed').length;
  if (incomplete > 0) {
    blockers.push(`${incomplete} review assignment(s) not yet completed. (${ICH_E6})`);
  }
  if (input.openBlockingComments > 0) {
    blockers.push(`${input.openBlockingComments} unresolved blocking comment(s) must be resolved. (${ICH_E6})`);
  }
  return { readyToDecide: blockers.length === 0, blockers };
}
