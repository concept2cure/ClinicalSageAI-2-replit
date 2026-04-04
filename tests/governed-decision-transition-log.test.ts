/**
 * Governed Decision Repository — Transition & Queue Tests
 *
 * Tests the lifecycle state machine, transition validation,
 * and queue classification logic.
 *
 * Note: DB-dependent functions (recordTransitionEvent, getProjectReviewQueue)
 * return empty results in test without a running DB. Pure logic tests
 * (isValidTransition, state machine rules) are the primary coverage here.
 */

import { describe, expect, it } from 'vitest';

import {
  isValidTransition,
  type GovernedLifecycleState,
} from '../server/services/governed-decision-repository';

// ═══════════════════════════════════════════════════════════════════════
// Transition Validation (pure logic — no DB needed)
// ═══════════════════════════════════════════════════════════════════════

describe('Repository — Transition Validation', () => {
  it('recommended_only → under_review is valid', () => {
    expect(isValidTransition('recommended_only', 'under_review')).toBe(true);
  });

  it('under_review → approved is valid', () => {
    expect(isValidTransition('under_review', 'approved')).toBe(true);
  });

  it('under_review → rejected is valid', () => {
    expect(isValidTransition('under_review', 'rejected')).toBe(true);
  });

  it('approved → executed is valid', () => {
    expect(isValidTransition('approved', 'executed')).toBe(true);
  });

  it('executed → superseded is valid', () => {
    expect(isValidTransition('executed', 'superseded')).toBe(true);
  });

  it('rejected → under_review is valid (re-review)', () => {
    expect(isValidTransition('rejected', 'under_review')).toBe(true);
  });

  it('deferred → under_review is valid (resume)', () => {
    expect(isValidTransition('deferred', 'under_review')).toBe(true);
  });

  it('recommended_only → approved is INVALID', () => {
    expect(isValidTransition('recommended_only', 'approved')).toBe(false);
  });

  it('recommended_only → executed is INVALID', () => {
    expect(isValidTransition('recommended_only', 'executed')).toBe(false);
  });

  it('superseded → anything is INVALID (terminal)', () => {
    expect(isValidTransition('superseded', 'under_review')).toBe(false);
    expect(isValidTransition('superseded', 'approved')).toBe(false);
  });

  it('unknown state → anything is INVALID', () => {
    expect(isValidTransition('nonexistent', 'approved')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// State Machine Completeness
// ═══════════════════════════════════════════════════════════════════════

describe('Repository — State Machine Completeness', () => {
  const ALL_STATES: GovernedLifecycleState[] = [
    'recommended_only', 'under_review', 'approved', 'rejected',
    'executed', 'deferred', 'escalated', 'superseded',
  ];

  it('every non-terminal state can be superseded', () => {
    for (const state of ALL_STATES) {
      if (state === 'superseded') continue;
      expect(isValidTransition(state, 'superseded')).toBe(true);
    }
  });

  it('superseded has zero valid transitions', () => {
    for (const target of ALL_STATES) {
      expect(isValidTransition('superseded', target)).toBe(false);
    }
  });

  it('executed is reachable only through approved', () => {
    expect(isValidTransition('approved', 'executed')).toBe(true);
    expect(isValidTransition('recommended_only', 'executed')).toBe(false);
    expect(isValidTransition('under_review', 'executed')).toBe(false);
    expect(isValidTransition('rejected', 'executed')).toBe(false);
  });
});
