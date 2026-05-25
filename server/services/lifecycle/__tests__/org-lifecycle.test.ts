/**
 * Pure-data tests over the org lifecycle state machine. No DB, no mocks —
 * exercises only the legal-transition map and the predicate functions.
 * DB-coupled paths (transition, ensureInitialState) are covered by the
 * integration test suite once a test DB harness is wired (Track F).
 */
import { describe, expect, test } from 'vitest';
import {
  ORG_LIFECYCLE_STATES,
  ORG_LIFECYCLE_TRANSITIONS,
  ORG_LIFECYCLE_PRODUCTIVE_STATES,
  ORG_LIFECYCLE_TRIGGERS,
  canTransition,
  type OrgLifecycleState,
} from '../../../../shared/schema/org-lifecycle';

describe('org-lifecycle closed-enum schema', () => {
  test('every state in the transition map is in the canonical set', () => {
    const states = new Set<string>(ORG_LIFECYCLE_STATES);
    for (const [from, tos] of Object.entries(ORG_LIFECYCLE_TRANSITIONS)) {
      expect(states.has(from)).toBe(true);
      for (const to of tos) {
        expect(states.has(to)).toBe(true);
      }
    }
  });

  test('productive states are a subset of canonical states', () => {
    for (const s of ORG_LIFECYCLE_PRODUCTIVE_STATES) {
      expect(ORG_LIFECYCLE_STATES).toContain(s);
    }
  });

  test('every canonical state appears as either a source or a target', () => {
    const reachable = new Set<string>();
    for (const [from, tos] of Object.entries(ORG_LIFECYCLE_TRANSITIONS)) {
      reachable.add(from);
      for (const to of tos) reachable.add(to);
    }
    // `account_created` is a first-row-only state — it appears as `from`,
    // even if no transition lands ON it. Same for the productive states.
    for (const s of ORG_LIFECYCLE_STATES) {
      expect(reachable.has(s)).toBe(true);
    }
  });

  test('no self-loops in the transition map', () => {
    for (const [from, tos] of Object.entries(ORG_LIFECYCLE_TRANSITIONS)) {
      expect(tos).not.toContain(from);
    }
  });

  test('triggers list is non-empty and unique', () => {
    expect(ORG_LIFECYCLE_TRIGGERS.length).toBeGreaterThan(0);
    expect(new Set(ORG_LIFECYCLE_TRIGGERS).size).toBe(ORG_LIFECYCLE_TRIGGERS.length);
  });
});

describe('canTransition()', () => {
  test('first transition (null → x) accepts only account_created or trial_active', () => {
    expect(canTransition(null, 'account_created')).toBe(true);
    expect(canTransition(null, 'trial_active')).toBe(true);
    expect(canTransition(null, 'billing_active')).toBe(false);
    expect(canTransition(null, 'billing_pending')).toBe(false);
    expect(canTransition(null, 'trial_expired')).toBe(false);
    expect(canTransition(null, 'suspended')).toBe(false);
  });

  test('rejects self-transitions', () => {
    for (const s of ORG_LIFECYCLE_STATES) {
      expect(canTransition(s, s)).toBe(false);
    }
  });

  test('trial_active → trial_expired is legal (the trial-expiry job path)', () => {
    expect(canTransition('trial_active', 'trial_expired')).toBe(true);
  });

  test('trial_active → billing_active is legal (early upgrade)', () => {
    expect(canTransition('trial_active', 'billing_active')).toBe(true);
  });

  test('trial_expired → billing_pending is legal (checkout starts)', () => {
    expect(canTransition('trial_expired', 'billing_pending')).toBe(true);
  });

  test('trial_expired → billing_active is NOT legal (must go through billing_pending)', () => {
    // Forces the Stripe webhook path to go through billing_pending first.
    // The webhook handler is responsible for both transitions in sequence.
    expect(canTransition('trial_expired', 'billing_active')).toBe(false);
  });

  test('billing_pending → billing_active is legal (Stripe webhook success)', () => {
    expect(canTransition('billing_pending', 'billing_active')).toBe(true);
  });

  test('billing_pending → trial_expired is legal (checkout abandoned/failed)', () => {
    expect(canTransition('billing_pending', 'trial_expired')).toBe(true);
  });

  test('any productive state can transition to suspended', () => {
    expect(canTransition('trial_active', 'suspended')).toBe(true);
    expect(canTransition('billing_active', 'suspended')).toBe(true);
    expect(canTransition('billing_pending', 'suspended')).toBe(true);
    expect(canTransition('trial_expired', 'suspended')).toBe(true);
  });

  test('suspended can return to billing_active or trial_active', () => {
    expect(canTransition('suspended', 'billing_active')).toBe(true);
    expect(canTransition('suspended', 'trial_active')).toBe(true);
  });

  test('suspended → billing_pending is NOT legal (must go through trial_active or billing_active)', () => {
    expect(canTransition('suspended', 'billing_pending')).toBe(false);
  });

  test('every reachable state is reachable from account_created (signup → ... )', () => {
    const visited = new Set<OrgLifecycleState>(['account_created']);
    const stack: OrgLifecycleState[] = ['account_created'];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const next of ORG_LIFECYCLE_TRANSITIONS[cur] ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    for (const s of ORG_LIFECYCLE_STATES) {
      expect(visited.has(s)).toBe(true);
    }
  });
});
