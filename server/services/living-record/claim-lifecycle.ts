/**
 * Living Record Spine — the Claim lifecycle state machine.
 *
 * The Claim has two orthogonal status axes:
 *   - content       (evidence_claims.status)        what we know about the claim
 *   - verification  (evidence_claims.verification)  whether its value agrees
 *                                                   with its canonical fact
 *
 * This module is the single authority for which transitions are legal on each
 * axis, and which governed audit action each transition writes. It is pure and
 * total: legal transitions return the next state; illegal ones throw. Nothing
 * here touches the database — the write path calls these to validate, then
 * persists through /api/c2c/actions/transition so every move is audited.
 *
 * See docs/architecture/LIVING_RECORD_SPINE.md §2.2.
 */

import type { ClaimVerification } from '../../../shared/schema/living-record-spine';

// Re-export so the verification type travels with the lifecycle machine that
// uses it (consumers import it from here, e.g. the reconciliation engine).
export type { ClaimVerification };

// ─────────────────────────────────────────────────────────────────────────────
// Content axis
// ─────────────────────────────────────────────────────────────────────────────

export type ClaimContentStatus =
  | 'proposed'
  | 'supported'
  | 'unsupported'
  | 'contradicted'
  | 'withdrawn'
  | 'superseded';

export const CLAIM_CONTENT_STATUSES: ClaimContentStatus[] = [
  'proposed',
  'supported',
  'unsupported',
  'contradicted',
  'withdrawn',
  'superseded',
];

/** Legal content transitions. `withdrawn` and `superseded` are terminal. */
export const CLAIM_CONTENT_TRANSITIONS: Record<ClaimContentStatus, ClaimContentStatus[]> = {
  proposed: ['supported', 'unsupported', 'contradicted', 'withdrawn'],
  supported: ['contradicted', 'unsupported', 'withdrawn', 'superseded'],
  unsupported: ['supported', 'contradicted', 'withdrawn', 'superseded'],
  contradicted: ['supported', 'unsupported', 'withdrawn', 'superseded'],
  withdrawn: [],
  superseded: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Verification axis
// ─────────────────────────────────────────────────────────────────────────────

export const CLAIM_VERIFICATION_STATES: ClaimVerification[] = [
  'unverified',
  'verified',
  'drifted',
  'disputed',
];

/** Legal verification transitions. */
export const CLAIM_VERIFICATION_TRANSITIONS: Record<ClaimVerification, ClaimVerification[]> = {
  unverified: ['verified', 'disputed'],
  verified: ['drifted', 'disputed'],
  drifted: ['verified', 'disputed'],
  disputed: ['verified', 'drifted'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export type ClaimAxis = 'content' | 'verification';

export function canTransitionContent(from: ClaimContentStatus, to: ClaimContentStatus): boolean {
  return (CLAIM_CONTENT_TRANSITIONS[from] ?? []).includes(to);
}

export function canTransitionVerification(from: ClaimVerification, to: ClaimVerification): boolean {
  return (CLAIM_VERIFICATION_TRANSITIONS[from] ?? []).includes(to);
}

export class IllegalClaimTransitionError extends Error {
  constructor(
    public readonly axis: ClaimAxis,
    public readonly from: string,
    public readonly to: string
  ) {
    super(`Illegal claim ${axis} transition: ${from} → ${to}`);
    this.name = 'IllegalClaimTransitionError';
  }
}

/** Validate + return the next content status, or throw. */
export function transitionContent(
  from: ClaimContentStatus,
  to: ClaimContentStatus
): ClaimContentStatus {
  if (!canTransitionContent(from, to)) {
    throw new IllegalClaimTransitionError('content', from, to);
  }
  return to;
}

/** Validate + return the next verification state, or throw. */
export function transitionVerification(
  from: ClaimVerification,
  to: ClaimVerification
): ClaimVerification {
  if (!canTransitionVerification(from, to)) {
    throw new IllegalClaimTransitionError('verification', from, to);
  }
  return to;
}

// ─────────────────────────────────────────────────────────────────────────────
// Governed audit actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every transition is persisted through the governed action ledger. This maps a
 * transition to the audit action the write path emits, so the audit string is
 * defined in one place rather than scattered across call sites.
 */
export function auditActionFor(axis: ClaimAxis, to: string): string {
  if (axis === 'verification') {
    // verification moves are reconciliation outcomes
    switch (to) {
      case 'verified':
        return 'c2c.claim.verify';
      case 'drifted':
        return 'c2c.claim.drift';
      case 'disputed':
        return 'c2c.claim.dispute';
      default:
        return 'c2c.claim.reconcile';
    }
  }
  // content moves are governed work transitions
  switch (to) {
    case 'withdrawn':
      return 'c2c.claim.withdraw';
    case 'superseded':
      return 'c2c.claim.supersede';
    default:
      return 'c2c.work.transition';
  }
}

/** True when the content status is terminal (no further content moves). */
export function isTerminalContent(status: ClaimContentStatus): boolean {
  return (CLAIM_CONTENT_TRANSITIONS[status] ?? []).length === 0;
}
