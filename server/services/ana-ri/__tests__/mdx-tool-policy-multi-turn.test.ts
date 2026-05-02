/**
 * Multi-turn confirmation tests for the AnA-MDX gate.
 *
 * Verifies the new behaviors layered onto requireGovernedToolGate:
 *   - First call without confirm stashes the proposed params and returns
 *     pendingActionToken in CONFIRMATION_REQUIRED.data.
 *   - Second call with confirm + reason but sparse params merges in the
 *     stashed params.
 *   - Successful gate clears the pending action.
 *   - Cross-thread / cross-tenant pendings don't leak.
 *   - reasonReferencedArtifact flag fires on artifact-citing reasons.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { requireGovernedToolGate } from '../mdx-tool-policy';
import {
  lookupPendingAction,
  _resetPendingActionStoreForTests,
} from '../mdx-pending-actions';

beforeEach(() => _resetPendingActionStoreForTests());

const baseCtx = (overrides: Record<string, unknown> = {}) => ({
  userId: 7,
  organizationId: 11,
  threadId: 't-abc',
  ...overrides,
});

describe('first-turn proposal', () => {
  it('stashes params and returns pendingActionToken when confirm missing', () => {
    const ctx = baseCtx() as any;
    const params: Record<string, unknown> = {
      programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      qSubType: 'presub',
      title: 'Predicate strategy',
    };
    const r = requireGovernedToolGate('q_sub.create', ctx, params);
    expect(r.ok).toBe(false);
    expect(r.result.error).toBe('CONFIRMATION_REQUIRED');
    expect((r.result.data as any).pendingActionToken).toMatch(/^pa-/);

    const stashed = lookupPendingAction({ organizationId: 11, threadId: 't-abc' });
    expect(stashed).not.toBeNull();
    expect(stashed!.action).toBe('q_sub.create');
    expect(stashed!.params.title).toBe('Predicate strategy');
  });

  it('does not stash when ctx has no threadId', () => {
    const ctx: any = { userId: 7, organizationId: 11 }; // no threadId
    const r = requireGovernedToolGate('q_sub.create', ctx, { programId: 'p' });
    expect(r.ok).toBe(false);
    expect((r.result.data as any).pendingActionToken).toBeUndefined();
  });
});

describe('second-turn confirmation merge', () => {
  it('merges stashed params when caller supplies only confirm + reason', () => {
    // Turn 1: propose.
    const ctx = baseCtx() as any;
    requireGovernedToolGate('q_sub.create', ctx, {
      programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      qSubType: 'presub',
      title: 'Predicate strategy',
    });

    // Turn 2: confirm. Sparse params.
    const turn2: Record<string, unknown> = {
      confirm: 'yes',
      reason: 'amended SAP per FDA Pre-Sub Q251142 §11.4 outcome',
    };
    const r2 = requireGovernedToolGate('q_sub.create', ctx, turn2);
    expect(r2.ok).toBe(true);
    // Merged params now visible on the params object.
    expect(turn2.programId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
    expect(turn2.qSubType).toBe('presub');
    expect(turn2.title).toBe('Predicate strategy');
  });

  it('does NOT merge when the action name differs from the stashed one', () => {
    const ctx = baseCtx() as any;
    requireGovernedToolGate('q_sub.create', ctx, { programId: 'p-1', title: 't' });
    const turn2: Record<string, unknown> = {
      confirm: 'yes',
      reason: 'related to §6 update',
    };
    // Different action — gate ignores the q_sub.create stash.
    const r = requireGovernedToolGate('section.approve', ctx, turn2);
    // Confirm is present but section.approve has its own missing-params
    // problem; the gate passes the confirmation step (it just checks
    // confirm/reason length/quality), and the handler will catch the
    // missing sectionId. We only assert here that the merge did NOT
    // pollute the params with q_sub.create's title.
    expect(turn2.title).toBeUndefined();
    expect(turn2.programId).toBeUndefined();
    expect(r.ok).toBe(true);
  });

  it('clears the pending action on a successful gate', () => {
    const ctx = baseCtx() as any;
    requireGovernedToolGate('q_sub.create', ctx, { programId: 'p-1' });
    expect(lookupPendingAction({ organizationId: 11, threadId: 't-abc' })).not.toBeNull();
    requireGovernedToolGate('q_sub.create', ctx, {
      confirm: 'yes',
      reason: 'rolling in commitment cm-1142-3 per FDA Q251142 §11 update',
    });
    expect(lookupPendingAction({ organizationId: 11, threadId: 't-abc' })).toBeNull();
  });
});

describe('cross-tenant / cross-thread isolation', () => {
  it('does not merge a pending action from another thread', () => {
    const ctxA = baseCtx({ threadId: 't-A' }) as any;
    const ctxB = baseCtx({ threadId: 't-B' }) as any;
    requireGovernedToolGate('q_sub.create', ctxA, { programId: 'p-A', title: 'A' });
    const turn2: Record<string, unknown> = { confirm: 'yes', reason: 'see §3 IFU updates from Mar 14, 2025' };
    requireGovernedToolGate('q_sub.create', ctxB, turn2);
    expect(turn2.programId).toBeUndefined();
    expect(turn2.title).toBeUndefined();
  });

  it('does not merge across organizations', () => {
    const ctxOrgA = baseCtx({ organizationId: 11 }) as any;
    const ctxOrgB = baseCtx({ organizationId: 22 }) as any;
    requireGovernedToolGate('q_sub.create', ctxOrgA, { programId: 'p-A' });
    const turn2: Record<string, unknown> = { confirm: 'yes', reason: 'per Pre-Sub Q251142 §6.1' };
    requireGovernedToolGate('q_sub.create', ctxOrgB, turn2);
    expect(turn2.programId).toBeUndefined();
  });
});

describe('reasonReferencedArtifact soft signal', () => {
  it('flags reasons that cite a section number', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx() as any, {
      confirm: 'yes',
      reason: 'rolling in commitment for §6.1 update',
    });
    expect(r.reasonReferencedArtifact).toBe(true);
  });

  it('flags reasons that cite a Q-number', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx() as any, {
      confirm: 'yes',
      reason: 'per FDA response on Q251142 dated April 3',
    });
    expect(r.reasonReferencedArtifact).toBe(true);
  });

  it('flags reasons that cite a K-number', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx() as any, {
      confirm: 'yes',
      reason: 'predicate K212284 confirmed by FDA',
    });
    expect(r.reasonReferencedArtifact).toBe(true);
  });

  it('flags reasons that cite an ISO standard', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx() as any, {
      confirm: 'yes',
      reason: 'ISO 10993-18 extractables data attached',
    });
    expect(r.reasonReferencedArtifact).toBe(true);
  });

  it('flags reasons that cite an ISO date', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx() as any, {
      confirm: 'yes',
      reason: 'rolling in change made 2026-04-15 by RA',
    });
    expect(r.reasonReferencedArtifact).toBe(true);
  });

  it('does NOT flag a generic "user asked" reason', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx() as any, {
      confirm: 'yes',
      reason: 'because the user asked me to do this',
    });
    expect(r.ok).toBe(true);
    expect(r.reasonReferencedArtifact).toBe(false);
  });

  it('still passes the gate when artifact reference absent (soft signal only)', () => {
    const r = requireGovernedToolGate('q_sub.create', baseCtx() as any, {
      confirm: 'yes',
      reason: 'general housekeeping update',
    });
    expect(r.ok).toBe(true);
    expect(r.reasonReferencedArtifact).toBe(false);
  });
});
