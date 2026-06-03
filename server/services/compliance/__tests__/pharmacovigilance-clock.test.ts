import { describe, it, expect } from 'vitest';
import { computeReportingClock } from '../pharmacovigilanceService';

const now = new Date('2026-06-10T00:00:00Z');
const inDays = (d: number) => new Date('2026-06-10T00:00:00Z').getTime() + d * 86400000;

describe('computeReportingClock', () => {
  it('returns "none" when there is no deadline', () => {
    const c = computeReportingClock(null, now);
    expect(c.status).toBe('none');
    expect(c.daysRemaining).toBeNull();
    expect(c.day6Flag).toBe(false);
  });

  it('returns "none" for an invalid date', () => {
    expect(computeReportingClock('not-a-date', now).status).toBe('none');
  });

  it('is on_track early in the 15-day window', () => {
    const c = computeReportingClock(new Date(inDays(14)), now);
    expect(c.daysRemaining).toBe(14);
    expect(c.status).toBe('on_track');
    expect(c.day6Flag).toBe(false);
  });

  it('is due_soon as the window narrows', () => {
    const c = computeReportingClock(new Date(inDays(11)), now);
    expect(c.daysRemaining).toBe(11);
    expect(c.status).toBe('due_soon');
  });

  it('flags day 6 of 15 (urgent tail, <= 9 days left)', () => {
    const c = computeReportingClock(new Date(inDays(9)), now);
    expect(c.daysRemaining).toBe(9);
    expect(c.day6Flag).toBe(true);
    expect(c.status).toBe('day6');
  });

  it('marks a past-due case as breached', () => {
    const c = computeReportingClock(new Date(inDays(-2)), now);
    expect(c.breached).toBe(true);
    expect(c.status).toBe('breached');
    expect(c.day6Flag).toBe(false);
  });

  it('accepts an ISO string deadline and echoes it back', () => {
    const c = computeReportingClock('2026-06-19T00:00:00Z', now);
    expect(c.deadline).toBe('2026-06-19T00:00:00.000Z');
    expect(c.daysRemaining).toBe(9);
  });
});
