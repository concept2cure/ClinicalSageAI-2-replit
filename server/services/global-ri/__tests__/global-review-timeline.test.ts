/**
 * Tests for the deterministic global review-timeline projector.
 */

import { describe, it, expect } from 'vitest';
import {
  projectReviewTimeline,
  listProcedures,
  type Region,
} from '../global-review-timeline';

/** Calendar-day difference between two ISO (YYYY-MM-DD) dates. */
function daysBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.round(ms / 86_400_000);
}

describe('projectReviewTimeline', () => {
  const start = '2026-01-01';

  it('FDA IND produces a Day-30 safe-to-proceed milestone', () => {
    const t = projectReviewTimeline({ region: 'FDA', procedure: 'IND', startDate: start });
    const day30 = t.milestones.find((m) => m.dayOffset === 30);
    expect(day30).toBeDefined();
    expect(day30?.name).toMatch(/safe to proceed/i);
    expect(day30?.date).toBe('2026-01-31'); // Jan 1 + 30 days
    expect(t.targetDecisionDate).toBe('2026-01-31');
  });

  it('FDA NDA_STANDARD targets a ~10-month decision (~Day 364)', () => {
    const t = projectReviewTimeline({ region: 'FDA', procedure: 'NDA_STANDARD', startDate: start });
    const offset = daysBetween(t.startDate, t.targetDecisionDate);
    expect(offset).toBe(364);
    // ~10 months as a sanity band.
    expect(offset).toBeGreaterThanOrEqual(300);
    expect(offset).toBeLessThanOrEqual(370);
    expect(t.milestones.some((m) => m.dayOffset === 60 && /filing/i.test(m.name))).toBe(true);
  });

  it('FDA BLA_PRIORITY targets ~Day 243', () => {
    const t = projectReviewTimeline({ region: 'FDA', procedure: 'BLA_PRIORITY', startDate: start });
    expect(daysBetween(t.startDate, t.targetDecisionDate)).toBe(243);
  });

  it('EMA CENTRALISED exposes Day-120 and Day-210 milestones', () => {
    const t = projectReviewTimeline({ region: 'EMA', procedure: 'CENTRALISED', startDate: start });
    expect(t.milestones.some((m) => m.dayOffset === 120)).toBe(true);
    expect(t.milestones.some((m) => m.dayOffset === 210 && /opinion/i.test(m.name))).toBe(true);
    // EC decision ~67 days after the 210-day opinion.
    expect(daysBetween(t.startDate, t.targetDecisionDate)).toBe(277);
  });

  it('PMDA STANDARD ~365 days, PRIORITY ~270 days', () => {
    const std = projectReviewTimeline({ region: 'PMDA', procedure: 'STANDARD', startDate: start });
    const pri = projectReviewTimeline({ region: 'PMDA', procedure: 'PRIORITY', startDate: start });
    expect(daysBetween(std.startDate, std.targetDecisionDate)).toBe(365);
    expect(daysBetween(pri.startDate, pri.targetDecisionDate)).toBe(270);
  });

  it('HEALTH_CANADA NDS_PRIORITY has a 215-day target', () => {
    const t = projectReviewTimeline({ region: 'HEALTH_CANADA', procedure: 'NDS_PRIORITY', startDate: start });
    expect(daysBetween(t.startDate, t.targetDecisionDate)).toBe(215);
  });

  it('HEALTH_CANADA NDS_STANDARD has a 300-day target', () => {
    const t = projectReviewTimeline({ region: 'HEALTH_CANADA', procedure: 'NDS_STANDARD', startDate: start });
    expect(daysBetween(t.startDate, t.targetDecisionDate)).toBe(300);
  });

  it('MHRA NATIONAL has a 150-day assessment target', () => {
    const t = projectReviewTimeline({ region: 'MHRA', procedure: 'NATIONAL', startDate: start });
    expect(daysBetween(t.startDate, t.targetDecisionDate)).toBe(150);
  });

  it('TGA PRESCRIPTION_MEDICINE approximates 255 working days as 357 calendar days', () => {
    const t = projectReviewTimeline({ region: 'TGA', procedure: 'PRESCRIPTION_MEDICINE', startDate: start });
    expect(daysBetween(t.startDate, t.targetDecisionDate)).toBe(357);
  });

  it('throws on an unknown procedure', () => {
    expect(() =>
      projectReviewTimeline({ region: 'FDA', procedure: 'NOPE', startDate: start }),
    ).toThrow(/unknown procedure/i);
  });

  it('throws on an unknown region', () => {
    expect(() =>
      projectReviewTimeline({ region: 'XYZ' as Region, procedure: 'IND', startDate: start }),
    ).toThrow(/unknown region/i);
  });

  it('throws on an invalid startDate', () => {
    expect(() =>
      projectReviewTimeline({ region: 'FDA', procedure: 'IND', startDate: 'not-a-date' }),
    ).toThrow(/invalid startdate/i);
  });

  it('milestones are sorted ascending by dayOffset', () => {
    const t = projectReviewTimeline({ region: 'EMA', procedure: 'CENTRALISED', startDate: start });
    const offsets = t.milestones.map((m) => m.dayOffset);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });

  it('is deterministic: same input yields identical output', () => {
    const a = projectReviewTimeline({ region: 'FDA', procedure: 'NDA_STANDARD', startDate: start });
    const b = projectReviewTimeline({ region: 'FDA', procedure: 'NDA_STANDARD', startDate: start });
    expect(a).toEqual(b);
  });

  it('accepts a Date and an ISO string equivalently', () => {
    const fromString = projectReviewTimeline({ region: 'FDA', procedure: 'IND', startDate: '2026-01-01' });
    const fromDate = projectReviewTimeline({
      region: 'FDA',
      procedure: 'IND',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(fromString).toEqual(fromDate);
    expect(fromString.startDate).toBe('2026-01-01');
  });

  it('listProcedures reports the encoded procedures per region', () => {
    expect(listProcedures('FDA')).toContain('IND');
    expect(listProcedures('EMA')).toContain('CENTRALISED');
    expect(listProcedures('TGA')).toContain('PRESCRIPTION_MEDICINE');
  });
});
