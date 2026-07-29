/**
 * Unit tests for the PURE surface of the subscription service (Report-OS,
 * Step 6). Only `nextRunFor` is exercised here — the DB-backed functions need a
 * live connection and are covered by typecheck, not by this suite.
 *
 * The `../../../db` module opens a pool at import time, so it is mocked: this
 * lets us import the service to assert its export surface without touching a
 * database.
 */

import { describe, expect, it, vi } from 'vitest';

// Stub the DB facade so importing the service does not open a real connection.
vi.mock('../../../db', () => ({ db: {} }));

import { nextRunFor } from '../subscription-service';
import * as subscriptionService from '../subscription-service';
import { computeNextRun } from '../cadence';
import type { ReportSchedule } from '../types';

describe('nextRunFor', () => {
  // Wednesday at 07:00 (dayOfWeek 3).
  const schedule: ReportSchedule = { cadence: 'weekly', dayOfWeek: 3, hour: 7 };

  it('delegates to computeNextRun for a weekly schedule', () => {
    // 2026-06-15 is a Monday.
    const now = new Date(Date.UTC(2026, 5, 15, 12, 0, 0));
    const next = nextRunFor({ schedule, lastRunAt: null }, now);
    expect(next.toISOString()).toBe(computeNextRun(schedule, now).toISOString());
    expect(next.toISOString()).toBe('2026-06-17T07:00:00.000Z');
  });

  it('returns a time strictly after `now` (anchored on now, not lastRunAt)', () => {
    const now = new Date(Date.UTC(2026, 5, 17, 8, 0, 0)); // Wed, after 07:00
    const lastRunAt = new Date(Date.UTC(2020, 0, 1, 0, 0, 0)); // distant past
    const next = nextRunFor({ schedule, lastRunAt }, now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    // Same weekday but time passed: rolls a full week from `now`.
    expect(next.toISOString()).toBe('2026-06-24T07:00:00.000Z');
  });
});

describe('subscription-service module exports', () => {
  it('exposes the expected function names', () => {
    for (const name of [
      'createSubscription',
      'listSubscriptions',
      'setEnabled',
      'markRun',
      'listDueSubscriptions',
      'nextRunFor',
    ]) {
      expect(typeof (subscriptionService as Record<string, unknown>)[name]).toBe(
        'function',
      );
    }
  });
});
