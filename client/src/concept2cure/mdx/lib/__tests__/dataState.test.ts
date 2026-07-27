/**
 * dataState — the truth primitive's contract.
 *
 * These tests encode the property the whole P0 fix rests on: a surface
 * can never be in a state where "error", "empty" and "real data" are
 * indistinguishable. If any of these fail, silent fixtures are reachable
 * again.
 */

import { describe, it, expect } from 'vitest';
import {
  toDataState,
  combineDataStates,
  readyData,
  readyRows,
  type DataState,
} from '../dataState';

describe('toDataState', () => {
  it('reports error even when stale data is still present', () => {
    /* The regression this prevents: an error masked by a previous
       success, leaving the user reading data that no longer reflects
       the server. */
    const s = toDataState([{ id: 1 }], false, 'HTTP 500');
    expect(s.status).toBe('error');
    if (s.status === 'error') expect(s.message).toBe('HTTP 500');
  });

  it('reports loading ahead of a previous result', () => {
    expect(toDataState([{ id: 1 }], true, null).status).toBe('loading');
  });

  it('distinguishes idle (never asked) from empty (asked, no rows)', () => {
    expect(toDataState(null, false, null).status).toBe('idle');
    expect(toDataState([], false, null).status).toBe('empty');
  });

  it('carries an idle reason so the user knows what to do', () => {
    const s = toDataState(null, false, null, { idleReason: 'Select a program.' });
    expect(s.status).toBe('idle');
    if (s.status === 'idle') expect(s.reason).toBe('Select a program.');
  });

  it('treats an all-zero summary object as real data, not empty', () => {
    /* A device program with zero open ECRs is a meaningful, correct
       answer — it must not render as "no data yet". */
    const s = toDataState({ openEcrs: 0, dhfCompletion: 0 }, false, null);
    expect(s.status).toBe('ready');
  });

  it('treats empty Map and Set as empty', () => {
    expect(toDataState(new Map(), false, null).status).toBe('empty');
    expect(toDataState(new Set(), false, null).status).toBe('empty');
    expect(toDataState(new Set([1]), false, null).status).toBe('ready');
  });

  it('reports ready for a populated collection', () => {
    const s = toDataState([{ id: 1 }], false, null);
    expect(s.status).toBe('ready');
    if (s.status === 'ready') expect(s.data).toHaveLength(1);
  });

  it('treats undefined the same as null (idle, never "empty")', () => {
    expect(toDataState(undefined, false, null).status).toBe('idle');
  });
});

describe('combineDataStates', () => {
  const ready: DataState<number[]> = { status: 'ready', data: [1] };
  const empty: DataState<number[]> = { status: 'empty' };
  const err: DataState<number[]> = { status: 'error', message: 'boom' };

  it('surfaces an error rather than rendering a partly-complete panel', () => {
    expect(combineDataStates(ready, ready, err).status).toBe('error');
  });

  it('prefers error over loading', () => {
    expect(combineDataStates({ status: 'loading' }, err).status).toBe('error');
  });

  it('reports empty only when every source is empty', () => {
    expect(combineDataStates(empty, empty).status).toBe('empty');
    expect(combineDataStates(empty, ready).status).toBe('ready');
  });

  it('reports ready with no inputs (nothing to block on)', () => {
    expect(combineDataStates().status).toBe('ready');
  });
});

describe('readyData / readyRows', () => {
  it('readyData returns null for every non-ready state', () => {
    expect(readyData({ status: 'error', message: 'x' })).toBeNull();
    expect(readyData({ status: 'empty' })).toBeNull();
    expect(readyData({ status: 'loading' })).toBeNull();
    expect(readyData({ status: 'idle' })).toBeNull();
    expect(readyData({ status: 'ready', data: 7 })).toBe(7);
  });

  it('readyRows returns [] for every non-ready state', () => {
    expect(readyRows({ status: 'error', message: 'x' })).toEqual([]);
    expect(readyRows({ status: 'ready', data: [1, 2] })).toEqual([1, 2]);
  });
});
