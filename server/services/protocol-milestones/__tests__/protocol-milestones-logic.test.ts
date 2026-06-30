/**
 * Protocol Milestones pure logic — bucketing + timeline summary. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import { milestoneBucket, summarizeTimeline, type MilestoneView } from '../protocol-milestones-logic';

const TODAY = '2026-06-10';

describe('milestoneBucket', () => {
  it('buckets by target date and terminal status', () => {
    expect(milestoneBucket({ targetDate: '2026-01-01' }, TODAY)).toBe('overdue');
    expect(milestoneBucket({ targetDate: '2026-06-20' }, TODAY)).toBe('due_30');
    expect(milestoneBucket({ targetDate: '2026-08-15' }, TODAY)).toBe('due_90');
    expect(milestoneBucket({ targetDate: '2027-01-01' }, TODAY)).toBe('upcoming');
    expect(milestoneBucket({ targetDate: null }, TODAY)).toBe('undated');
    expect(milestoneBucket({ targetDate: '2026-01-01', status: 'met' }, TODAY)).toBe('done');
    expect(milestoneBucket({ targetDate: '2026-01-01', status: 'cancelled' }, TODAY)).toBe('done');
  });
});

describe('summarizeTimeline', () => {
  it('counts buckets, orders by date, and finds the next upcoming milestone', () => {
    const ms: MilestoneView[] = [
      { id: 1, name: 'IRB submission', targetDate: '2026-01-15', status: 'met' }, // done
      { id: 2, name: 'First subject', targetDate: '2026-06-20', status: 'planned' }, // due_30, next
      { id: 3, name: 'Last subject', targetDate: '2026-12-01', status: 'planned' }, // upcoming
      { id: 4, name: 'DB lock', targetDate: null, status: 'planned' }, // undated
    ];
    const s = summarizeTimeline(ms, TODAY);
    expect(s.total).toBe(4);
    expect(s.counts.done).toBe(1);
    expect(s.counts.due_30).toBe(1);
    expect(s.counts.undated).toBe(1);
    // ordered: dated ascending, undated last
    expect(s.ordered[s.ordered.length - 1].id).toBe(4);
    expect(s.next?.id).toBe(2);
    expect(s.next?.daysRemaining).toBe(10);
  });
});
