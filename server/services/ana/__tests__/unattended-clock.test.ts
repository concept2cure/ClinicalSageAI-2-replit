/**
 * The owner's clock for a detached turn nobody watches (AnA detach DT3,
 * design §2.6, D-2; DT3 test 10), with fake timers and no database.
 *
 *   - unwatched for 15 minutes from the detach: the directive says
 *     unattended_limit (the next model call is the closing answer);
 *   - a hung round: after the 2-minute grace the clock stops the turn itself;
 *   - a watch at 10 minutes moves the deadline to 25;
 *   - 40 minutes from the start: budget_exhausted, whatever the watching;
 *   - a row read that fails never resets the clock;
 *   - a turn that ends first stops every timer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DETACHED_CLOSE_GRACE_MS, DETACHED_WALL_MS, UNATTENDED_MS, detachWarning, isWatchedNow, unattendedDeadline } from '@shared/ana/run-detach';
import { UnattendedClock } from '../unattended-clock.js';

const MIN = 60_000;

function clock(read: () => Promise<number | null> = async () => null) {
  const hardStop = vi.fn();
  const c = new UnattendedClock({ startedAt: Date.now(), readLastWatched: read, hardStop });
  return { c, hardStop };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-08T14:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('unattendedDeadline (the one answer, shared with the run read)', () => {
  const start = Date.parse('2026-10-08T14:00:00Z');
  it('null until the page closed', () => {
    expect(unattendedDeadline({ startedAtMs: start, detachedAtMs: null, lastWatchedAtMs: null })).toBeNull();
  });
  it('15 minutes after watching stopped: the later of the detach and the last stamp', () => {
    expect(unattendedDeadline({ startedAtMs: start, detachedAtMs: start + 2 * MIN, lastWatchedAtMs: null }))
      .toEqual({ at: start + 17 * MIN, reason: 'unattended_limit' });
    expect(unattendedDeadline({ startedAtMs: start, detachedAtMs: start + 2 * MIN, lastWatchedAtMs: start + 10 * MIN }))
      .toEqual({ at: start + 25 * MIN, reason: 'unattended_limit' });
  });
  it('never later than 40 minutes from the start', () => {
    expect(unattendedDeadline({ startedAtMs: start, detachedAtMs: start + 2 * MIN, lastWatchedAtMs: start + 30 * MIN }))
      .toEqual({ at: start + DETACHED_WALL_MS, reason: 'budget_exhausted' });
  });
  it('watched means stamped within 15 seconds', () => {
    expect(isWatchedNow(start, start + 15_000)).toBe(true);
    expect(isWatchedNow(start, start + 15_001)).toBe(false);
    expect(isWatchedNow(null, start)).toBe(false);
  });
});

describe('UnattendedClock', () => {
  it('unwatched for 15 minutes: the directive says unattended_limit, and not a moment before', async () => {
    const { c, hardStop } = clock();
    c.detach(Date.now());
    await vi.advanceTimersByTimeAsync(UNATTENDED_MS - 1_000);
    expect(c.directive()).toBeNull();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(c.directive()).toBe('unattended_limit');
    expect(hardStop).not.toHaveBeenCalled();
  });

  it('a hung round: the closing answer gets the 2-minute grace, then the clock stops the turn', async () => {
    const { c, hardStop } = clock();
    c.detach(Date.now());
    await vi.advanceTimersByTimeAsync(UNATTENDED_MS + 1_000);
    await vi.advanceTimersByTimeAsync(DETACHED_CLOSE_GRACE_MS - 2_000);
    expect(hardStop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(hardStop).toHaveBeenCalledTimes(1);
    expect(hardStop).toHaveBeenCalledWith('unattended_limit');
  });

  it('a watch at 10 minutes resets the clock: still going at 16, due at 25', async () => {
    let watched: number | null = null;
    const { c } = clock(async () => watched);
    const detached = Date.now();
    c.detach(detached);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    watched = Date.now();
    await vi.advanceTimersByTimeAsync(6 * MIN);
    expect(c.directive()).toBeNull();
    await vi.advanceTimersByTimeAsync(9 * MIN + 1_000);
    expect(c.directive()).toBe('unattended_limit');
  });

  it('40 minutes from the start ends it as budget_exhausted, whatever the watching', async () => {
    const { c, hardStop } = clock(async () => Date.now());
    c.detach(Date.now());
    await vi.advanceTimersByTimeAsync(DETACHED_WALL_MS - 1_000);
    expect(c.directive()).toBeNull();
    await vi.advanceTimersByTimeAsync(16_000);
    expect(c.directive()).toBe('budget_exhausted');
    await vi.advanceTimersByTimeAsync(DETACHED_CLOSE_GRACE_MS);
    expect(hardStop).toHaveBeenCalledWith('budget_exhausted');
  });

  it('a read that fails keeps the last reading: it never resets the clock', async () => {
    let fail = false;
    let watched: number | null = Date.now();
    const { c } = clock(async () => {
      if (fail) throw new Error('database unreachable');
      return watched;
    });
    c.detach(Date.now());
    await vi.advanceTimersByTimeAsync(1_000);
    fail = true;
    watched = Date.now() + 60 * MIN; // what a lying read would have said
    await vi.advanceTimersByTimeAsync(UNATTENDED_MS + 1_000);
    expect(c.directive()).toBe('unattended_limit');
  });

  it('a turn that ends first stops every timer: no hard stop after it', async () => {
    const { c, hardStop } = clock();
    c.detach(Date.now());
    await vi.advanceTimersByTimeAsync(UNATTENDED_MS + 1_000);
    c.stop();
    await vi.advanceTimersByTimeAsync(DETACHED_CLOSE_GRACE_MS * 2);
    expect(hardStop).not.toHaveBeenCalled();
  });

  it('a page that never closed arms nothing', async () => {
    const { c, hardStop } = clock();
    await vi.advanceTimersByTimeAsync(DETACHED_WALL_MS * 2);
    expect(c.directive()).toBeNull();
    expect(c.deadline()).toBeNull();
    expect(hardStop).not.toHaveBeenCalled();
  });
});

describe("the record's warning names the armed limits", () => {
  it('the page closed at, and no later than start + 40 minutes, in UTC', () => {
    const start = Date.parse('2026-10-08T14:00:00Z');
    expect(detachWarning('2026-10-08T14:02:11.123Z', start)).toBe(
      'The page closed at 2026-10-08T14:02:11Z; the turn continued. Unattended limit: stops after 15 minutes ' +
        'with nobody watching, and no later than 2026-10-08T14:40:00Z.',
    );
  });
});
