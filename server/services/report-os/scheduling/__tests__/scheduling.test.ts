import { describe, expect, it } from 'vitest';
import { computeNextRun, isDue } from '../cadence';
import { decideDelivery, describeDeliveryAudit } from '../delivery';
import {
  DEFAULT_WEEKLY_SCHEDULE,
  type ReportSchedule,
} from '../types';

describe('computeNextRun', () => {
  describe('daily', () => {
    const schedule: ReportSchedule = { cadence: 'daily', hour: 9, minute: 30 };

    it('returns today at the scheduled time when still ahead', () => {
      const from = new Date(Date.UTC(2026, 5, 15, 8, 0, 0));
      const next = computeNextRun(schedule, from);
      expect(next.toISOString()).toBe('2026-06-15T09:30:00.000Z');
      expect(next.getTime()).toBeGreaterThan(from.getTime());
    });

    it('rolls to tomorrow when the time has already passed', () => {
      const from = new Date(Date.UTC(2026, 5, 15, 10, 0, 0));
      const next = computeNextRun(schedule, from);
      expect(next.toISOString()).toBe('2026-06-16T09:30:00.000Z');
      expect(next.getTime()).toBeGreaterThan(from.getTime());
    });

    it('rolls forward when exactly at the scheduled time (strictly after)', () => {
      const from = new Date(Date.UTC(2026, 5, 15, 9, 30, 0));
      const next = computeNextRun(schedule, from);
      expect(next.toISOString()).toBe('2026-06-16T09:30:00.000Z');
      expect(next.getTime()).toBeGreaterThan(from.getTime());
    });
  });

  describe('weekly', () => {
    // Wednesday at 07:00 (dayOfWeek 3).
    const schedule: ReportSchedule = { cadence: 'weekly', dayOfWeek: 3, hour: 7 };

    it('lands on the correct dayOfWeek at the correct hour', () => {
      // 2026-06-15 is a Monday.
      const from = new Date(Date.UTC(2026, 5, 15, 12, 0, 0));
      const next = computeNextRun(schedule, from);
      expect(next.getUTCDay()).toBe(3); // Wednesday
      expect(next.getUTCHours()).toBe(7);
      expect(next.toISOString()).toBe('2026-06-17T07:00:00.000Z');
      expect(next.getTime()).toBeGreaterThan(from.getTime());
    });

    it('can land today when the scheduled time is still ahead', () => {
      // 2026-06-17 is a Wednesday; before 07:00.
      const from = new Date(Date.UTC(2026, 5, 17, 6, 0, 0));
      const next = computeNextRun(schedule, from);
      expect(next.toISOString()).toBe('2026-06-17T07:00:00.000Z');
    });

    it('rolls a full week when same weekday but time has passed', () => {
      // 2026-06-17 is a Wednesday; after 07:00.
      const from = new Date(Date.UTC(2026, 5, 17, 8, 0, 0));
      const next = computeNextRun(schedule, from);
      expect(next.getUTCDay()).toBe(3);
      expect(next.toISOString()).toBe('2026-06-24T07:00:00.000Z');
      expect(next.getTime()).toBeGreaterThan(from.getTime());
    });
  });

  describe('monthly', () => {
    it('uses this month when the day is still ahead', () => {
      const schedule: ReportSchedule = { cadence: 'monthly', dayOfMonth: 20, hour: 6 };
      const from = new Date(Date.UTC(2026, 5, 15, 0, 0, 0));
      const next = computeNextRun(schedule, from);
      expect(next.toISOString()).toBe('2026-06-20T06:00:00.000Z');
      expect(next.getTime()).toBeGreaterThan(from.getTime());
    });

    it('rolls to next month when the day has passed', () => {
      const schedule: ReportSchedule = { cadence: 'monthly', dayOfMonth: 10, hour: 6 };
      const from = new Date(Date.UTC(2026, 5, 15, 0, 0, 0));
      const next = computeNextRun(schedule, from);
      expect(next.toISOString()).toBe('2026-07-10T06:00:00.000Z');
      expect(next.getTime()).toBeGreaterThan(from.getTime());
    });

    it('clamps dayOfMonth 31 to 28', () => {
      const schedule: ReportSchedule = { cadence: 'monthly', dayOfMonth: 31, hour: 6 };
      const from = new Date(Date.UTC(2026, 5, 1, 0, 0, 0));
      const next = computeNextRun(schedule, from);
      expect(next.getUTCDate()).toBe(28);
      expect(next.toISOString()).toBe('2026-06-28T06:00:00.000Z');
    });
  });

  it('DEFAULT_WEEKLY_SCHEDULE yields a Monday 07:00 UTC', () => {
    const from = new Date(Date.UTC(2026, 5, 16, 0, 0, 0)); // Tuesday
    const next = computeNextRun(DEFAULT_WEEKLY_SCHEDULE, from);
    expect(next.getUTCDay()).toBe(1); // Monday
    expect(next.getUTCHours()).toBe(7);
    expect(next.getUTCMinutes()).toBe(0);
    expect(next.toISOString()).toBe('2026-06-22T07:00:00.000Z');
  });
});

describe('isDue', () => {
  const schedule: ReportSchedule = { cadence: 'daily', hour: 9, minute: 0 };

  it('is true when now is at or past the next run after lastRunAt', () => {
    const lastRun = new Date(Date.UTC(2026, 5, 15, 9, 0, 0));
    // next run after lastRun is 2026-06-16T09:00.
    const now = new Date(Date.UTC(2026, 5, 16, 9, 0, 0));
    expect(isDue(schedule, lastRun, now)).toBe(true);
  });

  it('is false just before the next run', () => {
    const lastRun = new Date(Date.UTC(2026, 5, 15, 9, 0, 0));
    const now = new Date(Date.UTC(2026, 5, 16, 8, 59, 0));
    expect(isDue(schedule, lastRun, now)).toBe(false);
  });

  it('is due when there has been no prior run', () => {
    const now = new Date(Date.UTC(2026, 5, 16, 9, 0, 0));
    expect(isDue(schedule, null, now)).toBe(true);
  });
});

describe('decideDelivery', () => {
  /* P1-44b (2026-10-01): finalizing a run is its signature, so the gate now
     knows whether the report carries one. Before, it could only say that one
     was required, and the route refused every external send of a final report. */
  it('external + final with the signature it was finalized under is allowed, not watermarked, and names that signature', () => {
    const decision = decideDelivery({ status: 'final', signatureId: 900 }, 'external');
    expect(decision.allowed).toBe(true);
    expect(decision.requiresESignature).toBe(true);
    expect(decision.signatureId).toBe(900);
    expect(decision.watermark).toBe(false);
  });

  it('external + final without a signature is refused: the e-signature rule is the gate, not advice to the caller', () => {
    const decision = decideDelivery({ status: 'final' }, 'external');
    expect(decision.allowed).toBe(false);
    expect(decision.requiresESignature).toBe(true);
    expect(decision.signatureId).toBeUndefined();
    expect(decision.reason).toMatch(/carries none/);
  });

  it('a null signature is no signature', () => {
    expect(decideDelivery({ status: 'final', signatureId: null }, 'external').allowed).toBe(false);
  });

  it('external + partial is watermarked and does not require e-signature', () => {
    const decision = decideDelivery({ status: 'partial' }, 'external');
    expect(decision.allowed).toBe(true);
    expect(decision.requiresESignature).toBe(false);
    expect(decision.watermark).toBe(true);
    expect(decision.reason).toBeDefined();
  });

  it('external + draft is watermarked and does not require e-signature', () => {
    const decision = decideDelivery({ status: 'draft' }, 'external');
    expect(decision.watermark).toBe(true);
    expect(decision.requiresESignature).toBe(false);
  });

  it('sealed flag forces e-signature on external even when not final', () => {
    const decision = decideDelivery({ status: 'draft', sealed: true }, 'external');
    expect(decision.requiresESignature).toBe(true);
    expect(decision.allowed).toBe(false);
    expect(decision.watermark).toBe(false);
  });

  it('platform + final has no watermark and no e-signature', () => {
    const decision = decideDelivery({ status: 'final' }, 'platform');
    expect(decision.allowed).toBe(true);
    expect(decision.requiresESignature).toBe(false);
    expect(decision.watermark).toBe(false);
  });

  it('platform + non-final is watermarked but needs no e-signature', () => {
    const decision = decideDelivery({ status: 'partial' }, 'platform');
    expect(decision.requiresESignature).toBe(false);
    expect(decision.watermark).toBe(true);
  });
});

describe('describeDeliveryAudit', () => {
  it('returns the expected normalized keys', () => {
    const decision = decideDelivery({ status: 'final', signatureId: 900 }, 'external');
    const audit = describeDeliveryAudit({
      subscriptionId: 42,
      reportTypeId: 'readiness_summary',
      channel: 'external',
      recipients: ['a@example.com', 'b@example.com'],
      decision,
      at: '2026-06-15T00:00:00.000Z',
    });
    expect(audit).toEqual({
      subscriptionId: 42,
      reportTypeId: 'readiness_summary',
      channel: 'external',
      recipientCount: 2,
      recipients: ['a@example.com', 'b@example.com'],
      allowed: true,
      requiresESignature: true,
      signatureId: 900,
      watermark: false,
      reason: decision.reason ?? null,
      at: '2026-06-15T00:00:00.000Z',
    });
  });

  it('defaults subscriptionId and reason to null when absent', () => {
    const audit = describeDeliveryAudit({
      reportTypeId: 'readiness_summary',
      channel: 'platform',
      recipients: [],
      decision: { allowed: true, requiresESignature: false, watermark: false },
      at: '2026-06-15T00:00:00.000Z',
    });
    expect(audit.subscriptionId).toBeNull();
    expect(audit.reason).toBeNull();
    expect(audit.signatureId).toBeNull();
    expect(audit.recipientCount).toBe(0);
  });
});
