/**
 * Pending-action store tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  proposeAction,
  lookupPendingAction,
  clearPendingAction,
  _resetPendingActionStoreForTests,
} from '../mdx-pending-actions';

beforeEach(() => {
  _resetPendingActionStoreForTests();
});

describe('pending-action store', () => {
  it('round-trips a proposal', () => {
    const proposed = proposeAction({
      organizationId: 1,
      threadId: 't-1',
      action: 'q_sub.create',
      params: { programId: 'p-1', title: 'x' },
    });
    expect(proposed.token).toMatch(/^pa-/);
    expect(proposed.action).toBe('q_sub.create');
    expect(proposed.params).toEqual({ programId: 'p-1', title: 'x' });

    const looked = lookupPendingAction({ organizationId: 1, threadId: 't-1' });
    expect(looked).not.toBeNull();
    expect(looked!.token).toBe(proposed.token);
    expect(looked!.params.title).toBe('x');
  });

  it('strips confirm + reason from the stash', () => {
    proposeAction({
      organizationId: 1,
      threadId: 't-1',
      action: 'q_sub.create',
      params: { programId: 'p-1', title: 'x', confirm: 'yes', reason: 'orig' },
    });
    const looked = lookupPendingAction({ organizationId: 1, threadId: 't-1' });
    expect(looked!.params.confirm).toBeUndefined();
    expect(looked!.params.reason).toBeUndefined();
    expect(looked!.params.programId).toBe('p-1');
  });

  it('refuses cross-tenant lookup even on the same thread id', () => {
    proposeAction({
      organizationId: 1,
      threadId: 't-1',
      action: 'q_sub.create',
      params: { programId: 'p-1' },
    });
    const otherTenant = lookupPendingAction({ organizationId: 999, threadId: 't-1' });
    expect(otherTenant).toBeNull();
  });

  it('overwrites a prior proposal on the same (org, thread)', () => {
    const first = proposeAction({
      organizationId: 1, threadId: 't-1', action: 'q_sub.create',
      params: { programId: 'p-A' },
    });
    const second = proposeAction({
      organizationId: 1, threadId: 't-1', action: 'section.approve',
      params: { sectionId: 42 },
    });
    expect(second.token).not.toBe(first.token);
    const looked = lookupPendingAction({ organizationId: 1, threadId: 't-1' });
    expect(looked!.action).toBe('section.approve');
    expect(looked!.params.sectionId).toBe(42);
  });

  it('returns null when token is supplied but does not match', () => {
    proposeAction({
      organizationId: 1, threadId: 't-1', action: 'q_sub.create',
      params: { programId: 'p-1' },
    });
    const looked = lookupPendingAction({
      organizationId: 1, threadId: 't-1', token: 'pa-deadbeef',
    });
    expect(looked).toBeNull();
  });

  it('clearPendingAction removes the entry', () => {
    proposeAction({
      organizationId: 1, threadId: 't-1', action: 'q_sub.create',
      params: { programId: 'p-1' },
    });
    clearPendingAction({ organizationId: 1, threadId: 't-1' });
    expect(lookupPendingAction({ organizationId: 1, threadId: 't-1' })).toBeNull();
  });

  it('lookup returns null for unknown thread', () => {
    expect(lookupPendingAction({ organizationId: 1, threadId: 'unknown' })).toBeNull();
  });
});
