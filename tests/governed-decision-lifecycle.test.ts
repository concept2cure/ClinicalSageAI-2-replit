/**
 * Governed Decision Lifecycle Tests
 *
 * Tests the lifecycle state machine for governed decisions:
 * recommended_only → under_review → approved/rejected → executed → superseded
 */

import { describe, expect, it } from 'vitest';

import {
  isValidTransition,
  type GovernedLifecycleState,
} from '../server/services/governed-decision-repository';

// ═══════════════════════════════════════════════════════════════════════
// Lifecycle Transition Validation
// ═══════════════════════════════════════════════════════════════════════

describe('Governed Decision Lifecycle — Transition Validation', () => {
  // Valid forward transitions
  it('recommended_only → under_review is valid', () => {
    expect(isValidTransition('recommended_only', 'under_review')).toBe(true);
  });

  it('under_review → approved is valid', () => {
    expect(isValidTransition('under_review', 'approved')).toBe(true);
  });

  it('under_review → rejected is valid', () => {
    expect(isValidTransition('under_review', 'rejected')).toBe(true);
  });

  it('under_review → escalated is valid', () => {
    expect(isValidTransition('under_review', 'escalated')).toBe(true);
  });

  it('approved → executed is valid', () => {
    expect(isValidTransition('approved', 'executed')).toBe(true);
  });

  it('executed → superseded is valid', () => {
    expect(isValidTransition('executed', 'superseded')).toBe(true);
  });

  // Recovery transitions
  it('rejected → under_review is valid (re-review)', () => {
    expect(isValidTransition('rejected', 'under_review')).toBe(true);
  });

  it('deferred → under_review is valid (resume)', () => {
    expect(isValidTransition('deferred', 'under_review')).toBe(true);
  });

  it('escalated → approved is valid (resolved escalation)', () => {
    expect(isValidTransition('escalated', 'approved')).toBe(true);
  });

  // Deferral
  it('recommended_only → deferred is valid', () => {
    expect(isValidTransition('recommended_only', 'deferred')).toBe(true);
  });

  it('under_review → deferred is valid', () => {
    expect(isValidTransition('under_review', 'deferred')).toBe(true);
  });

  // Supersession from any active state
  it('recommended_only → superseded is valid', () => {
    expect(isValidTransition('recommended_only', 'superseded')).toBe(true);
  });

  it('under_review → superseded is valid', () => {
    expect(isValidTransition('under_review', 'superseded')).toBe(true);
  });

  it('approved → superseded is valid', () => {
    expect(isValidTransition('approved', 'superseded')).toBe(true);
  });

  // Invalid transitions
  it('recommended_only → approved is INVALID (must review first)', () => {
    expect(isValidTransition('recommended_only', 'approved')).toBe(false);
  });

  it('recommended_only → executed is INVALID', () => {
    expect(isValidTransition('recommended_only', 'executed')).toBe(false);
  });

  it('approved → rejected is INVALID (already approved)', () => {
    expect(isValidTransition('approved', 'rejected')).toBe(false);
  });

  it('superseded → anything is INVALID (terminal state)', () => {
    expect(isValidTransition('superseded', 'under_review')).toBe(false);
    expect(isValidTransition('superseded', 'approved')).toBe(false);
    expect(isValidTransition('superseded', 'executed')).toBe(false);
  });

  it('executed → approved is INVALID (cannot un-execute)', () => {
    expect(isValidTransition('executed', 'approved')).toBe(false);
  });

  it('unknown state → anything is INVALID', () => {
    expect(isValidTransition('nonexistent', 'approved')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Lifecycle State Machine Completeness
// ═══════════════════════════════════════════════════════════════════════

describe('Governed Decision Lifecycle — State Machine Completeness', () => {
  const ALL_STATES: GovernedLifecycleState[] = [
    'recommended_only', 'under_review', 'approved', 'rejected',
    'executed', 'deferred', 'escalated', 'superseded',
  ];

  it('every state except superseded has at least one valid transition', () => {
    for (const state of ALL_STATES) {
      if (state === 'superseded') continue; // terminal
      const hasTransition = ALL_STATES.some(target => isValidTransition(state, target));
      expect(hasTransition).toBe(true);
    }
  });

  it('superseded is a terminal state with zero valid transitions', () => {
    for (const target of ALL_STATES) {
      expect(isValidTransition('superseded', target)).toBe(false);
    }
  });

  it('every non-terminal state can be superseded', () => {
    for (const state of ALL_STATES) {
      if (state === 'superseded') continue;
      expect(isValidTransition(state, 'superseded')).toBe(true);
    }
  });

  it('approved is reachable from recommended_only via under_review', () => {
    expect(isValidTransition('recommended_only', 'under_review')).toBe(true);
    expect(isValidTransition('under_review', 'approved')).toBe(true);
  });

  it('executed is reachable only through approved', () => {
    expect(isValidTransition('approved', 'executed')).toBe(true);
    // Cannot execute directly from other states
    expect(isValidTransition('recommended_only', 'executed')).toBe(false);
    expect(isValidTransition('under_review', 'executed')).toBe(false);
    expect(isValidTransition('rejected', 'executed')).toBe(false);
    expect(isValidTransition('deferred', 'executed')).toBe(false);
  });
});
