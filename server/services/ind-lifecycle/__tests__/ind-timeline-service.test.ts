/**
 * IND regulatory timeline derivation — deterministic 30-day + annual-report
 * milestone projection (21 CFR 312.40 / 312.33). No DB.
 */

import { describe, it, expect } from 'vitest';
import { buildIndTimeline } from '../ind-timeline-service';

const RECEIPT = '2026-01-01T00:00:00.000Z';
const EFFECTIVE = '2026-01-31T00:00:00.000Z'; // 30 days after receipt

describe('buildIndTimeline', () => {
  it('emits the 30-day safe-to-proceed milestone', () => {
    // dueSoonDays:7 so 21 days out reads as "upcoming" rather than "due_soon".
    const t = buildIndTimeline({ receiptDate: RECEIPT, asOf: '2026-01-10T00:00:00.000Z', dueSoonDays: 7 });
    const m = t.milestones.find((x) => x.key === 'safe_to_proceed')!;
    expect(m.date).toBe('2026-01-31T00:00:00.000Z');
    expect(m.cfrRef).toBe('21 CFR 312.40(b)');
    expect(m.status).toBe('upcoming');
    expect(m.daysFromNow).toBe(21);
  });

  it('flags a milestone within the due-soon window', () => {
    const t = buildIndTimeline({ receiptDate: RECEIPT, asOf: '2026-01-20T00:00:00.000Z' });
    expect(t.milestones.find((x) => x.key === 'safe_to_proceed')!.status).toBe('due_soon');
  });

  it('marks a passed milestone as past with negative daysFromNow', () => {
    const t = buildIndTimeline({ receiptDate: RECEIPT, asOf: '2026-03-01T00:00:00.000Z' });
    const m = t.milestones.find((x) => x.key === 'safe_to_proceed')!;
    expect(m.status).toBe('past');
    expect(m.daysFromNow).toBeLessThan(0);
  });

  it('projects annual-report due dates (anniversary + 60 days)', () => {
    const t = buildIndTimeline({ receiptDate: RECEIPT, effectiveDate: EFFECTIVE, asOf: '2026-02-01T00:00:00.000Z' });
    const ar1 = t.milestones.find((x) => x.key === 'annual_report_1')!;
    // anniversary = effective + 365d = 2027-01-31; due = +60d = 2027-04-01
    expect(ar1.date).toBe('2027-04-01T00:00:00.000Z');
    expect(ar1.cfrRef).toBe('21 CFR 312.33');
  });

  it('returns milestones in chronological order and the next upcoming one', () => {
    const t = buildIndTimeline({ receiptDate: RECEIPT, effectiveDate: EFFECTIVE, asOf: '2026-06-01T00:00:00.000Z' });
    const dates = t.milestones.map((m) => m.date);
    expect([...dates].sort()).toEqual(dates);
    // 30-day is past by June; the next is annual report 1.
    expect(t.next?.key).toBe('annual_report_1');
  });

  it('omits annual reports when no effective date is supplied', () => {
    const t = buildIndTimeline({ receiptDate: RECEIPT });
    expect(t.milestones.every((m) => m.key === 'safe_to_proceed')).toBe(true);
  });

  it('respects the projection horizon', () => {
    const t = buildIndTimeline({ receiptDate: RECEIPT, effectiveDate: EFFECTIVE, horizonDays: 400, asOf: RECEIPT });
    // Only annual report 1 (due ~2027-04-01, ~455d out but its anniversary ~2027-01-31 is within ~395d... )
    // With a 400-day horizon, AR2 (anniversary +730d) is well beyond and excluded.
    expect(t.milestones.some((m) => m.key === 'annual_report_2')).toBe(false);
  });
});
