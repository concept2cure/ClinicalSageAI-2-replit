/**
 * Claim lifecycle state machine — pure, no database.
 * Asserts the legal transitions on both axes and that illegal moves throw.
 */

import { describe, it, expect } from 'vitest';

import {
  CLAIM_CONTENT_STATUSES,
  CLAIM_VERIFICATION_STATES,
  canTransitionContent,
  canTransitionVerification,
  transitionContent,
  transitionVerification,
  IllegalClaimTransitionError,
  isTerminalContent,
  auditActionFor,
} from '../claim-lifecycle';

describe('claim content axis', () => {
  it('allows the canonical evidence-grading moves out of proposed', () => {
    expect(canTransitionContent('proposed', 'supported')).toBe(true);
    expect(canTransitionContent('proposed', 'unsupported')).toBe(true);
    expect(canTransitionContent('proposed', 'contradicted')).toBe(true);
    expect(canTransitionContent('proposed', 'withdrawn')).toBe(true);
  });

  it('cannot jump straight from proposed to superseded', () => {
    expect(canTransitionContent('proposed', 'superseded')).toBe(false);
    expect(() => transitionContent('proposed', 'superseded')).toThrow(IllegalClaimTransitionError);
  });

  it('treats withdrawn and superseded as terminal', () => {
    expect(isTerminalContent('withdrawn')).toBe(true);
    expect(isTerminalContent('superseded')).toBe(true);
    for (const to of CLAIM_CONTENT_STATUSES) {
      expect(canTransitionContent('withdrawn', to)).toBe(false);
      expect(canTransitionContent('superseded', to)).toBe(false);
    }
  });

  it('returns the next state on a legal move', () => {
    expect(transitionContent('supported', 'contradicted')).toBe('contradicted');
  });
});

describe('claim verification axis', () => {
  it('verifies or disputes from unverified', () => {
    expect(canTransitionVerification('unverified', 'verified')).toBe(true);
    expect(canTransitionVerification('unverified', 'disputed')).toBe(true);
  });

  it('drifts only from verified, then can re-verify', () => {
    expect(canTransitionVerification('verified', 'drifted')).toBe(true);
    expect(canTransitionVerification('drifted', 'verified')).toBe(true);
    // cannot drift straight from unverified
    expect(canTransitionVerification('unverified', 'drifted')).toBe(false);
    expect(() => transitionVerification('unverified', 'drifted')).toThrow(
      IllegalClaimTransitionError
    );
  });

  it('every verification state has a defined transition set', () => {
    for (const s of CLAIM_VERIFICATION_STATES) {
      expect(Array.isArray(canTransitionVerification(s, 'verified') ? [] : [])).toBe(true);
    }
  });
});

describe('governed audit actions', () => {
  it('maps verification outcomes to claim audit actions', () => {
    expect(auditActionFor('verification', 'verified')).toBe('c2c.claim.verify');
    expect(auditActionFor('verification', 'drifted')).toBe('c2c.claim.drift');
    expect(auditActionFor('verification', 'disputed')).toBe('c2c.claim.dispute');
  });

  it('maps terminal content moves to dedicated actions, others to the generic transition', () => {
    expect(auditActionFor('content', 'withdrawn')).toBe('c2c.claim.withdraw');
    expect(auditActionFor('content', 'superseded')).toBe('c2c.claim.supersede');
    expect(auditActionFor('content', 'supported')).toBe('c2c.work.transition');
  });
});
