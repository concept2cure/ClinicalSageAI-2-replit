/**
 * Tests for the regulatory timeline engine — proves milestones are ordered,
 * clock-defined where published, and honestly null where not.
 */
import { describe, it, expect } from 'vitest';
import { getTimeline, timelinePathways } from '../regulatory-timelines';

describe('regulatory timelines — consistency', () => {
  it('every pathway has an authority, basis, caveat, and a submission milestone at day 0', () => {
    for (const p of timelinePathways()) {
      const t = getTimeline(p)!;
      expect(t.authority).toBeTruthy();
      expect(t.basis).toBeTruthy();
      expect(t.caveat).toBeTruthy();
      const submit = t.milestones.find((m) => m.kind === 'submission');
      expect(submit?.day).toBe(0);
      expect(t.milestones.some((m) => m.kind === 'decision')).toBe(true);
    }
  });

  it('clock-defined milestones are non-decreasing in day', () => {
    for (const p of timelinePathways()) {
      const days = getTimeline(p)!.milestones.map((m) => m.day).filter((d): d is number => d !== null);
      const sorted = [...days].sort((a, b) => a - b);
      expect(days).toEqual(sorted);
    }
  });
});

describe('regulatory timelines — anchors', () => {
  it('510(k) has the 15-day RTA and a ~90-day MDUFA decision goal', () => {
    const t = getTimeline('510k')!;
    expect(t.targetDecisionDays).toBe(90);
    expect(t.milestones.find((m) => m.id === 'rta')?.day).toBe(15);
    expect(t.clockStops).toBe(true);
  });

  it('PMA has a 45-day filing decision and 180-day decision goal', () => {
    const t = getTimeline('pma')!;
    expect(t.milestones.find((m) => m.id === 'filing')?.day).toBe(45);
    expect(t.targetDecisionDays).toBe(180);
  });

  it('EU MDR CE has NO statutory clock (null days), stated honestly', () => {
    const t = getTimeline('mdr_ce')!;
    expect(t.targetDecisionDays).toBeNull();
    expect(t.milestones.find((m) => m.id === 'assessment')?.day).toBeNull();
    expect(t.caveat).toMatch(/no statutory review clock/i);
  });

  it('EU MAA has the day-120 clock stop and 210-day opinion', () => {
    const t = getTimeline('eu_maa')!;
    expect(t.milestones.find((m) => m.id === 'day120')?.day).toBe(120);
    expect(t.targetDecisionDays).toBe(210);
  });

  it('returns undefined for an unknown pathway', () => {
    expect(getTimeline('nope')).toBeUndefined();
  });
});
