/**
 * The ceiling on turns that go on after their page closed (AnA detach DT3
 * review, INF-40). A detached turn holds its request's pinned database
 * connection until it ends (db/requestDbLease.ts), for up to 40 minutes, and
 * the production pool is 40 connections: nothing bounded how many a task, or
 * one organisation, could leave running. Past the ceiling a closing page's
 * turn does not detach; it stops, as before DT3, and Continue picks it up.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_DETACHED_PER_ORGANISATION,
  MAX_DETACHED_PER_PROCESS,
  _resetDetachSlotsForTest,
  claimDetachSlot,
  detachedCount,
} from '../detach-slots.js';

afterEach(() => _resetDetachSlotsForTest());

describe('detach slots', () => {
  it('sized well under the pool, and an organisation never takes them all', () => {
    expect(MAX_DETACHED_PER_PROCESS).toBeLessThanOrEqual(20);
    expect(MAX_DETACHED_PER_ORGANISATION).toBeLessThan(MAX_DETACHED_PER_PROCESS);
  });

  it('one organisation is refused at its ceiling; another still detaches', () => {
    const held = Array.from({ length: MAX_DETACHED_PER_ORGANISATION }, () => claimDetachSlot(1));
    expect(held.every(Boolean)).toBe(true);
    expect(claimDetachSlot(1)).toBeNull();
    expect(claimDetachSlot(2)).not.toBeNull();
  });

  it('the process is refused at its ceiling, whichever organisation asks', () => {
    for (let org = 1; detachedCount() < MAX_DETACHED_PER_PROCESS; org++) {
      while (detachedCount() < MAX_DETACHED_PER_PROCESS && claimDetachSlot(org)) {
        if (detachedCount() % MAX_DETACHED_PER_ORGANISATION === 0) break;
      }
    }
    expect(claimDetachSlot(999)).toBeNull();
  });

  it('a released slot is free again, once', () => {
    const slots = Array.from({ length: MAX_DETACHED_PER_ORGANISATION }, () => claimDetachSlot(1)!);
    expect(claimDetachSlot(1)).toBeNull();
    slots[0]();
    slots[0]();
    expect(claimDetachSlot(1)).not.toBeNull();
    expect(claimDetachSlot(1)).toBeNull();
  });
});
