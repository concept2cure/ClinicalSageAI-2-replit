/**
 * A schedule with nothing dated to assess is not "on track".
 *
 * assessScheduleHealth counted open milestones with no target date as on
 * track, and called a schedule with no milestones at all 'on_track' —
 * "0/0 milestones complete. Schedule is on track." — which the proactive
 * sweep stored as AnA's summary: "Your program is on track."
 */
import { describe, it, expect } from 'vitest';
import { assessScheduleHealth, type MilestoneHealthInput } from '../health';

const now = new Date('2026-06-01T00:00:00.000Z');
const DAY = 86_400_000;
const mk = (over: Partial<MilestoneHealthInput>): MilestoneHealthInput => ({
  key: 'k', title: 'M', status: 'not_started', targetDate: null, isCritical: false, progress: 0, ...over,
});

describe('assessScheduleHealth — what was not assessed', () => {
  it('a schedule with no milestones is not assessed', () => {
    const h = assessScheduleHealth([], { now });
    expect(h.overallStatus).toBe('not_assessed');
    expect(h.summary).toBe('No milestones are scheduled.');
    expect(h.summary).not.toMatch(/on track/);
  });

  it('undated open milestones are not counted as on track', () => {
    const h = assessScheduleHealth([mk({ key: 'a' }), mk({ key: 'b', status: 'in_progress', progress: 20 })], { now });
    expect(h.undated).toBe(2);
    expect(h.onTrack).toBe(0);
    expect(h.overallStatus).toBe('not_assessed');
    expect(h.summary).toBe('0/2 milestones complete. 2 without a target date — not assessed.');
  });

  it('says which part is on track when some milestones have no date', () => {
    const later = new Date(now.getTime() + 90 * DAY);
    const h = assessScheduleHealth([mk({ key: 'a', targetDate: later }), mk({ key: 'b' })], { now });
    expect(h.onTrack).toBe(1);
    expect(h.undated).toBe(1);
    expect(h.overallStatus).toBe('on_track');
    expect(h.summary).toBe('0/2 milestones complete. 1 without a target date — not assessed. The dated milestones are on track.');
  });

  it('a fully dated, on-course schedule is still on track', () => {
    const later = new Date(now.getTime() + 90 * DAY);
    const h = assessScheduleHealth([mk({ key: 'a', targetDate: later })], { now });
    expect(h.undated).toBe(0);
    expect(h.summary).toBe('0/1 milestones complete. Schedule is on track.');
  });
});
