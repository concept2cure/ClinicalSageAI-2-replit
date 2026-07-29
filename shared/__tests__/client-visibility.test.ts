/**
 * Unit tests for shared/client-visibility.ts — the app-enforced domain for
 * unified_tasks.client_visibility and the pure grouper behind the Client
 * Review Room (MDX-CLIENT-01).
 *
 * The load-bearing invariant: `internal` (and NULL / unknown) work can
 * never come out of the grouper or the whitelist. The endpoint enforces
 * this in SQL; these tests pin the shared domain and the pure backstop.
 */

import { describe, it, expect } from 'vitest';
import {
  CLIENT_VISIBILITY,
  CLIENT_REVIEW_STATES,
  isClientReviewState,
  emptyClientReviewGroups,
  groupByClientReviewState,
  countClientReviewGroups,
} from '../client-visibility';

interface Row {
  taskId: string;
  clientVisibility: string | null;
}

const row = (taskId: string, clientVisibility: string | null): Row => ({
  taskId,
  clientVisibility,
});

describe('CLIENT_VISIBILITY domain', () => {
  it('models the four-state domain', () => {
    expect(CLIENT_VISIBILITY).toEqual([
      'internal',
      'client_visible',
      'client_action_required',
      'authority_ready',
    ]);
  });

  it('CLIENT_REVIEW_STATES excludes internal but covers every other state', () => {
    expect(CLIENT_REVIEW_STATES).not.toContain('internal');
    const nonInternal = CLIENT_VISIBILITY.filter((s) => s !== 'internal');
    expect([...CLIENT_REVIEW_STATES].sort()).toEqual([...nonInternal].sort());
  });
});

describe('isClientReviewState', () => {
  it('accepts exactly the three client-visible states', () => {
    expect(isClientReviewState('client_visible')).toBe(true);
    expect(isClientReviewState('client_action_required')).toBe(true);
    expect(isClientReviewState('authority_ready')).toBe(true);
  });

  it('rejects internal, null, undefined, and unknown values', () => {
    expect(isClientReviewState('internal')).toBe(false);
    expect(isClientReviewState(null)).toBe(false);
    expect(isClientReviewState(undefined)).toBe(false);
    expect(isClientReviewState('')).toBe(false);
    expect(isClientReviewState('CLIENT_VISIBLE')).toBe(false);
    expect(isClientReviewState('public')).toBe(false);
    expect(isClientReviewState(42)).toBe(false);
  });
});

describe('groupByClientReviewState', () => {
  it('buckets rows by state, preserving input order within each bucket', () => {
    const rows = [
      row('t1', 'client_visible'),
      row('t2', 'client_action_required'),
      row('t3', 'client_visible'),
      row('t4', 'authority_ready'),
      row('t5', 'client_action_required'),
    ];
    const groups = groupByClientReviewState(rows, (r) => r.clientVisibility);
    expect(groups.client_visible.map((r) => r.taskId)).toEqual(['t1', 't3']);
    expect(groups.client_action_required.map((r) => r.taskId)).toEqual(['t2', 't5']);
    expect(groups.authority_ready.map((r) => r.taskId)).toEqual(['t4']);
  });

  it('NEVER buckets internal rows — they are dropped, not misfiled', () => {
    const rows = [
      row('secret-1', 'internal'),
      row('t1', 'client_visible'),
      row('secret-2', 'internal'),
    ];
    const groups = groupByClientReviewState(rows, (r) => r.clientVisibility);
    const allBucketed = [
      ...groups.client_action_required,
      ...groups.client_visible,
      ...groups.authority_ready,
    ].map((r) => r.taskId);
    expect(allBucketed).toEqual(['t1']);
    expect(allBucketed).not.toContain('secret-1');
    expect(allBucketed).not.toContain('secret-2');
  });

  it('drops unclassified (null) and out-of-domain values', () => {
    const rows = [
      row('t1', null),
      row('t2', 'shared'),
      row('t3', 'authority_ready'),
    ];
    const groups = groupByClientReviewState(rows, (r) => r.clientVisibility);
    const { total } = countClientReviewGroups(groups);
    expect(total).toBe(1);
    expect(groups.authority_ready.map((r) => r.taskId)).toEqual(['t3']);
  });

  it('returns all-empty buckets for an empty input', () => {
    const groups = groupByClientReviewState<Row>([], (r) => r.clientVisibility);
    expect(groups).toEqual(emptyClientReviewGroups());
  });
});

describe('countClientReviewGroups', () => {
  it('counts per state and totals across visible states only', () => {
    const rows = [
      row('t1', 'client_visible'),
      row('t2', 'client_action_required'),
      row('t3', 'internal'),
      row('t4', 'authority_ready'),
      row('t5', 'authority_ready'),
    ];
    const { counts, total } = countClientReviewGroups(
      groupByClientReviewState(rows, (r) => r.clientVisibility),
    );
    expect(counts).toEqual({
      client_action_required: 1,
      client_visible: 1,
      authority_ready: 2,
    });
    expect(total).toBe(4); // the internal row is not counted anywhere
  });

  it('reports zeros for empty groups', () => {
    const { counts, total } = countClientReviewGroups(emptyClientReviewGroups());
    expect(total).toBe(0);
    expect(counts).toEqual({
      client_action_required: 0,
      client_visible: 0,
      authority_ready: 0,
    });
  });
});
